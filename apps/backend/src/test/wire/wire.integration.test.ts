import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawn, type Subprocess } from 'bun';
import { createClient, ConnectError, Code } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import {
  HealthService,
  OrgService,
  TaskService,
  EventService,
  AgentService,
  ProjectService,
  ProjectTemplateService,
  TaskNoteService,
  SavedViewService,
} from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

/**
 * The real server, driven by the real generated client (M12-T02).
 *
 * Every other backend test calls a handler function directly, which means the
 * interceptor chain, the CORS policy, session revocation, the body-size cap and
 * the protobuf codec are all things this repository *has* and never exercises
 * together. This boots `src/index.ts` as its own process and talks to it over a
 * socket, so what is under test is the server rather than a function it
 * happens to contain.
 *
 * Skipped without `TASKER_REAL_INTEGRATION=1`, the same gate the other
 * integration suites use: it binds a port and spawns a process, which the unit
 * suite must not.
 */

const runIntegration = process.env.TASKER_REAL_INTEGRATION === '1';
const testIf = runIntegration ? describe : describe.skip;

const PORT = Number(process.env.WIRE_TEST_PORT ?? 8123);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** A transport per test, so one test's credential cannot leak into another's. */
function transportWith(headers: Record<string, string> = {}) {
  return createConnectTransport({
    baseUrl: BASE_URL,
    httpVersion: '1.1',
    interceptors: [
      (next) => async (req) => {
        for (const [key, value] of Object.entries(headers)) req.header.set(key, value);
        return next(req);
      },
    ],
  });
}

