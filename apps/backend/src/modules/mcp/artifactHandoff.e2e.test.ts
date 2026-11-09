import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import type { Interceptor, ServiceImpl } from '@connectrpc/connect';
import { ArtifactService, AuthService, TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { setupIntegrationTest, makeAuthContext } from '../../test/setup';
import * as sqliteSchema from '../../db/schema.sqlite';
import * as mysqlSchema from '../../db/schema.mysql';
import mysql from 'mysql2/promise';
import { setupDatabase } from '../../db/db';
import { resolvePrincipal } from '../../lib/authenticate';
import { validationErrorInterceptor } from '../../lib/validationErrors';
import { currentPrincipalKey, currentUserIdKey } from '../auth/session';
import { createAuthHandler } from '../auth/auth.handler';
import { createAgentsHandler } from '../agents/agents.handler';
import { createArtifactsHandler } from '../artifacts/artifacts.handler';
import { createTaskManagementHandler } from '../tasks/tasks.handler';
import { handleMcpHttp, MCP_PATH } from './http';

/** Actual sockets, minted scopes and current handlers; no RPC/client replacement. */
describe('artifact worker handoff over MCP HTTP (M54)', () => {
  let server: http.Server, base = '', db: any;
  let admin: ReturnType<typeof makeAuthContext>;
  let agents: ReturnType<typeof createAgentsHandler>;
  let artifacts: ReturnType<typeof createArtifactsHandler>;
  let tasks: ReturnType<typeof createTaskManagementHandler>;
  let orgId = '', projectId = '', agentId = '', folderId = '', taskId = '';
  let foreignProjectId = '', foreignTaskId = '', foreignFolderId = '', foreignArtifactId = '';
  let writer = '', reader = '', taskReader = '';
  const tokenIds: string[] = [], rpcPaths: string[] = [];
  const mysqlProof = process.env.TASKER_EVIDENCE_MCP_MYSQL === '1';
  const S = mysqlProof ? mysqlSchema : sqliteSchema;
  const previousStandalone = process.env.STANDALONE, previousDatabase = process.env.DB_NAME;
  const ownedDatabase = `tasker_mcp_evidence_${crypto.randomUUID().replaceAll('-', '')}`;
  let mysqlAdmin: Awaited<ReturnType<typeof mysql.createConnection>> | undefined, schemaCreated = false;
  let dropNextResponse = false, nextId = 0;

  async function mint(scopes: string[]) {
    const issued = await agents.createAgentToken({ agentId, name: 'owned handoff test', scopes, expiresInDays: 1 }, admin);
    tokenIds.push(issued.token.id);
    return issued.plaintext;
  }
  beforeAll(async () => {
    if (mysqlProof) {
      mysqlAdmin = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD });
      await mysqlAdmin.query(`CREATE DATABASE \`${ownedDatabase}\` CHARACTER SET utf8mb4`); schemaCreated = true;
      process.env.STANDALONE = 'false'; process.env.DB_NAME = ownedDatabase; db = await setupDatabase('mysql');
    } else db = (await setupIntegrationTest()).db;
    const stamp = crypto.randomUUID(); orgId = `org-${stamp}`; projectId = `project-${stamp}`; agentId = `agent-${stamp}`;
    const userId = `user-${stamp}`;
    await seedScope(orgId, userId, projectId, `template-${stamp}`);
    admin = makeAuthContext(userId);
    await db.insert(S.agentRoles).values({ id: `role-${stamp}`, orgId, name: 'Evidence worker', systemPrompt: '', capabilities: '[]' });
    await db.insert(S.agents).values({ id: agentId, orgId, agentRoleId: `role-${stamp}`, name: 'Evidence worker' });
    agents = createAgentsHandler(db); artifacts = createArtifactsHandler(db); tasks = createTaskManagementHandler(db);
    writer = await mint(['tasks:read', 'artifacts:read', 'artifacts:write']);
    reader = await mint(['tasks:read', 'artifacts:read']); taskReader = await mint(['tasks:read']);
    folderId = (await artifacts.createFolder({ projectId, parentId: '', name: 'Outputs' }, admin)).folder.id;
    taskId = (await tasks.createTask({ projectId, title: 'Review the output', status: 'todo' }, admin)).task.id;
    const foreignOrgId = `foreign-org-${stamp}`, foreignUserId = `foreign-user-${stamp}`;
    foreignProjectId = `foreign-project-${stamp}`;
    await seedScope(foreignOrgId, foreignUserId, foreignProjectId, `foreign-template-${stamp}`);
    const foreignAdmin = makeAuthContext(foreignUserId);
    foreignTaskId = (await tasks.createTask({ projectId: foreignProjectId, title: 'Private foreign task', status: 'todo' }, foreignAdmin)).task.id;
    foreignFolderId = (await artifacts.createFolder({ projectId: foreignProjectId, parentId: '', name: 'Private folder' }, foreignAdmin)).folder.id;
    foreignArtifactId = (await artifacts.createArtifact({ folderId: foreignFolderId, name: 'private.txt', content: 'Private foreign output' }, foreignAdmin)).artifact.id;
    const session: Interceptor = next => async req => {
      const principal = await resolvePrincipal(db, { cookie: req.header.get('cookie'), authorization: req.header.get('authorization') });
      req.contextValues.set(currentPrincipalKey, principal);
      req.contextValues.set(currentUserIdKey, principal?.kind === 'user' ? principal.userId : null);
      return next(req);
    };
    const connect = connectNodeAdapter({ interceptors: [session, validationErrorInterceptor], routes: router => {
      router.service(AuthService, createAuthHandler(db));
      router.service(ArtifactService, artifacts as unknown as Partial<ServiceImpl<typeof ArtifactService>>);
      router.service(TaskService, tasks);
    } });
    server = http.createServer(async (req, res) => {
      if (req.url === MCP_PATH) {
        if (dropNextResponse) {
          dropNextResponse = false;
          // Commit the actual loopback write, then lose its MCP response on the socket.
          res.end = function () { this.destroy(); return this; };
        }
        await handleMcpHttp(req, res, { connectBaseUrl: base, allowedOrigins: [],
          authenticate: async authorization => (await resolvePrincipal(db, { cookie: null, authorization })) !== null });
      } else { rpcPaths.push(req.url || ''); connect(req, res); }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);
  async function seedScope(orgId: string, userId: string, projectId: string, templateId: string) {
    const now = new Date();
    await db.insert(S.users).values({ id: userId, email: `${userId}@example.test`, createdAt: now });
    await db.insert(S.organizations).values({ id: orgId, slug: orgId, name: 'Owned MCP scope', createdAt: now });
    await db.insert(S.organizationMembers).values({ orgId, userId, role: 'admin', joinedAt: now });
    await db.insert(S.projectTemplates).values({ id: templateId, orgId, name: 'Owned template', createdAt: now });
    await db.insert(S.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: 'Owned project', createdAt: now });
  }
  afterAll(async () => {
    try {
      for (const tokenId of tokenIds) expect((await agents.revokeAgentToken({ tokenId }, admin)).success).toBe(true);
      if (base) expect((await send('ping', {}, writer)).status).toBe(401);
    } finally {
      server?.closeAllConnections();
      if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      try {
        if (db) { if (mysqlProof) await db.$client.end(); else db.$client.close(); }
      } finally {
        try { if (mysqlAdmin) { try { if (schemaCreated) await mysqlAdmin.query(`DROP DATABASE IF EXISTS \`${ownedDatabase}\``); } finally { await mysqlAdmin.end(); } } }
        finally {
          if (previousStandalone === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = previousStandalone;
          if (previousDatabase === undefined) delete process.env.DB_NAME; else process.env.DB_NAME = previousDatabase;
        }
      }
    }
  });
  async function send(method: string, params: object, bearer = writer) {
    const response = await fetch(base + MCP_PATH, { method: 'POST', headers: { authorization: `Bearer ${bearer}`,
      'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++nextId, method, params }) });
    const body = await response.json() as any;
    if (!body || typeof body !== 'object') throw new Error('Missing JSON-RPC response after transport loss');
    return { status: response.status, body };
  }
  async function tool(name: string, args: object, service: string, method: string, bearer = writer) {
    const before = rpcPaths.length;
    const response = await send('tools/call', { name, arguments: args }, bearer);
    expect(response.status).toBe(200); expect(response.body.error).toBeUndefined();
    expect(rpcPaths.slice(before)).toEqual([`/tasker.health.v1.${service}/${method}`]);
    return response.body.result;
  }
  const artifactTool = (name: string, args: object, method: string, bearer = writer) => tool(name, args, 'ArtifactService', method, bearer);

  it('discovers, creates and links literal/encoded outputs, then reads metadata and explicit bounded content', async () => {
    const init = await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'handoff test', version: '1' } });
    expect(init.body.result.protocolVersion).toBe('2025-06-18');
    const catalogue = (await send('tools/list', {})).body.result.tools.map((item: any) => item.name);
    expect(catalogue).not.toContain('unlink_task_artifact'); expect(catalogue).not.toContain('create_folder');
    const folders = await artifactTool('list_folders', { project_id: projectId }, 'ListFolders');
    expect(folders.structuredContent.folders.map((item: any) => item.id)).toContain(folderId);
    const literal = '\uFEFF' + '漢😀\0'.repeat(2500), encoded = Buffer.from('Encoded output 😀\n'.repeat(300)).toString('base64');
    const outputs = [];
    for (const [name, content, content_type] of [['literal.txt', literal, 'text/plain'], ['encoded.bin', encoded, 'application/octet-stream']]) {
      const created = await artifactTool('create_artifact', { folder_id: folderId, name, content, content_type }, 'CreateArtifact');
      expect(created.isError).toBeUndefined(); outputs.push(created.structuredContent.artifact);
      const linked = await artifactTool('link_task_artifact', { task_id: taskId, artifact_id: created.structuredContent.artifact.id }, 'LinkTaskArtifact');
      expect(linked.structuredContent.link.linkedBy).toMatchObject({ kind: 'agent', id: agentId, name: 'Evidence worker' });
      expect(linked.structuredContent.link.linkedAt).toBeTruthy();
    }
    const listed = await artifactTool('list_artifacts', { folder_id: folderId }, 'ListArtifacts');
    expect(listed.structuredContent.artifacts.map((item: any) => item.name).sort()).toEqual(['encoded.bin', 'literal.txt']);
    const links = await artifactTool('list_task_artifact_links', { task_id: taskId }, 'ListTaskArtifactLinks');
    expect(links.structuredContent.links).toHaveLength(2); expect(links.structuredContent.evidence).toHaveLength(2);
    const digest = (await tool('get_task_digest', { task_id: taskId, include_artifacts: true }, 'TaskService', 'GetTaskDigest')).structuredContent.digest;
    expect(digest.artifacts).toHaveLength(2); expect(digest.artifacts.every((item: any) => !('content' in item))).toBe(true);
    expect(digest.task.status).toBe('todo'); // Evidence never enforces completion.
    const prefix = (await artifactTool('get_artifact_content', { artifact_id: outputs[0].id }, 'GetArtifactContent')).structuredContent;
    expect(prefix.content).toBe(Array.from(literal).slice(0, 4000).join('')); expect(prefix.truncated).toBe(true);
    expect(prefix.storedBytes).toBe(String(Buffer.byteLength(literal)));
    const full = (await artifactTool('get_artifact_content', { artifact_id: outputs[0].id, max_characters: 16000 }, 'GetArtifactContent')).structuredContent;
    expect(full.content).toBe(literal); expect(full.truncated ?? false).toBe(false);
    const packed = (await artifactTool('get_artifact_content', { artifact_id: outputs[1].id, max_characters: 13 }, 'GetArtifactContent', reader)).structuredContent;
    expect(packed.content).toBe(encoded.slice(0, 13)); expect(packed.truncated).toBe(true);
  });

  it('retains tasks-only ordinary digests and refuses positive artifact opt-in without scope', async () => {
    for (const args of [{ task_id: taskId }, { task_id: taskId, include_artifacts: false }]) {
      const result = await tool('get_task_digest', args, 'TaskService', 'GetTaskDigest', taskReader);
      expect(result.isError).toBeUndefined(); expect(result.structuredContent.digest.artifacts ?? []).toEqual([]);
    }
    const denied = await tool('get_task_digest', { task_id: taskId, include_artifacts: true }, 'TaskService', 'GetTaskDigest', taskReader);
    expect(denied.isError).toBe(true); expect(denied.content[0].text).toContain('permission_denied');
  });

  it('refuses actual foreign resources and read-only writes without changing the task links', async () => {
    const before = (await artifactTool('list_task_artifact_links', { task_id: taskId }, 'ListTaskArtifactLinks')).structuredContent.links;
    for (const [name, args, method] of [
      ['list_folders', { project_id: foreignProjectId }, 'ListFolders'],
      ['list_artifacts', { folder_id: foreignFolderId }, 'ListArtifacts'],
      ['get_artifact_content', { artifact_id: foreignArtifactId }, 'GetArtifactContent'],
      ['link_task_artifact', { task_id: foreignTaskId, artifact_id: before[0].artifactId }, 'LinkTaskArtifact'],
      ['link_task_artifact', { task_id: taskId, artifact_id: foreignArtifactId }, 'LinkTaskArtifact'],
    ] as const) {
      const result = await artifactTool(name, args, method); expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain('Private foreign');
    }
    const foreignDigest = await tool('get_task_digest', { task_id: foreignTaskId, include_artifacts: true }, 'TaskService', 'GetTaskDigest');
    expect(foreignDigest.isError).toBe(true);
    expect((await artifactTool('create_artifact', { folder_id: folderId, name: 'forbidden.txt', content: '' }, 'CreateArtifact', reader)).isError).toBe(true);
    expect((await artifactTool('link_task_artifact', { task_id: taskId, artifact_id: before[0].artifactId }, 'LinkTaskArtifact', reader)).isError).toBe(true);
    expect((await artifactTool('list_task_artifact_links', { task_id: taskId }, 'ListTaskArtifactLinks')).structuredContent.links).toEqual(before);
    const unlink = await fetch(`${base}/tasker.health.v1.ArtifactService/UnlinkTaskArtifact`, { method: 'POST', headers: { authorization: `Bearer ${writer}`, 'content-type': 'application/json' }, body: JSON.stringify({ taskId, artifactId: before[0].artifactId }) });
    expect(unlink.ok).toBe(false); // Even an artifact-write agent cannot unlink over RPC.
  });

  it.each([
    ['get_artifact_content', { artifact_id: 'a', max_characters: 0 }],
    ['get_artifact_content', { artifact_id: 'a', max_characters: null }],
    ['create_artifact', { folder_id: 'f', name: 'oversized.txt', content: 'x'.repeat(16001) }],
  ])('rejects malformed %s before any loopback RPC', async (name, args) => {
    const before = rpcPaths.length;
    const result = await send('tools/call', { name, arguments: args });
    expect(result.body.error.code).toBe(-32602); expect(rpcPaths).toHaveLength(before);
  });

  it('discovers the committed artifact after losing a create response instead of blindly creating again', async () => {
    const name = 'ambiguous-result.txt', before = rpcPaths.length;
    dropNextResponse = true;
    await expect(send('tools/call', { name: 'create_artifact', arguments: { folder_id: folderId, name, content: 'Committed before socket loss' } })).rejects.toThrow();
    expect(rpcPaths.slice(before)).toEqual(['/tasker.health.v1.ArtifactService/CreateArtifact']);
    const discovered = await artifactTool('list_artifacts', { folder_id: folderId }, 'ListArtifacts');
    const matches = discovered.structuredContent.artifacts.filter((item: any) => item.name === name);
    expect(matches).toHaveLength(1);
    const verified = await artifactTool('get_artifact_content', { artifact_id: matches[0].id, max_characters: 16000 }, 'GetArtifactContent');
    expect(verified.structuredContent.content).toBe('Committed before socket loss');
    expect(verified.structuredContent.truncated ?? false).toBe(false);
    expect(rpcPaths.slice(before).filter(path => path.endsWith('/CreateArtifact'))).toHaveLength(1);
  });
});
