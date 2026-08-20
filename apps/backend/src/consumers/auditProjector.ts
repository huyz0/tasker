import { randomUUID } from 'node:crypto';
import * as schemaMysql from '../db/schema.mysql';
import * as schemaSqlite from '../db/schema.sqlite';

/**
 * Turns a `domain.*` event into a row in `audit_log` (M08-T03).
 *
 * Deliberately not a request-time write. Routing through JetStream is what
 * makes the trail survive an API crash mid-request: an inline insert in the
 * same transaction as the change would be rolled back with it, so the one
 * case an auditor most wants recorded — the request that failed halfway — is
 * exactly the case that would leave no trace.
 */

function isStandalone(): boolean {
  return process.env.STANDALONE === 'true';
}

export interface DomainEvent {
  subject: string;
  payload: Record<string, any>;
  seq: number;
}

export interface AuditRow {
  id: string;
  orgId: string | null;
  subject: string;
  actorType: string;
  actorId: string | null;
  requestId: string | null;
  payload: string;
  streamSeq: number;
  occurredAt: Date;
}

/**
 * Reads the acting principal out of an event payload.
 *
 * `actorType` is explicit rather than inferred from a null `actorId`, because
 * "no human did this" (a retention sweep, a scheduled purge) and "we failed
 * to record who did this" are different facts and an audit trail that
 * conflates them is misleading in the direction that matters.
 *
 * M08-T04 makes every handler stamp `actor` onto its payload; until then this
 * reads whatever is already there (`userId`/`agentId` appear on many events)
 * and falls back to `system`.
 */
export function extractActor(payload: Record<string, any>): { actorType: string; actorId: string | null } {
  if (payload.actor && typeof payload.actor === 'object') {
    const kind = payload.actor.kind === 'agent' ? 'agent' : 'user';
    const id = payload.actor.userId ?? payload.actor.agentId ?? null;
    if (id) return { actorType: kind, actorId: String(id) };
  }
  if (payload.agentId) return { actorType: 'agent', actorId: String(payload.agentId) };
  if (payload.userId) return { actorType: 'user', actorId: String(payload.userId) };
  return { actorType: 'system', actorId: null };
}

/**
 * Which organization's trail this belongs to.
 *
 * Null is a legitimate answer, not a failure: a user registering happens
 * before any org membership exists. Dropping those events instead would put a
 * gap in the trail precisely where an account takeover would show up.
 */
export function extractOrgId(payload: Record<string, any>): string | null {
  return payload.orgId ? String(payload.orgId) : null;
}

/** Builds the row without touching the database, so the mapping is testable. */
export function toAuditRow(event: DomainEvent, now: Date = new Date()): AuditRow {
  const { actorType, actorId } = extractActor(event.payload);
  return {
    id: randomUUID(),
    orgId: extractOrgId(event.payload),
    subject: event.subject,
    actorType,
    actorId,
    requestId: event.payload.requestId ? String(event.payload.requestId) : null,
    // The event verbatim. Over twenty subjects publish here with different
    // shapes; a column per field would mean a migration whenever any handler
    // added one, and the trail would silently lose whatever had no column.
    payload: JSON.stringify(event.payload),
    streamSeq: event.seq,
    occurredAt: now,
  };
}

/**
 * Writes one event to the trail.
 *
 * Returns whether the row was new. The consumer is at-least-once — JetStream
 * redelivers anything unacknowledged, so a crash between write and ack
 * replays the event — and `audit_log.stream_seq` is unique, which turns that
 * replay into a no-op rather than a duplicate row. Swallowing only the
 * uniqueness violation keeps every other failure loud, so it can go unacked
 * and be retried.
 */
export async function projectEvent(db: any, event: DomainEvent, now: Date = new Date()): Promise<'written' | 'duplicate'> {
  const table = isStandalone() ? schemaSqlite.auditLog : schemaMysql.auditLog;
  const row = toAuditRow(event, now);
  try {
    await db.insert(table).values(row);
    return 'written';
  } catch (err) {
    if (isUniqueViolation(err)) return 'duplicate';
    throw err;
  }
}

/**
 * Recognises "this row already exists" across both engines.
 *
 * Matching on message text rather than a code because the two drivers report
 * it differently (SQLite: "UNIQUE constraint failed"; MySQL: ER_DUP_ENTRY /
 * "Duplicate entry"), and this repo runs both.
 */
export function isUniqueViolation(err: unknown): boolean {
  const message = String((err as Error)?.message ?? '').toLowerCase();
  const code = String((err as any)?.code ?? '');
  return (
    code === 'ER_DUP_ENTRY' ||
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    message.includes('unique constraint failed') ||
    message.includes('duplicate entry')
  );
}
