import { expect, it } from 'bun:test';
import mysql from 'mysql2/promise';
import { eq } from 'drizzle-orm';
import { setupDatabase } from '../db/db';
import * as S from '../db/schema.mysql';
import { EVENT_LEASE_MS, runDomainEventSweep } from './domainEventRelay';

const mysqlTest = process.env.TASKER_MYSQL_INTEGRATION === '1' ? it : it.skip;
function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

mysqlTest('MySQL relay recovers expired owners and retries the same source in an isolated database', async () => {
  const originalName = process.env.DB_NAME;
  const name = `tasker_relay_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
  });
  let db: any;
  const running: Promise<unknown>[] = [];
  const resume = latch(), started = latch();
  try {
    // The name is generated here, never caller-controlled. Only this owned
    // disposable schema is removed; never sweep an existing user's events.
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);
    process.env.DB_NAME = name;
    db = await setupDatabase('mysql');
    let clock = Date.UTC(2026, 10, 9);
    const now = () => clock;
    const row = async () => (await db.select().from(S.domainEvents).where(eq(S.domainEvents.id, 'event')))[0];
    const options = { now, projectLocally: async () => { throw new Error('unexpected local projection'); } };
    await db.insert(S.domainEvents).values({ id: 'event', subject: 'domain.task.created', payload: '{"eventId":"event"}', occurredAt: new Date(clock), createdAt: new Date(clock), nextAttemptAt: new Date(clock), brokerRequired: true });
    const owner = runDomainEventSweep(db, false, { ...options, publish: async () => {
      started.release(); await resume.promise; throw new Error('late failure');
    } });
    running.push(owner);
    await started.promise;
    expect((await runDomainEventSweep(db, false, { ...options, publish: async () => {} })).claimed).toBe(0);
    clock += EVENT_LEASE_MS + 1000;
    expect((await runDomainEventSweep(db, false, { ...options, publish: async () => {} })).delivered).toBe(1);
    resume.release();
    expect((await owner).stale).toBe(1);
    expect(await row()).toMatchObject({ attempts: 2, leaseToken: null, lastError: null });
    expect((await row()).deliveredAt).not.toBeNull();

    await db.delete(S.domainEvents);
    await db.insert(S.domainEvents).values({ id: 'event', subject: 'domain.task.created', payload: '{}', occurredAt: new Date(clock), createdAt: new Date(clock), nextAttemptAt: new Date(clock), brokerRequired: true });
    const sent: string[] = [];
    const failure = await runDomainEventSweep(db, false, { ...options, publish: async e => { sent.push(e.id); throw new Error('broker down'); } });
    expect(failure.retried).toBe(1);
    clock = (await row()).nextAttemptAt.getTime();
    expect((await runDomainEventSweep(db, false, { ...options, publish: async e => { sent.push(e.id); } })).delivered).toBe(1);
    expect(sent).toEqual(['event', 'event']);
  } finally {
    resume.release();
    await Promise.allSettled(running);
    if (db) await db.$client.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await admin.end();
    if (originalName === undefined) delete process.env.DB_NAME; else process.env.DB_NAME = originalName;
  }
}, 20_000);
