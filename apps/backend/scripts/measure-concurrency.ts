import { spawn, type Subprocess } from 'bun';
import { createServer, type AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { cpus, totalmem, tmpdir } from 'node:os';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { connect as natsConnect, type NatsConnection } from 'nats';
import { createClient, ConnectError, Code } from '@connectrpc/connect';
import { createMeasurementTransport } from './measurement-transport';
import { AgentService, AuthService, OrgService, ProjectService, ProjectTemplateService, TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { STREAM_NAME, DURABLE_NAME } from '../src/consumers/stream';
import { settleOwnedCleanup } from '../src/test/ownedCleanup';
import { measurementConfig, latencySummary, reconcileOutcomes } from './concurrency-core';

type Child = { process: Subprocess; kind: 'measured' | 'consumer' | 'recovery'; stopped: boolean };
type Attempt = { key: string; acceptedId?: string; milliseconds: number; success: boolean };
class MeasurementFailure extends Error {
  constructor(readonly stage: string, readonly failureCode: string) { super('Owned measurement failed.'); }
}
const usage = 'bun run measure:concurrency --concurrency 4 --duration 3 --fixture 20 --instances 2 --seed 1 --max-operations 20';
function safeCode(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'FAILED';
}
function readNumber(path: string): number | null {
  try { const value = Number(readFileSync(path, 'utf8').trim());return Number.isFinite(value) ? value : null; } catch { return null; }
}
function rss(pid: number): number | null {
  try { const value = /^VmRSS:\s+(\d+)\s+kB/m.exec(readFileSync('/proc/' + pid + '/status', 'utf8'));return value ? Number(value[1]) * 1024 : null; } catch { return null; }
}

async function main(args: string[]) {
  const launched = performance.now();
  const config = measurementConfig(args);
  const host = process.env.DB_HOST || '127.0.0.1';
  if (process.platform !== 'linux' || !['127.0.0.1', 'localhost'].includes(host) || Number(process.env.DB_PORT || 3306) !== 3306 || !process.env.DB_PASSWORD) {
    throw new Error('Use a disposable local Linux MySQL on3306 with an explicit password.');
  }
  const suffix = crypto.randomUUID().replaceAll('-', ''), database = 'tasker_load_' + suffix;
  const directory = mkdtempSync(join(tmpdir(), 'tasker-load-')), container = 'tasker-load-' + suffix;
  const prefix = 'measure-' + suffix + '-' + config.seed + '-';
  const previous = new Map<string, string | undefined>(['DB_NAME', 'STANDALONE', 'LOG_LEVEL'].map((key): [string, string | undefined] => [key, process.env[key]]));
  process.env.DB_NAME = database;process.env.STANDALONE = 'false';process.env.LOG_LEVEL = 'silent';
  const adminConfig = { host, port: 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD, connectTimeout: 5000 };
  const dockerEnv = { ...process.env };
  for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnv[key];
  const shared = { JWT_SECRET: randomBytes(48).toString('hex'), APP_ENCRYPTION_SECRET: randomBytes(16).toString('hex') };
  const children: Child[] = [], attempts: Attempt[] = [], errors: Record<string, number> = {};
  let admin: mysql.Connection | undefined, nc: NatsConnection | undefined, created = false, brokerAttempted = false;
  let timer: ReturnType<typeof setInterval> | undefined, sampling: Promise<void> | undefined;
  let report: any, primary: unknown, failed = false, phase = 'bootstrap';
  function reportPhase(stage: string) {
    console.error(JSON.stringify({ kind: 'tasker-load-phase', stage, elapsedMs: performance.now() - launched,
      attemptedLogical: attempts.length, completedLogical: attempts.filter(attempt => attempt.success).length, reportReady: Boolean(report) }));
  }
  function markPhase(stage: string) { phase = stage;reportPhase(stage); }
  reportPhase(phase);
  const interrupted = new AbortController();
  const onInterrupt = () => { markPhase('cancelled');interrupted.abort(); };
  process.on('SIGINT', onInterrupt);process.on('SIGTERM', onInterrupt);
  let apiPeakRssBytes = 0, generatorPeakRssBytes = process.memoryUsage().rss, memoryReadFailures = 0;
  let queueSamples = 0, queueReadFailures = 0, maxProducerPending = 0, maxConsumerPending = 0, maxConsumerUnacked = 0;
  async function query(sql: string, values: unknown[] = []): Promise<any> {
    if (interrupted.signal.aborted) throw new Error('Measurement cancelled.');
    const [result] = await admin!.query({ sql, values, timeout: 15_000 });return result;
  }
  async function docker(...args: string[]) {
    const child = spawn({ cmd: ['docker', '--host=unix:///var/run/docker.sock', ...args], env: dockerEnv, stdout: 'pipe', stderr: 'ignore' });
    const watchdog = setTimeout(() => child.kill('SIGKILL'), 20_000);
    try {
      const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
      if (code !== 0) throw new Error('Owned broker command failed.');return output.trim();
    } finally { clearTimeout(watchdog); }
  }
  async function wait(check: () => Promise<boolean>, label: string, budget = 30_000) {
    const deadline = Date.now() + budget;
    while (Date.now() < deadline) { if (interrupted.signal.aborted) throw new Error('Measurement cancelled.');if (await check()) return;await Bun.sleep(100); }
    throw new Error(label);
  }
  async function port() {
    const server = createServer();
    await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
    const value = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));return value;
  }
  function start(kind: Child['kind'], entry: string, args: string[], url: string) {
    const childProcess = spawn({ cmd: [process.execPath, 'run', join(import.meta.dir, '../src', entry), ...args], cwd: directory,
      env: { ...process.env, ...shared, DB_HOST: host, DB_NAME: database, STANDALONE: 'false', NATS_URL: url,
        NODE_ENV: 'development', LOG_LEVEL: 'silent', SHUTDOWN_PRE_DRAIN_MS: '0',
        OTEL_EXPORTER_OTLP_ENDPOINT: '', OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '' }, stdout: 'ignore', stderr: 'ignore' });
    const child = { process: childProcess, kind, stopped: false };children.push(child);return child;
  }
  async function stop(child: Child) {
    if (child.stopped) return;child.stopped = true;
    if (child.process.exitCode === null) child.process.kill('SIGTERM');
    let forced = false;
    const watchdog = setTimeout(() => { forced = true;child.process.kill('SIGKILL'); }, 30_000);
    try { if (await child.process.exited !== 0 || forced) throw new Error('Owned process did not drain.'); }
    finally { clearTimeout(watchdog); }
  }
  async function stopAll(selected: Child[]) {
    const stopped = await Promise.allSettled(selected.map(stop));
    if (stopped.some(result => result.status === 'rejected')) throw new Error('Owned API drain failed.');
  }
  async function api(kind: 'measured' | 'recovery', url: string) {
    const httpPort = await port(), endpoint = 'http://127.0.0.1:' + httpPort;
    const child = start(kind, 'index.ts', ['--port', String(httpPort)], url);
    await wait(async () => {
      if (child.process.exitCode !== null) throw new Error('Owned API exited during startup.');
      try { return (await fetch(endpoint + '/readyz', { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; }
    }, 'Owned API was not ready.');
    return endpoint;
  }
  function transport(endpoint: string, header: string, value: string) {
    return createMeasurementTransport({ endpoint, header, value, signal: interrupted.signal });
  }
  try {
    admin = await mysql.createConnection(adminConfig);
    const version = (await query('SELECT VERSION() AS version'))[0].version;
    await query('CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4');created = true;
    await query('USE ' + database);
    brokerAttempted = true;
    await docker('run', '-d', '--pull=never', '--name', container, '--label', 'tasker.measure.owner=' + suffix,
      '-p', '127.0.0.1::4222', 'nats:2.10-alpine', '-js');
    const brokerPort = Number((await docker('port', container, '4222/tcp')).split(':').at(-1));
    if (!Number.isInteger(brokerPort) || brokerPort < 1) throw new Error('Owned broker port was not assigned.');
    const url = 'nats://127.0.0.1:' + brokerPort;
    await wait(async () => {
      try { nc = await natsConnect({ servers: url, timeout: 500, maxReconnectAttempts: 0 });return true; } catch { return false; }
    }, 'Owned broker was not ready.');
    markPhase('api-startup');
    const endpoints: string[] = [];
    for (let index = 0; index < config.instances; index++) endpoints.push(await api('measured', url));
    const projector = start('consumer', 'consumers/index.ts', [], url), jsm = await nc!.jetstreamManager({ timeout: 5000 });
    await wait(async () => {
      if (projector.process.exitCode !== null) throw new Error('Owned audit consumer exited.');
      try { await jsm.consumers.info(STREAM_NAME, DURABLE_NAME);return true; } catch { return false; }
    }, 'Owned audit consumer was not ready.');
    markPhase('identity');
    const registration = await fetch(endpoints[0]! + '/api/auth/password/register', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ username: 'load-owner-' + suffix, password: crypto.randomUUID() + 'Load9!' }),
    });
    const cookie = registration.headers.get('set-cookie')?.split(';')[0];
    if (registration.status !== 201 || !cookie) throw new Error('Owned load identity was not issued.');
    const owner = transport(endpoints[0]!, 'cookie', cookie);
    const ownerId = (await createClient(AuthService, owner).getIdentity({})).user!.id;
    const orgId = (await createClient(OrgService, owner).seedOrg({ name: 'Load evidence', slug: 'load-' + suffix })).organization!.id;
    const templateId = (await createClient(ProjectTemplateService, owner).createTemplate({ orgId, name: 'Load template' })).template!.id;
    const projectId = (await createClient(ProjectService, owner).createProject({ orgId, templateId, ownerId, name: 'Load project' })).project!.id;
    const roleId = (await createClient(AgentService, owner).createAgentRole({ orgId, name: 'Load worker', systemPrompt: 'Use authorized work.', capabilities: '[]' })).role!.id;
    markPhase('fixtures');
    for (let offset = 0; offset < config.fixture; offset += 200) {
      const rows = Array.from({ length: Math.min(200, config.fixture - offset) }, (_, index) => [
        'tsk-' + crypto.randomUUID(), projectId, 'FIX-' + (offset + index), 'fixture-' + config.seed + '-' + (offset + index), 'todo', (offset + index) % 5,
      ]);
      await query('INSERT INTO tasks (id, project_id, display_id, title, status, priority) VALUES ?', [rows]);
    }
    const { mintToken } = await import('../src/lib/agentToken');
    const credentials: string[] = [];
    for (let offset = 0; offset < config.concurrency; offset += 200) {
      const agents: unknown[][] = [], tokens: unknown[][] = [];
      for (let index = offset; index < Math.min(offset + 200, config.concurrency); index++) {
        const agentId = 'ag-' + crypto.randomUUID(), minted = mintToken();
        agents.push([agentId, orgId, roleId, 'Load worker ' + index]);
        tokens.push(['tok-' + crypto.randomUUID(), orgId, agentId, 'load-fixture', minted.tokenPrefix, minted.tokenHash,
          '["tasks:read","tasks:write"]', ownerId, new Date(Date.now() + 3_600_000)]);
        credentials.push(minted.plaintext);
      }
      await query('INSERT INTO agents (id, org_id, agent_role_id, name) VALUES ?', [agents]);
      await query('INSERT INTO api_tokens (id, org_id, agent_id, name, token_prefix, token_hash, scopes, created_by, expires_at) VALUES ?', [tokens]);
    }
    const actualFixtureTasks = Number((await query('SELECT COUNT(*) AS n FROM tasks WHERE project_id = ? AND title LIKE ?', [projectId, 'fixture-' + config.seed + '-%']))[0].n);
    const actualAgents = Number((await query('SELECT COUNT(*) AS n FROM agents WHERE org_id = ?', [orgId]))[0].n);
    const actualTokens = Number((await query('SELECT COUNT(*) AS n FROM api_tokens WHERE org_id = ?', [orgId]))[0].n);
    if (actualFixtureTasks !== config.fixture || actualAgents !== config.concurrency || actualTokens !== config.concurrency) throw new Error('Owned fixture counts differ.');
    const pending = async () => Number((await query('SELECT COUNT(*) AS n FROM domain_events WHERE delivered_at IS NULL'))[0].n);
    async function drained() {
      if (await pending()) return false;
      const stream = await jsm.streams.info(STREAM_NAME), consumer = await jsm.consumers.info(STREAM_NAME, DURABLE_NAME);
      return consumer.ack_floor.stream_seq >= stream.state.last_seq;
    }
    markPhase('setup-drain');
    await wait(drained, 'Setup events did not drain.');
    const measured = children.filter(child => child.kind === 'measured');
    const sample = async () => {
      const memory = measured.map(child => rss(child.process.pid));
      if (memory.some(value => value === null)) memoryReadFailures++;
      apiPeakRssBytes = Math.max(apiPeakRssBytes, memory.reduce<number>((sum, value) => sum + (value ?? 0), 0));
      generatorPeakRssBytes = Math.max(generatorPeakRssBytes, process.memoryUsage().rss);
      try {
        const source = await pending(), consumer = await jsm.consumers.info(STREAM_NAME, DURABLE_NAME);
        queueSamples++;maxProducerPending = Math.max(maxProducerPending, source);
        maxConsumerPending = Math.max(maxConsumerPending, consumer.num_pending);maxConsumerUnacked = Math.max(maxConsumerUnacked, consumer.num_ack_pending);
      } catch { queueReadFailures++; }
    };
    await sample();
    timer = setInterval(() => { if (!sampling) sampling = sample().finally(() => { sampling = undefined; }); }, 500);
    markPhase('measurement');
    let next = 0, active = 0, peakActive = 0, rpcCalls = 0, responseIdentityMismatch = 0, lastAdmissionOffsetMs = 0;
    const firstWriteLatencies: number[] = [], startedAt = new Date().toISOString(), started = performance.now();
    const deadline = started + config.duration * 1000;
    await Promise.all(credentials.map(async credential => {
      const clients = endpoints.map(endpoint => createClient(TaskService, transport(endpoint, 'authorization', 'Bearer ' + credential)));
      while (!interrupted.signal.aborted && performance.now() < deadline && next < config.maxOperations) {
        const sequence = next++, key = prefix + sequence, at = performance.now();
        lastAdmissionOffsetMs = at - started;active++;peakActive = Math.max(peakActive, active);
        const attempt: Attempt = { key, milliseconds: 0, success: false };attempts.push(attempt);
        const route = (config.seed + sequence) % clients.length;
        const request = { projectId, title: key, status: 'todo', idempotencyKey: key };
        let stage = 'create';
        try {
          rpcCalls++;const first = (await clients[route]!.createTask(request)).task;
          if (!first?.id) { responseIdentityMismatch++;throw new Error('Missing accepted task identity.'); }
          attempt.acceptedId = first.id;firstWriteLatencies.push(performance.now() - at);
          stage = 'replay';rpcCalls++;const replay = (await clients[(route + 1) % clients.length]!.createTask(request)).task;
          if (!replay || replay.id !== first.id || replay.displayId !== first.displayId) { responseIdentityMismatch++;throw new Error('Replay identity changed.'); }
          stage = 'read';rpcCalls++;const canonical = (await clients[route]!.getTask({ taskId: first.id })).task;
          if (!canonical || canonical.id !== first.id || canonical.displayId !== first.displayId) { responseIdentityMismatch++;throw new Error('Canonical identity changed.'); }
          attempt.success = true;
        } catch (error) {
          const key = stage + ':' + (Code[ConnectError.from(error).code] ?? 'Unknown');errors[key] = (errors[key] ?? 0) + 1;
        } finally { attempt.milliseconds = performance.now() - at;active--; }
      }
    }));
    if (interrupted.signal.aborted) throw new Error('Measurement cancelled.');
    const phaseMs = performance.now() - started;
    markPhase('request-settled');
    clearInterval(timer);timer = undefined;if (sampling) await sampling;
    await sample();
    const postObservationMs = performance.now() - started - phaseMs;
    if (measured.some(child => child.process.exitCode !== null) || projector.process.exitCode !== null) throw new Error('Owned process exited during measurement.');
    markPhase('api-drain');
    const apiDrainAt = performance.now();
    await stopAll(measured);
    const apiDrainMs = performance.now() - apiDrainAt;
    markPhase('event-recovery');
    const tailStart = performance.now(), pendingAfterApiDrain = await pending();
    let recoveryApiStarted = false;
    if (pendingAfterApiDrain) { await api('recovery', url);recoveryApiStarted = true; }
    await wait(drained, 'Measured source or acknowledged audit did not drain.', 60_000);
    await stopAll(children.filter(child => child.kind === 'recovery'));
    const recoveryMs = performance.now() - tailStart;
    markPhase('projector-drain');
    const sqlDrainAt = performance.now();
    await stop(projector);
    markPhase('sql-drain');
    await wait(async () => Number((await query('SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.PROCESSLIST WHERE DB = ? AND ID <> CONNECTION_ID()', [database]))[0].n) === 0,
      'Owned SQL sessions did not quiesce.', 15_000);
    const sqlDrainMs = performance.now() - sqlDrainAt;
    const pendingAfterSqlDrain = await pending();
    markPhase('oracle');
    const oracleAt = performance.now();
    const sourceRows = await query('SELECT id, title FROM tasks WHERE project_id = ? AND title LIKE ?', [projectId, prefix + '%']);
    const outcomes = reconcileOutcomes(attempts, sourceRows.map((row: any) => ({ key: row.title, id: row.id })));
    const taskIds = new Set<string>(sourceRows.map((row: any) => row.id));
    const producers = await query("SELECT id, payload FROM domain_events WHERE org_id = ? AND subject = 'domain.task.created'", [orgId]);
    const audit = await query("SELECT event_id, payload FROM audit_log WHERE org_id = ? AND subject = 'domain.task.created'", [orgId]);
    const producerIds = new Map<string, string[]>(), auditIds = new Map<string, string[]>();
    let producerOrphans = 0, auditOrphans = 0, producerLost = 0, producerDuplicates = 0, auditLost = 0, auditDuplicates = 0, auditIdentityMismatch = 0;
    for (const row of producers) {
      const id = JSON.parse(row.payload).id;
      if (!taskIds.has(id)) producerOrphans++;
      const entries = producerIds.get(id) ?? [];entries.push(row.id);producerIds.set(id, entries);
    }
    for (const row of audit) {
      const payload = JSON.parse(row.payload), id = payload.id;
      if (!taskIds.has(id)) auditOrphans++;
      if (!producerIds.get(id)?.includes(row.event_id) || payload.eventId !== row.event_id) auditIdentityMismatch++;
      const entries = auditIds.get(id) ?? [];entries.push(row.event_id);auditIds.set(id, entries);
    }
    for (const id of taskIds) {
      const produced = producerIds.get(id)?.length ?? 0, projected = auditIds.get(id)?.length ?? 0;
      if (!produced) producerLost++;producerDuplicates += Math.max(0, produced - 1);
      if (!projected) auditLost++;auditDuplicates += Math.max(0, projected - 1);
    }
    const correctness = { ...outcomes, pendingAfterSqlDrain, producerLost, producerDuplicates, producerOrphans, auditLost, auditDuplicates, auditOrphans, auditIdentityMismatch, responseIdentityMismatch,
      checked: true, ok: outcomes.lost + outcomes.duplicates + outcomes.identityMismatch + outcomes.unexpected + producerLost + producerDuplicates + producerOrphans + auditLost + auditDuplicates + auditOrphans + auditIdentityMismatch + responseIdentityMismatch + pendingAfterSqlDrain === 0 };
    const completed = attempts.filter(attempt => attempt.success), acknowledged = attempts.filter(attempt => attempt.acceptedId !== undefined).length;
    let cpuQuotaCores: number | null = null;
    try { const [quota, period] = readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim().split(/\s+/);if (quota !== 'max' && Number(period) > 0) cpuQuotaCores = Number(quota) / Number(period); } catch { /* reported as unknown */ }
    const finalConsumer = await jsm.consumers.info(STREAM_NAME, DURABLE_NAME);
    report = {
      kind: 'tasker-http-concurrency-v1', startedAt, commit: process.env.GITHUB_SHA || 'unrecorded',
      workload: { ...config, mode: 'closed-loop create/replay/get; one shared project', actualPrincipals: actualAgents, apiPids: measured.map(child => child.process.pid),
        peakActive, fixtureTasks: actualFixtureTasks, poolSizePerApi: Number(process.env.DB_POOL_SIZE) || 20, poolQueueLimitPerApi: Number(process.env.DB_POOL_QUEUE_LIMIT) || 200 },
      timing: { setupMs: started - launched, phaseMs, lastAdmissionOffsetMs, postObservationMs, apiDrainMs, recoveryMs, sqlDrainMs, oracleMs: performance.now() - oracleAt, cleanupMs: 0, totalMs: 0, observerIntervalMs: 500 },
      counts: { attemptedLogical: attempts.length, completedLogical: completed.length, acknowledgedWrites: acknowledged, persistedMeasuredTasks: sourceRows.length, persistedProducerEvents: producers.length, persistedAuditRows: audit.length, rpcCalls, errors },
      throughput: { completedLogicalPerSecond: completed.length * 1000 / phaseMs, acknowledgedWritesPerSecond: acknowledged * 1000 / phaseMs },
      latencyMs: { allLogical: latencySummary(attempts.map(attempt => attempt.milliseconds)), successfulLogical: latencySummary(completed.map(attempt => attempt.milliseconds)), acknowledgedFirstWrite: latencySummary(firstWriteLatencies) },
      memory: { apiPeakRssBytes, generatorPeakRssBytes: Math.max(generatorPeakRssBytes, process.memoryUsage().rss), memoryReadFailures, scope: 'sampled direct API PIDs and generator; excludes MySQL/NATS' },
      hardware: { platform: process.platform, arch: process.arch, cpuModel: cpus()[0]?.model ?? null, logicalCpus: cpus().length, cpuQuotaCores, hostRamBytes: totalmem(), cgroupMemoryMaxBytes: readNumber('/sys/fs/cgroup/memory.max') },
      versions: { bun: Bun.version, apiBun: Bun.version, mysql: version, nats: nc!.info?.version ?? null },
      queue: { samples: queueSamples, readFailures: queueReadFailures, maxProducerPending, maxConsumerPending, maxConsumerUnacked, pendingAfterApiDrain, recoveryApiStarted, finalPending: pendingAfterSqlDrain, finalAckFloor: finalConsumer.ack_floor.stream_seq },
      correctness, cleanupFailures: 0, evidenceValid: acknowledged > 0,
      limitations: ['Single Linux host and one shared project; short closed-loop workload.', 'Actor/task fixtures are inserted directly; owner/org/project/role use real HTTP.', 'Observer and generator overhead are included; memory is sampled and excludes services.', 'Recovery API takeover, if required, is separate from measured request throughput.', 'Errors and uncertain outcomes are retained; no20k, steady-state, all-endpoint, streaming or multi-host claim.'],
    };
  } catch (error) { failed = true;primary = error; }
  finally {
    const cleanupAt = performance.now();
    reportPhase('cleanup');
    if (timer) clearInterval(timer);if (sampling) await sampling;
    const failures = await settleOwnedCleanup([
      ...[...children].reverse().map(child => () => stop(child)),
      async () => { await nc?.close(); },
      () => { admin?.destroy(); },
      async () => {
        if (!created) return;
        const cleanup = await mysql.createConnection(adminConfig);
        try { await cleanup.query({ sql: 'DROP DATABASE ' + database, timeout: 15_000 }); } finally { cleanup.destroy(); }
      },
      async () => {
        if (!brokerAttempted) return;
        const ids = await docker('ps', '-aq', '--filter', 'label=tasker.measure.owner=' + suffix);
        for (const id of ids.split('\n').filter(Boolean)) await docker('rm', '--force', '--volumes', id);
        if (await docker('ps', '-aq', '--filter', 'label=tasker.measure.owner=' + suffix)) throw new Error('Owned broker remained after cleanup.');
      },
      () => { rmSync(directory, { recursive: true, force: true }); },
    ], () => { process.removeListener('SIGINT', onInterrupt);process.removeListener('SIGTERM', onInterrupt);for (const [key, value] of previous) { if (value === undefined) delete process.env[key];else process.env[key] = value; } });
    if (report) {
      report.cleanupFailures = failures.length;report.correctness.ok &&= failures.length === 0;
      report.timing.cleanupMs = performance.now() - cleanupAt;report.timing.totalMs = performance.now() - launched;
      console.log(JSON.stringify(report));
      if (!report.correctness.ok) process.exitCode = 1;else if (!report.evidenceValid) process.exitCode = 2;
    }
    reportPhase('cleanup-finished');
    if (failed || failures.length) throw new MeasurementFailure(failed ? phase : 'cleanup', safeCode(primary));
  }
}

if (process.argv.length === 3 && process.argv[2] === '--help') console.log(usage);
else await main(process.argv.slice(2)).catch(error => { const stage = error instanceof MeasurementFailure ? error.stage : 'configuration';const code = error instanceof MeasurementFailure ? error.failureCode : safeCode(error);console.error('Owned load measurement failed: ' + stage + ' (' + code + ').');process.exitCode = 1; });
