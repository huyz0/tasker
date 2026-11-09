import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as S from '../../db/schema.sqlite';
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from '../../test/setup';
import { createTasksHandler } from '../tasks/tasks.handler';
import { createWorkflowsHandler } from '../workflows/workflows.handler';
import { createSchedulesHandler, createScheduleSweep, createScheduleAdmission } from './schedules.handler';

describe('durable schedule admission (M47-T02)', () => {
  let db: any, nc: any, ctx: any, schedule: any;
  let orgId: string, userId: string, projectId: string;
  let now = new Date('2026-11-09T08:00:00Z');
  const clock = () => now;
  beforeEach(async () => {
    ({ db, nc } = await setupIntegrationTest());
    const key = crypto.randomUUID();
    orgId = `org-${key}`; userId = `user-${key}`; projectId = `project-${key}`;
    await seedOrgWithAdmin(db, { orgId, userId, name: 'Schedules' });
    await seedProject(db, { orgId, userId, templateId: `template-${key}`, projectId, name: 'Recovery' });
    ctx = makeAuthContext(userId);
    now = new Date('2026-11-09T08:00:00Z');
    schedule = (await createSchedulesHandler(db, nc, clock).createSchedule({
      projectId, name: 'Routine', cadence: 'daily', hourUtc: 9, taskTitle: 'Original',
    }, ctx)).schedule;
    now = new Date('2026-11-09T10:00:00Z');
  });

  it('does not advance or create work when durable admission cannot be stored', async () => {
    const failing = new Proxy(db, { get(target, key) {
      if (key === 'insert') return (table: any) => table === S.scheduleRuns
        ? { values: async () => { throw new Error('injected occurrence write failure'); } }
        : target.insert(table);
      return Reflect.get(target, key);
    } });
    await createScheduleSweep(failing, nc, clock)().catch(() => undefined);
    const current = (await createSchedulesHandler(db, nc, clock).getSchedule({ id: schedule.id }, ctx)).schedule;
    const work = await db.select().from(S.tasks).where(eq(S.tasks.projectId, projectId));
    expect({ nextRunAt: current.nextRunAt, tasks: work.length, runs: (await db.select().from(S.scheduleRuns)).length })
      .toEqual({ nextRunAt: schedule.nextRunAt, tasks: 0, runs: 0 });
  });
  it('admits the original slot once, retains the frozen task, and creates no work yet', async () => {
    const admit = createScheduleAdmission(db, nc, clock);
    const admitted = await Promise.all([admit(), admit()]);
    expect(admitted.flat()).toHaveLength(1);
    const [run] = await db.select().from(S.scheduleRuns);
    expect(run).toMatchObject({ outcome: 'queued', attempts: 0, slotKey: 'scheduled:2026-11-09T09:00:00.000Z' });
    expect(run.dueAt.toISOString()).toBe(schedule.nextRunAt);
    await createSchedulesHandler(db, nc, clock).updateSchedule({ id: schedule.id, name: 'Changed',
      cadence: 'daily', hourUtc: 9, taskTitle: 'Changed', active: false }, ctx);
    expect(JSON.parse(run.frozenInputs)).toMatchObject({ title: 'Original — 2026-11-09', projectId, skipIfOpen: true });
    expect((await db.select().from(S.tasks))).toHaveLength(0);
    expect(await admit()).toHaveLength(0);
  });

  it('freezes a workflow graph with resolved defaults and author order', async () => {
    const types = createTasksHandler(db, nc);
    const { taskType } = await types.createTaskType({ orgId, projectId, name: 'Change' }, ctx);
    await types.createTaskStatus({ taskTypeId: taskType.id, name: 'queued' }, ctx);
    await types.createTaskStatus({ taskTypeId: taskType.id, name: 'shipped' }, ctx);
    const wf = createWorkflowsHandler(db, nc);
    const { template } = await wf.createWorkflowTemplate({ orgId, name: 'Workflow', description: 'Original parent', steps: [
      { key: 'second', title: 'Second', dependsOn: ['first', 'first'], priority: 2, taskTypeId: taskType.id },
      { key: 'first', title: 'First' },
    ] }, ctx);
    await createSchedulesHandler(db, nc, clock).updateSchedule({ id: schedule.id, name: 'Workflow run',
      cadence: 'daily', hourUtc: 9, templateId: template.id }, ctx);
    now = new Date('2026-11-10T10:00:00Z');
    await createScheduleAdmission(db, nc, clock)();
    const [run] = await db.select().from(S.scheduleRuns);
    await wf.updateWorkflowTemplate({ id: template.id, name: 'Edited', steps: [{ key: 'only', title: 'Changed' }] }, ctx);
    const frozen = JSON.parse(run.frozenInputs);
    expect(frozen.workflow).toMatchObject({ templateId: template.id, description: 'Original parent', steps: [
      { key: 'second', title: 'Second', status: 'queued', dependsOn: ['first'], priority: 2 },
      { key: 'first', title: 'First', status: 'todo' },
    ] });
  });

  it('rechecks an edited/paused candidate after acquiring its locks', async () => {
    let fired = false;
    const mutate = async () => createSchedulesHandler(db, nc, clock).updateSchedule({ id: schedule.id,
      name: 'Paused', cadence: 'daily', hourUtc: 9, taskTitle: 'Changed', active: false }, ctx);
    const wrap = (query: any, table?: any): any => new Proxy(query, { get(target, key) {
      if (key === 'then') return (resolve: any, reject: any) => Promise.resolve(target).then(async rows => {
        if (table === S.schedules && !fired) { fired = true; await mutate(); }
        return rows;
      }).then(resolve, reject);
      const value = Reflect.get(target, key);
      if (typeof value !== 'function') return value;
      return (...args: any[]) => wrap(value.apply(target, args), key === 'from' ? args[0] : table);
    } });
    const observed = new Proxy(db, { get(target, key) {
      if (key === 'select') return (...args: any[]) => wrap(target.select(...args));
      return Reflect.get(target, key);
    } });
    expect(await createScheduleAdmission(observed, nc, clock)()).toHaveLength(0);
    expect((await db.select().from(S.scheduleRuns))).toHaveLength(0);
    const current = (await createSchedulesHandler(db, nc, clock).getSchedule({ id: schedule.id }, ctx)).schedule;
    expect(current).toMatchObject({ name: 'Paused', active: false, nextRunAt: '2026-11-10T09:00:00.000Z' });
  });

  it('retains authorized history and cancels admitted creation when the schedule is deleted', async () => {
    await createScheduleAdmission(db, nc, clock)();
    const handler = createSchedulesHandler(db, nc, clock);
    await handler.deleteSchedule({ id: schedule.id }, ctx);
    const history = await handler.listScheduleRuns({ scheduleId: schedule.id }, ctx);
    expect(history.runs).toHaveLength(1);
    expect(history.runs[0]).toMatchObject({ outcome: 'cancelled' });
    const [stored] = await db.select().from(S.scheduleRuns);
    expect(stored.frozenInputs).toBeNull();
    expect(stored.completedAt).toBeInstanceOf(Date);
    expect((await handler.listSchedules({ projectId }, ctx)).schedules).toHaveLength(0);
    expect(await createScheduleAdmission(db, nc, clock)()).toHaveLength(0);
  });

  it('publishes durable admission so visible history can refresh', async () => {
    await createScheduleAdmission(db, nc, clock)();
    expect(nc.publishedMessages).toContainEqual(expect.objectContaining({
      subject: 'domain.schedule.queued', data: expect.objectContaining({ scheduleId: schedule.id, projectId, outcome: 'queued' }),
    }));
  });

  it('advances unavailable targets once with a safe terminal failure', async () => {
    const wf = createWorkflowsHandler(db, nc);
    const { template } = await wf.createWorkflowTemplate({ orgId, name: 'Later removed', steps: [{ key: 'a', title: 'A' }] }, ctx);
    await createSchedulesHandler(db, nc, clock).updateSchedule({ id: schedule.id, name: 'Workflow',
      cadence: 'daily', hourUtc: 9, templateId: template.id }, ctx);
    await wf.deleteWorkflowTemplate({ id: template.id }, ctx);
    now = new Date('2026-11-10T10:00:00Z');
    const admitted = await createScheduleAdmission(db, nc, clock)();
    expect(admitted).toHaveLength(1);
    const [run] = await db.select().from(S.scheduleRuns);
    expect(run).toMatchObject({ outcome: 'failed', frozenInputs: null, detail: 'The scheduled target is unavailable or its inputs are invalid.' });
    expect(run.completedAt).toBeInstanceOf(Date);
    expect((await createSchedulesHandler(db, nc, clock).getSchedule({ id: schedule.id }, ctx)).schedule)
      .toMatchObject({ lastOutcome: 'failed', nextRunAt: '2026-11-11T09:00:00.000Z' });
    expect(await createScheduleAdmission(db, nc, clock)()).toHaveLength(0);
  });

  it('allows current admins to pause and delete schedules under archived projects', async () => {
    await createScheduleAdmission(db, nc, clock)();
    await db.update(S.projects).set({ deletedAt: now }).where(eq(S.projects.id, projectId));
    const handler = createSchedulesHandler(db, nc, clock);
    expect((await handler.updateSchedule({ id: schedule.id, name: 'Paused', cadence: 'daily',
      hourUtc: 9, taskTitle: 'Original', active: false }, ctx)).schedule.active).toBe(false);
    expect((await handler.deleteSchedule({ id: schedule.id }, ctx)).success).toBe(true);
    expect((await handler.listScheduleRuns({ scheduleId: schedule.id }, ctx)).runs[0].outcome).toBe('cancelled');
  });

  it('rolls back an inserted occurrence when advancing the schedule fails', async () => {
    let insertionFinished = false;
    const failing = new Proxy(db, { get(target, key) {
      if (key === 'insert') return (table: any) => table === S.scheduleRuns
        ? { values: async (value: any) => { await target.insert(table).values(value); insertionFinished = true; } }
        : target.insert(table);
      if (key === 'update') return (table: any) => table === S.schedules
        ? { set: () => ({ where: async () => { throw new Error('injected advancement failure'); } }) }
        : target.update(table);
      return Reflect.get(target, key);
    } });
    expect(await createScheduleAdmission(failing, nc, clock)()).toHaveLength(0);
    expect(insertionFinished).toBe(true);
    expect(await db.select().from(S.scheduleRuns)).toHaveLength(0);
    expect((await createSchedulesHandler(db, nc, clock).getSchedule({ id: schedule.id }, ctx)).schedule.nextRunAt)
      .toBe(schedule.nextRunAt);
    expect(nc.publishedMessages.filter((m: any) => m.subject === 'domain.schedule.queued')).toHaveLength(0);
  });

});
