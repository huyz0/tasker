import { and, asc, count, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import * as schemaMysql from '../db/schema.mysql';
import * as schemaSqlite from '../db/schema.sqlite';
import { logger } from './logger';

export const EVENT_LEASE_MS = 60_000;
export const EVENT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
export type StoredDomainEvent = typeof schemaSqlite.domainEvents.$inferSelect;

/** The projector loads the original from SQL; the broker never carries large artifact bodies. */
export function brokerEventReference(event: StoredDomainEvent): Record<string, unknown> {
  const payload = JSON.parse(event.payload);
  return {
    eventRef: true, eventId: event.id, orgId: event.orgId, projectId: event.projectId,
    occurredAt: payload.occurredAt ?? event.occurredAt.toISOString(),
    actor: payload.actor, requestId: payload.requestId,
    traceparent: payload.traceparent, tracestate: payload.tracestate,
  };
}

interface RelayOptions {
  publish: (event: StoredDomainEvent) => Promise<void>;
  projectLocally: (event: StoredDomainEvent) => Promise<void>;
  now?: () => number;
  batch?: number;
  concurrency?: number;
  signal?: AbortSignal;
  onError?: (error: unknown, eventId: string) => void;
}
export interface EventSweepResult {
  claimed: number;
  delivered: number;
  retried: number;
  stale: number;
  released: number;
  pruned: number;
}

/** At-least-once delivery with fenced, recoverable leases and bounded work. */
export async function runDomainEventSweep(db: any, standalone: boolean, options: RelayOptions): Promise<EventSweepResult> {
  const result: EventSweepResult = { claimed: 0, delivered: 0, retried: 0, stale: 0, released: 0, pruned: 0 };
  if (options.signal?.aborted) return result;
  const now = options.now ?? Date.now;
  const events = standalone ? schemaSqlite.domainEvents : schemaMysql.domainEvents;
  const d = events as any;
  const at = new Date(now());
  const eligible = and(isNull(d.deliveredAt), lte(d.nextAttemptAt, at), or(isNull(d.claimedUntil), lte(d.claimedUntil, at)));
  const candidates = await db.select({ id: d.id }).from(events).where(eligible)
    .orderBy(asc(d.nextAttemptAt), asc(d.id)).limit(Math.max(1, Math.min(options.batch ?? 50, 500)));
  const affected = (response: any) => Number(standalone ? response.changes : response[0]?.affectedRows) > 0;

  async function deliver(id: string): Promise<void> {
    if (options.signal?.aborted) return;
    const token = crypto.randomUUID();
    const claimed = await db.update(events).set({ leaseToken: token, claimedUntil: new Date(now() + EVENT_LEASE_MS), attempts: sql`${d.attempts} + 1` })
      .where(and(eq(d.id, id), eligible));
    if (!affected(claimed)) return;
    result.claimed++;
    const owns = and(eq(d.id, id), eq(d.leaseToken, token), isNull(d.deliveredAt));
    const [event]: StoredDomainEvent[] = await db.select().from(events).where(owns).limit(1);
    if (!event) { result.stale++; return; }
    if (options.signal?.aborted) {
      const released = await db.update(events).set({ leaseToken: null, claimedUntil: null }).where(owns);
      if (affected(released)) result.released++; else result.stale++;
      return;
    }
    try {
      if (event.brokerRequired) await options.publish(event);
      else await options.projectLocally(event);
      const completed = await db.update(events).set({ deliveredAt: new Date(now()), leaseToken: null, claimedUntil: null, lastError: null }).where(owns);
      if (affected(completed)) result.delivered++; else result.stale++;
    } catch (error) {
      const delay = Math.min(300_000, 5_000 * 2 ** Math.min(16, Math.max(0, event.attempts - 1)));
      const retried = await db.update(events).set({
        leaseToken: null, claimedUntil: null, nextAttemptAt: new Date(now() + delay),
        lastError: String(error instanceof Error ? error.message : error).slice(0, 1000),
      }).where(owns);
      if (affected(retried)) result.retried++; else result.stale++;
      try { options.onError?.(error, id); }
      catch (err) { logger.error({ err, eventId: id }, 'domain_events.error_reporting_failed'); }
    }
  }

  let index = 0;
  const workers = Array.from({ length: Math.min(candidates.length, Math.max(1, Math.min(options.concurrency ?? 5, 16))) }, async () => {
    while (!options.signal?.aborted && index < candidates.length) {
      const candidate = candidates[index++];
      await deliver(candidate.id);
    }
  });
  // Even if one storage write fails, settle the other bounded workers before
  // returning so shutdown never loses track of network calls still in flight.
  const settled = await Promise.allSettled(workers);
  const failure = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failure) throw failure.reason;

  if (!options.signal?.aborted) {
    const old = await db.select({ id: d.id }).from(events)
      .where(lt(d.deliveredAt, new Date(now() - EVENT_RETENTION_MS))).limit(500);
    if (old.length) {
      await db.delete(events).where(inArray(d.id, old.map((r: any) => r.id)));
      result.pruned = old.length;
    }
  }
  return result;
}

/** Cheap aggregate for operations; no event bodies or tenant labels in telemetry. */
export async function countPendingDomainEvents(db: any, standalone: boolean): Promise<number> {
  const events = standalone ? schemaSqlite.domainEvents : schemaMysql.domainEvents;
  const [row] = await db.select({ value: count() }).from(events).where(isNull(events.deliveredAt));
  return Number(row?.value ?? 0);
}
