import { describe, expect, it } from 'bun:test';
import { Code } from '@connectrpc/connect';
import { eq } from 'drizzle-orm';
import * as S from '../../db/schema.sqlite';
import { setupIntegrationTest, seedOrgWithAdmin, seedProject, makeAuthContext } from '../../test/setup';
import { traceRows } from '../../test/traceRows';
import { currentPrincipalKey } from '../auth/session';
import { createTaskManagementHandler } from './tasks.handler';
import { createToolHost } from '../mcp/tools';
import { handleMcpMessage, JSONRPC } from '../mcp/protocol';

async function fixture(count = 0) {
  const { db } = await setupIntegrationTest();
  const suffix = crypto.randomUUID(), orgId = `org-${suffix}`, userId = `user-${suffix}`, projectId = `project-${suffix}`, templateId = `template-${suffix}`;
  await seedOrgWithAdmin(db, { orgId, userId, name: 'Digest' });
  await seedProject(db, { orgId, userId, projectId, templateId, name: 'Task owner' });
  const taskId = `task-${suffix}`, folderId = `folder-${suffix}`, content = 'literal body not metadata 😀';
  await db.insert(S.tasks).values({ id: taskId, projectId, title: 'Review evidence', status: 'todo', createdAt: new Date() });
  await db.insert(S.folders).values({ id: folderId, projectId, name: 'Outputs', createdAt: new Date() });
  for (let i = 0; i < count; i++) {
    const artifactId = `artifact-${suffix}-${i}`;
    await db.insert(S.artifacts).values({ id: artifactId, folderId, name: `${i}.txt`, content, contentType: 'text/plain', createdAt: new Date() });
    await db.insert(S.taskArtifactLinks).values({ id: `link-${suffix}-${String(i).padStart(3, '0')}`, taskId, artifactId });
  }
  function agent(scopes = ['tasks:read']) {
    const ctx = makeAuthContext(null);
    ctx.values.set(currentPrincipalKey, { kind: 'agent', agentId: `reader-${suffix}`, orgId, tokenId: 'fixture-token', scopes });
    return ctx;
  }
  return { db, orgId, userId, projectId, templateId, taskId, folderId, content, agent, ctx: makeAuthContext(userId) };
}

function forbidArtifactReads(db: any) {
  return new Proxy(db, { get(target, key) {
    if (key === 'select') return (fields?: Record<string, unknown>) => {
      const query = target.select(fields);
      return { from: (table: unknown) => {
        if ([S.artifacts, S.folders, S.taskArtifactLinks].includes(table as any)) throw new Error('ordinary/denied digest queried artifacts');
        return query.from(table);
      } };
    };
    return Reflect.get(target, key);
  } });
}

