import { expect, it } from 'bun:test';
import { spawn, type Subprocess } from 'bun';
import { createHmac } from 'node:crypto';
import * as http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { connect as natsConnect } from 'nats';
import { count, eq } from 'drizzle-orm';
import { setupDatabase } from '../../db/db';
import { transactionConflict } from '../../db/errors';
import { brokerEventReference } from '../../lib/domainEventRelay';
import { STREAM_NAME } from '../../consumers/stream';

const WORKER = String.raw`
const c = JSON.parse(process.env.TASKER_DOMAIN_RECOVERY_CASE);
const { setupDatabase } = await import(c.sourceRoot + '/db/db.ts');
const { withUnitOfWork } = await import(c.sourceRoot + '/db/access.ts');
const { safeErrorSerializer } = await import(c.sourceRoot + '/lib/databaseErrorDetails.ts');
let db;
try {
  db = await setupDatabase(c.driver, c.path);
  if (c.mode === 'capture') {
    const { createContextValues } = await import('@connectrpc/connect');
    const { currentPrincipalKey } = await import(c.sourceRoot + '/modules/auth/session.ts');
    const { captureDomainEvent } = await import(c.sourceRoot + '/lib/domainEventOutbox.ts');
    const { setDurableDomainEventCapture } = await import(c.sourceRoot + '/lib/natsCorrelation.ts');
    const { runWithRequestContext } = await import(c.sourceRoot + '/lib/requestContext.ts');
    const { createTaskManagementHandler } = await import(c.sourceRoot + '/modules/tasks/tasks.handler.ts');
    const { createArtifactsHandler } = await import(c.sourceRoot + '/modules/artifacts/artifacts.handler.ts');
    setDurableDomainEventCapture((tx, standalone, event) => captureDomainEvent(tx, standalone, event, { brokerRequired: true }));
    const values = createContextValues();
    values.set(currentPrincipalKey, { kind: 'user', userId: c.userId });
    const ctx = { values };
    const task = await runWithRequestContext({ requestId: c.key, actor: { kind: 'user', userId: c.userId }, orgId: c.orgId, projectId: c.projectId }, async () => {
      const result = await createTaskManagementHandler(db).createTask({ projectId: c.projectId, title: 'Recover ' + c.key, status: 'todo', idempotencyKey: c.key }, ctx);
      if (c.large) {
        const artifacts = createArtifactsHandler(db);
        const { folder } = await withUnitOfWork(db, () => artifacts.createFolder({ projectId: c.projectId, name: 'Evidence ' + c.key }, ctx));
        await withUnitOfWork(db, () => artifacts.createArtifact({ folderId: folder.id, name: 'Large evidence', content: 'x'.repeat(1_100_000), contentType: 'text/markdown' }, ctx));
      }
      return result.task;
    });
    await Bun.write(c.checkpoint, JSON.stringify({ taskId: task.id }));
    await new Promise(() => { setInterval(() => {}, 1000); });
  } else if (c.mode === 'webhook') {
    const { runWebhookSweep, httpSender } = await import(c.sourceRoot + '/modules/webhooks/delivery.ts');
    const result = await runWebhookSweep(db, c.driver === 'sqlite', { now: () => Date.now() + (c.offset || 0), send: httpSender(true) });
    await Bun.write(Bun.stdout, JSON.stringify(result) + '\n');
  } else {
    const { connect } = await import('nats');
    const { createDomainEventRuntime } = await import(c.sourceRoot + '/lib/domainEventRuntime.ts');
    let paused = false;
    const connector = async options => {
      const nc = await connect(options);
      const js = nc.jetstream();
      return new Proxy(nc, { get(target, key) {
        if (key === 'jetstream') return () => new Proxy(js, { get(stream, method) {
          if (method === 'publish') return async (...args) => {
            const ack = await stream.publish(...args);
            if (c.mode === 'ack-pause' && !paused) {
              paused = true;
              await Bun.write(c.checkpoint, JSON.stringify({ eventId: args[2].msgID, seq: ack.seq }));
              await new Promise(() => { setInterval(() => {}, 1000); });
            }
            return ack;
          };
          const value = Reflect.get(stream, method, stream);
          return typeof value === 'function' ? value.bind(stream) : value;
        } });
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    };
    const runtime = createDomainEventRuntime(db, c.driver === 'sqlite', { url: c.url, now: () => Date.now() + (c.offset || 0), connect: connector });
    if (c.mode === 'continuous') {
      let stopping = false;
      process.on('SIGTERM', () => {
        if (stopping) return;
        stopping = true;
        void runtime.close().then(async () => {
          if (c.driver === 'mysql') await db.$client.end(); else db.$client.close();
          process.exit(0);
        }).catch(() => process.exit(1));
      });
      runtime.start();
      await Bun.write(c.checkpoint, '{}');
      await new Promise(() => { setInterval(() => {}, 1000); });
    } else {
      const result = await runtime.sweep();
      await runtime.close();
      await Bun.write(Bun.stdout, JSON.stringify(result) + '\n');
    }
  }
} catch (error) {
  await Bun.write(Bun.stderr, JSON.stringify(safeErrorSerializer(error)) + '\n');
  process.exitCode = 1;
} finally {
  if (db) { if (c.driver === 'mysql') await db.$client.end(); else db.$client.close(); }
}
`;

