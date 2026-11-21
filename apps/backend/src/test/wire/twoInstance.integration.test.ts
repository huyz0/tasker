import { expect, it } from 'bun:test';
import { spawn, type Subprocess } from 'bun';
import { createServer, type AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { and, eq, isNull } from 'drizzle-orm';
import { connect as natsConnect, type NatsConnection } from 'nats';
import { createClient, Code, ConnectError } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { AgentService, AuthService, EventService, OrgService, ProjectService, ProjectTemplateService, TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { setupDatabase } from '../../db/db';
import * as S from '../../db/schema.mysql';
import { brokerEventReference } from '../../lib/domainEventRelay';
import { STREAM_NAME, DURABLE_NAME } from '../../consumers/stream';

const realTest = process.env.TASKER_REAL_INTEGRATION === '1' && process.env.TASKER_MYSQL_INTEGRATION === '1' ? it : it.skip;
type Child = { process: Subprocess; errors: Promise<string> };

realTest('two API processes share claims, retries, acknowledged audit identity and reconnect access on real MySQL and an owned broker', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tasker-pair-'));
  const suffix = crypto.randomUUID().replaceAll('-', ''), database = 'tasker_pair_' + suffix, container = 'tasker-pair-' + suffix;
  const previousName = process.env.DB_NAME, previousStandalone = process.env.STANDALONE;
  const root = join(import.meta.dir, '../..'), children: Child[] = [], stopFeeds: Array<() => Promise<void>> = [];
  const dockerEnv = { ...process.env };
  for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnv[key];
  let admin: mysql.Connection | undefined, db: any, nc: NatsConnection | undefined, created = false, brokerCreated = false;
  async function wait(check: () => Promise<boolean>, label: string, budget = 15_000) {
    const deadline = Date.now() + budget;
    while (Date.now() < deadline) { if (await check()) return;await Bun.sleep(25); }
    throw new Error(label);
  }
  async function docker(...args: string[]) {
    const child = spawn({ cmd: ['docker', '--host=unix:///var/run/docker.sock', ...args], env: dockerEnv, stdout: 'pipe', stderr: 'pipe' });
    const deadline = setTimeout(() => child.kill('SIGKILL'), 20_000);
    try {
      const [code, output, errors] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
      if (code !== 0) throw new Error('Owned broker command failed: ' + errors);
      return output.trim();
    } finally { clearTimeout(deadline); }
  }
  async function port() {
    const server = createServer();
    await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
    const value = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    return value;
  }
  const shared = { JWT_SECRET: randomBytes(48).toString('hex'), APP_ENCRYPTION_SECRET: randomBytes(16).toString('hex') };
  function start(entry: string, args: string[], url: string) {
    const child = spawn({ cmd: [process.execPath, 'run', join(root, entry), ...args], cwd: directory,
      env: { ...process.env, ...shared, STANDALONE: 'false', NATS_URL: url, NODE_ENV: 'development', LOG_LEVEL: 'silent',
        SHUTDOWN_PRE_DRAIN_MS: '0', OTEL_EXPORTER_OTLP_ENDPOINT: '', OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '' },
      stdout: 'ignore', stderr: 'pipe' });
    const tracked = { process: child, errors: new Response(child.stderr).text() };children.push(tracked);return tracked;
  }
  function transport(baseUrl: string, headers: Record<string, string>) {
    return createConnectTransport({ baseUrl, httpVersion: '1.1', defaultTimeoutMs: 15_000, interceptors: [next => async request => {
      for (const [key, value] of Object.entries(headers)) request.header.set(key, value);
      return next(request);
    }] });
  }
  function clients(baseUrl: string, cookie: string) {
    const t = transport(baseUrl, { cookie });
    return { auth: createClient(AuthService, t), orgs: createClient(OrgService, t), tasks: createClient(TaskService, t),
      agents: createClient(AgentService, t), projects: createClient(ProjectService, t), templates: createClient(ProjectTemplateService, t),
      events: createClient(EventService, t) };
  }
  async function register(baseUrl: string, username: string) {
    const response = await fetch(baseUrl + '/api/auth/password/register', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: crypto.randomUUID() + 'Pair!9' }) });
    if (response.status !== 201) throw new Error('Owned pair identity registration failed.');
    const cookie = response.headers.get('set-cookie')?.split(';')[0];if (!cookie) throw new Error('Owned pair session was not issued.');
    return cookie;
  }
  try {
    process.env.STANDALONE = 'false';
    admin = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD });
    await admin.query('CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4');created = true;
    process.env.DB_NAME = database;db = await setupDatabase('mysql');
    await docker('run', '-d', '--name', container, '-p', '127.0.0.1::4222', '-p', '127.0.0.1::8222', 'nats:2.10-alpine', '-js', '-m', '8222');brokerCreated = true;
    const natsPort = Number((await docker('port', container, '4222/tcp')).split(':').at(-1));
    const monitorPort = Number((await docker('port', container, '8222/tcp')).split(':').at(-1));
    const url = 'nats://127.0.0.1:' + natsPort;
    await wait(async () => { try { return (await fetch('http://127.0.0.1:' + monitorPort + '/healthz', { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; } }, 'Owned broker was not ready.');
    const first = 'http://127.0.0.1:' + await port(), a = start('index.ts', ['--port', first.split(':').at(-1)!], url);
    await wait(async () => { if (a.process.exitCode !== null) throw new Error('First owned API exited during startup.');try { return (await fetch(first + '/readyz')).ok; } catch { return false; } }, 'First owned API was not ready.');
    const second = 'http://127.0.0.1:' + await port(), b = start('index.ts', ['--port', second.split(':').at(-1)!], url);
    await wait(async () => { if (b.process.exitCode !== null) throw new Error('Second owned API exited during startup.');try { return (await fetch(second + '/readyz')).ok; } catch { return false; } }, 'Second owned API was not ready.');
    expect(a.process.pid).not.toBe(b.process.pid);
    start('consumers/index.ts', [], url);nc = await natsConnect({ servers: url });
    const jsm = await nc.jetstreamManager();
    await wait(async () => { try { await jsm.consumers.info(STREAM_NAME, DURABLE_NAME);return true; } catch { return false; } }, 'Owned audit consumer was not ready.');

    const ownerCookie = await register(first, 'pair-owner-' + suffix), ownerA = clients(first, ownerCookie), ownerB = clients(second, ownerCookie);
    const userId = (await ownerA.auth.getIdentity({})).user!.id;expect((await ownerB.auth.getIdentity({})).user?.id).toBe(userId);
    const orgId = (await ownerA.orgs.seedOrg({ name: 'Two-instance proof', slug: 'pair-' + suffix })).organization!.id;
    const memberName = 'pair-member-' + suffix;await ownerA.orgs.inviteUser({ orgId, username: memberName, role: 'member' });
    const memberCookie = await register(second, memberName), member = clients(second, memberCookie), memberId = (await member.auth.getIdentity({})).user!.id;
    const templateId = (await ownerA.templates.createTemplate({ orgId, name: 'Pair template' })).template!.id;
    const projectId = (await ownerA.projects.createProject({ orgId, templateId, ownerId: userId, name: 'Pair project' })).project!.id;
    const request = { projectId, title: 'Accepted pair task', status: 'todo', idempotencyKey: 'pair-' + suffix };
    const task = (await ownerA.tasks.createTask(request)).task!, replay = (await ownerB.tasks.createTask(request)).task!;
    expect(replay.id).toBe(task.id);expect(replay.displayId).toBe(task.displayId);
    expect((await db.select().from(S.tasks).where(and(eq(S.tasks.projectId, projectId), eq(S.tasks.title, request.title))))).toHaveLength(1);
    expect((await member.tasks.getTask({ taskId: task.id })).task?.id).toBe(task.id);
    const role = (await ownerA.agents.createAgentRole({ orgId, name: 'Pair worker', systemPrompt: 'Use authorized work only.', capabilities: '[]' })).role!;
    const workers = [];
    for (const [index, endpoint] of [first, second].entries()) {
      const agent = (await ownerA.agents.createAgent({ orgId, agentRoleId: role.id, name: 'Pair worker ' + index })).agent!;
      const token = await ownerA.agents.createAgentToken({ agentId: agent.id, name: 'owned-pair-token', scopes: ['tasks:read', 'tasks:write'] });
      if (!token.plaintext) throw new Error('Owned scoped worker token was not issued.');
      workers.push(createClient(TaskService, transport(endpoint, { authorization: 'Bearer ' + token.plaintext })));
    }
    const contested = (await ownerA.tasks.createTask({ projectId, title: 'One winning pair claim', status: 'todo' })).task!;
    const claims = await Promise.allSettled(workers.map(worker => worker.claimTask({ taskId: contested.id })));
    expect(claims.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.select().from(S.taskAssignments).where(eq(S.taskAssignments.taskId, contested.id))).toHaveLength(1);

    let event: any;
    await wait(async () => {
      const rows = await db.select().from(S.domainEvents).where(and(eq(S.domainEvents.orgId, orgId), eq(S.domainEvents.subject, 'domain.task.created')));
      event = rows.find((row: { payload: string }) => JSON.parse(row.payload).id === task.id);return Boolean(event?.deliveredAt);
    }, 'Accepted task did not receive a broker acknowledgement.');
    const duplicate = await nc.jetstream().publish(event.subject, new TextEncoder().encode(JSON.stringify(brokerEventReference(event))), { msgID: 'copy-' + suffix });
    await wait(async () => (await jsm.consumers.info(STREAM_NAME, DURABLE_NAME)).ack_floor.stream_seq >= duplicate.seq, 'Audit consumer did not acknowledge the real duplicate.');
    const audit = (await db.select().from(S.auditLog).where(and(eq(S.auditLog.orgId, orgId), eq(S.auditLog.subject, 'domain.task.created'))))
      .filter((row: { payload: string }) => JSON.parse(row.payload).id === task.id);
    if (!audit.length) throw new Error('Lost audit outcome after acknowledged delivery');
    if (audit.length !== 1) throw new Error('Duplicate audit outcome: ' + audit.length + ' rows');
    expect(audit[0].eventId).toBe(event.id);
    await wait(async () => (await db.select().from(S.domainEvents).where(and(eq(S.domainEvents.orgId, orgId), isNull(S.domainEvents.deliveredAt)))).length === 0, 'Prior producer work did not drain.');

    function feed(actor: ReturnType<typeof clients>, budget: number) {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), budget);
      const iterator = actor.events.subscribeEvents({ orgId, projectId }, { signal: controller.signal, timeoutMs: 40_000 })[Symbol.asyncIterator]();
      const stop = async () => { clearTimeout(timer);controller.abort();await iterator.return?.().catch(() => undefined); };
      stopFeeds.push(stop);return { iterator, stop };
    }
    const before = feed(member, 10_000);expect((await before.iterator.next()).value?.subject).toBe('stream.ready');
    await ownerA.tasks.createTask({ projectId, title: 'Visible before revocation', status: 'todo' });
    let positive = false;
    for (let index = 0; index < 4; index++) { const frame = (await before.iterator.next()).value;if (frame?.subject === 'domain.task.created') { positive = true;break; } }
    expect(positive).toBe(true);await before.stop();
    await ownerA.orgs.removeOrgMember({ orgId, userId: memberId });
    expect((await member.auth.getIdentity({})).user?.id).toBe(memberId);
    const denied = await member.tasks.getTask({ taskId: task.id }).then(() => null, error => ConnectError.from(error).code);
    if (denied === null) throw new Error('Revoked member unexpectedly read the task.');
    expect([Code.NotFound, Code.PermissionDenied]).toContain(denied);
    const ownerFeed = feed(ownerB, 35_000), after = feed(member, 35_000);
    expect((await ownerFeed.iterator.next()).value?.subject).toBe('stream.ready');expect((await after.iterator.next()).value?.subject).toBe('stream.ready');
    await ownerA.tasks.createTask({ projectId, title: 'Owner barrier after reconnect', status: 'todo' });
    let delivered = false;
    for (let index = 0; index < 4; index++) { const frame = (await ownerFeed.iterator.next()).value;if (frame?.subject === 'domain.task.created') { delivered = true;break; } }
    expect(delivered).toBe(true);
    let heartbeat = false;
    for (let index = 0; index < 4; index++) {
      const frame = (await after.iterator.next()).value;expect(frame?.subject.startsWith('stream.')).toBe(true);
      if (frame?.subject === 'stream.heartbeat') { heartbeat = true;break; }
    }
    expect(heartbeat).toBe(true);
  } finally {
    const failures: unknown[] = [];
    await Promise.allSettled(stopFeeds.map(stop => stop()));
    for (const child of children.reverse()) {
      if (child.process.exitCode === null) child.process.kill('SIGTERM');
      const deadline = setTimeout(() => child.process.kill('SIGKILL'), 15_000);
      try { const code = await child.process.exited;await child.errors;if (code !== 0) failures.push(new Error('An owned process did not drain cleanly.')); }
      finally { clearTimeout(deadline); }
    }
    await nc?.close();if (db) await db.$client.end();
    if (created && admin) await admin.query('DROP DATABASE ' + database);
    await admin?.end();
    if (brokerCreated) { try { await docker('rm', '-f', container); } catch (error) { failures.push(error); } }
    rmSync(directory, { recursive: true, force: true });
    if (previousName === undefined) delete process.env.DB_NAME;else process.env.DB_NAME = previousName;
    if (previousStandalone === undefined) delete process.env.STANDALONE;else process.env.STANDALONE = previousStandalone;
    if (failures.length) throw new AggregateError(failures, 'Owned two-instance cleanup failed.');
  }
}, 180_000);
