import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as S from '../../db/schema.sqlite';
import { setupIntegrationTest, seedOrgWithAdmin, seedProject, makeAuthContext } from '../../test/setup';
import { createProjectsHandler } from '../projects/projects.handler';
import { createSchedulesHandler, createScheduleAdmission } from './schedules.handler';
import { createScheduleExecutor } from './occurrenceExecution';
import { purgeProjectCascade, purgeOrgCascade } from '../../lib/cascadePurge';
import { runRetentionSweep } from '../../lib/retentionSweep';

async function fixture() {
  const { db, nc } = await setupIntegrationTest();
  const key = crypto.randomUUID(), orgId = `org-${key}`, userId = `user-${key}`, projectId = `project-${key}`;
  await seedOrgWithAdmin(db, { orgId, userId, name: 'Purge' });
  await seedProject(db, { orgId, userId, templateId: `template-${key}`, projectId, name: 'Purge' });
  const ctx = makeAuthContext(userId);
  const handler = createSchedulesHandler(db, nc, () => new Date('2026-11-09T08:00:00Z'));
  const { schedule } = await handler.createSchedule({ projectId, name: 'Retained intent', cadence: 'daily', hourUtc: 9, taskTitle: 'Work' }, ctx);
  const [admitted] = await createScheduleAdmission(db, nc, () => new Date('2026-11-09T10:00:00Z'))();
  const executor = createScheduleExecutor(db, nc, () => new Date('2026-11-09T10:00:00Z'));
  const lease = await executor.claim(admitted!.run.id);
  return { db, nc, ctx, orgId, projectId, handler, schedule, executor, lease: lease!, runId: admitted!.run.id };
}

describe('project purge owns retained schedule occurrences', () => {
  for (const target of ['organization', 'project'] as const) {
    it(`retains an ${target} restored after the retention scan, including its pending receipts`, async () => {
      const f = await fixture();
      const table = target === 'organization' ? S.organizations : S.projects;
      const id = target === 'organization' ? f.orgId : f.projectId;
      await f.db.update(table).set({ deletedAt: new Date('2000-01-01') }).where(eq(table.id, id));
      let reads = 0;
      const wrap = (query: any, restoreAfterRead: boolean): any => new Proxy(query, { get(object, key) {
        if (key === 'then') return (resolve: any, reject: any) => Promise.resolve(object).then(async rows => {
          if (restoreAfterRead) await f.db.update(table).set({ deletedAt: null }).where(eq(table.id, id));
          return rows;
        }).then(resolve, reject);
        const value = Reflect.get(object, key);
        return typeof value === 'function' ? (...args: any[]) => wrap(value.apply(object, args), restoreAfterRead) : value;
      } });
      const racing = new Proxy(f.db, { get(db, key) {
        if (key === 'select') return (...args: any[]) => {
          const query = db.select(...args);
          return { from: (selected: any) => wrap(query.from(selected), selected === table && ++reads === 2) };
        };
        return Reflect.get(db, key);
      } });
      const purged = await runRetentionSweep(racing);
      expect(purged[target === 'organization' ? 'organizations' : 'projects']).toBe(0);
      expect(await f.db.select().from(S.organizations)).toHaveLength(1);
      expect(await f.db.select().from(S.projects)).toHaveLength(1);
      expect(await f.db.select().from(S.schedules)).toHaveLength(1);
      expect(await f.db.select().from(S.scheduleRuns)).toHaveLength(1);
    });
  }

  it('manual purge removes tombstones, frozen intents and project workflows; a claimed worker creates nothing', async () => {
    const f = await fixture();
    await f.handler.deleteSchedule({ id: f.schedule.id }, f.ctx);
    await f.db.insert(S.workflowTemplates).values({ id: crypto.randomUUID(), orgId: f.orgId, projectId: f.projectId,
      name: 'Project workflow', steps: '[]', createdAt: new Date(), updatedAt: new Date() });
    const projects = createProjectsHandler(f.db, f.nc);
    await projects.archiveProject({ projectId: f.projectId }, f.ctx);
    await projects.purgeProject({ projectId: f.projectId }, f.ctx);
    expect(await f.db.select().from(S.schedules)).toHaveLength(0);
    expect(await f.db.select().from(S.scheduleRuns)).toHaveLength(0);
    expect(await f.db.select().from(S.workflowTemplates)).toHaveLength(0);
    await f.executor.execute(f.lease);
    expect(await f.db.select().from(S.tasks)).toHaveLength(0);
  });

  for (const target of ['project', 'organization']) {
    it(`rolls back all ${target} cleanup when receipt removal fails`, async () => {
      const f = await fixture();
      await f.db.insert(S.tasks).values({ id: 'preserve-work', projectId: f.projectId, title: 'Existing work', status: 'todo', createdAt: new Date() });
      const faulty = new Proxy(f.db, { get(db, key) {
        if (key === 'delete') return (table: any) => table === S.scheduleRuns
          ? { where: async () => { throw new Error('injected receipt purge failure'); } } : db.delete(table);
        return Reflect.get(db, key);
      } });
      await expect(target === 'project' ? purgeProjectCascade(faulty, f.projectId) : purgeOrgCascade(faulty, f.orgId))
        .rejects.toThrow('injected receipt purge failure');
      expect(await f.db.select().from(S.tasks).where(eq(S.tasks.projectId, f.projectId))).toHaveLength(1);
      expect(await f.db.select().from(S.projects)).toHaveLength(1);
      expect(await f.db.select().from(S.schedules)).toHaveLength(1);
      expect(await f.db.select().from(S.scheduleRuns)).toHaveLength(1);
    });
  }
});