type Driver = 'sqlite' | 'mysql';
type Child = { process: Subprocess; output: Promise<string>; errors: Promise<string> };
const enabled = process.env.TASKER_REAL_INTEGRATION === '1';

for (const driver of ['sqlite', 'mysql'] as Driver[]) {
  const realTest = enabled && (driver === 'sqlite' || process.env.TASKER_MYSQL_INTEGRATION === '1') ? it : it.skip;
  realTest(`domain recovery across real processes and broker failure (${driver})`, async () => {
    const originalStandalone = process.env.STANDALONE, originalName = process.env.DB_NAME;
    const directory = mkdtempSync(join(tmpdir(), `tasker-domain-${driver}-`));
    const path = join(directory, 'source.sqlite');
    const suffix = crypto.randomUUID().replaceAll('-', '');
    const databaseName = `tasker_recovery_${suffix}`;
    const container = `tasker-domain-proof-${suffix}`;
    const sourceRoot = join(import.meta.dir, '../..');
    const orgId = `org-${suffix}`, userId = `user-${suffix}`, projectId = `project-${suffix}`;
    const children: Child[] = [];
    const sockets = new Set<Socket>();
    const teardownErrors: string[] = [];
    let db: any, admin: mysql.Connection | undefined, receiver: http.Server | undefined, containerAttempted = false;
    const dockerEnv = { ...process.env };
    for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnv[key];
    async function docker(...args: string[]) {
      const child = spawn({ cmd: ['docker', '--host=unix:///var/run/docker.sock', ...args], env: dockerEnv, stdout: 'pipe', stderr: 'pipe' });
      const timeout = setTimeout(() => child.kill('SIGKILL'), 15_000);
      try {
        const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
        if (code !== 0) throw new Error(`owned Docker command failed (${code}): ${stderr}`);
        return stdout.trim();
      } finally { clearTimeout(timeout); }
    }
    const childEnv = () => ({ ...process.env, STANDALONE: driver === 'sqlite' ? 'true' : 'false', DB_PATH: path, NODE_ENV: 'test', LOG_LEVEL: 'silent', OTEL_EXPORTER_OTLP_ENDPOINT: '', OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '' });
    function track(process: Subprocess): Child {
      const child = { process, output: new Response(process.stdout as ReadableStream).text(), errors: new Response(process.stderr as ReadableStream).text() };
      children.push(child); return child;
    }
    function worker(mode: string, url: string, extra: Record<string, unknown> = {}) {
      return track(spawn({ cmd: [process.execPath, '--eval', WORKER], cwd: join(sourceRoot, '..'), env: { ...childEnv(), TASKER_DOMAIN_RECOVERY_CASE: JSON.stringify({ sourceRoot, driver, path, mode, url, orgId, userId, projectId, ...extra }) }, stdout: 'pipe', stderr: 'pipe' }));
    }
    function consumer(url: string) {
      return track(spawn({ cmd: [process.execPath, 'run', join(sourceRoot, 'consumers/index.ts')], cwd: directory, env: { ...childEnv(), NATS_URL: url }, stdout: 'pipe', stderr: 'pipe' }));
    }
    async function result(child: Child) {
      const timeout = setTimeout(() => child.process.kill('SIGKILL'), 20_000);
      try {
        const [code, stdout, stderr] = await Promise.all([child.process.exited, child.output, child.errors]);
        expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
        return JSON.parse(stdout);
      } finally { clearTimeout(timeout); }
    }
    async function stop(child: Child) {
      child.process.kill('SIGTERM');
      const timeout = setTimeout(() => child.process.kill('SIGKILL'), 10_000);
      try { expect(await child.process.exited).toBe(0); } finally { clearTimeout(timeout); }
    }
    async function wait(check: () => Promise<boolean>, label: string, timeoutMs = 12_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try { if (await check()) return; } catch (error) { if (!transactionConflict(error)) throw error; }
        await Bun.sleep(40);
      }
      throw new Error(`recovery checkpoint timed out: ${label}`);
    }
    async function checkpoint(child: Child, name: string) {
      await wait(async () => {
        if (existsSync(name)) return true;
        if (child.process.exitCode !== null) throw new Error(`worker exited before checkpoint: ${await child.errors}`);
        return false;
      }, name);
      return Bun.file(name).json();
    }
    try {
      process.env.STANDALONE = driver === 'sqlite' ? 'true' : 'false';
      if (driver === 'mysql') {
        admin = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || 'password' });
        await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4`);
        process.env.DB_NAME = databaseName;
      }
      db = await setupDatabase(driver, path);
      const S: any = driver === 'sqlite' ? await import('../../db/schema.sqlite') : await import('../../db/schema.mysql');
      const createdAt = new Date();
      await db.insert(S.users).values({ id: userId, createdAt });
      await db.insert(S.organizations).values({ id: orgId, name: 'Recovery', slug: orgId, createdAt });
      await db.insert(S.organizationMembers).values({ orgId, userId, role: 'admin', joinedAt: createdAt });
      await db.insert(S.projectTemplates).values({ id: 'template', orgId, name: 'Recovery', createdAt });
      await db.insert(S.projects).values({ id: projectId, orgId, templateId: 'template', ownerId: userId, name: 'Recovery', key: 'REC', createdAt });
      const secret = 'fixture-recovery-signing-key';
      const requests: { valid: boolean; body: string }[] = [];
      let held: http.ServerResponse | undefined;
      receiver = http.createServer((req, res) => {
        let body = '';
        req.on('data', value => { body += value; });
        req.on('end', () => {
          const expected = createHmac('sha256', secret).update(`${req.headers['x-tasker-timestamp']}.${body}`).digest('hex');
          requests.push({ valid: req.headers['x-tasker-signature'] === `sha256=${expected}`, body });
          if (requests.length === 1) { held = res; }
          else { res.writeHead(204); res.end(); }
        });
      });
      receiver.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
      await new Promise<void>(resolve => receiver!.listen(0, '127.0.0.1', resolve));
      const { encryptToken } = await import('../../lib/crypto');
      await db.insert(S.webhooks).values({ id: 'hook', orgId, url: `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/events`, secretEncrypted: encryptToken(secret), events: '["task.*"]', active: true, createdAt });
      const reservation = http.createServer();
      await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
      const port = (reservation.address() as AddressInfo).port;
      await new Promise<void>(resolve => reservation.close(() => resolve()));
      containerAttempted = true;
      await docker('run', '--detach', '--pull=never', '--name', container, '--publish', `127.0.0.1:${port}:4222`, 'nats:2.10-alpine', '-js', '-sd', '/data');
      const url = `nats://127.0.0.1:${port}`;
      await wait(async () => { try { const nc = await natsConnect({ servers: url, timeout: 250, maxReconnectAttempts: 0 }); await nc.drain(); return true; } catch { return false; } }, 'owned broker startup');
      const sourceEvents = () => db.select().from(S.domainEvents).where(eq(S.domainEvents.orgId, orgId));
      const sourceStates = () => db.select({ id: S.domainEvents.id, deliveredAt: S.domainEvents.deliveredAt, attempts: S.domainEvents.attempts }).from(S.domainEvents).where(eq(S.domainEvents.orgId, orgId));
      const auditRows = () => db.select().from(S.auditLog).where(eq(S.auditLog.orgId, orgId));
      const auditCount = async () => Number((await db.select({ value: count() }).from(S.auditLog).where(eq(S.auditLog.orgId, orgId)))[0].value);
      const capturePoint = join(directory, 'committed');
      const producer = worker('capture', url, { key: 'committed-work', large: true, checkpoint: capturePoint });
      const captured = await checkpoint(producer, capturePoint);
      producer.process.kill('SIGKILL');
      expect(await producer.process.exited).not.toBe(0);
      const sources = await sourceEvents();
      expect(sources.length).toBe(3);
      expect(sources.every((event: any) => !event.deliveredAt)).toBe(true);
      expect(await db.select().from(S.tasks)).toHaveLength(1);
      expect(await db.select().from(S.webhookDeliveries)).toHaveLength(1);
      expect(captured.taskId).toBeTruthy();

      const ackPoint = join(directory, 'accepted-before-bookkeeping');
      const interruptedRelay = worker('ack-pause', url, { checkpoint: ackPoint });
      const acknowledged = await checkpoint(interruptedRelay, ackPoint);
      interruptedRelay.process.kill('SIGKILL');
      await interruptedRelay.process.exited;
      const pendingBeforeResume = (await sourceEvents()).find((event: any) => event.id === acknowledged.eventId);
      expect(pendingBeforeResume.deliveredAt).toBeNull();
      expect((await result(worker('relay', url, { offset: 61_000 }))).delivered).toBeGreaterThan(0);
      expect((await sourceEvents()).every((event: any) => event.deliveredAt)).toBe(true);

      const nc = await natsConnect({ servers: url });
      try {
        const info = await (await nc.jetstreamManager()).streams.info(STREAM_NAME);
        expect(info.state.messages).toBe(3);
        await nc.jetstream().publish(sources[0].subject, Buffer.from(JSON.stringify(brokerEventReference(sources[0]))), { msgID: `duplicate-${sources[0].id}` });
      } finally { await nc.drain(); }
      const projector = consumer(url);
      await wait(async () => (await auditCount()) === 3, 'SQL reference projection with custom DB_PATH', 70_000);
      const projected = await auditRows();
      expect(new Set(projected.map((row: any) => row.eventId)).size).toBe(3);
      const large = projected.find((row: any) => row.subject === 'domain.artifact.created');
      expect(JSON.parse(large.payload).content).toHaveLength(1_100_000);
      expect(await db.select().from(S.webhookDeliveries)).toHaveLength(1);
      await stop(projector);

      const firstSender = worker('webhook', url);
      await wait(async () => {
        if (held) return true;
        if (firstSender.process.exitCode !== null) throw new Error(`sender exited before HTTP: ${await firstSender.errors}`);
        return false;
      }, 'first signed webhook HTTP request');
      firstSender.process.kill('SIGSTOP');
      expect((await result(worker('webhook', url, { offset: 61_000 }))).delivered).toBe(1);
      const [deliveryAfterWinner] = await db.select().from(S.webhookDeliveries);
      const [hookAfterWinner] = await db.select().from(S.webhooks);
      held!.writeHead(503); held!.end();
      firstSender.process.kill('SIGCONT');
      expect(await result(firstSender)).toMatchObject({ delivered: 0, retried: 0, failed: 0, disabled: 0 });
      expect((await db.select().from(S.webhookDeliveries))[0]).toEqual(deliveryAfterWinner);
      expect((await db.select().from(S.webhooks))[0]).toEqual(hookAfterWinner);
      expect(requests).toHaveLength(2);
      expect(requests.every(request => request.valid)).toBe(true);

      await docker('stop', '--time', '1', container);
      const outagePoint = join(directory, 'outage-commit');
      const offlineProducer = worker('capture', url, { key: 'outage-work', checkpoint: outagePoint });
      await checkpoint(offlineProducer, outagePoint);
      offlineProducer.process.kill('SIGKILL'); await offlineProducer.process.exited;
      const runningPoint = join(directory, 'relay-running');
      const reconnecting = worker('continuous', url, { checkpoint: runningPoint });
      await checkpoint(reconnecting, runningPoint);
      await wait(async () => (await sourceStates()).some((event: any) => event.attempts > 0 && !event.deliveredAt), 'broker outage retains attempted pending source');
      await docker('start', container);
      await wait(async () => { try { const nc = await natsConnect({ servers: url, timeout: 250, maxReconnectAttempts: 0 }); await nc.drain(); return true; } catch { return false; } }, 'owned broker restart');
      const resumedProjector = consumer(url);
      await wait(async () => (await auditCount()) === 4, 'broker/relay recovery and resumed audit', 70_000);
      await wait(async () => (await sourceStates()).every((event: any) => event.deliveredAt), 'source completion after broker recovery', 70_000);
      expect(await db.select().from(S.tasks)).toHaveLength(2);
      expect(await db.select().from(S.webhookDeliveries)).toHaveLength(2);
      await stop(reconnecting); await stop(resumedProjector);
    } finally {
      if (originalStandalone === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = originalStandalone;
      if (originalName === undefined) delete process.env.DB_NAME; else process.env.DB_NAME = originalName;
      for (const child of children) {
        try { if (child.process.exitCode === null) child.process.kill('SIGKILL'); }
        catch (error) { teardownErrors.push(String(error)); }
      }
      await Promise.all(children.map(child => child.process.exited));
      for (const socket of sockets) socket.destroy();
      const cleanup = await Promise.allSettled([
        (async () => { if (receiver) await new Promise<void>(resolve => receiver!.close(() => resolve())); })(),
        (async () => { if (db) { if (driver === 'mysql') await db.$client.end(); else db.$client.close(); } })(),
        (async () => {
          if (containerAttempted) {
            try { await docker('rm', '--force', '--volumes', container); }
            catch (error) { if (!String(error).includes('No such container')) throw error; }
          }
        })(),
      ]);
      for (const outcome of cleanup) if (outcome.status === 'rejected') teardownErrors.push(String(outcome.reason));
      if (admin) {
        try { await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``); }
        catch (error) { teardownErrors.push(String(error)); }
        finally { try { await admin.end(); } catch (error) { teardownErrors.push(String(error)); } }
      }
      try { rmSync(directory, { recursive: true, force: true }); } catch (error) { teardownErrors.push(String(error)); }
      if (teardownErrors.length) await Bun.write(Bun.stderr, JSON.stringify({ cleanupErrors: teardownErrors }) + '\n');
    }
    expect(teardownErrors).toEqual([]);
  }, 180_000);
}
