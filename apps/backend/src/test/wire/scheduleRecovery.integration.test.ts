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
import { purgeExpiredIdempotencyKeys } from '../../lib/idempotency';
import { createTaskManagementHandler } from '../../modules/tasks/tasks.handler';
import { createWorkflowsHandler } from '../../modules/workflows/workflows.handler';
import { createSchedulesHandler, createScheduleAdmission } from '../../modules/schedules/schedules.handler';

const WORKER = String.raw`
const c = JSON.parse(process.env.TASKER_SCHEDULE_CASE);
const { setupDatabase } = await import(c.sourceRoot + '/db/db.ts');
const { createScheduleAdmission } = await import(c.sourceRoot + '/modules/schedules/schedules.handler.ts');
const real = await setupDatabase(c.driver, c.path);
let db = real;
try {
  const { setDurableDomainEventCapture } = await import(c.sourceRoot + '/lib/natsCorrelation.ts');
  const { captureDomainEvent } = await import(c.sourceRoot + '/lib/domainEventOutbox.ts');
  setDurableDomainEventCapture((tx, standalone, event) => captureDomainEvent(tx, standalone, event, { brokerRequired: false }));
  let result;
  if (c.started) await Bun.write(c.started, 'ready');
  if (c.gate) while (!await Bun.file(c.gate).exists()) await Bun.sleep(20);
  if (c.mode === 'purge') {
    const { purgeProjectCascade } = await import(c.sourceRoot + '/lib/cascadePurge.ts');
    const purged = await purgeProjectCascade(db, c.projectId, async () => {
      await Bun.write(c.checkpoint, JSON.stringify({ locked: true }));
      while (!await Bun.file(c.release).exists()) await Bun.sleep(20);
      return true;
    });
    result = { purged };
  } else if (c.mode && c.mode !== 'admit') {
    const S = await import(c.sourceRoot + '/db/schema.' + c.driver + '.ts');
    const { createScheduleExecutor } = await import(c.sourceRoot + '/modules/schedules/occurrenceExecution.ts');
    if (c.mode === 'before-receipt') db = new Proxy(real, { get(target, key) {
      if (key === 'update') return table => table === S.scheduleRuns ? {
        set: value => value.outcome === 'created' ? { where: async () => {
          const provisional = await db.select({ id: S.tasks.id }).from(S.tasks);
          await Bun.write(c.checkpoint, JSON.stringify({ provisional }));
          await new Promise(() => { setInterval(() => {}, 1000); });
        } } : target.update(table).set(value),
      } : target.update(table);
      return Reflect.get(target, key);
    } });
    const executor = createScheduleExecutor(db, null, () => new Date(c.now));
    let lease, deferred = false;
    try {
    lease = await executor.claim(c.runId);
    if (c.mode === 'claim-wait') {
      if (!lease) throw new Error('expected a recoverable lease');
      await Bun.write(c.checkpoint, JSON.stringify({ lease }));
      while (!await Bun.file(c.release).exists()) await Bun.sleep(20);
    }
    if (lease) await executor.execute(lease);
    } catch (error) {
      const { transactionConflict } = await import(c.sourceRoot + '/db/errors.ts');
      if (!c.allowConflict || !transactionConflict(error)) throw error;
      deferred = true;
    }
    const receipt = await executor.loadRun(c.runId);
    result = deferred ? { deferred: true } : { id: receipt?.id, outcome: receipt?.outcome, taskId: receipt?.taskId };
  } else {
    const admitted = await createScheduleAdmission(db, null, () => new Date(c.now))();
    result = { count: admitted.length, ids: admitted.map(x => x.run.id) };
  }
  if (c.checkpoint && c.mode !== 'claim-wait' && c.mode !== 'purge') {
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
  (enabled ? it : it.skip)(`schedule recovery survives real process contention, SIGKILL and stale SIGSTOP owners (${driver})`, async () => {
    const oldStandalone = process.env.STANDALONE, oldName = process.env.DB_NAME;
    const directory = mkdtempSync(join(tmpdir(), `tasker-schedule-${driver}-`));
    const path = join(directory, 'source.sqlite');
    const key = crypto.randomUUID().replaceAll('-', '');
    const databaseName = `tasker_schedule_${key}`;
    const sourceRoot = join(import.meta.dir, '../..');
    const orgId = `org-${key}`, userId = `user-${key}`, projectId = `project-${key}`;
    const children: Child[] = [];
    let db: any, admin: mysql.Connection | undefined;
    function worker(now: string, checkpoint?: string, extra: Record<string, unknown> = {}) {
      const process = spawn({ cmd: [Bun.argv[0]!, '--eval', WORKER], cwd: join(sourceRoot, '..'),
        env: { ...globalThis.process.env, LOG_LEVEL: 'silent', NODE_ENV: 'test', TASKER_SCHEDULE_CASE:
          JSON.stringify({ sourceRoot, driver, path, now, checkpoint, ...extra }) }, stdout: 'pipe', stderr: 'pipe' });
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
    async function checkpoint(child: Child, name: string) {
      const deadline = Date.now() + 15_000;
      while (!existsSync(name) && Date.now() < deadline) {
        if (child.process.exitCode !== null) throw new Error(`worker exited before checkpoint: ${await child.errors}`);
        await Bun.sleep(20);
      }
      expect(existsSync(name)).toBe(true);
      return Bun.file(name).json();
    }
    async function started(child: Child, name: string) {
      const deadline = Date.now() + 15_000;
      while (!existsSync(name) && Date.now() < deadline) {
        if (child.process.exitCode !== null) throw new Error(`worker failed before contention: ${await child.errors}`);
        await Bun.sleep(20);
      }
      expect(existsSync(name)).toBe(true);
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
      // Boot/migrate connections before releasing concurrent operations. A
      // migration-lock failure proves startup contention, not admission safety.
      const raceGate = join(directory, 'race-go');
      const firstReady = join(directory, 'first-ready'), secondReady = join(directory, 'second-ready');
      const first = worker('2026-11-09T10:00:00Z', undefined, { started: firstReady, gate: raceGate });
      await started(first, firstReady);
      const second = worker('2026-11-09T10:00:00Z', undefined, { started: secondReady, gate: raceGate });
      await started(second, secondReady);
      await Bun.write(raceGate, 'go');
      const raced = await Promise.all([result(first), result(second)]);
      expect(raced.reduce((sum, value) => sum + value.count, 0)).toBe(1);
      expect(await db.select().from(S.scheduleRuns)).toHaveLength(1);
      expect(await db.select().from(S.tasks)).toHaveLength(0);
      now = new Date('2026-11-10T10:00:00Z');
      const admittedCheckpoint = join(directory, 'committed.json');
      const owner = worker(now.toISOString(), admittedCheckpoint);
      const deadline = Date.now() + 15_000;
      while (!existsSync(admittedCheckpoint) && Date.now() < deadline) {
        if (owner.process.exitCode !== null) throw new Error(`owner exited before admission: ${await owner.errors}`);
        await Bun.sleep(20);
      }
      expect(existsSync(admittedCheckpoint)).toBe(true);
      const committed = await Bun.file(admittedCheckpoint).json();
      expect(committed.count).toBe(1);
      owner.process.kill('SIGKILL');
      await owner.process.exited;
      const [occurrence] = await db.select().from(S.scheduleRuns).where(eq(S.scheduleRuns.id, committed.ids[0]));
      expect(occurrence).toMatchObject({ outcome: 'queued', slotKey: 'scheduled:2026-11-10T09:00:00.000Z' });
      expect(JSON.parse(occurrence.frozenInputs).title).toBe('Recovered work — 2026-11-10');
      expect((await result(worker(now.toISOString()))).count).toBe(0);
      expect((await handler.getSchedule({ id: schedule.id }, { values })).schedule.nextRunAt).toBe('2026-11-11T09:00:00.000Z');
      expect(await db.select().from(S.tasks)).toHaveLength(0);

      const runId = raced.find(value => value.count === 1)!.ids[0];
      const beforePath = join(directory, 'before-receipt.json');
      const before = worker(now.toISOString(), beforePath, { mode: 'before-receipt', runId });
      const provisional = await checkpoint(before, beforePath);
      expect(provisional.provisional).toHaveLength(1);
      before.process.kill('SIGKILL'); await before.process.exited;
      expect(await db.select().from(S.tasks)).toHaveLength(0);
      expect(await db.select().from(S.domainEvents).where(eq(S.domainEvents.subject, 'domain.task.created'))).toHaveLength(0);
      const [running] = await db.select().from(S.scheduleRuns).where(eq(S.scheduleRuns.id, runId));
      expect(running).toMatchObject({ outcome: 'running', attempts: 1, taskId: null });

      const afterPath = join(directory, 'after-receipt.json');
      const recoveryTime = new Date(now.getTime() + 61_000).toISOString();
      const after = worker(recoveryTime, afterPath, { mode: 'after-receipt', runId });
      const completed = await checkpoint(after, afterPath);
      // Bun 1.3.11 mutates received properties matched with expect.any(String).
      // Keep the real ID intact: later process replays must compare exact IDs.
      expect(completed).toMatchObject({ id: runId, outcome: 'created' });
      expect(typeof completed.taskId).toBe('string');
      expect(completed.taskId.length).toBeGreaterThan(0);
      after.process.kill('SIGKILL'); await after.process.exited;
      expect((await db.select().from(S.tasks)).map((task: any) => task.id)).toEqual([completed.taskId]);
      expect(await db.select().from(S.domainEvents).where(eq(S.domainEvents.subject, 'domain.task.created'))).toHaveLength(1);
      const [receipt] = await db.select().from(S.scheduleRuns).where(eq(S.scheduleRuns.id, runId));
      expect(receipt).toMatchObject({ outcome: 'created', attempts: 2, taskId: completed.taskId, frozenInputs: null });
      const later = new Date(now.getTime() + 3 * 86_400_000);
      expect(await purgeExpiredIdempotencyKeys(db, driver === 'sqlite', later)).toBeGreaterThan(0);
      const replay = await result(worker(later.toISOString(), undefined, { mode: 'execute', runId }));
      expect(replay).toEqual(completed);
      expect(replay.taskId).toBe(completed.taskId);
      expect((await db.select().from(S.tasks)).map((task: any) => task.id)).toEqual([completed.taskId]);

      const workflows = createWorkflowsHandler(db);
      const { template } = await workflows.createWorkflowTemplate({ orgId, name: 'Frozen graph', description: 'Original parent',
        steps: [{ key: 'first', title: 'First' }, { key: 'second', title: 'Second', dependsOn: ['first'] }],
      }, { values });
      await handler.updateSchedule({ id: schedule.id, name: 'Frozen graph run', cadence: 'daily', hourUtc: 9,
        templateId: template.id, skipIfOpen: false }, { values });
      now = new Date('2026-11-11T10:00:00Z');
      const admittedGraph = await createScheduleAdmission(db, null, () => now)();
      expect(admittedGraph).toHaveLength(1);
      const graphId = admittedGraph[0]!.run.id;
      await workflows.deleteWorkflowTemplate({ id: template.id }, { values });
      const graphBeforePath = join(directory, 'graph-before.json');
      const graphBefore = worker(now.toISOString(), graphBeforePath, { mode: 'before-receipt', runId: graphId });
      const provisionalGraph = await checkpoint(graphBefore, graphBeforePath);
      expect(provisionalGraph.provisional).toHaveLength(4);
      graphBefore.process.kill('SIGKILL'); await graphBefore.process.exited;
      expect((await db.select().from(S.tasks)).map((task: any) => task.id)).toEqual([completed.taskId]);
      expect(await db.select().from(S.domainEvents).where(eq(S.domainEvents.subject, 'domain.task.workflow_started'))).toHaveLength(0);

      const oldPath = join(directory, 'old-owner.json'), oldRelease = join(directory, 'old-release');
      const oldTime = new Date(now.getTime() + 61_000);
      const oldOwner = worker(oldTime.toISOString(), oldPath, { mode: 'claim-wait', runId: graphId, release: oldRelease });
      const oldLease = await checkpoint(oldOwner, oldPath);
      oldOwner.process.kill('SIGSTOP');
      const successorPath = join(directory, 'successor.json'), successorRelease = join(directory, 'successor-release');
      const successor = worker(new Date(oldTime.getTime() + 61_000).toISOString(), successorPath,
        { mode: 'claim-wait', runId: graphId, release: successorRelease });
      const nextLease = await checkpoint(successor, successorPath);
      expect(nextLease.lease.token).not.toBe(oldLease.lease.token);
      await Bun.write(oldRelease, 'continue'); oldOwner.process.kill('SIGCONT');
      expect((await result(oldOwner)).outcome).toBe('running');
      expect((await db.select().from(S.tasks)).map((task: any) => task.id)).toEqual([completed.taskId]);
      const [owned] = await db.select().from(S.scheduleRuns).where(eq(S.scheduleRuns.id, graphId));
      expect(owned.leaseToken).toBe(nextLease.lease.token);
      await Bun.write(successorRelease, 'continue');
      const graphResult = await result(successor);
      expect(graphResult).toMatchObject({ id: graphId, outcome: 'created' });
      expect(typeof graphResult.taskId).toBe('string');
      expect(graphResult.taskId.length).toBeGreaterThan(0);
      const graph = await db.select().from(S.tasks).where(eq(S.tasks.parentTaskId, graphResult.taskId));
      expect(graph.map((task: any) => task.title).sort()).toEqual(['First', 'Second']);
      const firstStep = graph.find((task: any) => task.title === 'First');
      const secondStep = graph.find((task: any) => task.title === 'Second');
      const links = await createTaskManagementHandler(db).listTaskLinks({ taskId: secondStep.id }, { values });
      expect(links.blockedBy.map((task: any) => task.id)).toEqual([firstStep.id]);
      const [graphReceipt] = await db.select().from(S.scheduleRuns).where(eq(S.scheduleRuns.id, graphId));
      expect(graphReceipt).toMatchObject({ outcome: 'created', attempts: 3, frozenInputs: null, taskId: graphResult.taskId });
      expect(await db.select().from(S.domainEvents).where(eq(S.domainEvents.subject, 'domain.task.workflow_started'))).toHaveLength(1);
      expect(await db.select().from(S.domainEvents).where(eq(S.domainEvents.subject, 'domain.task.created'))).toHaveLength(4);

      // Force cleanup also serves retention/org cascades, which may own a
      // still-active child project. Hold the common project lock while real
      // independent admission/execution workers contend for it.
      const purgePath = join(directory, 'purge-locked.json'), purgeRelease = join(directory, 'purge-release');
      const contentionGate = join(directory, 'contention-go');
      const admitStarted = join(directory, 'admit-started'), executeStarted = join(directory, 'execute-started');
      const concurrentAdmit = worker('2026-11-12T10:00:00Z', undefined, { started: admitStarted, gate: contentionGate });
      await started(concurrentAdmit, admitStarted);
      const concurrentExecute = worker('2026-11-12T10:00:00Z', undefined,
        { mode: 'execute', runId: committed.ids[0], started: executeStarted, gate: contentionGate, allowConflict: true });
      await started(concurrentExecute, executeStarted);
      const purge = worker('2026-11-12T10:00:00Z', purgePath, { mode: 'purge', projectId, release: purgeRelease });
      expect(await checkpoint(purge, purgePath)).toEqual({ locked: true });
      await Bun.write(contentionGate, 'go');
      // A bounded coordination window verifies the workers remain fenced;
      // it does not substitute a wall-clock wait for the lease-expiry test.
      await Bun.sleep(300);
      if (driver === 'mysql') expect(concurrentExecute.process.exitCode).toBeNull();
      await Bun.write(purgeRelease, 'continue');
      expect(await result(purge)).toEqual({ purged: true });
      expect((await result(concurrentAdmit)).count).toBe(0);
      const executionAfterPurge = await result(concurrentExecute);
      expect(executionAfterPurge).toEqual(driver === 'sqlite' && executionAfterPurge.deferred ? { deferred: true } : {});
      expect(await db.select().from(S.projects)).toHaveLength(0);
      expect(await db.select().from(S.schedules)).toHaveLength(0);
      expect(await db.select().from(S.scheduleRuns)).toHaveLength(0);
      expect(await db.select().from(S.tasks)).toHaveLength(0);
      expect(await db.select().from(S.domainEvents).where(eq(S.domainEvents.subject, 'domain.task.created'))).toHaveLength(4);
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
  }, 120_000);
}
