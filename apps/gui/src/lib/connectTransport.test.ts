import { describe, it, expect, vi, afterEach } from 'vitest';

let capturedOptions: any;
vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn((opts: any) => {
    capturedOptions = opts;
    return {};
  }),
}));

describe('connectTransport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('configures the transport with the backend base URL and credentials', async () => {
    await import('./connectTransport');
    expect(capturedOptions.baseUrl).toBe('http://localhost:8080');
    expect(capturedOptions.interceptors).toHaveLength(1);
  });

  it('the request-logging interceptor stamps a request id and logs failures', async () => {
    await import('./connectTransport');
    const interceptor = capturedOptions.interceptors[0];

    const req = {
      header: new Headers(),
      method: { name: 'GetIdentity', parent: { typeName: 'tasker.health.v1.AuthService' } },
    };

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const next = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(interceptor(next)(req)).rejects.toThrow('boom');
    expect(req.header.get('x-request-id')).toBeTruthy();
    expect(spy).toHaveBeenCalled();
  });

  it('does not report a request the caller cancelled', async () => {
    await import('./connectTransport');
    const interceptor = capturedOptions.interceptors[0];
    const controller = new AbortController();
    controller.abort();
    const req = {
      header: new Headers(),
      signal: controller.signal,
      method: { name: 'SubscribeEvents', parent: { typeName: 'tasker.health.v1.EventService' } },
    };

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const abort = Object.assign(new Error('signal is aborted without reason'), { name: 'AbortError' });
    const next = vi.fn().mockRejectedValue(abort);

    await expect(interceptor(next)(req)).rejects.toBe(abort);
    expect(spy).not.toHaveBeenCalled();
  });
});
