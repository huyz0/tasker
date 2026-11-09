import { describe, it, expect, beforeEach } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { setupIntegrationTest } from '../test/setup';
import * as S from '../db/schema.sqlite';
import { runDomainEventSweep, brokerEventReference, EVENT_LEASE_MS, EVENT_RETENTION_MS, countPendingDomainEvents } from './domainEventRelay';

function latch() {
  let release!: () => void;
  const promise = new Promise<void>(r => { release = r; });
  return { promise, release };
}

describe('durable domain event relay', () => {
  let db: any, clock: number;
  const now = () => clock;
  const event = (id: string, changes: Record<string, unknown> = {}) => db.insert(S.domainEvents).values({
    id, subject: 'domain.task.created', orgId: 'org', projectId: 'project',
    payload: JSON.stringify({ eventId: id, occurredAt: new Date(clock).toISOString(), orgId: 'org', projectId: 'project', title: 'source' }),
    occurredAt: new Date(clock), createdAt: new Date(clock), brokerRequired: true, nextAttemptAt: new Date(clock), ...changes,
  });
  const row = async (id = 'event') => (await db.select().from(S.domainEvents).where(eq(S.domainEvents.id, id)))[0];
  const noLocal = async () => { throw new Error('unexpected local projection'); };

  beforeEach(async () => {
    ({ db } = await setupIntegrationTest());
    clock = Date.UTC(2026, 10, 8);
  });

  it('keeps failures pending and a new sweep retries the same event after its stored backoff', async () => {
    await event('event');
    const sent: string[] = [];
    const publish = async (e: any) => { sent.push(e.id); throw new Error('broker unavailable'); };
    expect(await runDomainEventSweep(db, true, { now, publish, projectLocally: noLocal })).toMatchObject({ retried: 1 });
    const failed = await row();
    expect(await countPendingDomainEvents(db, true)).toBe(1);
    expect(failed).toMatchObject({ attempts: 1, deliveredAt: null, leaseToken: null, lastError: 'broker unavailable' });
    expect(failed.nextAttemptAt.getTime()).toBeGreaterThan(clock);
    clock = failed.nextAttemptAt.getTime() - 1000;
    expect(await runDomainEventSweep(db, true, { now, publish, projectLocally: noLocal })).toMatchObject({ claimed: 0 });
    clock = failed.nextAttemptAt.getTime();
    expect(await runDomainEventSweep(db, true, { now, publish: async e => { sent.push(e.id); }, projectLocally: noLocal })).toMatchObject({ delivered: 1 });
    expect(sent).toEqual(['event', 'event']);
    expect((await row()).deliveredAt).not.toBeNull();
    expect(await countPendingDomainEvents(db, true)).toBe(0);
  });

  it('gives only one live lease to competing sweepers', async () => {
    await event('event');
    const sent: string[] = [];
    const options = { now, publish: async (e: any) => { await Bun.sleep(5); sent.push(e.id); }, projectLocally: noLocal };
    await Promise.all([runDomainEventSweep(db, true, options), runDomainEventSweep(db, true, options)]);
    expect(sent).toEqual(['event']);
    expect((await row()).attempts).toBe(1);
  });

  it.each([false, true])('fences an expired owner after a successor completes (old publish fails: %s)', async oldFails => {
    await event('event');
    const started = latch(), resume = latch();
    const first = runDomainEventSweep(db, true, { now, projectLocally: noLocal, publish: async () => {
      started.release(); await resume.promise; if (oldFails) throw new Error('late failure');
    } });
    await started.promise;
    clock += EVENT_LEASE_MS + 1000;
    const secondStarted = latch(), secondResume = latch();
    const successor = runDomainEventSweep(db, true, { now, projectLocally: noLocal, publish: async () => {
      secondStarted.release(); await secondResume.promise;
    } });
    await secondStarted.promise;
    const ownedBySuccessor = await row();
    try {
      resume.release();
      expect((await first).stale).toBe(1);
      expect(await row()).toMatchObject({ deliveredAt: null, attempts: 2, lastError: null, leaseToken: ownedBySuccessor.leaseToken });
    } finally {
      resume.release(); secondResume.release();
      await Promise.allSettled([first, successor]);
    }
    expect((await successor).delivered).toBe(1);
    expect(await row()).toMatchObject({ attempts: 2, lastError: null, leaseToken: null });

  });

  it('stops taking new leases while draining and settles the in-flight delivery', async () => {
    await event('first'); await event('second');
    const controller = new AbortController(), started = latch(), resume = latch();
    const sent: string[] = [];
    const pending = runDomainEventSweep(db, true, { now, concurrency: 1, signal: controller.signal, projectLocally: noLocal, publish: async e => {
      sent.push(e.id); started.release(); await resume.promise;
    } });
    await started.promise;
    controller.abort(); resume.release();
    expect((await pending).delivered).toBe(1);
    expect(sent).toHaveLength(1);
    const rows = await db.select().from(S.domainEvents);
    expect(rows.filter((e: any) => e.deliveredAt === null)).toHaveLength(1);
    expect(rows.find((e: any) => e.deliveredAt === null).attempts).toBe(0);
  });

  it('projects brokerless events locally without silently requiring a broker', async () => {
    await event('event', { brokerRequired: false });
    const projected: string[] = [];
    expect(await runDomainEventSweep(db, true, { now, publish: async () => { throw new Error('must not publish'); }, projectLocally: async e => { projected.push(e.id); } })).toMatchObject({ delivered: 1 });
    expect(projected).toEqual(['event']);
  });

  it('prunes old delivered sources in bounded batches and never prunes pending work', async () => {
    const old = new Date(clock - EVENT_RETENTION_MS - 1000);
    await event('pending', { createdAt: old, nextAttemptAt: new Date(clock + 60_000) });
    await event('settled', { createdAt: old, deliveredAt: old });
    expect(await runDomainEventSweep(db, true, { now, publish: async () => {}, projectLocally: noLocal })).toMatchObject({ pruned: 1 });
    expect((await db.select().from(S.domainEvents)).map((r: any) => r.id)).toEqual(['pending']);
  });

  it('awaits other in-flight sends when a worker cannot persist its completion or retry', async () => {
    await event('broken'); await event('held');
    await db.run(sql.raw("CREATE TRIGGER fail_relay_update BEFORE UPDATE ON domain_events WHEN OLD.id = 'broken' AND OLD.attempts > 0 BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END"));
    const started = latch(), resume = latch();
    let settled = false;
    const pending = runDomainEventSweep(db, true, { now, concurrency: 2, projectLocally: noLocal, publish: async e => {
      if (e.id === 'held') { started.release(); await resume.promise; }
    } });
    const observed = pending.then(() => { settled = true; return null; }, error => { settled = true; return error; });
    try {
      await started.promise;
      await Bun.sleep(10);
      expect(settled).toBe(false);
    } finally {
      resume.release();
      const failure = await observed;
      expect(String(failure)).toContain('storage unavailable');
    }
    const rows = await db.select().from(S.domainEvents);
    expect(rows.find((e: any) => e.id === 'held').deliveredAt).not.toBeNull();
    expect(rows.find((e: any) => e.id === 'broken').deliveredAt).toBeNull();
  });

  it('bounds broker messages while retaining full source content and producer identity', async () => {
    const content = 'x'.repeat(1_100_000);
    await event('event', { payload: JSON.stringify({ eventId: 'event', content, actor: { kind: 'user', userId: 'u' }, requestId: 'request', traceparent: 'trace' }) });
    const source = await row();
    const reference = brokerEventReference(source);
    expect(reference).toMatchObject({ eventRef: true, eventId: 'event', orgId: 'org', projectId: 'project', actor: { kind: 'user', userId: 'u' }, requestId: 'request', traceparent: 'trace' });
    expect(JSON.stringify(reference).length).toBeLessThan(2000);
    expect(JSON.parse(source.payload).content).toBe(content);
    expect(reference).not.toHaveProperty('content');
  });
});
