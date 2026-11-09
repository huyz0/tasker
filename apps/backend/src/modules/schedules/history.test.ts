import { eq } from 'drizzle-orm';
import * as S from '../../db/schema.sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from '../../test/setup';
import { createScheduleAdmission, createSchedulesHandler } from './schedules.handler';
import { createScheduleExecutor } from './occurrenceExecution';

describe('schedule recovery history (M47-T04)', () => {
  let db: any, ctx: any, handler: any, scheduleId: string, now: Date;
  const clock = () => now;
  beforeEach(async () => {
    ({ db } = await setupIntegrationTest());
    const key = crypto.randomUUID(), orgId = `org-${key}`, userId = `user-${key}`, projectId = `project-${key}`;
    await seedOrgWithAdmin(db, { orgId, userId });
    await seedProject(db, { orgId, userId, projectId, templateId: `template-${key}` });
    ctx = makeAuthContext(userId);
    now = new Date('2026-11-09T08:00:00Z');
    handler = createSchedulesHandler(db, null, clock);
    scheduleId = (await handler.createSchedule({ projectId, name: 'Recovery', cadence: 'daily', hourUtc: 9,
      taskTitle: 'Task', taskDescription: 'fixture-private-snapshot-body' }, ctx)).schedule.id;
    now = new Date('2026-11-09T10:00:00Z');
  });

  it('exposes bounded queued metadata without execution inputs or ownership tokens', async () => {
    await createScheduleAdmission(db, null, clock)();
    const result = await handler.listScheduleRuns({ scheduleId }, ctx);
    expect(result.runs[0]).toMatchObject({ outcome: 'queued', attempts: 0,
      dueAt: '2026-11-09T09:00:00.000Z', nextAttemptAt: now.toISOString() });
    expect(JSON.stringify(result)).not.toMatch(/frozenInputs|actorJson|leaseToken|fixture-private-snapshot-body/);
  });

  it('derives interrupted history on silent lease expiry without changing the receipt', async () => {
    const admitted = await createScheduleAdmission(db, null, clock)();
    const executor = createScheduleExecutor(db, null, clock);
    const lease = (await executor.claim(admitted[0]!.run.id))!;
    const active = (await handler.listScheduleRuns({ scheduleId }, ctx)).runs[0];
    expect(active).toMatchObject({ outcome: 'running', attempts: 1, startedAt: now.toISOString(),
      claimedUntil: '2026-11-09T10:01:00.000Z' });
    now = new Date('2026-11-09T10:01:01Z');
    const expired = (await handler.listScheduleRuns({ scheduleId }, ctx)).runs[0];
    expect(expired).toMatchObject({ outcome: 'interrupted', attempts: 1,
      nextAttemptAt: '2026-11-09T10:01:00.000Z' });
    expect((await executor.loadRun(lease.id)).outcome).toBe('running');
    expect(JSON.stringify(expired)).not.toContain(lease.token);
  });

  it('exposes completion metadata in manual response and retained history', async () => {
    const result = (await handler.runSchedule({ id: scheduleId }, ctx)).run;
    expect(result).toMatchObject({ outcome: 'created', attempts: 1, completedAt: now.toISOString(), startedAt: now.toISOString() });
    expect(result.dueAt).toBeUndefined();
    expect(result.nextAttemptAt).toBeUndefined();
    expect((await handler.listScheduleRuns({ scheduleId }, ctx)).runs[0]).toEqual(result);
  });
  it('clears the previous interruption explanation when a new attempt starts', async () => {
    const admitted = await createScheduleAdmission(db, null, clock)();
    const id = admitted[0]!.run.id;
    await db.update(S.scheduleRuns).set({ outcome: 'interrupted', detail: 'fixture old interruption' }).where(eq(S.scheduleRuns.id, id));
    await createScheduleExecutor(db, null, clock).claim(id);
    expect((await handler.listScheduleRuns({ scheduleId }, ctx)).runs[0].detail).toBeUndefined();
  });

});
