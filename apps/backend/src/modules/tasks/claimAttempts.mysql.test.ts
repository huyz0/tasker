import { expect, it } from 'bun:test';
import { Code } from '@connectrpc/connect';
import { eq, sql } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import { setupDatabase } from '../../db/db';
import * as S from '../../db/schema.mysql';
import { makeAuthContext } from '../../test/setup';
import { currentPrincipalKey } from '../auth/session';
import { createTaskManagementHandler } from './tasks.handler';
import { purgeAgentCascade, purgeProjectCascade } from '../../lib/cascadePurge';

const enabled = process.env.TASKER_MYSQL_INTEGRATION === '1';
(enabled ? it : it.skip)('MySQL persists winning generations, fences releases and rolls back exact ownership closure', async () => {
  const previousStandalone = process.env.STANDALONE, previousName = process.env.DB_NAME;
  const name = `tasker_m57_claim_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD });
  let db: any, created = false;
  try {
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`); created = true;
    process.env.STANDALONE = 'false'; process.env.DB_NAME = name;
    db = await setupDatabase('mysql');
    const suffix = crypto.randomUUID(), orgId = `org-${suffix}`, userId = `user-${suffix}`;
    const projectId = `project-${suffix}`, templateId = `template-${suffix}`, roleId = `role-${suffix}`;
    const agentIds = [`agent-A-${suffix}`, `agent-B-${suffix}`] as const;
    const now = new Date(), human = makeAuthContext(userId), events: { subject: string }[] = [];
    const tasks = createTaskManagementHandler(db, { publish: (subject: string) => events.push({ subject }) });
    await db.insert(S.users).values({ id: userId, email: `${suffix}@example.test`, name: 'Owner', createdAt: now });
    await db.insert(S.organizations).values({ id: orgId, name: 'Receipt proof', slug: orgId, createdAt: now });
    await db.insert(S.organizationMembers).values({ orgId, userId, role: 'admin', joinedAt: now });
    await db.insert(S.projectTemplates).values({ id: templateId, orgId, name: 'Template', createdAt: now });
    await db.insert(S.projects).values({ id: projectId, templateId, orgId, ownerId: userId, key: 'CLAIM', name: 'Claims', createdAt: now });
    await db.insert(S.agentRoles).values({ id: roleId, orgId, name: 'Workers', systemPrompt: '', capabilities: '[]', createdAt: now });
    for (const [index, id] of agentIds.entries()) {
      await db.insert(S.agents).values({ id, orgId, agentRoleId: roleId, name: `Worker ${index}`, createdAt: now });
    }
    const agents = agentIds.map(agentId => {
      const ctx = makeAuthContext(null);
      ctx.values.set(currentPrincipalKey, { kind: 'agent', agentId, orgId, tokenId: 'fixture-token', scopes: ['tasks:read', 'tasks:write', 'comments:write'] });
      return ctx;
    });
    const newTask = async (label: string) => {
      const id = `task-${label}-${suffix}`;
      await db.insert(S.tasks).values({ id, projectId, title: label, status: 'todo', createdAt: now });
      return id;
    };
    const held = async (taskId: string) => (await db.select().from(S.taskAssignments).where(eq(S.taskAssignments.taskId, taskId)))[0];
    const receipts = (taskId: string) => db.select().from(S.taskClaimAttempts).where(eq(S.taskClaimAttempts.taskId, taskId));
    const taskId = await newTask('first');
    const request = { taskId, externalRunId: 'mysql/job-A', idempotencyKey: 'mysql-first' };
    const first: any = await tasks.claimTask(request, agents[0]);
    expect(first.attempt).toMatchObject({ id: (await held(taskId)).id, taskId, orgId,
      owner: { kind: 'agent', id: agentIds[0], name: 'Worker 0' }, externalRunId: 'mysql/job-A' });
    expect((await receipts(taskId))[0].claimedAt.toISOString()).toBe(first.attempt.claimedAt);
    expect((await tasks.claimTask(request, agents[0])).attempt).toEqual(first.attempt);
    expect(await receipts(taskId)).toHaveLength(1);
    await expect(tasks.claimTask({ ...request, externalRunId: 'mysql/job-B' }, agents[0])).rejects.toMatchObject({ code: Code.InvalidArgument });
    await tasks.releaseTask({ taskId, expectedAttemptId: first.attempt.id, handoffNote: 'Real handoff' }, agents[0]);
    expect(await held(taskId)).toBeUndefined();
    expect((await receipts(taskId))[0]).toMatchObject({ releaseReason: 'released', releasedByKind: 'agent', releasedById: agentIds[0] });
    expect((await tasks.claimTask(request, agents[0])).attempt).toEqual(first.attempt);
    expect(await held(taskId)).toBeUndefined();
    const second: any = await tasks.claimTask({ taskId, externalRunId: 'mysql/reclaim' }, agents[0]);
    expect(second.attempt.id).not.toBe(first.attempt.id);
    const eventsBefore = events.length;
    await expect(tasks.releaseTask({ taskId, expectedAttemptId: first.attempt.id, handoffNote: 'Stale note' }, agents[0]))
      .rejects.toMatchObject({ code: Code.FailedPrecondition });
    expect((await held(taskId)).id).toBe(second.attempt.id);
    expect(await db.select().from(S.taskNotes).where(eq(S.taskNotes.taskId, taskId))).toHaveLength(1);
    expect(events).toHaveLength(eventsBefore);
    await tasks.unassignTask({ taskId, agentId: agentIds[0] }, human);
    const ended = await receipts(taskId);
    expect(ended.find((row: any) => row.id === second.attempt.id)).toMatchObject({ releaseReason: 'unassigned', releasedByKind: 'user', releasedById: userId });
    await tasks.unassignTask({ taskId, agentId: agentIds[0] }, human);
    expect(await receipts(taskId)).toEqual(ended);

    const raced = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => tasks.claimTask({ taskId }, agents[index % 2])));
    const winners = raced.filter(outcome => outcome.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    expect(await receipts(taskId)).toHaveLength(3);
    const winner: any = (winners[0] as PromiseFulfilledResult<any>).value;
    expect((await held(taskId)).id).toBe(winner.attempt.id);
    expect((await receipts(taskId)).filter((row: any) => !row.releasedAt)).toHaveLength(1);
    expect(await tasks.claimNextTask({ projectId }, agents[0])).toEqual({});
    await tasks.unassignTask({ taskId, agentId: winner.attempt.owner.id }, human);
    const next: any = await tasks.claimNextTask({ projectId, externalRunId: 'mysql/next' }, human);
    expect(next.attempt).toMatchObject({ taskId, externalRunId: 'mysql/next', owner: { kind: 'user', id: userId, name: 'Owner' } });

    const faultTask = await newTask('fault');
    const faultClaim: any = await tasks.claimTask({ taskId: faultTask }, agents[1]);
    await db.execute(sql.raw("CREATE TRIGGER m57_end_fault BEFORE UPDATE ON task_claim_attempts FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'receipt closure fault'"));
    for (const operation of [
      () => tasks.releaseTask({ taskId: faultTask, expectedAttemptId: faultClaim.attempt.id, handoffNote: 'No partial note' }, agents[1]),
      () => tasks.unassignTask({ taskId: faultTask, agentId: agentIds[1] }, human),
      () => purgeAgentCascade(db, agentIds[1]),
    ]) {
      await expect(operation()).rejects.toThrow();
      expect((await held(faultTask)).id).toBe(faultClaim.attempt.id);
      expect((await receipts(faultTask))[0].releasedAt).toBeNull();
      expect(await db.select().from(S.taskNotes).where(eq(S.taskNotes.taskId, faultTask))).toHaveLength(0);
      expect(await db.select().from(S.agents).where(eq(S.agents.id, agentIds[1]))).toHaveLength(1);
    }
    await db.execute(sql.raw('DROP TRIGGER m57_end_fault'));
    await db.update(S.agents).set({ name: 'Renamed' }).where(eq(S.agents.id, agentIds[1]));
    await purgeAgentCascade(db, agentIds[1]);
    expect(await held(faultTask)).toBeUndefined();
    expect((await receipts(faultTask))[0]).toMatchObject({ ownerName: 'Worker 1', releaseReason: 'owner_purged', releasedByKind: 'system', releasedById: null });

    const legacyTask = await newTask('legacy');
    await db.insert(S.taskAssignments).values({ id: `ta-legacy-${suffix}`, taskId: legacyTask, agentId: agentIds[0], source: 'claim' });
    await tasks.releaseTask({ taskId: legacyTask }, agents[0]);
    expect(await receipts(legacyTask)).toHaveLength(0);
    await db.execute(sql.raw("CREATE TRIGGER m57_insert_fault BEFORE INSERT ON task_claim_attempts FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'receipt insert fault'"));
    await expect(tasks.claimTask({ taskId: legacyTask, idempotencyKey: 'mysql-insert-fault' }, agents[0])).rejects.toThrow();
    expect(await held(legacyTask)).toBeUndefined();
    expect(await receipts(legacyTask)).toHaveLength(0);
    expect(await db.select().from(S.idempotencyKeys).where(eq(S.idempotencyKeys.idempotencyKey, 'mysql-insert-fault'))).toHaveLength(0);
    await db.execute(sql.raw('DROP TRIGGER m57_insert_fault'));
    await purgeProjectCascade(db, projectId);
    expect(await db.select().from(S.taskClaimAttempts)).toHaveLength(0);
    expect(await db.select().from(S.tasks)).toHaveLength(0);
  } finally {
    if (db) await db.$client.end();
    try { if (created) await admin.query(`DROP DATABASE \`${name}\``); } finally { await admin.end(); }
    if (previousStandalone === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = previousStandalone;
    if (previousName === undefined) delete process.env.DB_NAME; else process.env.DB_NAME = previousName;
  }
}, 60_000);
