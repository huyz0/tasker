import { describe, it, expect } from 'bun:test';
import { createContextValues } from '@connectrpc/connect';
import { and, eq } from 'drizzle-orm';
import { spawn, type Subprocess } from 'bun';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupDatabase } from '../../db/db';
import { purgeOrgCascade } from '../../lib/cascadePurge';
import { currentPrincipalKey } from '../../modules/auth/session';
import { createTaskManagementHandler } from '../../modules/tasks/tasks.handler';

// The worker executes the real task operation. Only its final idempotency
// response write is paused; no production fault-injection flag is introduced.
const WORKER = String.raw`
const c = JSON.parse(process.env.TASKER_RECOVERY_CASE);
const { setupDatabase } = await import(c.sourceRoot + '/db/db.ts');
const { transactionConflict } = await import(c.sourceRoot + '/db/errors.ts');
const { createTaskManagementHandler } = await import(c.sourceRoot + '/modules/tasks/tasks.handler.ts');
const { currentPrincipalKey } = await import(c.sourceRoot + '/modules/auth/session.ts');
const { createContextValues, Code } = await import('@connectrpc/connect');
const S = await import(c.sourceRoot + '/db/schema.' + (c.driver === 'sqlite' ? 'sqlite' : 'mysql') + '.ts');
let db;
try {
  for (let attempt = 0; attempt < 30; attempt++) {
    try { db = await setupDatabase(c.driver, c.path); break; }
    catch (error) { if (!transactionConflict(error) || attempt === 29) throw error; await Bun.sleep(20); }
  }
  const guarded = c.pause ? new Proxy(db, {
    get(target, key) {
      if (key !== 'update') return Reflect.get(target, key);
      return (table) => {
        const builder = target.update(table);
        if (table !== S.idempotencyKeys) return builder;
        return { set(values) {
          const update = builder.set(values);
          return { where(condition) { return (async () => {
            await Bun.write(c.checkpoint, 'task-written-before-response');
            await new Promise(() => { setInterval(() => {}, 1000); });
            return await update.where(condition);
          })(); } };
        } };
      };
    },
  }) : db;
  const values = createContextValues();
  values.set(currentPrincipalKey, { kind: 'user', userId: c.userId });
  const handler = createTaskManagementHandler(guarded, null);
  let response;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      response = await handler.createTask({ projectId: c.projectId, title: 'Recover this task', status: 'todo', idempotencyKey: c.key }, { values });
      break;
    } catch (error) {
      if (error.code !== Code.Aborted || attempt === 29) throw error;
      await Bun.sleep(20);
    }
  }
  await Bun.write(Bun.stdout, JSON.stringify({ taskId: response.task.id }) + '\n');
} catch (error) {
  await Bun.write(Bun.stderr, String(error.message) + '\n');
  process.exitCode = 1;
} finally {
  if (db) { if (c.driver === 'mysql') await db.$client.end(); else db.$client.close(); }
}
`;

