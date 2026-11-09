import { eq } from 'drizzle-orm';
import { afterEach, expect, it } from 'bun:test';
import { setupIntegrationTest, seedOrgWithAdmin, seedProject, makeAuthContext } from '../../test/setup';
import * as S from '../../db/schema.sqlite';
import { createSchedulesHandler } from './schedules.handler';
import { captureDomainEvent } from '../../lib/domainEventOutbox';
import { setDurableDomainEventCapture } from '../../lib/natsCorrelation';
import { runWithRequestContext } from '../../lib/requestContext';

afterEach(() => setDurableDomainEventCapture(null));
it('captures manual schedule task creation and run bookkeeping in each actual project context', async () => {
  const { db } = await setupIntegrationTest();
  await seedOrgWithAdmin(db, { orgId: 'org', userId: 'owner' });
  for (const projectId of ['a', 'b']) {
    await seedProject(db, { orgId: 'org', userId: 'owner', projectId, templateId: `template-${projectId}` });
    await db.update(S.projects).set({ key: projectId.toUpperCase() }).where(eq(S.projects.id, projectId));
  }
  const schedules = createSchedulesHandler(db), ctx = makeAuthContext('owner');
  const ids: string[] = [];
  for (const projectId of ['a', 'b']) ids.push((await schedules.createSchedule({ projectId, name: projectId, cadence: 'daily', hourUtc: 9, taskTitle: 'Capture', taskPriority: 0 }, ctx)).schedule.id);
  setDurableDomainEventCapture((tx, standalone, event) => captureDomainEvent(tx, standalone, event, { brokerRequired: false }));
  await runWithRequestContext({ requestId: 'outer', orgId: 'foreign', projectId: 'wrong' }, async () => {
    for (const id of ids) expect((await schedules.runSchedule({ id }, ctx)).run.outcome).toBe('created');
  });
  const events = await db.select().from(S.domainEvents);
  expect(events.filter((e: any) => e.subject === 'domain.schedule.ran')).toHaveLength(2);
  expect(events.filter((e: any) => e.subject === 'domain.task.created')).toHaveLength(2);
  expect(events.every((e: any) => e.orgId === 'org' && ['a', 'b'].includes(e.projectId))).toBe(true);
  expect(await db.select().from(S.scheduleRuns)).toHaveLength(2);
});
