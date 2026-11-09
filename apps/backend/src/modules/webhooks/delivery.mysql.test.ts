import { expect, it } from 'bun:test';
import mysql from 'mysql2/promise';
import { eq, sql } from 'drizzle-orm';
import { setupDatabase } from '../../db/db';
import * as S from '../../db/schema.mysql';
import { encryptToken } from '../../lib/crypto';
import { runWebhookSweep } from './delivery';

const mysqlTest = process.env.TASKER_MYSQL_INTEGRATION === '1' ? it : it.skip;
function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

mysqlTest('MySQL webhook results fence stale owners and roll back endpoint-counter failures', async () => {
  const previousName = process.env.DB_NAME;
  const name = `tasker_webhook_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || 'password' });
  let db: any;
  let owner: Promise<unknown> | undefined;
  const started = latch(), resume = latch();
  try {
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);
    process.env.DB_NAME = name;
    db = await setupDatabase('mysql');
    let clock = Date.UTC(2026, 10, 9);
    const now = () => clock;
    await db.insert(S.users).values({ id: 'owner' });
    await db.insert(S.organizations).values({ id: 'org', name: 'Fixture', slug: 'fixture' });
    await db.insert(S.organizationMembers).values({ orgId: 'org', userId: 'owner', role: 'admin' });
    await db.insert(S.webhooks).values({ id: 'hook', orgId: 'org', url: 'https://fixture.example/events', secretEncrypted: encryptToken('fixture-signing-key'), events: '["task.*"]', active: true, consecutiveFailures: 19, createdAt: new Date(clock) });
    await db.insert(S.webhookDeliveries).values({ id: 'delivery', webhookId: 'hook', eventId: 'event', eventType: 'task.created', payload: '{}', nextAttemptAt: new Date(clock), createdAt: new Date(clock) });
    const delivery = async () => (await db.select().from(S.webhookDeliveries))[0];
    const hook = async () => (await db.select().from(S.webhooks))[0];
    owner = runWebhookSweep(db, false, { now, send: async () => { started.release(); await resume.promise; throw new Error('late sender failure'); } });
    await started.promise;
    clock += 61_000;
    expect((await runWebhookSweep(db, false, { now, send: async () => ({ status: 503 }) })).disabled).toBe(1);
    const expectedDelivery = await delivery(), expectedHook = await hook();
    resume.release(); await owner;
    expect(await delivery()).toEqual(expectedDelivery);
    expect(await hook()).toEqual(expectedHook);

    await db.update(S.webhooks).set({ active: true, consecutiveFailures: 0, disabledReason: null }).where(eq(S.webhooks.id, 'hook'));
    await db.update(S.webhookDeliveries).set({ status: 'pending', attempts: 0, nextAttemptAt: new Date(clock), claimedUntil: null, leaseToken: null }).where(eq(S.webhookDeliveries.id, 'delivery'));
    await db.execute(sql.raw("CREATE TRIGGER fail_hook_counter BEFORE UPDATE ON webhooks FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'counter storage unavailable'"));
    const errors: unknown[] = [];
    expect((await runWebhookSweep(db, false, { now, send: async () => ({ status: 204 }), onError: error => { errors.push(error); } })).delivered).toBe(0);
    expect(errors).toHaveLength(1);
    expect(await delivery()).toMatchObject({ status: 'pending', attempts: 0 });
    await db.execute(sql.raw('DROP TRIGGER fail_hook_counter'));
    clock += 61_000;
    expect((await runWebhookSweep(db, false, { now, send: async () => ({ status: 204 }) })).delivered).toBe(1);
  } finally {
    resume.release();
    if (owner) await owner;
    if (db) await db.$client.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await admin.end();
    if (previousName === undefined) delete process.env.DB_NAME; else process.env.DB_NAME = previousName;
  }
}, 30_000);
