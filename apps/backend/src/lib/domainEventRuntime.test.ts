import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { setupIntegrationTest } from '../test/setup';
import * as S from '../db/schema.sqlite';
import { createDomainEventRuntime } from './domainEventRuntime';

describe('durable event runtime', () => {
  let db: any, clock: number;
  const now = () => clock;
  const seed = (id = 'event', brokerRequired = true) => db.insert(S.domainEvents).values({ id, subject: 'domain.task.created', payload: JSON.stringify({ eventId: id, occurredAt: new Date(clock).toISOString(), content: 'x'.repeat(1_100_000) }), occurredAt: new Date(clock), createdAt: new Date(clock), nextAttemptAt: new Date(clock), brokerRequired });
  beforeEach(async () => { ({ db } = await setupIntegrationTest()); clock = Date.UTC(2026, 10, 9); });

  it('recovers initial connection failure, provisions the stream and publishes acknowledged stable references', async () => {
    await seed();
    let attempts = 0, provisioned = false;
    const sent: any[] = [];
    const connection = {
      isClosed: () => false,
      jetstreamManager: async () => ({ streams: { info: async () => { throw new Error('not found'); }, add: async () => { provisioned = true; } } }),
      jetstream: () => ({ publish: async (subject: string, data: Uint8Array, options: any) => { expect(provisioned).toBe(true); sent.push({ subject, payload: JSON.parse(new TextDecoder().decode(data)), options }); return {}; } }),
      drain: async () => {},
    };
    const runtime = createDomainEventRuntime(db, true, { now, url: 'nats://fixture:4222', connect: async () => { if (++attempts === 1) throw new Error('offline'); return connection as any; } });
    expect((await runtime.sweep()).retried).toBe(1);
    expect(runtime.getConnection()).toBeNull();
    clock += 6000;
    expect((await runtime.sweep()).delivered).toBe(1);
    expect(runtime.getConnection()).toBe(connection as any);
    expect(attempts).toBe(2);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ subject: 'domain.task.created', options: { msgID: 'event', timeout: 5000 }, payload: { eventRef: true, eventId: 'event' } });
    expect(JSON.stringify(sent[0].payload).length).toBeLessThan(2000);
    await runtime.close();
  });

  it('connects a configured broker even before the first event or subscription', async () => {
    const connection = { isClosed: () => false, drain: async () => {} };
    const runtime = createDomainEventRuntime(db, true, { now, url: 'nats://fixture:4222', connect: async () => connection as any });
    runtime.start();
    try { await Bun.sleep(10); expect(runtime.getConnection()).toBe(connection as any); }
    finally { await runtime.close(); }
  });

  it('projects brokerless events once locally and takes no leases after stopping', async () => {
    await seed('event', false);
    const runtime = createDomainEventRuntime(db, true, { now, connect: async () => { throw new Error('must not connect'); } });
    expect((await runtime.sweep()).delivered).toBe(1);
    await db.update(S.domainEvents).set({ deliveredAt: null }).where(eq(S.domainEvents.id, 'event'));
    expect((await runtime.sweep()).delivered).toBe(1);
    expect(await db.select().from(S.auditLog)).toHaveLength(1);
    await seed('pending', false);
    runtime.stopLeasing();
    expect((await runtime.sweep()).claimed).toBe(0);
    await runtime.close();
    expect((await db.select().from(S.domainEvents).where(eq(S.domainEvents.id, 'pending')))[0].deliveredAt).toBeNull();
  });
});
