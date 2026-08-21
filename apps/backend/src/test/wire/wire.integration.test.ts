import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawn, type Subprocess } from 'bun';
import { createClient, ConnectError, Code } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import {
  HealthService,
  OrgService,
  TaskService,
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

  afterAll(() => {
    server?.kill();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

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
});
