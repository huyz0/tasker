import { beforeEach, describe, expect, it } from 'bun:test';
import { setupIntegrationTest } from '../test/setup';
import * as S from '../db/schema.sqlite';
import { projectEvent, hydrateDomainEvent } from './auditProjector';
import { brokerEventReference } from '../lib/domainEventRelay';

describe('durable audit projection', () => {
  let db: any;
  const occurredAt = '2026-11-08T01:02:03.000Z';
  const event = (id: string, seq = 1) => ({ subject: 'domain.task.created', seq, payload: { eventId: id, occurredAt, title: id } });
  beforeEach(async () => { ({ db } = await setupIntegrationTest()); });

  it('deduplicates by producer identity, permits reused sequences and keeps producer time', async () => {
    expect(await projectEvent(db, event('producer-a'))).toBe('written');
    expect(await projectEvent(db, event('producer-a', 99))).toBe('duplicate');
    expect(await projectEvent(db, event('producer-b'))).toBe('written');
    const rows = await db.select().from(S.auditLog);
    expect(rows.map((r: any) => r.eventId).sort()).toEqual(['producer-a', 'producer-b']);
    expect(rows.every((r: any) => r.occurredAt.toISOString() === occurredAt)).toBe(true);
  });

  it('hydrates references from SQL, retaining full content while rejecting routing/identity mismatches', async () => {
    const payload = { ...event('source').payload, content: 'x'.repeat(1_100_000) };
    await db.insert(S.domainEvents).values({ id: 'source', subject: 'domain.task.created', payload: JSON.stringify(payload), occurredAt: new Date(occurredAt), createdAt: new Date(), brokerRequired: false, nextAttemptAt: new Date() });
    const [stored] = await db.select().from(S.domainEvents);
    const reference = { subject: stored.subject, seq: 1, payload: brokerEventReference(stored) };
    const hydrated = await hydrateDomainEvent(db, reference);
    expect(hydrated.payload).toEqual(payload);
    expect(await projectEvent(db, reference)).toBe('written');
    expect(JSON.parse((await db.select().from(S.auditLog))[0].payload).content).toHaveLength(1_100_000);
    await expect(projectEvent(db, { ...reference, payload: { ...reference.payload, orgId: 'wrong' } })).rejects.toThrow();
    await expect(projectEvent(db, { ...reference, subject: 'domain.task.deleted' })).rejects.toThrow();
    await expect(projectEvent(db, { ...reference, payload: { ...reference.payload, eventId: 'missing' } })).rejects.toThrow();
  });

  it('preserves legacy full payload replay and rejects conflicting producer identity', async () => {
    const legacy = { subject: 'domain.task.created', seq: 10, payload: { title: 'legacy' } };
    expect(await projectEvent(db, legacy)).toBe('written');
    expect(await projectEvent(db, legacy)).toBe('duplicate');
    expect(await projectEvent(db, event('same'))).toBe('written');
    await expect(projectEvent(db, { ...event('same', 88), payload: { ...event('same').payload, title: 'different' } })).rejects.toThrow();
    expect(await db.select().from(S.auditLog)).toHaveLength(2);
  });
});
