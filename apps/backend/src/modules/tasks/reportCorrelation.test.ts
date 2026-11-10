import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Code } from '@connectrpc/connect';
import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { CreateTaskNoteRequestSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { ListTaskNotesResponseSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import * as S from '../../db/schema.sqlite';
import { setupIntegrationTest, seedOrgWithAdmin, seedProject, makeAuthContext } from '../../test/setup';
import { currentPrincipalKey } from '../auth/session';
import { createTaskManagementHandler } from './tasks.handler';
import { createTaskNotesHandler } from './task_notes.handler';
import { createUsageHandlers } from './usage';
import { createArtifactsHandler } from '../artifacts/artifacts.handler';

describe('explicit claim report association', () => {
  let db: any, tasks: ReturnType<typeof createTaskManagementHandler>, notes: ReturnType<typeof createTaskNotesHandler>;
  let usage: ReturnType<typeof createUsageHandlers>, artifacts: ReturnType<typeof createArtifactsHandler>;
  let taskId: string, otherTaskId: string, orgId: string, agentId: string, artifactId: string;
  let ownAttempt: string, foreignAttempt: string, otherTaskAttempt: string;
  let own: ReturnType<typeof makeAuthContext>, other: ReturnType<typeof makeAuthContext>, human: ReturnType<typeof makeAuthContext>;
  const priorStandalone = process.env.STANDALONE;

  beforeEach(async () => {
    const setup = await setupIntegrationTest(); db = setup.db;
    const suffix = crypto.randomUUID(), userId = `user-${suffix}`, projectId = `project-${suffix}`, roleId = `role-${suffix}`;
    orgId = `org-${suffix}`; agentId = `agent-A-${suffix}`;
    taskId = `task-A-${suffix}`; otherTaskId = `task-B-${suffix}`;
    await seedOrgWithAdmin(db, { orgId, userId });
    await seedProject(db, { orgId, userId, projectId, templateId: `template-${suffix}` });
    await db.insert(S.agentRoles).values({ id: roleId, orgId, name: 'Workers', systemPrompt: '', capabilities: '[]', createdAt: new Date() });
    for (const id of [agentId, `agent-B-${suffix}`]) {
      await db.insert(S.agents).values({ id, orgId, agentRoleId: roleId, name: id, createdAt: new Date() });
    }
    for (const id of [taskId, otherTaskId]) {
      await db.insert(S.tasks).values({ id, projectId, title: id, status: 'todo', createdAt: new Date() });
    }
    const agentContext = (id: string) => {
      const ctx = makeAuthContext(null);
      ctx.values.set(currentPrincipalKey, { kind: 'agent', agentId: id, orgId, tokenId: 'fixture-token', scopes: ['tasks:read', 'tasks:write', 'comments:write', 'artifacts:read', 'artifacts:write'] });
      return ctx;
    };
    own = agentContext(agentId); other = agentContext(`agent-B-${suffix}`); human = makeAuthContext(userId);
    tasks = createTaskManagementHandler(db, setup.nc); notes = createTaskNotesHandler(db, setup.nc);
    usage = createUsageHandlers(db, setup.nc, true); artifacts = createArtifactsHandler(db, setup.nc);
    ownAttempt = (await tasks.claimTask({ taskId }, own)).attempt.id;
    await tasks.releaseTask({ taskId, expectedAttemptId: ownAttempt }, own);
    foreignAttempt = (await tasks.claimTask({ taskId }, other)).attempt.id;
    otherTaskAttempt = (await tasks.claimTask({ taskId: otherTaskId }, own)).attempt.id;
    const folder: any = await artifacts.createFolder({ projectId, name: 'Outputs' }, human);
    const artifact: any = await artifacts.createArtifact({ folderId: folder.folder.id, name: 'result.txt', content: 'Recorded result', contentType: 'text/plain' }, human);
    artifactId = artifact.artifact.id;
  });

  afterEach(() => {
    db?.$client.close();
    if (priorStandalone === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = priorStandalone;
  });

  const report = (kind: 'note' | 'usage' | 'artifact', attemptId?: string, ctx = own) => kind === 'note'
    ? notes.createTaskNote({ taskId, content: 'Delayed result', noteType: 'comment', attemptId }, ctx)
    : kind === 'usage' ? usage.reportUsage({ taskId, inputTokens: 1, attemptId }, ctx)
      : artifacts.linkTaskArtifact({ taskId, artifactId, attemptId }, ctx);

  for (const kind of ['note', 'usage', 'artifact'] as const) {
    it(`retains explicit closed-receipt association for delayed ${kind}`, async () => {
      const response: any = await report(kind, ownAttempt);
      const value = kind === 'note' ? response.taskNote : kind === 'usage' ? response.record : response.link;
      expect(value.attemptId).toBe(ownAttempt);
    });
    it(`refuses another authenticated owner's receipt on ${kind}`, async () => {
      await expect(report(kind, foreignAttempt)).rejects.toMatchObject({ code: Code.NotFound });
    });
    it(`refuses a same-owner other-task receipt on ${kind}`, async () => {
      await expect(report(kind, otherTaskAttempt)).rejects.toMatchObject({ code: Code.NotFound });
    });
    it(`refuses an unknown receipt on ${kind}`, async () => {
      await expect(report(kind, 'ta-unknown')).rejects.toMatchObject({ code: Code.NotFound });
    });
    it(`checks ordinary ${kind} permission before exposing receipt validity`, async () => {
      const denied = makeAuthContext(null);
      denied.values.set(currentPrincipalKey, { kind: 'agent', agentId, orgId, tokenId: 'fixture-no-scopes', scopes: [] });
      await expect(report(kind, foreignAttempt, denied)).rejects.toMatchObject({ code: Code.PermissionDenied });
    });
  }

  it('keeps omitted correlation ungrouped while a newer claim is held', async () => {
    for (const kind of ['note', 'usage', 'artifact'] as const) {
      const response: any = await report(kind);
      const value = kind === 'note' ? response.taskNote : kind === 'usage' ? response.record : response.link;
      expect(value.attemptId).toBeUndefined();
    }
  });

  it('does not reassign keyed usage to another or omitted receipt', async () => {
    await usage.reportUsage({ taskId, inputTokens: 1, idempotencyKey: 'final', attemptId: ownAttempt }, own);
    await expect(usage.reportUsage({ taskId, inputTokens: 1, idempotencyKey: 'final', attemptId: foreignAttempt }, other))
      .rejects.toMatchObject({ code: Code.InvalidArgument });
    await expect(usage.reportUsage({ taskId, inputTokens: 1, idempotencyKey: 'final' }, own))
      .rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  it('does not replace an existing artifact association on a duplicate pair', async () => {
    await artifacts.linkTaskArtifact({ taskId, artifactId, attemptId: ownAttempt }, own);
    await expect(artifacts.linkTaskArtifact({ taskId, artifactId, attemptId: foreignAttempt }, other))
      .rejects.toMatchObject({ code: Code.FailedPrecondition });
  });

  it('does not retrofit an ungrouped link into a receipt', async () => {
    await artifacts.linkTaskArtifact({ taskId, artifactId }, human);
    await expect(artifacts.linkTaskArtifact({ taskId, artifactId, attemptId: ownAttempt }, own))
      .rejects.toMatchObject({ code: Code.FailedPrecondition });
  });

  it('associates a release handoff with the exact held receipt', async () => {
    const response: any = await tasks.releaseTask({ taskId, expectedAttemptId: foreignAttempt, handoffNote: 'Handoff for this claim' }, other);
    expect(response.handoffNote.attemptId).toBe(foreignAttempt);
  });

  it('keeps a legacy assignment handoff ungrouped instead of fabricating a receipt', async () => {
    await tasks.releaseTask({ taskId }, other);
    await db.insert(S.taskAssignments).values({ id: 'ta-legacy', taskId, agentId, source: 'claim' });
    const response: any = await tasks.releaseTask({ taskId, handoffNote: 'Legacy handoff' }, own);
    expect(response.handoffNote.content).toBe('Legacy handoff');
    expect(response.handoffNote.attemptId).toBeUndefined();
  });

  it('keeps the documented default note type through the actual request codec', async () => {
    const request = fromBinary(CreateTaskNoteRequestSchema, toBinary(CreateTaskNoteRequestSchema,
      create(CreateTaskNoteRequestSchema, { taskId, content: 'Legacy omitted type' })));
    const response: any = await notes.createTaskNote(request, own);
    expect(response.taskNote.noteType).toBe('comment');
    expect(response.taskNote.attemptId).toBeUndefined();
  });

  it('binds association to agent identity rather than one issued token', async () => {
    const rotated = makeAuthContext(null);
    rotated.values.set(currentPrincipalKey, { kind: 'agent', agentId, orgId, tokenId: 'another-fixture-token', scopes: ['comments:write'] });
    const response: any = await report('note', ownAttempt, rotated);
    expect(response.taskNote.attemptId).toBe(ownAttempt);
    expect(response.taskNote.agentId).toBe(agentId);
  });

  it('reads stored associations and keeps legacy note omission through the response codec', async () => {
    const linked: any = await report('note', ownAttempt);
    const legacy: any = await report('note');
    const listed: any = await notes.listTaskNotes({ taskId, page: { limit: 50 } }, own);
    const decoded = fromBinary(ListTaskNotesResponseSchema, toBinary(ListTaskNotesResponseSchema,
      create(ListTaskNotesResponseSchema, listed)));
    expect(decoded.taskNotes.find(note => note.id === linked.taskNote.id)?.attemptId).toBe(ownAttempt);
    expect(decoded.taskNotes.find(note => note.id === legacy.taskNote.id)?.attemptId).toBeUndefined();
    await notes.updateTaskNote({ taskNoteId: linked.taskNote.id, content: 'Edited', attemptId: foreignAttempt }, own);
    const after: any = await notes.listTaskNotes({ taskId }, own);
    expect(after.taskNotes.find((note: any) => note.id === linked.taskNote.id).attemptId).toBe(ownAttempt);
    await report('usage', ownAttempt);
    expect((await usage.listUsageRecords({ taskId }, own)).records[0]?.attemptId).toBe(ownAttempt);
    await report('artifact', ownAttempt);
    const links: any = await artifacts.listTaskArtifactLinks({ taskId, page: { limit: 50 } }, own);
    expect(links.links[0].attemptId).toBe(ownAttempt);
    expect(links.evidence[0].link.attemptId).toBe(ownAttempt);
  });

  it('retains an older receipt when the same agent reclaims the task', async () => {
    await tasks.releaseTask({ taskId }, other);
    const current = await tasks.claimTask({ taskId }, own);
    expect(current.attempt.id).not.toBe(ownAttempt);
    const response: any = await report('usage', ownAttempt);
    expect(response.record.attemptId).toBe(ownAttempt);
  });

  it('accepts human-owned usage/link receipts without granting agent note authorship', async () => {
    await tasks.releaseTask({ taskId: otherTaskId }, own);
    const receipt = (await tasks.claimTask({ taskId: otherTaskId }, human)).attempt;
    const reported: any = await usage.reportUsage({ taskId: otherTaskId, inputTokens: 1, attemptId: receipt.id }, human);
    expect(reported.record.attemptId).toBe(receipt.id);
    expect(reported.record.userId).toBe(receipt.owner.id);
    const linked: any = await artifacts.linkTaskArtifact({ taskId: otherTaskId, artifactId, attemptId: receipt.id }, human);
    expect(linked.link.attemptId).toBe(receipt.id);
    await expect(notes.createTaskNote({ taskId: otherTaskId, content: 'Not an agent', attemptId: receipt.id }, human))
      .rejects.toMatchObject({ code: Code.PermissionDenied });
    await expect(artifacts.linkTaskArtifact({ taskId, artifactId, attemptId: ownAttempt }, human))
      .rejects.toMatchObject({ code: Code.NotFound });
  });
});
