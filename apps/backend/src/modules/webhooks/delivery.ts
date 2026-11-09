/** Fenced at-least-once webhook delivery; network I/O never holds SQL locks. */
import { and, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import * as schemaMysql from '../../db/schema.mysql';
import * as schemaSqlite from '../../db/schema.sqlite';
import { withUnitOfWork } from '../../db/access';
import { decryptToken } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { writeNotifications, type WebhookDisabledPayload } from '../../lib/notificationRegistry';
import { signDelivery } from './events';
export { httpSender } from './httpSender';

export const MAX_ATTEMPTS = 8;
export const DISABLE_AFTER_FAILURES = 20;
const BASE_BACKOFF_MS = 30_000;
const LEASE_MS = 60_000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function backoffMs(attemptsMade: number): number {
  return BASE_BACKOFF_MS * 2 ** Math.max(0, attemptsMade - 1);
}
export type Sender = (url: string, body: string, headers: Record<string, string>) => Promise<{ status: number }>;
export interface SweepOptions {
  send: Sender;
  now?: () => number;
  batch?: number;
  concurrency?: number;
  signal?: AbortSignal;
  onError?: (err: unknown) => void;
}
export interface SweepResult {
  delivered: number;
  retried: number;
  failed: number;
  disabled: number;
}

export async function runWebhookSweep(db: any, isStandalone: boolean, opts: SweepOptions): Promise<SweepResult> {
  const now = opts.now ?? Date.now;
  const webhooks = isStandalone ? schemaSqlite.webhooks : schemaMysql.webhooks;
  const deliveries = isStandalone ? schemaSqlite.webhookDeliveries : schemaMysql.webhookDeliveries;
  const d = deliveries as any, w = webhooks as any;
  const result: SweepResult = { delivered: 0, retried: 0, failed: 0, disabled: 0 };
  if (opts.signal?.aborted) return result;
  const at = new Date(now());
  const eligible = and(eq(d.status, 'pending'), lte(d.nextAttemptAt, at), or(isNull(d.claimedUntil), lte(d.claimedUntil, at)));
  const due = await db.select({ id: d.id }).from(deliveries).where(eligible)
    .orderBy(d.nextAttemptAt).limit(Math.max(1, Math.min(opts.batch ?? 50, 500)));
  const affected = (response: any) => Number(isStandalone ? response.changes : response[0]?.affectedRows) > 0;
  const webhookCache = new Map<string, any>();
  const loadWebhook = async (id: string) => {
    if (!webhookCache.has(id)) {
      const [row] = await db.select().from(webhooks).where(eq(w.id, id)).limit(1);
      webhookCache.set(id, row ?? null);
    }
    return webhookCache.get(id);
  };

  async function deliverOne(id: string): Promise<void> {
    if (opts.signal?.aborted) return;
    const token = crypto.randomUUID();
    const claimed = await db.update(deliveries).set({ leaseToken: token, claimedUntil: new Date(now() + LEASE_MS) })
      .where(and(eq(d.id, id), eligible));
    if (!affected(claimed)) return;
    const owns = and(eq(d.id, id), eq(d.leaseToken, token), eq(d.status, 'pending'));
    const [row] = await db.select().from(deliveries).where(owns).limit(1);
    if (!row) return;
    if (opts.signal?.aborted) {
      await db.update(deliveries).set({ leaseToken: null, claimedUntil: null }).where(owns);
      return;
    }
    const hook = await loadWebhook(row.webhookId);
    if (!hook || !hook.active) {
      const changed = await db.update(deliveries).set({ status: 'failed', leaseToken: null, claimedUntil: null, lastError: hook ? 'webhook is not active' : 'webhook was deleted' }).where(owns);
      if (affected(changed)) result.failed++;
      return;
    }
    const timestamp = Math.floor(now() / 1000);
    const headers = {
      'content-type': 'application/json', 'user-agent': 'Tasker-Webhooks/1',
      'x-tasker-event': row.eventType, 'x-tasker-delivery': row.id,
      'x-tasker-timestamp': String(timestamp),
      'x-tasker-signature': signDelivery(decryptToken(hook.secretEncrypted), timestamp, row.payload),
    };
    let status: number | null = null, error: string | null = null;
    try {
      status = (await opts.send(hook.url, row.payload, headers)).status;
      if (status < 200 || status >= 300) error = `receiver answered HTTP ${status}`;
    } catch (failure) { error = String((failure as Error)?.message ?? failure).slice(0, 500); }
    const attempts = row.attempts + 1, doneAt = new Date(now());
    const finalAttempt = attempts >= MAX_ATTEMPTS;

    // The winning delivery result and its endpoint counters commit together.
    // A late owner changes neither, even if its HTTP request eventually wins.
    const outcome = await withUnitOfWork(db, async () => {
      const changed = await db.update(deliveries).set(error ? {
        status: finalAttempt ? 'failed' : 'pending', attempts, lastStatusCode: status, lastError: error,
        nextAttemptAt: finalAttempt ? row.nextAttemptAt : new Date(now() + backoffMs(attempts)), leaseToken: null, claimedUntil: null,
      } : { status: 'delivered', attempts, lastStatusCode: status, lastError: null, deliveredAt: doneAt, leaseToken: null, claimedUntil: null }).where(owns);
      if (!affected(changed)) return null;
      if (!error) {
        await db.update(webhooks).set({ consecutiveFailures: 0, lastDeliveryAt: doneAt }).where(eq(w.id, hook.id));
        return { kind: 'delivered' as const, disabled: false };
      }
      await db.update(webhooks).set({ consecutiveFailures: sql`${w.consecutiveFailures} + 1` }).where(eq(w.id, hook.id));
      const [after] = await db.select({ consecutiveFailures: w.consecutiveFailures, active: w.active }).from(webhooks).where(eq(w.id, hook.id));
      let disabled = false;
      if (after?.active && after.consecutiveFailures >= DISABLE_AFTER_FAILURES) {
        const reason = `disabled after ${after.consecutiveFailures} consecutive failed deliveries (last: ${error})`;
        const off = await db.update(webhooks).set({ active: false, disabledReason: reason }).where(and(eq(w.id, hook.id), eq(w.active, true)));
        if (affected(off)) {
          disabled = true;
          await notifyAdmins(db, isStandalone, { orgId: hook.orgId, webhookId: hook.id, host: new URL(hook.url).host, failures: after.consecutiveFailures, disabledAt: doneAt.toISOString() });
        }
      }
      return { kind: finalAttempt ? 'failed' as const : 'retried' as const, disabled };
    });
    if (outcome) {
      result[outcome.kind]++;
      if (outcome.disabled) { hook.active = false; result.disabled++; }
    }
  }

  const queue = due.map((row: { id: string }) => row.id);
  const workers = Array.from({ length: Math.min(Math.max(1, Math.min(opts.concurrency ?? 8, 16)), queue.length) }, async () => {
    for (let id = queue.shift(); id && !opts.signal?.aborted; id = queue.shift()) {
      try { await deliverOne(id); }
      catch (error) {
        if (opts.onError) opts.onError(error); else logger.error({ err: error, deliveryId: id }, 'webhook_delivery.failed');
      }
    }
  });
  const settled = await Promise.allSettled(workers);
  const failure = settled.find((item): item is PromiseRejectedResult => item.status === 'rejected');
  if (failure) throw failure.reason;
  if (!opts.signal?.aborted) {
    await db.delete(deliveries).where(and(inArray(d.status, ['delivered', 'failed']), lt(d.createdAt, new Date(now() - RETENTION_MS))));
  }
  return result;
}

async function notifyAdmins(db: any, isStandalone: boolean, payload: WebhookDisabledPayload): Promise<void> {
  const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
  const admins = await db.select({ userId: (members as any).userId }).from(members)
    .where(and(eq((members as any).orgId, payload.orgId), inArray((members as any).role, ["owner", "admin"])));
  await writeNotifications(db, isStandalone, "webhook.disabled", payload, admins);
}
