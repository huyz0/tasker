import { expect, it } from 'bun:test';
import { spawn, type Subprocess } from 'bun';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { eq } from 'drizzle-orm';
import { createContextValues } from '@connectrpc/connect';
import { setupDatabase } from '../../db/db';
import { currentUserIdKey } from '../../modules/auth/session';
import { createSchedulesHandler } from '../../modules/schedules/schedules.handler';

const WORKER = String.raw`
const c = JSON.parse(process.env.TASKER_SCHEDULE_CASE);
const { setupDatabase } = await import(c.sourceRoot + '/db/db.ts');
const { createScheduleAdmission } = await import(c.sourceRoot + '/modules/schedules/schedules.handler.ts');
const db = await setupDatabase(c.driver, c.path);
try {
  const admitted = await createScheduleAdmission(db, null, () => new Date(c.now))();
  const result = { count: admitted.length, ids: admitted.map(x => x.run.id) };
  if (c.checkpoint) {
    await Bun.write(c.checkpoint, JSON.stringify(result));
    await new Promise(() => { setInterval(() => {}, 1000); });
  }
  await Bun.write(Bun.stdout, JSON.stringify(result));
} finally {
  if (c.driver === 'mysql') await db.$client.end(); else db.$client.close();
}
`;

type Driver = 'sqlite' | 'mysql';
type Child = { process: Subprocess; output: Promise<string>; errors: Promise<string> };
for (const driver of ['sqlite', 'mysql'] as Driver[]) {
  const enabled = process.env.TASKER_REAL_INTEGRATION === '1'
    && (driver === 'sqlite' || process.env.TASKER_MYSQL_INTEGRATION === '1');
  (enabled ? it : it.skip)(`schedule admission survives real process contention and SIGKILL (${driver})`, async () => {
    const oldStandalone = process.env.STANDALONE, oldName = process.env.DB_NAME;
    const directory = mkdtempSync(join(tmpdir(), `tasker-schedule-${driver}-`));
    const path = join(directory, 'source.sqlite');
    const key = crypto.randomUUID().replaceAll('-', '');
    const databaseName = `tasker_schedule_${key}`;
    const sourceRoot = join(import.meta.dir, '../..');
    const orgId = `org-${key}`, userId = `user-${key}`, projectId = `project-${key}`;
    const children: Child[] = [];
    let db: any, admin: mysql.Connection | undefined;
    function worker(now: string, checkpoint?: string) {
      const process = spawn({ cmd: [Bun.argv[0]!, '--eval', WORKER], cwd: join(sourceRoot, '..'),
        env: { ...globalThis.process.env, LOG_LEVEL: 'silent', NODE_ENV: 'test', TASKER_SCHEDULE_CASE:
          JSON.stringify({ sourceRoot, driver, path, now, checkpoint }) }, stdout: 'pipe', stderr: 'pipe' });
      const child = { process, output: new Response(process.stdout).text(), errors: new Response(process.stderr).text() };
      children.push(child); return child;
    }
    async function result(child: Child) {
      const timer = setTimeout(() => child.process.kill('SIGKILL'), 15_000);
      try {
        const [code, out, errors] = await Promise.all([child.process.exited, child.output, child.errors]);
        expect({ code, errors }).toEqual({ code: 0, errors: '' });
        return JSON.parse(out);
      } finally { clearTimeout(timer); }
    }
    try {
      process.env.STANDALONE = driver === 'sqlite' ? 'true' : 'false';
      if (driver === 'mysql') {
        admin = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD });
        await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4`);
        process.env.DB_NAME = databaseName;
      }
      db = await setupDatabase(driver, path);
      const S: any = driver === 'sqlite' ? await import('../../db/schema.sqlite') : await import('../../db/schema.mysql');
      const createdAt = new Date();
      await db.insert(S.users).values({ id: userId, createdAt });
      await db.insert(S.organizations).values({ id: orgId, name: 'Recovery', slug: orgId, createdAt });
      await db.insert(S.organizationMembers).values({ orgId, userId, role: 'admin', joinedAt: createdAt });
      await db.insert(S.projectTemplates).values({ id: `template-${key}`, orgId, name: 'Recovery', createdAt });
      await db.insert(S.projects).values({ id: projectId, orgId, templateId: `template-${key}`, ownerId: userId, name: 'Recovery', key: 'SCH', createdAt });
      const values = createContextValues(); values.set(currentUserIdKey, userId);
      let now = new Date('2026-11-09T08:00:00Z');
      const handler = createSchedulesHandler(db, null, () => now);
      const { schedule } = await handler.createSchedule({ projectId, name: 'Routine', cadence: 'daily', hourUtc: 9, taskTitle: 'Recovered work' }, { values });
      const raced = await Promise.all([result(worker('2026-11-09T10:00:00Z')), result(worker('2026-11-09T10:00:00Z'))]);
      expect(raced.reduce((sum, value) => sum + value.count, 0)).toBe(1);
      expect(await db.select().from(S.scheduleRuns)).toHaveLength(1);
      expect(await db.select().from(S.tasks)).toHaveLength(0);
      now = new Date('2026-11-10T10:00:00Z');
      const checkpoint = join(directory, 'committed.json');
      const owner = worker(now.toISOString(), checkpoint);
      const deadline = Date.now() + 15_000;
      while (!existsSync(checkpoint) && Date.now() < deadline) {
        if (owner.process.exitCode !== null) throw new Error(`owner exited before admission: ${await owner.errors}`);
        await Bun.sleep(20);
      }
      expect(existsSync(checkpoint)).toBe(true);
      const committed = await Bun.file(checkpoint).json();
      expect(committed.count).toBe(1);
      owner.process.kill('SIGKILL');
      await owner.process.exited;
      const [occurrence] = await db.select().from(S.scheduleRuns).where(eq(S.scheduleRuns.id, committed.ids[0]));
      expect(occurrence).toMatchObject({ outcome: 'queued', slotKey: 'scheduled:2026-11-10T09:00:00.000Z' });
      expect(JSON.parse(occurrence.frozenInputs).title).toBe('Recovered work — 2026-11-10');
      expect((await result(worker(now.toISOString()))).count).toBe(0);
      expect((await handler.getSchedule({ id: schedule.id }, { values })).schedule.nextRunAt).toBe('2026-11-11T09:00:00.000Z');
      expect(await db.select().from(S.tasks)).toHaveLength(0);
    } finally {
      for (const child of children) {
        if (child.process.exitCode === null) child.process.kill('SIGKILL');
        await Promise.all([child.process.exited, child.output, child.errors]);
      }
      if (db) { if (driver === 'mysql') await db.$client.end(); else db.$client.close(); }
      if (admin) { try { await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``); } finally { await admin.end(); } }
      if (oldStandalone === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = oldStandalone;
      if (oldName === undefined) delete process.env.DB_NAME; else process.env.DB_NAME = oldName;
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);
}
