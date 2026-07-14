import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { reportError, setErrorReporter, RemoteErrorReporter, type ErrorReporter } from './errorReporter';
import { BACKEND_URL } from './backendUrl';

describe('errorReporter', () => {
  afterEach(() => {
    setErrorReporter(new RemoteErrorReporter());
  });

  it('routes reported events through the active reporter', () => {
    const received: any[] = [];
    const fake: ErrorReporter = { report: (event) => received.push(event) };
    setErrorReporter(fake);

    reportError({ message: 'something broke', err: new Error('boom'), severity: 'error' });

    expect(received).toHaveLength(1);
    expect(received[0].message).toBe('something broke');
  });

  it('defaults to logging to the console', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError({ message: 'default sink', severity: 'error' });
    expect(spy).toHaveBeenCalled();
  });
});

describe('RemoteErrorReporter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('POSTs the error report to the backend client-errors endpoint', () => {
    new RemoteErrorReporter().report({
      message: 'window.onerror',
      err: new TypeError('x is not a function'),
      severity: 'error',
      context: { url: '/tasks' },
    });

    expect(fetch).toHaveBeenCalledWith(`${BACKEND_URL}/api/client-errors`, expect.objectContaining({
      method: 'POST',
      keepalive: true,
    }));
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.message).toBe('window.onerror');
    expect(body.severity).toBe('error');
    expect(body.errName).toBe('TypeError');
    expect(body.context).toEqual({ url: '/tasks' });
  });

  it('still logs to console even if the backend POST fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    new RemoteErrorReporter().report({ message: 'oops', severity: 'error' });

    expect(spy).toHaveBeenCalled();
    // Let the swallowed rejection settle so it doesn't leak into other tests.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('does not throw when err is not an Error instance', () => {
    expect(() => new RemoteErrorReporter().report({ message: 'weird', err: 'a string error', severity: 'error' })).not.toThrow();
  });
});
