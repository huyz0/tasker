import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { extractActor, extractOrgId, toAuditRow, projectEvent, isUniqueViolation } from './auditProjector';

const event = (subject: string, payload: Record<string, any>, seq = 1) => ({ subject, payload, seq });

describe('extractActor', () => {
  it('reads an explicit user actor', () => {
    expect(extractActor({ actor: { kind: 'user', userId: 'usr-1' } })).toEqual({ actorType: 'user', actorId: 'usr-1' });
  });

  it('reads an explicit agent actor', () => {
    expect(extractActor({ actor: { kind: 'agent', agentId: 'agt-1' } })).toEqual({ actorType: 'agent', actorId: 'agt-1' });
  });

  it('falls back to a bare agentId already on many payloads', () => {
    // M08-T04 stamps `actor` onto every event; until then the trail still has
    // to name whoever it can from what handlers publish today.
    expect(extractActor({ agentId: 'agt-2' })).toEqual({ actorType: 'agent', actorId: 'agt-2' });
  });

  it('falls back to a bare userId', () => {
    expect(extractActor({ userId: 'usr-2' })).toEqual({ actorType: 'user', actorId: 'usr-2' });
  });

  it('records "system" rather than an unattributed null when nobody is named', () => {
    // "No human did this" and "we failed to record who did" are different
    // facts. An audit trail that conflates them misleads in the direction
    // that matters.
    expect(extractActor({ taskId: 't1' })).toEqual({ actorType: 'system', actorId: null });
  });

  it('treats an actor object with no id as unattributed rather than trusting kind', () => {
    expect(extractActor({ actor: { kind: 'user' } })).toEqual({ actorType: 'system', actorId: null });
  });
});

describe('extractOrgId', () => {
  it('reads orgId when the event carries one', () => {
    expect(extractOrgId({ orgId: 'org-1' })).toBe('org-1');
  });

  it('returns null for an event that legitimately predates org membership', () => {
    // e.g. a user registering. Dropping these would leave a gap exactly where
    // an account takeover would show.
    expect(extractOrgId({ userId: 'usr-1' })).toBeNull();
  });
});

describe('toAuditRow', () => {
  it('stores the payload verbatim rather than typed columns', () => {
    const payload = { orgId: 'org-1', userId: 'usr-1', requestId: 'req-1', nested: { a: 1 } };
    const row = toAuditRow(event('domain.agent.created', payload, 7));
    expect(JSON.parse(row.payload)).toEqual(payload);
  });

  it('carries subject, sequence and requestId onto the row', () => {
    const now = new Date('2026-08-20T00:00:00Z');
    const row = toAuditRow(event('domain.agent.token_created', { orgId: 'org-1', requestId: 'req-9' }, 42), now);
    expect(row.subject).toBe('domain.agent.token_created');
    expect(row.streamSeq).toBe(42);
    expect(row.requestId).toBe('req-9');
    expect(row.occurredAt).toBe(now);
  });

  it('leaves requestId null when the event was not published during a request', () => {
    expect(toAuditRow(event('domain.retention.swept', {})).requestId).toBeNull();
  });

  it('gives every row its own id', () => {
    const a = toAuditRow(event('domain.task.created', {}, 1));
    const b = toAuditRow(event('domain.task.created', {}, 2));
    expect(a.id).not.toBe(b.id);
  });
});

describe('isUniqueViolation', () => {
  it('recognises SQLite and MySQL phrasing, since this repo runs both', () => {
    expect(isUniqueViolation(new Error('UNIQUE constraint failed: audit_log.stream_seq'))).toBe(true);
    expect(isUniqueViolation(new Error("Duplicate entry '7' for key 'audit_log_stream_seq_unique'"))).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error('x'), { code: 'ER_DUP_ENTRY' }))).toBe(true);
  });

  it('does not swallow an unrelated failure', () => {
    // Everything else must stay loud so the message goes unacked and retries.
    expect(isUniqueViolation(new Error('connection lost'))).toBe(false);
  });
});

describe('projectEvent', () => {
  const original = process.env.STANDALONE;
  beforeEach(() => { process.env.STANDALONE = 'true'; });
  afterEach(() => { if (original === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = original; });

  function fakeDb(onInsert?: () => void) {
    const inserted: any[] = [];
    return {
      inserted,
      db: {
        insert: () => ({
          values: async (row: any) => { onInsert?.(); inserted.push(row); },
        }),
      },
    };
  }

  it('writes the event and reports it as new', async () => {
    const { db, inserted } = fakeDb();
    expect(await projectEvent(db, event('domain.task.created', { orgId: 'org-1' }, 3))).toBe('written');
    expect(inserted).toHaveLength(1);
    expect(inserted[0].subject).toBe('domain.task.created');
  });

  it('treats a redelivered event as a duplicate instead of a second row', async () => {
    // The at-least-once contract: JetStream redelivers anything unacked, so a
    // crash between write and ack replays it. The unique stream_seq makes the
    // replay a no-op — without this the trail would double-count every crash.
    const { db } = fakeDb(() => { throw new Error('UNIQUE constraint failed: audit_log.stream_seq'); });
    expect(await projectEvent(db, event('domain.task.created', {}, 3))).toBe('duplicate');
  });

  it('rethrows any other failure so the message goes unacked and retries', async () => {
    const { db } = fakeDb(() => { throw new Error('database is locked'); });
    await expect(projectEvent(db, event('domain.task.created', {}, 4))).rejects.toThrow('database is locked');
  });
});
