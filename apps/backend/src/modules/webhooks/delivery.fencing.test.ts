import { beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupIntegrationTest, seedOrgWithAdmin } from '../../test/setup';
import * as S from '../../db/schema.sqlite';
import { encryptToken } from '../../lib/crypto';
import { runWebhookSweep } from './delivery';

function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

describe('webhook fenced ownership', () => {
  let db: any, clock: number;
  const now = () => clock;
  const delivery = async () => (await db.select().from(S.webhookDeliveries))[0];
  const hook = async () => (await db.select().from(S.webhooks))[0];
  beforeEach(async () => {
    ({ db } = await setupIntegrationTest());
    clock = Date.UTC(2026, 10, 9);
    await seedOrgWithAdmin(db, { orgId: 'org', userId: 'owner' });
    await db.insert(S.webhooks).values({ id: 'hook', orgId: 'org', url: 'https://fixture.example/events', secretEncrypted: encryptToken('fixture-signing-key'), events: '["task.*"]', active: true, consecutiveFailures: 19, createdAt: new Date(clock) });
    await db.insert(S.webhookDeliveries).values({ id: 'delivery', webhookId: 'hook', eventId: 'event', eventType: 'task.created', payload: '{}', nextAttemptAt: new Date(clock), createdAt: new Date(clock) });
  });

  for (const oldFails of [false, true]) for (const successorSucceeds of [false, true]) {
    it(`leaves successor result/counters unchanged (oldFails=${oldFails}, successorSucceeds=${successorSucceeds})`, async () => {
      const started = latch(), resume = latch();
      const first = runWebhookSweep(db, true, { now, send: async () => {
        started.release(); await resume.promise;
        if (oldFails) throw new Error('late sender failure');
        return { status: 201 };
      } });
      try {
        await started.promise;
        clock += 61_000;
        await runWebhookSweep(db, true, { now, send: async () => ({ status: successorSucceeds ? 204 : 503 }) });
        const expectedDelivery = await delivery(), expectedHook = await hook();
        resume.release(); await first;
        expect(await delivery()).toEqual(expectedDelivery);
        expect(await hook()).toEqual(expectedHook);
      } finally { resume.release(); await first; }
    });
  }

  it('rolls back delivered status when endpoint counter persistence fails, leaving recoverable work', async () => {
    await db.run(sql.raw("CREATE TRIGGER fail_hook_update BEFORE UPDATE ON webhooks BEGIN SELECT RAISE(ABORT, 'counter storage unavailable'); END"));
    const errors: unknown[] = [];
    const result = await runWebhookSweep(db, true, { now, send: async () => ({ status: 204 }), onError: error => { errors.push(error); } });
    expect(errors).toHaveLength(1);
    expect(result.delivered).toBe(0);
    expect(await delivery()).toMatchObject({ status: 'pending', attempts: 0 });
    await db.run(sql.raw('DROP TRIGGER fail_hook_update'));
    clock += 61_000;
    expect((await runWebhookSweep(db, true, { now, send: async () => ({ status: 204 }) })).delivered).toBe(1);
  });

  it('awaits the other sender even when a worker error reporter throws', async () => {
    await db.insert(S.webhookDeliveries).values({ id: 'held', webhookId: 'hook', eventId: 'held-event', eventType: 'task.created', payload: '{}', nextAttemptAt: new Date(clock), createdAt: new Date(clock) });
    await db.run(sql.raw("CREATE TRIGGER fail_hook_update BEFORE UPDATE ON webhooks BEGIN SELECT RAISE(ABORT, 'counter storage unavailable'); END"));
    const started = latch(), resume = latch();
    let settled = false;
    const pending = runWebhookSweep(db, true, { now, concurrency: 2,
      send: async (_url, _body, headers) => { if (headers['x-tasker-delivery'] === 'held') { started.release(); await resume.promise; } return { status: 204 }; },
      onError: () => { throw new Error('error reporter failed'); },
    });
    const observed = pending.then(() => { settled = true; return null; }, error => { settled = true; return error; });
    try { await started.promise; await Bun.sleep(10); expect(settled).toBe(false); }
    finally { resume.release(); expect(String(await observed)).toContain('error reporter failed'); }
  });

  it('stops taking new delivery leases during drain while finishing the active sender', async () => {
    await db.insert(S.webhookDeliveries).values({ id: 'second', webhookId: 'hook', eventId: 'second-event', eventType: 'task.created', payload: '{}', nextAttemptAt: new Date(clock), createdAt: new Date(clock) });
    const controller = new AbortController(), started = latch(), resume = latch();
    let sent = 0;
    const pending = runWebhookSweep(db, true, { now, concurrency: 1, signal: controller.signal, send: async () => { sent++; started.release(); await resume.promise; return { status: 204 }; } });
    await started.promise;
    controller.abort(); resume.release();
    await pending;
    expect(sent).toBe(1);
    expect((await db.select().from(S.webhookDeliveries)).filter((row: any) => row.status === 'pending')).toHaveLength(1);
  });
});
