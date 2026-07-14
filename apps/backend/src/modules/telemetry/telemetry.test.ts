import { describe, it, expect, beforeEach } from 'bun:test';
import { createTelemetryRoutes } from './telemetry';
import { setErrorReporter, LoggerErrorReporter, type ErrorReporter } from '../../lib/errorReporter';
import { resetErrorRingBuffer } from '../../lib/errorRingBuffer';
import { setupIntegrationTest } from '../../test/setup';
import * as schemaSqlite from '../../db/schema.sqlite';
import { createSessionToken } from '../auth/session';

function postClientError(routes: ReturnType<typeof createTelemetryRoutes>, body: unknown) {
  return routes.handle(new Request('http://localhost/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

let db: any;

beforeEach(async () => {
  const setup = await setupIntegrationTest();
  db = setup.db;
  resetErrorRingBuffer();
});

describe('POST /api/client-errors', () => {
  it('routes a valid client error report through reportError with source: client', async () => {
    const received: any[] = [];
    setErrorReporter({ report: (event) => received.push(event) } as ErrorReporter);
    try {
      const routes = createTelemetryRoutes(db);
      const res = await postClientError(routes, {
        message: 'window.onerror',
        severity: 'error',
        errName: 'TypeError',
        errStack: 'TypeError: x is not a function\n  at foo.js:1:1',
        context: { url: '/tasks' },
      });

      expect(res.status).toBe(204);
      expect(received).toHaveLength(1);
      expect(received[0].message).toBe('client: window.onerror');
      expect(received[0].severity).toBe('error');
      expect(received[0].context.source).toBe('client');
      expect(received[0].context.clientErrorName).toBe('TypeError');
      expect(received[0].context.clientContext).toContain('/tasks');
    } finally {
      setErrorReporter(new LoggerErrorReporter());
    }
  });

  it('rejects a report with no message using an RFC7807 problem-details body', async () => {
    const routes = createTelemetryRoutes(db);
    const res = await postClientError(routes, { severity: 'error' });
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const body: any = await res.json();
    expect(body).toMatchObject({ title: 'Invalid client error report', status: 400 });
  });

  it('defaults an invalid/missing severity to "error" rather than rejecting', async () => {
    const received: any[] = [];
    setErrorReporter({ report: (event) => received.push(event) } as ErrorReporter);
    try {
      const routes = createTelemetryRoutes(db);
      const res = await postClientError(routes, { message: 'oops' });
      expect(res.status).toBe(204);
      expect(received[0].severity).toBe('error');
    } finally {
      setErrorReporter(new LoggerErrorReporter());
    }
  });

  it('truncates an oversized message instead of logging it unbounded', async () => {
    const received: any[] = [];
    setErrorReporter({ report: (event) => received.push(event) } as ErrorReporter);
    try {
      const routes = createTelemetryRoutes(db);
      const hugeMessage = 'x'.repeat(10_000);
      await postClientError(routes, { message: hugeMessage });
      expect(received[0].message.length).toBeLessThan(hugeMessage.length);
      expect(received[0].message).toContain('(truncated)');
    } finally {
      setErrorReporter(new LoggerErrorReporter());
    }
  });
});

describe('GET /api/debug/errors', () => {
  async function makeOrgAdmin(userId: string) {
    const orgId = 'org-debug-errors-' + Date.now() + '-' + userId;
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: 'Debug Org', slug: orgId, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: 'admin', joinedAt: new Date() });
  }

  it('rejects an unauthenticated request', async () => {
    const routes = createTelemetryRoutes(db);
    const res = await routes.handle(new Request('http://localhost/api/debug/errors'));
    expect(res.status).toBe(401);
  });

  it('rejects an authenticated caller who is not an admin of any organization', async () => {
    const userId = 'user-debug-nonadmin-' + Date.now();
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    const token = createSessionToken(userId);

    const routes = createTelemetryRoutes(db);
    const res = await routes.handle(new Request('http://localhost/api/debug/errors', {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(403);
  });

  it('reports a 500, not a 403, when the admin check itself fails for a non-authorization reason', async () => {
    const userId = 'user-debug-dbfail-' + Date.now();
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    const token = createSessionToken(userId);

    // A broken db.select (e.g. a transient DB outage) must not be
    // misreported as "you're not an admin" - only a genuine
    // PermissionDenied from assertOrgAdminOfAny should map to 403.
    const brokenDb = { select: () => { throw new Error('connection refused'); } };

    const routes = createTelemetryRoutes(brokenDb);
    const res = await routes.handle(new Request('http://localhost/api/debug/errors', {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(500);
  });

  it('returns recently reported errors (most recent first) to an org admin', async () => {
    const userId = 'user-debug-admin-' + Date.now();
    await makeOrgAdmin(userId);
    const token = createSessionToken(userId);

    setErrorReporter(new LoggerErrorReporter());
    const { reportError } = await import('../../lib/errorReporter');
    reportError({ message: 'first error', err: new Error('boom-1'), severity: 'error' });
    reportError({ message: 'second error', err: new Error('boom-2'), severity: 'fatal' });

    const routes = createTelemetryRoutes(db);
    const res = await routes.handle(new Request('http://localhost/api/debug/errors', {
      headers: { authorization: `Bearer ${token}` },
    }));

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.errors.length).toBeGreaterThanOrEqual(2);
    expect(body.errors[0].message).toBe('second error');
    expect(body.errors[0].severity).toBe('fatal');
    expect(body.errors[1].message).toBe('first error');
  });
});