type Driver = 'sqlite' | 'mysql';
async function fixture(driver: Driver) {
  const previous = process.env.STANDALONE;
  process.env.STANDALONE = driver === 'sqlite' ? 'true' : 'false';
  const directory = mkdtempSync(join(tmpdir(), 'tasker-recovery-'));
  const path = join(directory, 'recovery.sqlite');
  const db: any = await setupDatabase(driver, path);
  const S: any = driver === 'sqlite' ? await import('../../db/schema.sqlite') : await import('../../db/schema.mysql');
  const suffix = crypto.randomUUID(), orgId = `org-${suffix}`, userId = `user-${suffix}`;
  const projectId = `project-${suffix}`, templateId = `template-${suffix}`, key = `key-${suffix}`;
  const createdAt = new Date();
  await db.insert(S.users).values({ id: userId, createdAt });
  await db.insert(S.organizations).values({ id: orgId, name: 'Recovery', slug: orgId, createdAt });
  await db.insert(S.organizationMembers).values({ orgId, userId, role: 'admin', joinedAt: createdAt });
  await db.insert(S.projectTemplates).values({ id: templateId, orgId, name: 'Recovery', createdAt });
  await db.insert(S.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: 'Recovery', key: 'REC', nextTaskNumber: 1, createdAt });
  const children: Subprocess[] = [];
  const checkpoint = join(directory, 'checkpoint');
  const worker = (pause = false) => {
    const child = spawn({
      cmd: [process.execPath, '--eval', WORKER], cwd: join(import.meta.dir, '../../..'),
      env: {
        ...process.env, STANDALONE: driver === 'sqlite' ? 'true' : 'false', LOG_LEVEL: 'silent',
        TASKER_RECOVERY_CASE: JSON.stringify({ sourceRoot: join(import.meta.dir, '../..'), driver, path, userId, projectId, key, pause, checkpoint }),
      }, stdout: 'pipe', stderr: 'pipe',
    });
    children.push(child);
    return child;
  };
  const read = async (child: Subprocess) => {
    const timeout = setTimeout(() => child.kill(), 15_000);
    try {
      const [status, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout as ReadableStream).text(), new Response(child.stderr as ReadableStream).text()]);
      expect({ status, stderr }).toEqual({ status: 0, stderr: '' });
      return JSON.parse(stdout) as { taskId: string };
    } finally { clearTimeout(timeout); }
  };
  const snapshot = async () => {
    const tasks = await db.select().from(S.tasks).where(eq(S.tasks.projectId, projectId));
    const [project] = await db.select().from(S.projects).where(eq(S.projects.id, projectId));
    const keys = await db.select().from(S.idempotencyKeys).where(and(eq(S.idempotencyKeys.principalKey, `user:${userId}`), eq(S.idempotencyKeys.idempotencyKey, key)));
    return { taskCount: tasks.length, taskId: tasks[0]?.id, nextTaskNumber: project.nextTaskNumber, responses: keys.map((r: any) => JSON.parse(r.responseJson)) };
  };
  const cleanup = async () => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
    await Promise.all(children.map(child => child.exited));
    await db.delete(S.idempotencyKeys).where(eq(S.idempotencyKeys.principalKey, `user:${userId}`));
    await purgeOrgCascade(db, orgId);
    await db.delete(S.users).where(eq(S.users.id, userId));
    if (driver === 'mysql') await db.$client.end(); else db.$client.close();
    rmSync(directory, { recursive: true, force: true });
    if (previous === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = previous;
  };
  return { db, projectId, userId, key, worker, read, snapshot, cleanup, checkpoint };
}

for (const driver of ['sqlite', 'mysql'] as const) {
  const enabled = process.env.TASKER_REAL_INTEGRATION === '1' && (driver === 'sqlite' || process.env.TASKER_MYSQL_INTEGRATION === '1');
  const suite = enabled ? describe : describe.skip;
  suite(`cross-process mutation recovery (${driver})`, () => {
    it('two separate workers retry one key into one actual task', async () => {
      const f = await fixture(driver);
      try {
        const [first, second] = await Promise.all([f.read(f.worker()), f.read(f.worker())]);
        expect(second.taskId).toBe(first.taskId);
        const state = await f.snapshot();
        expect(state.taskCount).toBe(1);
        expect(state.nextTaskNumber).toBe(2);
        expect(state.responses).toHaveLength(1);
        expect(state.responses[0].task.id).toBe(first.taskId);
      } finally { await f.cleanup(); }
    }, 30_000);

    it('a worker killed after the task write leaves no partial mutation and a new worker recovers the key', async () => {
      const f = await fixture(driver);
      try {
        const paused = f.worker(true);
        for (let attempt = 0; attempt < 200 && !existsSync(f.checkpoint) && paused.exitCode === null; attempt++) await Bun.sleep(25);
        expect(existsSync(f.checkpoint)).toBe(true);
        paused.kill('SIGKILL');
        await paused.exited;
        const rolledBack = await f.snapshot();
        expect(rolledBack).toMatchObject({ taskCount: 0, nextTaskNumber: 1, responses: [] });
        const recovered = await f.read(f.worker());
        const state = await f.snapshot();
        expect(state.taskCount).toBe(1);
        expect(state.nextTaskNumber).toBe(2);
        expect(state.responses[0].task.id).toBe(recovered.taskId);
        // Replay through the parent as well, not only the worker's code.
        const values = createContextValues();
        values.set(currentPrincipalKey, { kind: 'user', userId: f.userId });
        expect((await createTaskManagementHandler(f.db).createTask({ projectId: f.projectId, title: 'Recover this task', status: 'todo', idempotencyKey: f.key }, { values })).task.id).toBe(recovered.taskId);
      } finally { await f.cleanup(); }
    }, 30_000);
  });
}
