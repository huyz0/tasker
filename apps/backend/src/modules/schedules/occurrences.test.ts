import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as S from '../../db/schema.sqlite';
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from '../../test/setup';
import { createSchedulesHandler, createScheduleSweep } from './schedules.handler';

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
});
