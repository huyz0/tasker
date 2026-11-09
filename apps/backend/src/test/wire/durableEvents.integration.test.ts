import { expect, it } from 'bun:test';
import { spawn } from 'bun';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Code, createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { AuthService, OrgService, ProjectTemplateService, ProjectService, TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';

const realTest = process.env.TASKER_REAL_INTEGRATION === '1' ? it : it.skip;
realTest('real brokerless API captures committed writes and projects them locally', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tasker-durable-wire-'));
  const path = join(directory, 'wire.sqlite');
  const port = Number(process.env.DURABLE_WIRE_TEST_PORT ?? 8137);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn({ cmd: [process.execPath, 'run', join(import.meta.dir, '../../index.ts'), '--port', String(port), '--db', path], env: { ...process.env, STANDALONE: 'true', NATS_URL: '', NODE_ENV: 'development', LOG_LEVEL: 'silent', SHUTDOWN_PRE_DRAIN_MS: '500' }, stdout: 'ignore', stderr: 'pipe' });
  const errors = new Response(child.stderr).text();
  let sqlite: Database | undefined;
  let exitStatus: number | null = null;
  let stderr = '';
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(`${baseUrl}/readyz`)).ok) { ready = true; break; } } catch { /* starting */ }
      await Bun.sleep(50);
    }
    expect(ready).toBe(true);
    const registered = await fetch(`${baseUrl}/api/auth/password/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'durable-worker-owner', password: 'Fixture-strong-password-123!' }) });
    expect(registered.ok).toBe(true);
    const cookie = registered.headers.get('set-cookie')!.split(';')[0]!;
    const transport = createConnectTransport({ baseUrl, httpVersion: '1.1', interceptors: [next => async req => { req.header.set('cookie', cookie); return next(req); }] });
    const ownerId = (await createClient(AuthService, transport).getIdentity({})).user!.id;
    const orgId = (await createClient(OrgService, transport).seedOrg({ name: 'Durable', slug: 'durable' })).organization!.id;
    const templateId = (await createClient(ProjectTemplateService, transport).createTemplate({ orgId, name: 'Durable', description: '' })).template!.id;
    const projectId = (await createClient(ProjectService, transport).createProject({ orgId, templateId, name: 'Durable', ownerId })).project!.id;
    const task = (await createClient(TaskService, transport).createTask({ projectId, title: 'Captured over the real adapter', status: 'todo', idempotencyKey: 'durable-wire' })).task!;
    sqlite = new Database(path, { readonly: true });
    sqlite.exec('PRAGMA busy_timeout = 1000');
    const event = sqlite.query("SELECT * FROM domain_events WHERE subject = 'domain.task.created'").get() as any;
    expect(event).toBeTruthy();
    expect(JSON.parse(event.payload)).toMatchObject({ id: task.id, orgId, projectId, eventId: event.id });
    let audit: any;
    for (let attempt = 0; attempt < 100; attempt++) {
      audit = sqlite.query('SELECT * FROM audit_log WHERE event_id = ?').get(event.id);
      if (audit) break;
      await Bun.sleep(50);
    }
    expect(audit).toBeTruthy();
    expect(JSON.parse(audit.payload).id).toBe(task.id);
    expect((sqlite.query('SELECT COUNT(*) AS n FROM audit_log WHERE event_id = ?').get(event.id) as any).n).toBe(1);
    child.kill('SIGTERM');
    for (let attempt = 0; attempt < 50; attempt++) {
      if ((await fetch(`${baseUrl}/readyz`)).status === 503) break;
      await Bun.sleep(5);
    }
    await expect(createClient(TaskService, transport).createTask({ projectId, title: 'Must not enter during drain', status: 'todo' })).rejects.toMatchObject({ code: Code.Unavailable });
    expect((sqlite.query('SELECT COUNT(*) AS n FROM tasks').get() as any).n).toBe(1);

  } finally {
    sqlite?.close(); child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 10_000);
    await child.exited; clearTimeout(force);
    stderr = await errors;
    exitStatus = child.exitCode;
    rmSync(directory, { recursive: true, force: true });
  }
  expect({ exitStatus, stderr }).toMatchObject({ exitStatus: 0 });
}, 30_000);
