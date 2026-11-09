import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Code } from '@connectrpc/connect';
import { TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { eq } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import { setupDatabase } from '../../db/db';
import * as sqliteSchema from '../../db/schema.sqlite';
import * as mysqlSchema from '../../db/schema.mysql';
import { encodeCursor } from '../../db/query-builder';
import { makeAuthContext } from '../../test/setup';
import { createMutationInterceptor } from '../../lib/mutationInterceptor';
import { setDurableDomainEventCapture } from '../../lib/natsCorrelation';
import { captureDomainEvent } from '../../lib/domainEventOutbox';
import { createTaskManagementHandler } from './tasks.handler';

for (const dialect of ['sqlite', 'mysql'] as const) {
  const enabled = dialect === 'sqlite' || process.env.TASKER_MYSQL_INTEGRATION === '1';
  (enabled ? describe : describe.skip)(`${dialect} pending/history boundaries`, () => {
    const S: any = dialect === 'sqlite' ? sqliteSchema : mysqlSchema;
    let db: any, admin: any, name: string, previousName: string | undefined, previousStandalone: string | undefined;
    let handler: any, ctx: any, userId: string, orgId: string, taskId: string, secondTaskId: string, agentId: string, projectId: string;
    beforeAll(async () => {
      previousName = process.env.DB_NAME; previousStandalone = process.env.STANDALONE;
      process.env.STANDALONE = String(dialect === 'sqlite');
      if (dialect === 'mysql') {
        admin = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD });
        name = `tasker_history_${crypto.randomUUID().replaceAll('-', '')}`;
        await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);
        process.env.DB_NAME = name;
      }
      db = await setupDatabase(dialect, ':memory:');
    }, 90_000);
    afterAll(async () => {
      if (dialect === 'mysql') {
        if (db) await db.$client.end();
        if (admin) { try { await admin.query(`DROP DATABASE IF EXISTS \`${name}\``); } finally { await admin.end(); } }
      } else db?.$client.close();
      if (previousName === undefined) delete process.env.DB_NAME; else process.env.DB_NAME = previousName;
      if (previousStandalone === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = previousStandalone;
    });
    beforeEach(async () => {
      const key = crypto.randomUUID(), now = new Date();
      userId = `user-${key}`;
      orgId = `org-${key}`; projectId = `project-${key}`; taskId = `task-${key}`; secondTaskId = `task2-${key}`; agentId = `agent-${key}`;
      await db.insert(S.users).values({ id: userId, createdAt: now });
      await db.insert(S.organizations).values({ id: orgId, name: 'History', slug: orgId, createdAt: now });
      await db.insert(S.organizationMembers).values({ orgId, userId, role: 'admin', joinedAt: now });
      await db.insert(S.projectTemplates).values({ id: `template-${key}`, orgId, name: 'History', createdAt: now });
      await db.insert(S.projects).values({ id: projectId, orgId, templateId: `template-${key}`, ownerId: userId, name: 'History', createdAt: now });
      await db.insert(S.tasks).values([taskId, secondTaskId].map(id => ({ id, projectId, title: id, status: 'todo', createdAt: now })));
      await db.insert(S.agentRoles).values({ id: `role-${key}`, orgId, name: 'Worker', systemPrompt: 'Work', capabilities: '[]' });
      await db.insert(S.agents).values({ id: agentId, orgId, agentRoleId: `role-${key}`, name: 'Worker' });
      handler = createTaskManagementHandler(db); ctx = makeAuthContext(userId);
    });
    async function seed(kind: 'questions' | 'approvals', statuses: string[], target = taskId) {
      const ids = statuses.map(() => crypto.randomUUID());
      const rows = statuses.map((status, index) => ({
        id: ids[index], taskId: target, orgId, projectId, status, createdAt: new Date(1_700_000_000_000 + index * 1000),
        ...(kind === 'questions' ? { question: `Question ${index}`, options: '[]', askedByAgentId: agentId }
          : { fromStatus: 'todo', toStatus: 'done', requestedByAgentId: agentId }),
      }));
      await db.insert(kind === 'questions' ? S.inputRequests : S.transitionApprovals).values(rows);
      return ids;
    }
    const cases = [
      ['questions', 'listInputRequests', 'inputRequests', 'open', ['answered', 'cancelled'], 20],
      ['approvals', 'listTransitionApprovals', 'approvals', 'pending', ['approved', 'rejected', 'stale'], 10],
    ] as const;
    for (const [kind, method, field, pending, closed, limit] of cases) {
      it(`${kind}: SQL separates old pending work and complete closed history before bounded paging/counts`, async () => {
        const ids = await seed(kind, [pending, ...Array.from({ length: limit + 3 }, (_, i) => closed[i % closed.length]!)]);
        const active = await handler[method]({ taskId, page: { limit } }, ctx);
        expect(active[field].map((r: any) => r.id)).toEqual([ids[0]]);
        expect(active.page.totalCount).toBe(1);
        const history = await handler[method]({ taskId, status: 'closed', page: { limit } }, ctx);
        expect(history[field]).toHaveLength(limit); expect(history.page.totalCount).toBe(limit + 3);
        expect(history[field].every((r: any) => closed.includes(r.status as never))).toBe(true);
        const next = await handler[method]({ taskId, status: 'closed', page: { limit, cursor: history.page.nextCursor } }, ctx);
        expect(next[field]).toHaveLength(3);
        expect(new Set([...history[field], ...next[field]].map((r: any) => r.id)).size).toBe(limit + 3);
        expect(next.page.totalCount).toBe(limit + 3);
        await expect(handler[method]({ taskId, status: 'other' }, ctx)).rejects.toThrow();
        await expect(handler[method]({ taskId, status: 'closed' }, makeAuthContext('foreign-user'))).rejects.toMatchObject({ code: Code.PermissionDenied });
      });
      it(`${kind}: organization paging reaches every pending row beyond fifty`, async () => {
        const firstIds = await seed(kind, Array(31).fill(pending));
        const secondIds = await seed(kind, Array(30).fill(pending), secondTaskId);
        const first = await handler[method]({ orgId, page: { limit: 50 } }, ctx);
        const second = await handler[method]({ orgId, page: { limit: 50, cursor: first.page.nextCursor } }, ctx);
        expect(first[field]).toHaveLength(50); expect(second[field]).toHaveLength(11);
        expect(first.page.totalCount).toBe(61); expect(second.page.totalCount).toBe(61);
        expect([...first[field], ...second[field]].map((r: any) => r.id).sort()).toEqual([...firstIds, ...secondIds].sort());
      });
      it(`${kind}: bound cursor rejects changed status/task/order/filter and legacy restarts the authorized first page`, async () => {
        const ids = await seed(kind, [pending, pending, pending]);
        await seed(kind, [closed[0]!, closed[0]!]);
        const first = await handler[method]({ taskId, page: { limit: 1 } }, ctx);
        const cursor = first.page.nextCursor;
        for (const change of [{ status: 'closed' }, { taskId: secondTaskId }, { page: { limit: 1, cursor, sort: 'createdAt:asc' } }, { page: { limit: 1, cursor, filter: 'changed' } }]) {
          await expect(handler[method]({ taskId, page: { limit: 1, cursor }, ...change }, ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
        }
        const otherOrg = `other-${crypto.randomUUID()}`;
        await db.insert(S.organizations).values({ id: otherOrg, name: 'Other authorized organization', slug: otherOrg, createdAt: new Date() });
        await db.insert(S.organizationMembers).values({ orgId: otherOrg, userId, role: 'admin', joinedAt: new Date() });
        await expect(handler[method]({ orgId: otherOrg, page: { limit: 1, cursor } }, ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
        // The authorized organization queue is a different rowset from this task.
        await expect(handler[method]({ orgId, page: { limit: 1, cursor } }, ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
        const legacy = encodeCursor(1_699_000_000_000, ids[0]!, 'createdAt', 999);
        const restarted = await handler[method]({ taskId, page: { limit: 1, cursor: legacy } }, ctx);
        expect(restarted[field].map((r: any) => r.id)).toEqual(first[field].map((r: any) => r.id));
        expect(restarted.page.totalCount).toBe(3);
      });
    }
    it('does not apply an approval cursor to the questions endpoint', async () => {
      await seed('questions', ['open', 'open']); await seed('approvals', ['pending', 'pending']);
      const first = await handler.listTransitionApprovals({ taskId, page: { limit: 1 } }, ctx);
      await expect(handler.listInputRequests({ taskId, page: { limit: 1, cursor: first.page.nextCursor } }, ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
      // Authorization still runs for every page; a cursor grants no access.
      await expect(handler.listTransitionApprovals({ taskId, page: { cursor: first.page.nextCursor } }, makeAuthContext('foreign-user'))).rejects.toMatchObject({ code: Code.PermissionDenied });
    });
    it('commits stale closure, rolls back capture failure, and fences competing decisions through the real interceptor', async () => {
      const [id] = await seed('approvals', ['pending']);
      const invoke = (approvalId: string, approve: boolean) => createMutationInterceptor(db)(async () =>
        handler.decideTransitionApproval({ id: approvalId, approve }, ctx))({ stream: false,
          method: TaskService.methods.find(method => method.name === 'DecideTransitionApproval') } as any);
      const readTask = async () => (await handler.getTask({ taskId }, ctx)).task;
      try {
        setDurableDomainEventCapture(async (tx, standalone, event) => {
          await captureDomainEvent(tx, standalone, event, { brokerRequired: false });
          throw new Error('capture unavailable');
        });
        await expect(invoke(id!, true)).rejects.toThrow('capture unavailable');
        expect((await readTask()).status).toBe('todo');
        expect((await handler.getTransitionApproval({ id }, ctx)).approval.status).toBe('pending');
        expect(await db.select().from(S.domainEvents).where(eq(S.domainEvents.projectId, projectId))).toHaveLength(0);
        expect(await db.select().from(S.taskActivity).where(eq(S.taskActivity.taskId, taskId))).toHaveLength(0);

        setDurableDomainEventCapture((tx, standalone, event) => captureDomainEvent(tx, standalone, event, { brokerRequired: false }));
        await invoke(id!, true);
        expect((await readTask()).status).toBe('done');
        expect((await handler.getTransitionApproval({ id }, ctx)).approval.status).toBe('approved');
        const eventsBeforeStale = await db.select().from(S.domainEvents);
        const [staleId] = await seed('approvals', ['pending']);
        await expect(invoke(staleId!, true)).rejects.toMatchObject({ code: Code.FailedPrecondition });
        expect((await handler.getTransitionApproval({ id: staleId }, ctx)).approval.status).toBe('stale');
        expect((await readTask()).status).toBe('done');
        expect((await handler.listTransitionApprovals({ taskId }, ctx)).approvals).toHaveLength(0);
        expect((await handler.listTransitionApprovals({ taskId, status: 'closed' }, ctx)).approvals.map((r: any) => r.id).sort()).toEqual([id, staleId].sort());
        expect(await db.select().from(S.domainEvents)).toHaveLength(eventsBeforeStale.length);

        const [competingId] = await seed('approvals', ['pending'], secondTaskId);
        const decisions = await Promise.allSettled([invoke(competingId!, true), invoke(competingId!, false)]);
        expect(decisions.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        const winner = (await handler.getTransitionApproval({ id: competingId }, ctx)).approval;
        expect((await handler.getTask({ taskId: secondTaskId }, ctx)).task.status).toBe(winner.status === 'approved' ? 'done' : 'todo');
        await expect(invoke(competingId!, winner.status !== 'approved')).rejects.toMatchObject({ code: Code.FailedPrecondition });
      } finally { setDurableDomainEventCapture(null); }
    });
  });
}
