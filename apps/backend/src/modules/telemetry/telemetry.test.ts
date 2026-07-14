import { describe, it, expect } from 'bun:test';
import { createTelemetryRoutes } from './telemetry';
import { setErrorReporter, LoggerErrorReporter, type ErrorReporter } from '../../lib/errorReporter';

function postClientError(routes: ReturnType<typeof createTelemetryRoutes>, body: unknown) {
  return routes.handle(new Request('http://localhost/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('POST /api/client-errors', () => {
  it('routes a valid client error report through reportError with source: client', async () => {
    const received: any[] = [];
    setErrorReporter({ report: (event) => received.push(event) } as ErrorReporter);
    try {
      const routes = createTelemetryRoutes();
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
    const routes = createTelemetryRoutes();
    const res = await postClientError(routes, { severity: 'error' });
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const body = await res.json();
    expect(body).toMatchObject({ title: 'Invalid client error report', status: 400 });
  });

  it('defaults an invalid/missing severity to "error" rather than rejecting', async () => {
    const received: any[] = [];
    setErrorReporter({ report: (event) => received.push(event) } as ErrorReporter);
    try {
      const routes = createTelemetryRoutes();
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
      const routes = createTelemetryRoutes();
      const hugeMessage = 'x'.repeat(10_000);
      await postClientError(routes, { message: hugeMessage });
      expect(received[0].message.length).toBeLessThan(hugeMessage.length);
      expect(received[0].message).toContain('(truncated)');
    } finally {
      setErrorReporter(new LoggerErrorReporter());
    }
  });
});
