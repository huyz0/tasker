import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Code } from '@connectrpc/connect';
import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { ListTaskAttemptsRequestSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { eq } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import { setupDatabase } from '../../db/db';
import * as SQ from '../../db/schema.sqlite';
import * as MY from '../../db/schema.mysql';
import { makeAuthContext } from '../../test/setup';
import { currentPrincipalKey } from '../auth/session';
import { createTaskManagementHandler } from './tasks.handler';
import { createTaskNotesHandler } from './task_notes.handler';
import { createUsageHandlers } from './usage';
import { createArtifactsHandler } from '../artifacts/artifacts.handler';

for (const dialect of ['sqlite', 'mysql'] as const) {
  const enabled = dialect === 'sqlite' || process.env.TASKER_MYSQL_INTEGRATION === '1';
  (enabled ? describe : describe.skip)(`${dialect} bounded claim history and report reads`, () => {
    const S: any = dialect === 'sqlite' ? SQ : MY;
    let db: any, admin: mysql.Connection | undefined, databaseName: string | undefined, created = false;
    let previousName: string | undefined, previousStandalone: string | undefined;
    let tasks: any, notes: any, usage: any, artifacts: any;
    let orgId: string, projectId: string, taskId: string, otherTaskId: string, agentId: string, userId: string;
    let ownReceipt: string, secondReceipt: string, foreignTaskReceipt: string, artifactId: string;
    let ctx: ReturnType<typeof makeAuthContext>;
    const at = new Date('2026-11-08T12:00:00.000Z');
    beforeAll(async () => {
      previousName = process.env.DB_NAME; previousStandalone = process.env.STANDALONE;
      process.env.STANDALONE = String(dialect === 'sqlite');
      if (dialect === 'mysql') {
        admin = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1',
          port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD });
        databaseName = `tasker_m57_reads_${crypto.randomUUID().replaceAll('-', '')}`;
        await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4`);
        created = true;
        process.env.DB_NAME = databaseName;
      }
      db = await setupDatabase(dialect, ':memory:');
    }, 90_000);
    afterAll(async () => {
      try {
        if (dialect === 'sqlite') db?.$client.close();
        else if (db) await db.$client.end();
      } finally {
        if (admin) {
          try { if (created && databaseName) await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``); }
          finally { await admin.end(); }
        }
        if (previousName === undefined) delete process.env.DB_NAME; else process.env.DB_NAME = previousName;
        if (previousStandalone === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = previousStandalone;
      }
    });
    beforeEach(async () => {
      const key = crypto.randomUUID();
      orgId = `org-${key}`; userId = `user-${key}`; agentId = `agent-${key}`;
      projectId = `project-${key}`; taskId = `task-${key}`; otherTaskId = `other-task-${key}`;
      await db.insert(S.users).values({ id: userId, name: 'Reader', createdAt: at });
      await db.insert(S.organizations).values({ id: orgId, name: 'Read fixtures', slug: orgId, createdAt: at });
      await db.insert(S.organizationMembers).values({ orgId, userId, role: 'admin', joinedAt: at });
      await db.insert(S.projectTemplates).values({ id: `template-${key}`, orgId, name: 'Template', createdAt: at });
      await db.insert(S.projects).values({ id: projectId, orgId, ownerId: userId, templateId: `template-${key}`, name: 'Reports', createdAt: at });
      await db.insert(S.tasks).values([taskId, otherTaskId].map(id => ({ id, projectId, title: id, status: 'todo', createdAt: at })));
      await db.insert(S.agentRoles).values({ id: `role-${key}`, orgId, name: 'Worker', systemPrompt: '', capabilities: '[]', createdAt: at });
      await db.insert(S.agents).values({ id: agentId, orgId, agentRoleId: `role-${key}`, name: 'Current name', createdAt: at });
      const receiptId = (i: number) => `ta-${key}-${String(i).padStart(3, '0')}`;
      await db.insert(S.taskClaimAttempts).values(Array.from({ length: 125 }, (_, i) => ({
        id: receiptId(i), taskId, orgId, ownerKind: 'agent', ownerId: agentId, ownerName: 'Recorded owner', claimedAt: at,
        ...(i < 124 ? { releasedAt: at, releaseReason: 'released', releasedByKind: 'agent', releasedById: agentId } : {}),
      })));
      ownReceipt = receiptId(0); secondReceipt = receiptId(1); foreignTaskReceipt = `ta-other-${key}`;
      await db.insert(S.taskClaimAttempts).values({ id: foreignTaskReceipt, taskId: otherTaskId, orgId,
        ownerKind: 'agent', ownerId: agentId, ownerName: 'Recorded owner', claimedAt: at });
      const folderId = `folder-${key}`;
      await db.insert(S.folders).values({ id: folderId, projectId, name: 'Outputs', createdAt: at });
      const reports = Array.from({ length: 375 }, (_, i) => ({
        id: `${key}-${String(i).padStart(3, '0')}`, attemptId: i < 125 ? ownReceipt : i < 250 ? secondReceipt : null,
      }));
      await db.insert(S.taskNotes).values(reports.map((row, i) => ({ ...row, taskId, agentId,
        content: `Report ${i}`, noteType: i < 5 ? 'handoff' : 'comment', createdAt: at })));
      await db.insert(S.usageRecords).values(reports.map(row => ({ ...row, taskId, orgId, projectId, agentId, inputTokens: 1, createdAt: at })));
      await db.insert(S.artifacts).values(reports.map(row => ({ id: row.id, folderId, name: row.id, content: 'Recorded output', createdAt: at })));
      await db.insert(S.taskArtifactLinks).values(reports.map(row => ({ ...row, taskId, artifactId: row.id, linkedAt: at })));
      artifactId = reports[0]!.id;
      tasks = createTaskManagementHandler(db); notes = createTaskNotesHandler(db);
      usage = createUsageHandlers(db, null, dialect === 'sqlite'); artifacts = createArtifactsHandler(db);
      ctx = makeAuthContext(userId);
    });

    const source = (kind: 'notes' | 'usage' | 'artifacts', request: any, caller = ctx) => kind === 'notes'
      ? notes.listTaskNotes({ taskId, ...request }, caller) : kind === 'usage'
        ? usage.listUsageRecords({ taskId, ...request }, caller) : artifacts.listTaskArtifactLinks({ taskId, ...request }, caller);
    const rows = (kind: 'notes' | 'usage' | 'artifacts', response: any): any[] => kind === 'notes'
      ? response.taskNotes : kind === 'usage' ? response.records : response.links;

    it('defaults to fifty and caps/tie-pages every recorded receipt without duplication', async () => {
      expect((await tasks.listTaskAttempts({ taskId }, ctx)).attempts).toHaveLength(50);
      const first = await tasks.listTaskAttempts({ taskId, page: { limit: 1000 } }, ctx);
      expect(first.attempts).toHaveLength(100); expect(Number(first.page.totalCount)).toBe(125);
      const next = await tasks.listTaskAttempts({ taskId, page: { limit: 100, cursor: first.page.nextCursor } }, ctx);
      expect(next.attempts).toHaveLength(25); expect(next.page.nextCursor || '').toBe('');
      const ids = [...first.attempts, ...next.attempts].map((row: any) => row.id);
      expect(new Set(ids).size).toBe(125); expect(ids).toEqual([...ids].sort().reverse());
    });
    it('preserves protobuf page defaults and does not invent history for an unclaimed task', async () => {
      const request = fromBinary(ListTaskAttemptsRequestSchema, toBinary(ListTaskAttemptsRequestSchema,
        create(ListTaskAttemptsRequestSchema, { taskId, page: {} })));
      expect((await tasks.listTaskAttempts(request, ctx)).attempts).toHaveLength(50);
      const emptyTask = `empty-${crypto.randomUUID()}`;
      await db.insert(S.tasks).values({ id: emptyTask, projectId, title: 'Never recorded', status: 'todo', createdAt: at });
      const empty = await tasks.listTaskAttempts({ taskId: emptyTask }, ctx);
      expect(empty.attempts).toEqual([]); expect(Number(empty.page.totalCount)).toBe(0); expect(empty.page.nextCursor || '').toBe('');
    });
    it('reads recorded owner snapshots and system closure without invented actor IDs', async () => {
      await db.update(S.taskClaimAttempts).set({ releaseReason: 'owner_purged', releasedAt: at,
        releasedByKind: 'system', releasedById: null, externalRunId: '<opaque/job>' }).where(eq(S.taskClaimAttempts.id, ownReceipt));
      await db.update(S.agents).set({ name: 'Renamed owner' }).where(eq(S.agents.id, agentId));
      const response = await tasks.listTaskAttempts({ taskId, page: { limit: 100 } }, ctx);
      const next = await tasks.listTaskAttempts({ taskId, page: { cursor: response.page.nextCursor } }, ctx);
      const receipt = next.attempts.find((row: any) => row.id === ownReceipt);
      expect(receipt).toMatchObject({ owner: { id: agentId, name: 'Recorded owner' }, externalRunId: '<opaque/job>',
        claimedAt: at.toISOString(), releasedAt: at.toISOString(), releaseReason: 'owner_purged', releasedBy: { kind: 'system' } });
      expect(receipt.releasedBy.id).toBeUndefined();
      expect(response.attempts[0].releasedAt).toBeUndefined();
    });
    it('refuses changed-task cursors and unsupported history filter/sort', async () => {
      const first = await tasks.listTaskAttempts({ taskId, page: { limit: 1 } }, ctx);
      await expect(tasks.listTaskAttempts({ taskId: otherTaskId, page: { cursor: first.page.nextCursor } }, ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
      for (const page of [{ filter: 'running' }, { sort: 'owner' }, { cursor: 'not-a-cursor' }]) {
        await expect(tasks.listTaskAttempts({ taskId, page }, ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
      }
    });
    it('requires current task read scope and organization membership', async () => {
      const denied = makeAuthContext(null);
      denied.values.set(currentPrincipalKey, { kind: 'agent', agentId, orgId, tokenId: 'fixture-denied', scopes: [] });
      await expect(tasks.listTaskAttempts({ taskId }, denied)).rejects.toMatchObject({ code: Code.PermissionDenied });
      await expect(tasks.listTaskAttempts({ taskId }, makeAuthContext('outside-user'))).rejects.toMatchObject({ code: Code.PermissionDenied });
    });
    for (const kind of ['notes', 'usage', 'artifacts'] as const) {
      it(`${kind}: filters before paging/counts for a reader who does not own the receipt`, async () => {
        const first = await source(kind, { attemptId: ownReceipt, page: { limit: 100 } });
        expect(rows(kind, first)).toHaveLength(100); expect(Number(first.page.totalCount)).toBe(125);
        expect(rows(kind, first).every(row => row.attemptId === ownReceipt)).toBe(true);
        const next = await source(kind, { attemptId: ownReceipt, page: { limit: 100, cursor: first.page.nextCursor } });
        expect(rows(kind, next)).toHaveLength(25);
        expect(new Set([...rows(kind, first), ...rows(kind, next)].map(row => row.id)).size).toBe(125);
        if (kind === 'usage') expect(first.totals.reports).toBe(375n);
      });
      it(`${kind}: retains reachable ungrouped legacy reports`, async () => {
        const response = await source(kind, { uncorrelatedOnly: true, page: { limit: 50 } });
        expect(Number(response.page.totalCount)).toBe(125);
        expect(rows(kind, response)).toHaveLength(50);
        expect(rows(kind, response).every(row => row.attemptId == null)).toBe(true);
      });
      it(`${kind}: refuses invalid receipt scopes and mixed filters`, async () => {
        for (const request of [{ attemptId: foreignTaskReceipt }, { attemptId: 'ta-missing' }]) {
          await expect(source(kind, { ...request, page: { limit: 1 } })).rejects.toMatchObject({ code: Code.NotFound });
        }
        await expect(source(kind, { attemptId: ownReceipt, uncorrelatedOnly: true, page: { limit: 1 } })).rejects.toMatchObject({ code: Code.InvalidArgument });
      });
      it(`${kind}: does not reuse a cursor across association filters`, async () => {
        const first = await source(kind, { attemptId: ownReceipt, page: { limit: 1 } });
        for (const filter of [{ uncorrelatedOnly: true }, {}]) {
          await expect(source(kind, { ...filter, page: { limit: 1, cursor: first.page.nextCursor } })).rejects.toMatchObject({ code: Code.InvalidArgument });
        }
      });
    }
    it('keeps independent artifact read permission and refuses reverse correlation', async () => {
      const taskOnly = makeAuthContext(null);
      taskOnly.values.set(currentPrincipalKey, { kind: 'agent', agentId, orgId, tokenId: 'fixture-reader', scopes: ['tasks:read'] });
      expect((await tasks.listTaskAttempts({ taskId }, taskOnly)).attempts).toHaveLength(50);
      await expect(source('artifacts', { attemptId: ownReceipt, page: { limit: 1 } }, taskOnly)).rejects.toMatchObject({ code: Code.PermissionDenied });
      await expect(artifacts.listTaskArtifactLinks({ artifactId, attemptId: ownReceipt, page: { limit: 1 } }, ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
    });
    it('bounds the latest task-wide handoffs independently of receipt filters', async () => {
      const response = await source('notes', { noteType: 'handoff', page: { limit: 3 } });
      expect(Number(response.page.totalCount)).toBe(5); expect(response.taskNotes).toHaveLength(3);
      expect(response.taskNotes.every((row: any) => row.noteType === 'handoff')).toBe(true);
      await expect(source('notes', { noteType: 'running' })).rejects.toMatchObject({ code: Code.InvalidArgument });
    });
  });
}
