import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as schemaMysql from '../db/schema.mysql';
import * as schemaSqlite from '../db/schema.sqlite';

/** Projects retained SQL events or compatible legacy broker payloads. Producer
 * identity, not broker sequence, makes at-least-once delivery idempotent. */

function isStandalone(): boolean {
  return process.env.STANDALONE === 'true';
}

export interface DomainEvent {
  subject: string;
  payload: Record<string, any>;
  seq: number;
}

export interface AuditRow {
  eventId: string;
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
    eventId: typeof event.payload.eventId === 'string' && event.payload.eventId ? event.payload.eventId : `legacy:${event.seq}`,
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
    occurredAt: typeof event.payload.occurredAt === 'string' && Number.isFinite(Date.parse(event.payload.occurredAt)) ? new Date(event.payload.occurredAt) : now,
  };
}

/** Resolve references from the authoritative source before any projection.
 * A missing source or mismatched routing is retryable; never audit an envelope
 * as if it were the source event. Legacy full messages pass through. */
export async function hydrateDomainEvent(db: any, event: DomainEvent): Promise<DomainEvent> {
  if (event.payload.eventRef !== true) return event;
  const id = event.payload.eventId;
  if (typeof id !== 'string' || !id || id.length > 256) throw new Error('invalid domain event reference');
  const events = isStandalone() ? schemaSqlite.domainEvents : schemaMysql.domainEvents;
  const [source] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!source || source.subject !== event.subject || source.orgId !== (event.payload.orgId ?? null)
    || source.projectId !== (event.payload.projectId ?? null)) throw new Error('domain event reference is missing or mismatched');
  const payload = JSON.parse(source.payload);
  if (payload.eventId !== id || payload.occurredAt !== event.payload.occurredAt) throw new Error('domain event source identity is mismatched');
  return { ...event, payload };
}

/** Duplicate identity is accepted only when it describes the same source.
 * An unrelated unique violation or a conflicting producer identity stays loud. */
export async function projectEvent(db: any, event: DomainEvent, now: Date = new Date()): Promise<'written' | 'duplicate'> {
  const table = isStandalone() ? schemaSqlite.auditLog : schemaMysql.auditLog;
  const row = toAuditRow(await hydrateDomainEvent(db, event), now);
  try {
    await db.insert(table).values(row);
    return 'written';
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const [existing] = await db.select().from(table).where(eq(table.eventId, row.eventId)).limit(1);
    if (existing && existing.subject === row.subject && existing.orgId === row.orgId && existing.payload === row.payload) return 'duplicate';
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
  let current: any = err;
  for (let depth = 0; current && depth < 8; depth++, current = current.cause) {
    const message = String(current.message ?? '').toLowerCase();
    if (current.code === 'ER_DUP_ENTRY' || current.code === 'SQLITE_CONSTRAINT_UNIQUE'
      || message.includes('unique constraint failed') || message.includes('duplicate entry')) return true;
  }
  return false;
}
