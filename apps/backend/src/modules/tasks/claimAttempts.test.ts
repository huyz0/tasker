import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Code } from '@connectrpc/connect';
import { eq, sql } from 'drizzle-orm';
import * as S from '../../db/schema.sqlite';
import { setupIntegrationTest, seedOrgWithAdmin, seedProject, makeAuthContext } from '../../test/setup';
import { currentPrincipalKey } from '../auth/session';
import { createTaskManagementHandler } from './tasks.handler';
import { purgeAgentCascade, purgeTaskCascade } from '../../lib/cascadePurge';

describe('durable claim generations', () => {
  let db: any, nc: Awaited<ReturnType<typeof setupIntegrationTest>>['nc'];
  let tasks: ReturnType<typeof createTaskManagementHandler>;
  let orgId: string, userId: string, projectId: string, taskId: string, agentId: string;
  let agent: ReturnType<typeof makeAuthContext>, human: ReturnType<typeof makeAuthContext>;
  const priorStandalone = process.env.STANDALONE;

  beforeEach(async () => {
    ({ db, nc } = await setupIntegrationTest());
    const suffix = crypto.randomUUID();
    orgId = `org-${suffix}`; userId = `user-${suffix}`;
    projectId = `project-${suffix}`; taskId = `task-${suffix}`; agentId = `agent-${suffix}`;
    await seedOrgWithAdmin(db, { orgId, userId });
    await seedProject(db, { orgId, userId, projectId, templateId: `template-${suffix}` });
    await db.insert(S.agentRoles).values({ id: `role-${suffix}`, orgId, name: 'Worker', systemPrompt: '', capabilities: '[]', createdAt: new Date() });
    await db.insert(S.agents).values({ id: agentId, orgId, agentRoleId: `role-${suffix}`, name: 'Original worker', createdAt: new Date() });
    await db.insert(S.tasks).values({ id: taskId, projectId, title: 'Claimed work', status: 'todo', createdAt: new Date() });
    human = makeAuthContext(userId);
    agent = makeAuthContext(null);
    agent.values.set(currentPrincipalKey, { kind: 'agent', agentId, orgId, tokenId: 'fixture-token', scopes: ['tasks:read', 'tasks:write', 'comments:write'] });
    tasks = createTaskManagementHandler(db, nc);
  });

  afterEach(() => {
    db?.$client.close();
    if (priorStandalone === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = priorStandalone;
  });

  const heldId = async () => (await db.select().from(S.taskAssignments).where(eq(S.taskAssignments.taskId, taskId)))[0]?.id;
  const receiptRows = async () => await db.all(sql`SELECT * FROM task_claim_attempts WHERE task_id = ${taskId}`);

  it('returns the winning assignment ID and authenticated ownership receipt', async () => {
    const before = Math.floor(Date.now() / 1000) * 1000;
    const response: any = await tasks.claimTask({ taskId, externalRunId: 'runner/job-42', ownerId: 'forged' }, agent);
    expect(response.attempt).toBeDefined();
    expect(response.attempt).toMatchObject({ id: await heldId(), taskId, orgId,
      owner: { kind: 'agent', id: agentId, name: 'Original worker' }, externalRunId: 'runner/job-42' });
    expect(Date.parse(response.attempt.claimedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(response.attempt.claimedAt)).toBeLessThanOrEqual(Date.now());
    expect(response.attempt.releasedAt).toBeUndefined();
    expect(await receiptRows()).toHaveLength(1);
  });

  it('replays the original receipt after release without creating another generation', async () => {
    const request = { taskId, idempotencyKey: 'claim-retry', externalRunId: 'job-A' };
    const first: any = await tasks.claimTask(request, agent);
    expect(first.attempt).toBeDefined();
    await tasks.releaseTask({ taskId, expectedAttemptId: first.attempt.id }, agent);
    const replay: any = await tasks.claimTask(request, agent);
    expect(replay.attempt).toEqual(first.attempt);
    expect(await heldId()).toBeUndefined();
    expect(await receiptRows()).toHaveLength(1);
    expect(nc.publishedMessages.filter(event => event.subject === 'domain.task.claimed')).toHaveLength(1);
  });

  it('refuses a changed external correlation on the same claim key', async () => {
    await tasks.claimTask({ taskId, idempotencyKey: 'one-key', externalRunId: 'job-A' }, agent);
    await expect(tasks.claimTask({ taskId, idempotencyKey: 'one-key', externalRunId: 'job-B' }, agent))
      .rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  it('fences a stale same-agent release before any handoff or new assignment removal', async () => {
    await tasks.claimTask({ taskId }, agent);
    const oldId = await heldId();
    await tasks.releaseTask({ taskId }, agent);
    await tasks.claimTask({ taskId }, agent);
    const newId = await heldId();
    expect(newId).not.toBe(oldId);
    const eventsBefore = nc.publishedMessages.length;
    await expect(tasks.releaseTask({ taskId, expectedAttemptId: oldId, handoffNote: 'Stale handoff must not exist' }, agent))
      .rejects.toMatchObject({ code: Code.FailedPrecondition });
    expect(await heldId()).toBe(newId);
    expect(await db.select().from(S.taskNotes).where(eq(S.taskNotes.taskId, taskId))).toHaveLength(0);
    expect(nc.publishedMessages).toHaveLength(eventsBefore);
  });

  it('retains and closes exactly the removed receipt when a human unassigns', async () => {
    const response: any = await tasks.claimTask({ taskId }, agent);
    expect(response.attempt).toBeDefined();
    await tasks.unassignTask({ taskId, agentId }, human);
    expect(await heldId()).toBeUndefined();
    const rows = await receiptRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: response.attempt.id, release_reason: 'unassigned', released_by_kind: 'user', released_by_id: userId });
    expect(rows[0].released_at).not.toBeNull();
    await tasks.unassignTask({ taskId, agentId }, human);
    expect(await receiptRows()).toEqual(rows);
  });

  it('ends retained ownership on owner purge without erasing its original name', async () => {
    const response: any = await tasks.claimTask({ taskId }, agent);
    expect(response.attempt).toBeDefined();
    await db.update(S.agents).set({ name: 'Renamed worker' }).where(eq(S.agents.id, agentId));
    await purgeAgentCascade(db, agentId);
    expect(await heldId()).toBeUndefined();
    const rows = await receiptRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: response.attempt.id, owner_id: agentId, owner_name: 'Original worker', release_reason: 'owner_purged', released_by_kind: 'system', released_by_id: null });
    expect(rows[0].released_at).not.toBeNull();
  });

  it('records human self-claims but never fabricates a receipt for a manual assignment', async () => {
    const response: any = await tasks.claimTask({ taskId }, human);
    expect(response.attempt.owner).toMatchObject({ kind: 'user', id: userId });
    await tasks.releaseTask({ taskId, expectedAttemptId: response.attempt.id }, human);
    await tasks.assignTask({ taskId, agentId }, human);
    await expect(tasks.releaseTask({ taskId }, agent)).rejects.toMatchObject({ code: Code.PermissionDenied });
    expect(await receiptRows()).toHaveLength(1);
    await tasks.unassignTask({ taskId, agentId }, human);
    expect(await receiptRows()).toHaveLength(1);
  });

  it('returns ClaimNext receipt/correlation and leaves an empty queue receipt-free', async () => {
    const first: any = await tasks.claimNextTask({ projectId, externalRunId: 'queue/job-1', idempotencyKey: 'next-retry' }, agent);
    expect(first.attempt).toMatchObject({ id: await heldId(), taskId, externalRunId: 'queue/job-1' });
    const empty: any = await tasks.claimNextTask({ projectId }, agent);
    expect(empty.attempt).toBeUndefined();
    await tasks.releaseTask({ taskId }, agent);
    const replay: any = await tasks.claimNextTask({ projectId, externalRunId: 'queue/job-1', idempotencyKey: 'next-retry' }, agent);
    expect(replay.attempt).toEqual(first.attempt);
    expect(await heldId()).toBeUndefined();
    expect(await receiptRows()).toHaveLength(1);
  });

  it('gives a racing claim one receipt and a later reclaim another', async () => {
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () => tasks.claimTask({ taskId }, agent)));
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    const id = await heldId();
    expect((await receiptRows()).map((row: any) => row.id)).toEqual([id]);
    await tasks.releaseTask({ taskId, expectedAttemptId: id }, agent);
    const reclaimed: any = await tasks.claimTask({ taskId }, agent);
    expect(reclaimed.attempt.id).not.toBe(id);
    const rows = await receiptRows();
    expect(rows).toHaveLength(2);
    expect(rows.find((row: any) => row.id === id).release_reason).toBe('released');
    expect(rows.find((row: any) => row.id === reclaimed.attempt.id).released_at).toBeNull();
  });

  it('rolls back the winning assignment and event if receipt storage fails', async () => {
    await db.run(sql.raw("CREATE TRIGGER receipt_insert_fault BEFORE INSERT ON task_claim_attempts BEGIN SELECT RAISE(ABORT, 'receipt storage fault'); END"));
    await expect(tasks.claimTask({ taskId, idempotencyKey: 'failed-claim' }, agent)).rejects.toThrow();
    expect(await heldId()).toBeUndefined();
    expect(await receiptRows()).toHaveLength(0);
    expect(await db.select().from(S.taskActivity).where(eq(S.taskActivity.taskId, taskId))).toHaveLength(0);
    expect(await db.select().from(S.idempotencyKeys)).toHaveLength(0);
    expect(nc.publishedMessages).toHaveLength(0);
    await db.run(sql.raw('DROP TRIGGER receipt_insert_fault'));
    expect((await tasks.claimTask({ taskId, idempotencyKey: 'failed-claim' }, agent)).attempt).toBeDefined();
  });

  for (const operation of ['release', 'unassign', 'owner-purge'] as const) {
    it(`rolls back ${operation} ownership removal when receipt closure fails`, async () => {
      const first: any = await tasks.claimTask({ taskId }, agent);
      const eventsBefore = nc.publishedMessages.length;
      await db.run(sql.raw("CREATE TRIGGER receipt_end_fault BEFORE UPDATE ON task_claim_attempts BEGIN SELECT RAISE(ABORT, 'receipt closure fault'); END"));
      const run = operation === 'release'
        ? () => tasks.releaseTask({ taskId, expectedAttemptId: first.attempt.id, handoffNote: 'Atomic handoff' }, agent)
        : operation === 'unassign' ? () => tasks.unassignTask({ taskId, agentId }, human)
          : () => purgeAgentCascade(db, agentId);
      await expect(run()).rejects.toThrow();
      expect(await heldId()).toBe(first.attempt.id);
      expect((await receiptRows())[0].released_at).toBeNull();
      expect(await db.select().from(S.taskNotes).where(eq(S.taskNotes.taskId, taskId))).toHaveLength(0);
      expect(await db.select().from(S.agents).where(eq(S.agents.id, agentId))).toHaveLength(1);
      expect(nc.publishedMessages).toHaveLength(eventsBefore);
    });
  }

  it('keeps legacy ownership release working and removes receipts with a purged task', async () => {
    await db.insert(S.taskAssignments).values({ id: 'ta-legacy', taskId, agentId, source: 'claim' });
    await tasks.releaseTask({ taskId }, agent);
    expect(await receiptRows()).toHaveLength(0);
    await tasks.claimTask({ taskId }, agent);
    expect(await receiptRows()).toHaveLength(1);
    await purgeTaskCascade(db, taskId);
    expect(await receiptRows()).toHaveLength(0);
    expect(await db.select().from(S.tasks).where(eq(S.tasks.id, taskId))).toHaveLength(0);
  });

  it('does not turn a terminal status or archive into an ownership end', async () => {
    const response: any = await tasks.claimTask({ taskId }, agent);
    const recorded = await receiptRows();
    expect(recorded[0].released_at).toBeNull();
    await tasks.updateTaskStatus({ taskId, status: 'done' }, agent);
    expect(await receiptRows()).toEqual(recorded);
    await tasks.deleteTask({ taskId }, human);
    expect(await receiptRows()).toEqual(recorded);
    expect(await heldId()).toBe(response.attempt.id);
  });
});
