/**
 * The webhook delivery sweep (M37-T04, ADR-0030): due outbox rows are
 * claimed, signed, POSTed, and recorded - retried with backoff, and a webhook
 * that keeps failing is switched off and its organization's admins told.
 */
import * as http from "node:http";
import * as https from "node:https";
import { isIP } from "node:net";
import { and, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { decryptToken } from "../../lib/crypto";
import { writeNotifications, type WebhookDisabledPayload } from "../../lib/notificationRegistry";
import { signDelivery } from "./events";
import { isPublicAddress, safeLookup, type Resolver } from "./urlSafety";

export const MAX_ATTEMPTS = 8;
/** Consecutive failed attempts, across deliveries, that switch a webhook off. */
export const DISABLE_AFTER_FAILURES = 20;
const BASE_BACKOFF_MS = 30_000;
const LEASE_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** 30 s, 1 m, 2 m ... doubling per attempt already made. */
export function backoffMs(attemptsMade: number): number {
  return BASE_BACKOFF_MS * 2 ** Math.max(0, attemptsMade - 1);
}

interface SendResult {
  status: number;
}
/** POSTs `body` with `headers`; resolves with the status, or rejects on a transport failure. */
export type Sender = (url: string, body: string, headers: Record<string, string>) => Promise<SendResult>;

/**
 * The real sender. No redirects are followed (a 3xx is a failure, so a
 * receiver cannot bounce the request somewhere private), the connection's own
 * DNS lookup is vetted, and an IP-literal host - which Node connects to
 * without calling `lookup` at all - is checked here.
 */
export function httpSender(allowPrivate: boolean, resolve?: Resolver): Sender {
  return (url, body, headers) => new Promise((resolvePromise, reject) => {
    const target = new URL(url);
    const host = target.hostname.replace(/^\[|\]$/g, "");
    if (!allowPrivate && isIP(host) && !isPublicAddress(host)) {
      return reject(new Error(`refusing to connect to non-public address ${host}`));
    }
    const transport = target.protocol === "https:" ? https : http;
    const req = transport.request(target, {
      method: "POST",
      headers: { ...headers, "content-length": Buffer.byteLength(body).toString() },
      lookup: safeLookup(allowPrivate, resolve) as any,
      timeout: REQUEST_TIMEOUT_MS,
    }, (res) => {
      res.resume(); // the body is not needed - drain it so the socket is freed
      res.on("end", () => resolvePromise({ status: res.statusCode ?? 0 }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error(`timed out after ${REQUEST_TIMEOUT_MS / 1000} s`)));
    req.on("error", reject);
    req.end(body);
  });
}

export interface SweepOptions {
  send: Sender;
  now?: () => number;
  batch?: number;
  concurrency?: number;
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
  const d = deliveries as any;
  const w = webhooks as any;
  const result: SweepResult = { delivered: 0, retried: 0, failed: 0, disabled: 0 };
  const at = new Date(now());

  const unleased = or(isNull(d.claimedUntil), lt(d.claimedUntil, at));
  const due = await db.select({ id: d.id }).from(deliveries)
    .where(and(eq(d.status, "pending"), lte(d.nextAttemptAt, at), unleased))
    .orderBy(d.nextAttemptAt)
    .limit(opts.batch ?? 50);

  const webhookCache = new Map<string, any>();
  const loadWebhook = async (id: string) => {
    if (!webhookCache.has(id)) {
      const [row] = await db.select().from(webhooks).where(eq(w.id, id)).limit(1);
      webhookCache.set(id, row ?? null);
    }
    return webhookCache.get(id);
  };

  async function deliverOne(id: string): Promise<void> {
    // The lease: of several replicas sweeping at once, exactly one claims a row.
    const claimed = await db.update(deliveries).set({ claimedUntil: new Date(now() + LEASE_MS) })
      .where(and(eq(d.id, id), eq(d.status, "pending"), unleased));
    if (!(isStandalone ? claimed.changes : claimed[0]?.affectedRows)) return;
    const [row] = await db.select().from(deliveries).where(eq(d.id, id)).limit(1);
    const hook = await loadWebhook(row.webhookId);

    if (!hook || !hook.active) {
      // Deleted, paused or disabled since this was queued: not delivered, and
      // not retried into a receiver nobody wants to hear from.
      await db.update(deliveries).set({ status: "failed", claimedUntil: null, lastError: hook ? "webhook is not active" : "webhook was deleted" }).where(eq(d.id, id));
      result.failed++;
      return;
    }

    const timestamp = Math.floor(now() / 1000);
    const headers = {
      "content-type": "application/json",
      "user-agent": "Tasker-Webhooks/1",
      "x-tasker-event": row.eventType,
      "x-tasker-delivery": row.id,
      "x-tasker-timestamp": String(timestamp),
      "x-tasker-signature": signDelivery(decryptToken(hook.secretEncrypted), timestamp, row.payload),
    };
    let status: number | null = null;
    let error: string | null = null;
    try {
      status = (await opts.send(hook.url, row.payload, headers)).status;
      if (status < 200 || status >= 300) error = `receiver answered HTTP ${status}`;
    } catch (e) {
      error = String((e as Error)?.message ?? e).slice(0, 500);
    }
    const attempts = row.attempts + 1;
    const doneAt = new Date(now());

    if (!error) {
      await db.update(deliveries).set({ status: "delivered", attempts, lastStatusCode: status, lastError: null, deliveredAt: doneAt, claimedUntil: null }).where(eq(d.id, id));
      await db.update(webhooks).set({ consecutiveFailures: 0, lastDeliveryAt: doneAt }).where(eq(w.id, hook.id));
      result.delivered++;
      return;
    }

    const finalAttempt = attempts >= MAX_ATTEMPTS;
    await db.update(deliveries).set({
      status: finalAttempt ? "failed" : "pending",
      attempts,
      lastStatusCode: status,
      lastError: error,
      nextAttemptAt: finalAttempt ? row.nextAttemptAt : new Date(now() + backoffMs(attempts)),
      claimedUntil: null,
    }).where(eq(d.id, id));
    if (finalAttempt) result.failed++; else result.retried++;

    // Counted in the database, not in memory, so replicas add up correctly.
    await db.update(webhooks).set({ consecutiveFailures: sql`${w.consecutiveFailures} + 1` }).where(eq(w.id, hook.id));
    const [after] = await db.select({ consecutiveFailures: w.consecutiveFailures, active: w.active }).from(webhooks).where(eq(w.id, hook.id));
    if (after?.active && after.consecutiveFailures >= DISABLE_AFTER_FAILURES) {
      const reason = `disabled after ${after.consecutiveFailures} consecutive failed deliveries (last: ${error})`;
      const off = await db.update(webhooks).set({ active: false, disabledReason: reason }).where(and(eq(w.id, hook.id), eq(w.active, true)));
      if (isStandalone ? off.changes : off[0]?.affectedRows) {
        hook.active = false;
        result.disabled++;
        await notifyAdmins(db, isStandalone, {
          orgId: hook.orgId, webhookId: hook.id, host: new URL(hook.url).host, failures: after.consecutiveFailures, disabledAt: doneAt.toISOString(),
        });
      }
    }
  }

  const queue = due.map((r: { id: string }) => r.id);
  const workers = Array.from({ length: Math.min(opts.concurrency ?? 8, queue.length) }, async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        await deliverOne(id);
      } catch (e) {
        opts.onError?.(e);
      }
    }
  });
  await Promise.all(workers);

  // Settled rows are history; a week of it answers "did my receiver get it".
  await db.delete(deliveries).where(and(inArray(d.status, ["delivered", "failed"]), lt(d.createdAt, new Date(now() - RETENTION_MS))));
  return result;
}

async function notifyAdmins(db: any, isStandalone: boolean, payload: WebhookDisabledPayload): Promise<void> {
  const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
  const admins = await db.select({ userId: (members as any).userId }).from(members)
    .where(and(eq((members as any).orgId, payload.orgId), inArray((members as any).role, ["owner", "admin"])));
  await writeNotifications(db, isStandalone, "webhook.disabled", payload, admins);
}