testIf('the real server over a real socket', () => {
  let server: Subprocess | null = null;
  let dataDir = '';

  beforeAll(async () => {
    // Its own directory and its own database, so this suite neither reads nor
    // destroys the developer's `.data/local.sqlite`.
    dataDir = mkdtempSync(join(tmpdir(), 'tasker-wire-'));
    server = spawn({
      cmd: ['bun', 'run', join(import.meta.dir, '../../index.ts'), '--port', String(PORT), '--db', join(dataDir, 'wire.sqlite')],
      env: {
        ...process.env,
        STANDALONE: 'true',
        ENABLE_TEST_LOGIN: 'true',
        LOG_LEVEL: 'silent',
        NODE_ENV: 'development',
        SHUTDOWN_PRE_DRAIN_MS: '0',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    for (let attempt = 0; attempt < 120; attempt++) {
      try {
        const res = await fetch(`${BASE_URL}/readyz`);
        if (res.ok) return;
      } catch {
        // Not listening yet.
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('the server never became ready');
  }, 60_000);

  afterAll(async () => {
    server?.kill();
    // Wait for the owned listener to close before deleting its database or
    // starting the next real-socket run on this port.
    if (server) await server.exited;
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  }, 60_000);

  it('answers an RPC through the generated client and the real codec', async () => {
    // The whole point: this request was serialized by the same code the GUI and
    // the CLI use, sent over a socket, and decoded by the server's own router.
    const health = createClient(HealthService, transportWith());
    const pong = await health.ping({});

    expect(pong.message).toContain('pong');
    expect(pong.dbStatus).toContain('sqlite');
  });

  it('refuses an unauthenticated call with a real Connect error code', async () => {
    // Authorization runs in an interceptor, and a handler test that injects a
    // context value never proves the interceptor is wired at all.
    const orgs = createClient(OrgService, transportWith());
    try {
      await orgs.listOrgs({});
      throw new Error('expected a refusal');
    } catch (err) {
      expect(ConnectError.from(err).code).toBe(Code.Unauthenticated);
    }
  });

  it('carries the request id back on the response, as the interceptor promises', async () => {
    // `x-request-id` is what an operator quotes out of an error report. It is
    // set by an interceptor, so nothing below the socket can confirm it.
    const res = await fetch(`${BASE_URL}/tasker.health.v1.HealthService/Ping`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': 'wire-test-request' },
      body: '{}',
    });

    expect(res.headers.get('x-request-id')).toBe('wire-test-request');
  });

  it('permits a credential preflight from an allowed GUI origin without opening other origins', async () => {
    const path = `${BASE_URL}/tasker.health.v1.AuthService/GetIdentity`;
    const headers = { origin: 'http://localhost:5173', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type,connect-protocol-version' };
    const allowed = await fetch(path, { method: 'OPTIONS', headers });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(headers.origin);
    expect(allowed.headers.get('access-control-allow-headers')?.toLowerCase().split(',').map(value => value.trim())).toContain('authorization');
    const foreign = await fetch(path, { method: 'OPTIONS', headers: { ...headers, origin: 'https://foreign.example' } });
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('reflects an allowed origin and no other', async () => {
    // Reflecting an arbitrary Origin with credentials would let any site read
    // authenticated responses using a visitor's cookie. The allowlist lives in
    // config and is applied above the Connect adapter, so this is the only
    // level it can be checked at.
    const allowed = await fetch(`${BASE_URL}/tasker.health.v1.HealthService/Ping`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: '{}',
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

    const forged = await fetch(`${BASE_URL}/tasker.health.v1.HealthService/Ping`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: '{}',
    });
    expect(forged.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects a body larger than the cap rather than buffering it', async () => {
    // An unbounded-memory footgun that only exists above the handler.
    const res = await fetch(`${BASE_URL}/api/client-errors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'x'.repeat(300 * 1024) }),
    });

    expect(res.status).toBe(413);
  });

  it('serves the health and readiness probes without a credential', async () => {
    // A probe runs before the process is ready and holds no session.
    for (const path of ['/healthz', '/readyz']) {
      const res = await fetch(`${BASE_URL}${path}`);
      expect(`${path}: ${res.status}`).toBe(`${path}: 200`);
    }
  });

  it('exposes metrics that a scraper can parse, naming RPCs it has served', async () => {
    // The counters are recorded in an interceptor, so this also proves the
    // interceptor ran for the calls above.
    const res = await fetch(`${BASE_URL}/metrics`);
    const body = await res.text();

    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(body).toContain('# TYPE tasker_rpc_requests_total counter');
    expect(body).toContain('HealthService/Ping');
  });

  it('rejects an unknown RPC rather than answering something plausible', async () => {
    const res = await fetch(`${BASE_URL}/tasker.health.v1.HealthService/NoSuchMethod`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('refuses an agent token that does not exist, through the real auth path', async () => {
    // Credential resolution happens in an interceptor against the database.
    // A handler test hands it a resolved principal and skips the whole lookup.
    const tasks = createClient(TaskService, transportWith({ authorization: 'Bearer tskr_not_a_real_token' }));
    try {
      await tasks.listTasks({ projectId: 'proj-1' });
      throw new Error('expected a refusal');
    } catch (err) {
      const code = ConnectError.from(err).code;
      expect([Code.Unauthenticated, Code.PermissionDenied]).toContain(code);
    }
  });

  const lifecycleTest = process.env.TASKER_STREAM_LIFECYCLE_INTEGRATION === '1' ? it : it.skip;
  lifecycleTest('closes an already-open feed after logout through the real auth and streaming adapters', async () => {
    // Needs the real NATS broker as well as this suite's server. Keep it
    // explicit so running ordinary wire tests without a broker stays valid.
    const registered = await fetch(`${BASE_URL}/api/auth/password/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'wire-stream-user', password: 'Wire-test-strong-password-123!' }),
    });
    expect(registered.ok).toBe(true);
    const cookie = registered.headers.get('set-cookie')!.split(';')[0]!;
    const events = createClient(EventService, transportWith({ cookie }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    const iterator = events.subscribeEvents({}, { signal: controller.signal })[Symbol.asyncIterator]();
    try {
      expect((await iterator.next()).value.subject).toBe('stream.ready');
      const loggedOutAt = Date.now();
      const response = await fetch(`${BASE_URL}/api/auth/logout`, { method: 'POST', headers: { cookie } });
      expect(response.status).toBe(204);
      const untilClosed = async () => {
        while (!(await iterator.next()).done) { /* heartbeats may precede revalidation */ }
      };
      await expect(untilClosed()).rejects.toMatchObject({ code: Code.Unauthenticated });
      expect(Date.now() - loggedOutAt).toBeLessThan(33_000);
    } finally {
      clearTimeout(timeout);
      controller.abort();
      await iterator.return?.();
    }
  }, 45_000);

  it('retains claim receipts, fences stale generations and binds delayed reports through real auth and codecs', async () => {
    const registered = await fetch(`${BASE_URL}/api/auth/password/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: `wire-claims-${crypto.randomUUID()}`, password: crypto.randomUUID() + 'Wire!9' }),
    });
    expect(registered.ok).toBe(true);
    const cookie = registered.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('Owned wire session was not issued');
    const { userId } = await registered.json() as { userId: string };
    const human = transportWith({ cookie }), orgs = createClient(OrgService, human);
    const agents = createClient(AgentService, human), tasks = createClient(TaskService, human);
    const org = (await orgs.seedOrg({ name: 'Wire receipt scope', slug: `wire-claims-${crypto.randomUUID()}` })).organization!;
    const template = (await createClient(ProjectTemplateService, human).createTemplate({ orgId: org.id, name: 'Wire receipt template' })).template!;
    const project = (await createClient(ProjectService, human).createProject({ orgId: org.id, templateId: template.id, ownerId: userId, name: 'Wire receipts' })).project!;
    const task = (await tasks.createTask({ projectId: project.id, title: 'Wire claim and delayed reports', status: 'todo' })).task!;
    const other = (await tasks.createTask({ projectId: project.id, title: 'Different task', status: 'todo' })).task!;
    const role = (await agents.createAgentRole({ orgId: org.id, name: 'Wire worker', systemPrompt: 'Report authorized work.', capabilities: '[]' })).role!;
    const owned: { agentId: string; name: string; tokenId: string }[] = [];
    const issue = async (name: string) => {
      const agent = (await agents.createAgent({ orgId: org.id, agentRoleId: role.id, name })).agent!;
      const metadata = { agentId: agent.id, name: `wire-owned-${crypto.randomUUID()}`, tokenId: '' }; owned.push(metadata);
      const issued = await agents.createAgentToken({ agentId: agent.id, name: metadata.name, scopes: ['tasks:read', 'tasks:write', 'comments:write'] });
      metadata.tokenId = issued.token?.id ?? '';
      if (!metadata.tokenId || !issued.plaintext) throw new Error('Owned wire credential was not issued');
      return { agent, transport: transportWith({ authorization: `Bearer ${issued.plaintext}` }) };
    };
    try {
      const a = await issue('Prior wire worker'), b = await issue('Current wire worker');
      const workerA = createClient(TaskService, a.transport), workerB = createClient(TaskService, b.transport);
      const notesA = createClient(TaskNoteService, a.transport);
      const request = { taskId: task.id, externalRunId: 'wire/pipeline/prior', idempotencyKey: `wire-key-${crypto.randomUUID()}` };
      const first = await workerA.claimTask(request);
      if (!first.attempt?.id) throw new Error('Winning wire claim did not return a receipt');
      expect(first.attempt.id).toMatch(/^ta-/);
      expect((await tasks.getTask({ taskId: task.id })).task?.assignees[0]?.agentId).toBe(a.agent.id);
      expect(first.attempt.owner?.id).toBe(a.agent.id);
      expect(first.attempt.externalRunId).toBe(request.externalRunId);
      expect((await workerA.claimTask(request)).attempt?.id).toBe(first.attempt.id);
      await expect(workerA.claimTask({ ...request, externalRunId: 'changed' })).rejects.toMatchObject({ code: Code.InvalidArgument });
      await workerA.releaseTask({ taskId: task.id, expectedAttemptId: first.attempt.id, handoffNote: 'Original ownership ended' });
      const second = await workerA.claimTask({ taskId: task.id });
      if (!second.attempt?.id) throw new Error('Reclaim did not return its own receipt');
      expect(second.attempt.id).not.toBe(first.attempt.id);
      await expect(workerA.releaseTask({ taskId: task.id, expectedAttemptId: first.attempt.id, handoffNote: 'Must not be created' }))
        .rejects.toMatchObject({ code: Code.FailedPrecondition });
      expect((await tasks.getTask({ taskId: task.id })).task?.assignees[0]?.agentId).toBe(a.agent.id);
      const heldReceipt = (await tasks.listTaskAttempts({ taskId: task.id })).attempts.find(receipt => receipt.id === second.attempt?.id);
      expect(heldReceipt?.id).toBe(second.attempt.id);
      expect(heldReceipt?.releasedAt).toBeUndefined();
      expect((await notesA.listTaskNotes({ taskId: task.id })).taskNotes.some(note => note.content === 'Must not be created')).toBe(false);
      // Legacy omission still releases the current generation on a new server.
      await workerA.releaseTask({ taskId: task.id });
      const current = await workerB.claimTask({ taskId: task.id, externalRunId: 'wire/pipeline/current' });
      const delayed = await workerA.reportUsage({ taskId: task.id, attemptId: first.attempt.id, inputTokens: 11n, idempotencyKey: 'wire-delayed-report' });
      expect(delayed.record?.attemptId).toBe(first.attempt.id);
      expect((await workerA.reportUsage({ taskId: task.id, attemptId: first.attempt.id, inputTokens: 11n, idempotencyKey: 'wire-delayed-report' })).record?.id).toBe(delayed.record?.id);
      await expect(workerB.reportUsage({ taskId: task.id, attemptId: first.attempt.id, inputTokens: 1n })).rejects.toMatchObject({ code: Code.NotFound });
      await expect(workerA.reportUsage({ taskId: other.id, attemptId: first.attempt.id, inputTokens: 1n })).rejects.toMatchObject({ code: Code.NotFound });
      const legacy = await workerA.reportUsage({ taskId: task.id, inputTokens: 2n });
      expect(legacy.record?.attemptId).toBeUndefined();
      const lateNote = await notesA.createTaskNote({ taskId: task.id, content: 'Late explicit report', attemptId: first.attempt.id });
      expect(lateNote.taskNote?.attemptId).toBe(first.attempt.id);
      await expect(createClient(TaskNoteService, b.transport).updateTaskNote({ taskNoteId: lateNote.taskNote!.id, content: 'Foreign edit' })).rejects.toMatchObject({ code: Code.PermissionDenied });
      await expect(createClient(TaskNoteService, human).deleteTaskNote({ taskNoteId: lateNote.taskNote!.id })).rejects.toMatchObject({ code: Code.PermissionDenied });
      expect((await tasks.listUsageRecords({ taskId: task.id, attemptId: first.attempt.id, page: { limit: 1 } })).records.map(record => record.id)).toEqual([delayed.record!.id]);
      expect((await tasks.listUsageRecords({ taskId: task.id, uncorrelatedOnly: true })).records.map(record => record.id)).toEqual([legacy.record!.id]);
      const foreignOrg = (await orgs.seedOrg({ name: 'Foreign wire scope', slug: `wire-foreign-${crypto.randomUUID()}` })).organization!;
      const foreignTemplate = (await createClient(ProjectTemplateService, human).createTemplate({ orgId: foreignOrg.id, name: 'Foreign' })).template!;
      const foreignProject = (await createClient(ProjectService, human).createProject({ orgId: foreignOrg.id, templateId: foreignTemplate.id, ownerId: userId, name: 'Foreign' })).project!;
      const foreignTask = (await tasks.createTask({ projectId: foreignProject.id, title: 'Foreign task' })).task!;
      await expect(workerA.listTaskAttempts({ taskId: foreignTask.id })).rejects.toMatchObject({ code: Code.PermissionDenied });
      await tasks.unassignTask({ taskId: task.id, agentId: b.agent.id });
      const history = await tasks.listTaskAttempts({ taskId: task.id, page: { limit: 100 } });
      expect(history.attempts).toHaveLength(3);
      expect(history.attempts.find(receipt => receipt.id === current.attempt?.id)?.releaseReason).toBe('unassigned');
      expect(history.attempts.find(receipt => receipt.id === first.attempt?.id)?.releasedAt).toBeTruthy();
      expect((await workerA.claimTask(request)).attempt?.id).toBe(first.attempt.id);
      expect((await tasks.getTask({ taskId: task.id })).task?.assignees).toHaveLength(0);
    } finally {
      for (const entry of owned) {
        const ids = entry.tokenId ? [entry.tokenId] : (await agents.listAgentTokens({ agentId: entry.agentId })).tokens
          .filter(token => token.name === entry.name && !token.revokedAt).map(token => token.id);
        for (const tokenId of ids) await agents.revokeAgentToken({ tokenId });
      }
    }
  }, 60_000);

  it('keeps named query ownership, sharing, presence and current permissions through actual auth and wire codecs', async () => {
    const register = async (label: string, username = `wire-view-${label}-${crypto.randomUUID()}`) => {
      const response = await fetch(`${BASE_URL}/api/auth/password/register`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: crypto.randomUUID() + 'Wire!9' }),
      });
      expect(response.status).toBe(201);
      const cookie = response.headers.get('set-cookie')?.split(';')[0];
      if (!cookie) throw new Error('Owned view session was not issued');
      const { userId } = await response.json() as { userId: string };
      return { username, userId, transport: transportWith({ cookie }) };
    };
    const a = await register('a'), foreign = await register('foreign');
    const memberUsername = `wire-view-b-${crypto.randomUUID()}`;
    const orgs = createClient(OrgService, a.transport), viewsA = createClient(SavedViewService, a.transport);
    const viewsForeign = createClient(SavedViewService, foreign.transport);
    const org = (await orgs.seedOrg({ name: 'Wire saved views', slug: `wire-views-${crypto.randomUUID()}` })).organization!;
    const template = (await createClient(ProjectTemplateService, a.transport).createTemplate({ orgId: org.id, name: 'Views' })).template!;
    const project = (await createClient(ProjectService, a.transport).createProject({ orgId: org.id, templateId: template.id, ownerId: a.userId, name: 'Wire view project' })).project!;
    // Username invitations are consumed when that identity registers.
    await orgs.inviteUser({ orgId: org.id, username: memberUsername, role: 'member' });
    const b = await register('b', memberUsername);
    const viewsB = createClient(SavedViewService, b.transport);
    const privateA = (await viewsA.createSavedView({ projectId: project.id, name: 'Owner private', definition: { version: 1, screen: 'tasks', tasks: {} } })).view!;
    const privateB = (await viewsB.createSavedView({ projectId: project.id, name: 'Member private', definition: { version: 1, screen: 'tasks', tasks: { priority: 0, ready: false, search: 'private wire query' } } })).view!;
    expect(privateB.ownerUserId).toBe(b.userId);expect(privateB.orgId).toBe(org.id);
    expect((await viewsA.getSavedView({ viewId: privateA.id })).definition?.tasks?.priority).toBeUndefined();
    expect((await viewsB.getSavedView({ viewId: privateB.id })).definition?.tasks).toMatchObject({ priority: 0, ready: false, search: 'private wire query' });
    await expect(viewsA.getSavedView({ viewId: privateB.id })).rejects.toMatchObject({ code: Code.NotFound });
    await expect(viewsB.getSavedView({ viewId: privateA.id })).rejects.toMatchObject({ code: Code.NotFound });
    const catalog = await viewsB.listSavedViews({ orgId: org.id, screen: 'tasks', visibility: 'personal' });
    expect(catalog.views.map(view => view.id)).toEqual([privateB.id]);
    expect(catalog.canCreateShared).toBe(false);
    expect((await viewsA.listSavedViews({ orgId: org.id, screen: 'tasks' })).canCreateShared).toBe(true);
    expect(JSON.stringify(catalog)).not.toContain('private wire query');
    const shared = (await viewsA.createSavedView({ projectId: project.id, name: 'Shared reports', visibility: 'organization', definition: { version: 1, screen: 'reports', reports: { windowDays: 90 } } })).view!;
    expect((await viewsB.getSavedView({ viewId: shared.id })).definition?.reports?.windowDays).toBe(90);
    await expect(viewsB.renameSavedView({ viewId: shared.id, name: 'Denied' })).rejects.toMatchObject({ code: Code.PermissionDenied });
    await expect(viewsB.deleteSavedView({ viewId: shared.id })).rejects.toMatchObject({ code: Code.PermissionDenied });
    await expect(viewsForeign.getSavedView({ viewId: shared.id })).rejects.toMatchObject({ code: Code.NotFound });
    await expect(viewsForeign.createSavedView({ projectId: project.id, name: 'Foreign', definition: { version: 1, screen: 'tasks', tasks: {} } })).rejects.toMatchObject({ code: Code.NotFound });
    await orgs.updateOrgMemberRole({ orgId: org.id, userId: b.userId, role: 'admin' });
    await expect(viewsB.getSavedView({ viewId: privateA.id })).rejects.toMatchObject({ code: Code.NotFound });
    const formerAdmin = (await viewsB.createSavedView({ projectId: project.id, name: 'Created as admin', visibility: 'organization', definition: { version: 1, screen: 'tasks', tasks: {} } })).view!;
    await orgs.updateOrgMemberRole({ orgId: org.id, userId: b.userId, role: 'member' });
    expect((await viewsB.listSavedViews({ orgId: org.id, screen: 'tasks' })).canCreateShared).toBe(false);
    await expect(viewsB.renameSavedView({ viewId: formerAdmin.id, name: 'No retained admin' })).rejects.toMatchObject({ code: Code.PermissionDenied });
    await expect(viewsB.deleteSavedView({ viewId: formerAdmin.id })).rejects.toMatchObject({ code: Code.PermissionDenied });
    expect((await viewsA.renameSavedView({ viewId: formerAdmin.id, name: 'Managed by current admin' })).view?.ownerUserId).toBe(b.userId);
    await createClient(ProjectService, a.transport).archiveProject({ projectId: project.id });
    const unavailable = await viewsB.listSavedViews({ orgId: org.id, screen: 'tasks' });
    expect(unavailable.views.every(view => view.unavailableReason === 'project_unavailable')).toBe(true);
    await expect(viewsB.getSavedView({ viewId: privateB.id })).rejects.toMatchObject({ code: Code.FailedPrecondition });
    expect((await viewsB.renameSavedView({ viewId: privateB.id, name: 'Obsolete private' })).view?.name).toBe('Obsolete private');
    expect((await viewsB.deleteSavedView({ viewId: privateB.id })).success).toBe(true);
    await expect(viewsB.getSavedView({ viewId: privateB.id })).rejects.toMatchObject({ code: Code.NotFound });
  }, 30_000);

});