describe('optional artifact digest authority (M54)', () => {
  it.each([undefined, false])('retains tasks-only authority and no artifact query for opt-in%s', async includeArtifacts => {
    const f = await fixture(2), handler = createTaskManagementHandler(forbidArtifactReads(f.db));
    const { digest }: any = await handler.getTaskDigest({ taskId: f.taskId, ...(includeArtifacts === undefined ? {} : { includeArtifacts }) }, f.agent());
    expect(digest.task.id).toBe(f.taskId);
    expect(digest).not.toHaveProperty('artifacts');
  });

  it('refuses requested artifact metadata without scope before reading the source links', async () => {
    const f = await fixture(1), handler = createTaskManagementHandler(forbidArtifactReads(f.db));
    await expect(handler.getTaskDigest({ taskId: f.taskId, includeArtifacts: true }, f.agent()))
      .rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  it('does not grant access to a foreign task through artifact opt-in', async () => {
    const f = await fixture(1), context = f.agent(['tasks:read', 'artifacts:read']);
    context.values.set(currentPrincipalKey, { kind: 'agent', agentId: 'foreign', tokenId: 'fixture', orgId: 'foreign-org', scopes: ['tasks:read', 'artifacts:read'] });
    await expect(createTaskManagementHandler(f.db).getTaskDigest({ taskId: f.taskId, includeArtifacts: true }, context))
      .rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  it.each([0, 20, 25])('returns bounded metadata for%i links, with truthful truncation and no bodies', async count => {
    const f = await fixture(count);
    let sourceRows = 0, metadataRows = 0;
    const observed = new Proxy(f.db, { get(db, key) {
      if (key === 'select') return (fields?: Record<string, unknown>) => {
        const query = db.select(fields);
        return { from: (table: unknown) => traceRows(query.from(table), rows => {
          if (table === S.taskArtifactLinks) { sourceRows += rows.length; expect(rows.length).toBeLessThanOrEqual(21); }
          if (table === S.artifacts) {
            metadataRows += rows.length; expect(rows.length).toBeLessThanOrEqual(20);
            expect(rows.some(row => Object.values(row).includes(f.content))).toBe(false);
          }
        }) };
      };
      return Reflect.get(db, key);
    } });
    const { digest }: any = await createTaskManagementHandler(observed).getTaskDigest({ taskId: f.taskId, includeArtifacts: true, orgId: 'caller-supplied' }, f.agent(['tasks:read', 'artifacts:read']));
    expect(digest.artifacts).toHaveLength(Math.min(count, 20));
    expect(digest.truncated).toBe(count > 20);
    expect(sourceRows).toBe(Math.min(count, 21));
    expect(metadataRows).toBe(Math.min(count, 20));
    for (const item of digest.artifacts) {
      expect(item.availability).toBe('available');
      expect(item.contentType).toBe('text/plain');
      expect(item.storedBytes).toBe(BigInt(Buffer.byteLength(f.content)));
      expect(item.link.taskId).toBe(f.taskId);
      expect(item.link.linkedBy).toBeUndefined();
      expect(item).not.toHaveProperty('content');
    }
  });

  it('retains answered-question truncation when evidence is empty', async () => {
    const f = await fixture();
    await f.db.insert(S.inputRequests).values(Array.from({ length: 21 }, (_, index) => ({
      id: `question-${f.taskId}-${index}`, taskId: f.taskId, orgId: f.orgId, projectId: f.projectId,
      question: `Question ${index}`, status: 'answered', answer: 'Answer', askedByUserId: f.userId,
      answeredByUserId: f.userId, createdAt: new Date(), answeredAt: new Date(),
    })));
    const { digest }: any = await createTaskManagementHandler(f.db).getTaskDigest({ taskId: f.taskId, includeArtifacts: true }, f.agent(['tasks:read', 'artifacts:read']));
    expect(digest.answeredQuestions).toHaveLength(20);
    expect(digest.relations.children).toHaveLength(0);
    expect(digest.artifacts).toEqual([]);
    expect(digest.truncated).toBe(true);
  });

  it('uses current cross-project availability and sanitizes nested unavailable names', async () => {
    const f = await fixture(1), sourceProject = `${f.projectId}-source`;
    await f.db.insert(S.projects).values({ id: sourceProject, orgId: f.orgId, templateId: f.templateId, ownerId: f.userId, name: 'Source', key: 'SRC', createdAt: new Date() });
    await f.db.update(S.folders).set({ projectId: sourceProject, deletedAt: new Date() }).where(eq(S.folders.id, f.folderId));
    const handler = createTaskManagementHandler(f.db), context = f.agent(['tasks:read', 'artifacts:read']);
    const archived: any = await handler.getTaskDigest({ taskId: f.taskId, includeArtifacts: true }, context);
    expect(archived.digest.artifacts[0].availability).toBe('archived');
    await f.db.update(S.projects).set({ deletedAt: new Date() }).where(eq(S.projects.id, sourceProject));
    const unavailable: any = await handler.getTaskDigest({ taskId: f.taskId, includeArtifacts: true }, context);
    expect(unavailable.digest.artifacts[0]).toMatchObject({ availability: 'unavailable', link: { artifactName: 'Artifact unavailable' } });
    expect(unavailable.digest.artifacts[0].storedBytes).toBeUndefined();
    expect(unavailable.digest.artifacts[0].contentType).toBeUndefined();
  });
});

describe('MCP digest opt-in', () => {
  it.each([undefined, false, true])('maps include_artifacts%s to exactly one existing RPC', async includeArtifacts => {
    const sent: unknown[] = [];
    const host = createToolHost(async (_service, method, body) => { sent.push({ method, body }); return {}; });
    const result: any = await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_task_digest', arguments: {
      task_id: 'task-a', ...(includeArtifacts === undefined ? {} : { include_artifacts: includeArtifacts }),
    } } }, host);
    expect(result.error).toBeUndefined();
    expect(sent).toEqual([{ method: 'GetTaskDigest', body: { taskId: 'task-a', ...(includeArtifacts === undefined ? {} : { includeArtifacts }) } }]);
  });

  it.each([null, 'yes', 1])('rejects a malformed digest opt-in before any RPC %#', async include_artifacts => {
    let calls = 0;
    const host = createToolHost(async () => { calls++; return {}; });
    expect(host.tools.find(tool => tool.name === 'get_task_digest')!.inputSchema.properties).toHaveProperty('include_artifacts');
    const result: any = await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_task_digest', arguments: { task_id: 'a', include_artifacts } } }, host);
    expect(result.error.code).toBe(JSONRPC.invalidParams);
    expect(calls).toBe(0);
  });
});
