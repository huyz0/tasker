import { beforeEach, describe, expect, it } from 'bun:test';
import { createContextValues, Code } from '@connectrpc/connect';
import { currentPrincipalKey } from '../auth/session';
import { createScheduleExecutor } from './occurrenceExecution';
import { eq, sql } from 'drizzle-orm';
import * as S from '../../db/schema.sqlite';
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from '../../test/setup';
import { createTaskManagementHandler, createTasksHandler } from '../tasks/tasks.handler';
import { createWorkflowsHandler } from '../workflows/workflows.handler';
import { createScheduleAdmission, createManualScheduleAdmission, createSchedulesHandler, createScheduleSweep } from './schedules.handler';
import { purgeExpiredIdempotencyKeys } from '../../lib/idempotency';

describe('leased schedule execution (M47-T03)', () => {
  let db: any, nc: any, ctx: any, handler: any;
  let orgId: string, userId: string, projectId: string, schedule: any;
  let now: Date;
  const clock = () => now;
  beforeEach(async () => {
    ({ db, nc } = await setupIntegrationTest());
    const key = crypto.randomUUID();
    orgId = `org-${key}`; userId = `user-${key}`; projectId = `project-${key}`;
    await seedOrgWithAdmin(db, { orgId, userId, name: 'Recovery' });
    await seedProject(db, { orgId, userId, templateId: `template-${key}`, projectId, name: 'Recovery' });
    ctx = makeAuthContext(userId);
    now = new Date('2026-11-09T08:00:00Z');
    handler = createSchedulesHandler(db, nc, clock);
    schedule = (await handler.createSchedule({ projectId, name: 'Routine', cadence: 'daily', hourUtc: 9,
      taskTitle: 'Original task', taskDescription: 'Original description', taskPriority: 2 }, ctx)).schedule;
    now = new Date('2026-11-09T10:00:00Z');
  });

  it('resumes a paused admitted intent with frozen inputs and retains its receipt beyond key expiry', async () => {
    const admitted = await createScheduleAdmission(db, nc, clock)();
    expect(admitted).toHaveLength(1);
    const { run } = admitted[0]!;
    await handler.updateSchedule({ id: schedule.id, name: 'Changed', cadence: 'daily', hourUtc: 9,
      taskTitle: 'Changed task', taskDescription: 'Changed description', active: false }, ctx);
    await createScheduleSweep(db, nc, clock)();
    const work = await db.select().from(S.tasks).where(eq(S.tasks.projectId, projectId));
    expect(work).toHaveLength(1);
    expect(work[0]).toMatchObject({ title: 'Original task — 2026-11-09', description: 'Original description', priority: 2, scheduleId: schedule.id });
    const [receipt] = await db.select().from(S.scheduleRuns).where(eq(S.scheduleRuns.id, run.id));
    expect(receipt).toMatchObject({ outcome: 'created', taskId: work[0].id, attempts: 1, frozenInputs: null });
    now = new Date('2026-11-11T10:00:00Z');
    expect(await purgeExpiredIdempotencyKeys(db, true, now)).toBeGreaterThan(0);
    await createScheduleSweep(db, nc, clock)();
    expect((await db.select().from(S.tasks)).map((t: any) => t.id)).toEqual([work[0].id]);
    expect((await handler.listScheduleRuns({ scheduleId: schedule.id }, ctx)).runs).toMatchObject([{ id: run.id, taskId: work[0].id }]);
  });

  it('creates the original frozen workflow after its template and default ordering change', async () => {
    const types = createTasksHandler(db, nc);
    const { taskType } = await types.createTaskType({ orgId, projectId, name: 'Change' }, ctx);
    const first = (await types.createTaskStatus({ taskTypeId: taskType.id, name: 'queued' }, ctx)).status;
    const second = (await types.createTaskStatus({ taskTypeId: taskType.id, name: 'shipped' }, ctx)).status;
    const wf = createWorkflowsHandler(db, nc);
    const { template } = await wf.createWorkflowTemplate({ orgId, name: 'Frozen workflow', description: 'Original parent', steps: [
      { key: 'second', title: 'Second', dependsOn: ['first'], taskTypeId: taskType.id, priority: 3 },
      { key: 'first', title: 'First', description: 'Original first' },
    ] }, ctx);
    await handler.updateSchedule({ id: schedule.id, name: 'Frozen routine', cadence: 'daily', hourUtc: 9, templateId: template.id }, ctx);
    now = new Date('2026-11-10T10:00:00Z');
    await createScheduleAdmission(db, nc, clock)();
    await handler.updateSchedule({ id: schedule.id, name: 'New routine', cadence: 'daily', hourUtc: 9, taskTitle: 'Different', active: false }, ctx);
    await wf.deleteWorkflowTemplate({ id: template.id }, ctx);
    await db.update(S.taskStatuses).set({ position: 10 }).where(eq(S.taskStatuses.id, first.id));
    await db.update(S.taskStatuses).set({ position: 0 }).where(eq(S.taskStatuses.id, second.id));
    await createScheduleSweep(db, nc, clock)();
    const work = await db.select().from(S.tasks).where(eq(S.tasks.projectId, projectId));
    expect(work).toHaveLength(3);
    const parent = work.find((task: any) => task.scheduleId === schedule.id);
    const a = work.find((task: any) => task.title === 'First');
    const b = work.find((task: any) => task.title === 'Second');
    expect(parent).toMatchObject({ title: 'Frozen routine — 2026-11-10', description: 'Original parent' });
    expect(a).toMatchObject({ parentTaskId: parent.id, description: 'Original first' });
    expect(b).toMatchObject({ parentTaskId: parent.id, status: 'queued', priority: 3 });
    const links = await createTaskManagementHandler(db, nc).listTaskLinks({ taskId: b.id }, ctx);
    expect(links.blockedBy.map((task: any) => task.id)).toEqual([a.id]);
  });

  it('rolls work and events back with a failed receipt write, then retries the same intent', async () => {
    let failed = false;
    const failing = new Proxy(db, { get(target, key) {
      if (key === 'update') return (table: any) => table === S.scheduleRuns ? {
        set: (value: any) => value.outcome === 'created' && !failed ? {
          where: async () => { failed = true; throw new Error('injected terminal receipt failure'); },
        } : target.update(table).set(value),
      } : target.update(table);
      return Reflect.get(target, key);
    } });
    const sweep = createScheduleSweep(failing, nc, clock);
    await sweep().catch(() => undefined);
    expect(failed).toBe(true);
    expect(await db.select().from(S.tasks)).toHaveLength(0);
    expect(nc.publishedMessages.filter((m: any) => m.subject === 'domain.task.created')).toHaveLength(0);
    const [interrupted] = await db.select().from(S.scheduleRuns);
    expect(interrupted).toMatchObject({ outcome: 'interrupted', attempts: 1, taskId: null });
    now = new Date(now.getTime() + 5000);
    await sweep();
    const [receipt] = await db.select().from(S.scheduleRuns);
    const work = await db.select().from(S.tasks);
    expect(receipt).toMatchObject({ id: interrupted.id, outcome: 'created', attempts: 2, taskId: work[0].id, frozenInputs: null });
    expect(work).toHaveLength(1);
    expect(nc.publishedMessages.filter((m: any) => m.subject === 'domain.task.created')).toHaveLength(1);
  });

  it('serializes concurrent manual runs under skip-if-open', async () => {
    const result = await Promise.all([handler.runSchedule({ id: schedule.id }, ctx), handler.runSchedule({ id: schedule.id }, ctx)]);
    expect(result.map(value => value.run.outcome).sort()).toEqual(['created', 'skipped']);
    expect(await db.select().from(S.tasks)).toHaveLength(1);
    expect((await handler.getSchedule({ id: schedule.id }, ctx)).schedule.nextRunAt).toBe(schedule.nextRunAt);
    expect((await db.select().from(S.scheduleRuns)).every((run: any) => run.slotKey.startsWith('manual:'))).toBe(true);
  });
  it('fences a stopped owner after another worker takes its expired lease', async () => {
    const admitted = await createScheduleAdmission(db, nc, clock)();
    const executor = createScheduleExecutor(db, nc, clock);
    const old = (await executor.claim(admitted[0]!.run.id))!;
    now = new Date(now.getTime() + 61_000);
    const successor = (await executor.claim(old.id))!;
    expect(successor.token).not.toBe(old.token);
    await executor.execute(old);
    expect(await db.select().from(S.tasks)).toHaveLength(0);
    expect((await executor.loadRun(old.id)).leaseToken).toBe(successor.token);
    await executor.execute(successor);
    expect(await db.select().from(S.tasks)).toHaveLength(1);
  });

  it('rejects frozen workflow scope drifting away from its admitted project', async () => {
    const other = `other-${crypto.randomUUID()}`;
    const [sourceProject] = await db.select().from(S.projects).where(eq(S.projects.id, projectId));
    await db.insert(S.projects).values({ id: other, orgId, ownerId: userId, templateId: sourceProject.templateId, name: 'Other', key: 'OTHER', createdAt: now });
    const wf = createWorkflowsHandler(db, nc);
    const { template } = await wf.createWorkflowTemplate({ orgId, name: 'Workflow', steps: [{ key: 'a', title: 'A' }] }, ctx);
    await handler.updateSchedule({ id: schedule.id, name: 'Workflow', cadence: 'daily', hourUtc: 9, templateId: template.id }, ctx);
    now = new Date('2026-11-10T10:00:00Z');
    const admitted = await createScheduleAdmission(db, nc, clock)();
    const run = admitted[0]!.run;
    const inputs = JSON.parse(run.frozenInputs); inputs.workflow.projectId = other;
    await db.update(S.scheduleRuns).set({ frozenInputs: JSON.stringify(inputs) }).where(eq(S.scheduleRuns.id, run.id));
    await createScheduleSweep(db, nc, clock)();
    expect(await db.select().from(S.tasks)).toHaveLength(0);
    expect((await db.select().from(S.scheduleRuns))[0].outcome).toBe('failed');
  });

  async function agentCredential() {
    const key = crypto.randomUUID(), agentId = `agent-${key}`, tokenId = `token-${key}`;
    await db.insert(S.agentRoles).values({ id: `role-${key}`, orgId, name: 'Worker', systemPrompt: '', capabilities: '[]' });
    await db.insert(S.agents).values({ id: agentId, orgId, agentRoleId: `role-${key}`, name: 'Worker' });
    await db.insert(S.apiTokens).values({ id: tokenId, agentId, orgId, name: 'Original', tokenPrefix: 'fixture',
      tokenHash: crypto.randomUUID().replaceAll('-', '').repeat(2), scopes: '["tasks:read","tasks:write"]',
      createdBy: userId, createdAt: now, expiresAt: new Date(now.getTime() + 3600_000) });
    const principal = { kind: 'agent' as const, agentId, orgId, tokenId, scopes: ['tasks:read', 'tasks:write'] };
    return { principal, agentId, tokenId, roleId: `role-${key}` };
  }

  for (const change of ['revoked', 'expired', 'invalid-expiry', 'scope-removed', 'agent-deleted', 'binding-changed', 'replacement-token', 'org-rebound'] as const) {
    it(`revalidates the exact manual credential after admission (${change})`, async () => {
      const { principal, agentId, tokenId, roleId } = await agentCredential();
      const run = await createManualScheduleAdmission(db, nc, clock)(schedule.id, principal);
      expect(JSON.parse(run.actorJson)).toEqual({ kind: 'agent', orgId, agentId, tokenId });
      if (change === 'replacement-token') {
        await db.update(S.apiTokens).set({ revokedAt: now }).where(eq(S.apiTokens.id, tokenId));
        await db.insert(S.apiTokens).values({ id: `replacement-${tokenId}`, agentId, orgId, name: 'Replacement', tokenPrefix: 'fixture',
          tokenHash: crypto.randomUUID().replaceAll('-', '').repeat(2), scopes: '["tasks:read","tasks:write"]',
          createdBy: userId, createdAt: new Date(now.getTime() + 1000), expiresAt: new Date(now.getTime() + 3600_000) });
      }
      if (change === 'org-rebound') {
        const other = `org-${crypto.randomUUID()}`;
        await db.insert(S.organizations).values({ id: other, name: 'Other', slug: other, createdAt: now });
        await db.update(S.apiTokens).set({ orgId: other }).where(eq(S.apiTokens.id, tokenId));
      }
      if (change === 'revoked') await db.update(S.apiTokens).set({ revokedAt: now }).where(eq(S.apiTokens.id, tokenId));
      if (change === 'invalid-expiry') await db.run(sql`UPDATE api_tokens SET expires_at = 'invalid' WHERE id = ${tokenId}`);
      if (change === 'expired') await db.update(S.apiTokens).set({ expiresAt: now }).where(eq(S.apiTokens.id, tokenId));
      if (change === 'scope-removed') await db.update(S.apiTokens).set({ scopes: '["tasks:read"]' }).where(eq(S.apiTokens.id, tokenId));
      if (change === 'agent-deleted') await db.update(S.agents).set({ deletedAt: now }).where(eq(S.agents.id, agentId));
      if (change === 'binding-changed') {
        const other = `agent-${crypto.randomUUID()}`;
        await db.insert(S.agents).values({ id: other, orgId, agentRoleId: roleId, name: 'Other' });
        await db.update(S.apiTokens).set({ agentId: other }).where(eq(S.apiTokens.id, tokenId));
      }
      const executor = createScheduleExecutor(db, nc, clock);
      const lease = (await executor.claim(run.id))!;
      await executor.execute(lease);
      expect(await db.select().from(S.tasks)).toHaveLength(0);
      expect((await executor.loadRun(run.id))).toMatchObject({ outcome: 'failed', frozenInputs: null });
    });
  }

  it('rejects revoked cached credentials before accepting a new manual intent', async () => {
    const { principal, tokenId } = await agentCredential();
    await db.update(S.apiTokens).set({ revokedAt: now }).where(eq(S.apiTokens.id, tokenId));
    const values = createContextValues(); values.set(currentPrincipalKey, principal);
    const error: any = await handler.runSchedule({ id: schedule.id }, { values }).catch((e: any) => e);
    expect(error.code).toBe(Code.Unauthenticated);
    expect(await db.select().from(S.scheduleRuns)).toHaveLength(0);
  });

  it('records failed manual admission in the schedule pointer without losing its previous task', async () => {
    const wf = createWorkflowsHandler(db, nc);
    const { template } = await wf.createWorkflowTemplate({ orgId, name: 'Workflow', steps: [{ key: 'a', title: 'A' }] }, ctx);
    await handler.updateSchedule({ id: schedule.id, name: 'Workflow', cadence: 'daily', hourUtc: 9, templateId: template.id }, ctx);
    const first = (await handler.runSchedule({ id: schedule.id }, ctx)).run;
    expect(first.outcome).toBe('created');
    await wf.deleteWorkflowTemplate({ id: template.id }, ctx);
    now = new Date(now.getTime() + 1000);
    const failed = (await handler.runSchedule({ id: schedule.id }, ctx)).run;
    expect(failed.outcome).toBe('failed');
    expect((await handler.getSchedule({ id: schedule.id }, ctx)).schedule)
      .toMatchObject({ lastOutcome: 'failed', lastTaskId: first.taskId, lastRunAt: now.toISOString() });
  });

  function busyFirstScan(table: any) {
    let pending = true;
    return new Proxy(db, { get(target, key) {
      if (key === 'select') return (...args: any[]) => ({ from: (selected: any) => {
        if (selected !== table || !pending) return target.select(...args).from(selected);
        pending = false;
        return { where: () => ({ orderBy: () => ({ limit: async () => {
          throw Object.assign(new Error('injected transient scan lock'), { code: 'SQLITE_BUSY' });
        } }) }) };
      } });
      return Reflect.get(target, key);
    } });
  }

  it('defers a conflicted due scan and still processes already admitted work', async () => {
    await createScheduleAdmission(db, nc, clock)();
    const sweep = createScheduleSweep(busyFirstScan(S.schedules), nc, clock);
    expect(await sweep()).toBe(0);
    expect(await db.select().from(S.tasks)).toHaveLength(1);
    expect((await db.select().from(S.scheduleRuns))[0].outcome).toBe('created');
  });

  it('keeps a conflicted pending scan recoverable for the next pass', async () => {
    await createScheduleAdmission(db, nc, clock)();
    const executor = createScheduleExecutor(busyFirstScan(S.scheduleRuns), nc, clock);
    expect(await executor.runPending()).toBe(0);
    expect((await db.select().from(S.scheduleRuns))[0].outcome).toBe('queued');
    expect(await executor.runPending()).toBe(1);
    expect(await db.select().from(S.tasks)).toHaveLength(1);
  });

  for (const change of ['membership', 'role', 'project-archived'] as const) {
    it(`revalidates accepted human intent authority (${change})`, async () => {
      const run = await createManualScheduleAdmission(db, nc, clock)(schedule.id, { kind: 'user', userId });
      if (change === 'membership') await db.delete(S.organizationMembers).where(eq(S.organizationMembers.userId, userId));
      if (change === 'role') await db.update(S.organizationMembers).set({ role: 'viewer' }).where(eq(S.organizationMembers.userId, userId));
      if (change === 'project-archived') await db.update(S.projects).set({ deletedAt: now }).where(eq(S.projects.id, projectId));
      const executor = createScheduleExecutor(db, nc, clock);
      await executor.execute((await executor.claim(run.id))!);
      expect(await db.select().from(S.tasks)).toHaveLength(0);
      expect(await executor.loadRun(run.id)).toMatchObject({ outcome: 'failed', frozenInputs: null });
    });
  }

  it('rolls back a partially created frozen graph before recording business failure', async () => {
    const wf = createWorkflowsHandler(db, nc);
    const { template } = await wf.createWorkflowTemplate({ orgId, name: 'Workflow', steps: [
      { key: 'a', title: 'First' }, { key: 'b', title: 'Second', dependsOn: ['a'] },
    ] }, ctx);
    await handler.updateSchedule({ id: schedule.id, name: 'Workflow', cadence: 'daily', hourUtc: 9, templateId: template.id }, ctx);
    now = new Date('2026-11-10T10:00:00Z');
    const admitted = await createScheduleAdmission(db, nc, clock)();
    const run = admitted[0]!.run, inputs = JSON.parse(run.frozenInputs);
    inputs.workflow.steps[1].status = 'fixture-invalid-status';
    await db.update(S.scheduleRuns).set({ frozenInputs: JSON.stringify(inputs) }).where(eq(S.scheduleRuns.id, run.id));
    nc.clear();
    await createScheduleSweep(db, nc, clock)();
    expect(await db.select().from(S.tasks)).toHaveLength(0);
    expect(nc.publishedMessages.filter((m: any) => m.subject.startsWith('domain.task.'))).toHaveLength(0);
    const [receipt] = await db.select().from(S.scheduleRuns);
    expect(receipt).toMatchObject({ outcome: 'failed', taskId: null, frozenInputs: null });
    expect(receipt.detail).not.toContain('fixture-invalid-status');
  });

  it('isolates a terminal receipt failure from other due schedules', async () => {
    now = new Date('2026-11-09T08:00:00Z');
    const fine = (await handler.createSchedule({ projectId, name: 'Fine', cadence: 'daily', hourUtc: 9, taskTitle: 'Fine task' }, ctx)).schedule;
    now = new Date('2026-11-09T10:00:00Z');
    const failing = new Proxy(db, { get(target, key) {
      if (key === 'update') return (table: any) => table === S.scheduleRuns ? {
        set: (value: any) => value.outcome === 'created' ? { where: async (condition: any) => {
          const [task] = await target.select({ title: S.tasks.title }).from(S.tasks).where(eq(S.tasks.id, value.taskId));
          if (task.title.startsWith('Original task')) throw new Error('fixture-sensitive-body');
          return await target.update(table).set(value).where(condition);
        } } : target.update(table).set(value),
      } : target.update(table);
      return Reflect.get(target, key);
    } });
    expect(await createScheduleSweep(failing, nc, clock)()).toBe(2);
    expect((await db.select().from(S.tasks)).map((task: any) => task.title)).toEqual(['Fine task — 2026-11-09']);
    const receipts = await db.select().from(S.scheduleRuns);
    expect(receipts.find((run: any) => run.scheduleId === schedule.id).outcome).toBe('interrupted');
    expect(receipts.find((run: any) => run.scheduleId === fine.id).outcome).toBe('created');
    expect(JSON.stringify(receipts)).not.toContain('fixture-sensitive-body');
    expect(JSON.stringify(nc.publishedMessages)).not.toContain('fixture-sensitive-body');
  });

  it('bounds retry backoff while retaining the same interrupted intent', async () => {
    const failing = new Proxy(db, { get(target, key) {
      if (key === 'update') return (table: any) => table === S.scheduleRuns ? {
        set: (value: any) => value.outcome === 'created' ? { where: async () => { throw new Error('fixture transient failure'); } }
          : target.update(table).set(value),
      } : target.update(table);
      return Reflect.get(target, key);
    } });
    let runId: string | undefined;
    for (const delay of [5000, 10000, 20000, 40000, 80000, 160000, 300000, 300000]) {
      await createScheduleSweep(failing, nc, clock)();
      const [run] = await db.select().from(S.scheduleRuns);
      runId ??= run.id;
      expect(run).toMatchObject({ id: runId, outcome: 'interrupted', taskId: null });
      expect(run.nextAttemptAt.getTime() - now.getTime()).toBe(delay);
      expect(await db.select().from(S.tasks)).toHaveLength(0);
      now = run.nextAttemptAt;
    }
    expect(await db.select().from(S.scheduleRuns)).toHaveLength(1);
  });

  it('returns its accepted manual intent when lease acquisition hits transient contention', async () => {
    await handler.updateSchedule({ id: schedule.id, name: 'Paused', cadence: 'daily', hourUtc: 9, taskTitle: 'Original task', active: false }, ctx);
    let conflicted = false;
    const busy = new Proxy(db, { get(target, key) {
      if (key === 'select') return (...args: any[]) => {
        if (!conflicted && args[0]?.scheduleId === S.scheduleRuns.scheduleId) {
          conflicted = true;
          return { from: () => ({ where: () => ({ limit: async () => {
            throw Object.assign(new Error('injected manual lease contention'), { code: 'SQLITE_BUSY' });
          } }) }) };
        }
        return target.select(...args);
      };
      return Reflect.get(target, key);
    } });
    const response = await createSchedulesHandler(busy, nc, clock).runSchedule({ id: schedule.id }, ctx);
    expect(conflicted).toBe(true);
    expect(response.run).toMatchObject({ outcome: 'queued', trigger: 'manual' });
    expect(await db.select().from(S.scheduleRuns)).toHaveLength(1);
    await createScheduleSweep(db, nc, clock)();
    expect(await db.select().from(S.tasks)).toHaveLength(1);
    expect((await db.select().from(S.scheduleRuns))[0]).toMatchObject({ id: response.run.id, outcome: 'created' });
  });

  it('serializes a manual run racing the scheduled sweeper under skip-if-open', async () => {
    await Promise.all([handler.runSchedule({ id: schedule.id }, ctx), createScheduleSweep(db, nc, clock)()]);
    const receipts = await db.select().from(S.scheduleRuns);
    expect(receipts.map((run: any) => run.trigger).sort()).toEqual(['manual', 'schedule']);
    expect(receipts.map((run: any) => run.outcome).sort()).toEqual(['created', 'skipped']);
    expect(await db.select().from(S.tasks)).toHaveLength(1);
    expect((await handler.getSchedule({ id: schedule.id }, ctx)).schedule.nextRunAt).toBe('2026-11-10T09:00:00.000Z');
  });

});
