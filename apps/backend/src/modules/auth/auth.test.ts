import { describe, it, expect, mock, afterEach } from 'bun:test';
import { authRoutes } from './auth';
import { createSessionToken, parseSessionCookie, verifySessionToken } from './session';

describe('Auth session status', () => {
  it('reports unauthenticated when there is no session cookie', async () => {
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/session'));
    expect(await res.json()).toEqual({ authenticated: false, userId: null });
  });

  it('reports the authenticated user when a valid session cookie is present', async () => {
    const token = createSessionToken('user-42');
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/session', {
      headers: { cookie: `session=${token}` },
    }));
    expect(await res.json()).toEqual({ authenticated: true, userId: 'user-42' });
  });
});

describe('Auth Routes (Google OAuth 2.1)', () => {
  it('should redirect to Google consent screen on /api/auth/google/login', async () => {
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('accounts.google.com/o/oauth2/v2/auth');
  });

  afterEach(() => {
    mock.restore();
  });

  it('should issue a session cookie and redirect to dashboard on /api/auth/google/callback', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | Request | URL, options?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'mock_access_token' }), { status: 200 });
      }
      if (urlStr === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return new Response(JSON.stringify({ id: 'testuser123', email: 'test@example.com' }), { status: 200 });
      }
      return originalFetch(url, options);
    }) as unknown as typeof fetch;

    // MOCK: Sending a fake code '123' to the callback
    const req = new Request('http://localhost/api/auth/google/callback?code=123');
    const res = await authRoutes.handle(req);
    
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    // Check if Set-Cookie header is properly applied
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain('HttpOnly');
    const session = verifySessionToken(parseSessionCookie(cookie)!);
    expect(session?.userId).toBe('testuser123');

    globalThis.fetch = originalFetch;
  });

  it('should allow cookie injection when test login is enabled', async () => {
    const originalEnable = require('../../config').config.enableTestLogin;
    require('../../config').config.enableTestLogin = true;

    const req = new Request('http://localhost/api/auth/test/inject?userId=admin999');
    const res = await authRoutes.handle(req);

    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie');
    const session = verifySessionToken(parseSessionCookie(cookie)!);
    expect(session?.userId).toBe('admin999');

    require('../../config').config.enableTestLogin = originalEnable;
  });

  it('should block cookie injection when test login is disabled', async () => {
    const originalEnable = require('../../config').config.enableTestLogin;
    require('../../config').config.enableTestLogin = false;

    const req = new Request('http://localhost/api/auth/test/inject?userId=admin999');
    const res = await authRoutes.handle(req);

    expect(res.status).toBe(403);
    expect(res.headers.get('set-cookie')).toBeNull();

    require('../../config').config.enableTestLogin = originalEnable;
  });

  it('should mark the session cookie Secure in production, but not otherwise', async () => {
    const cfg = require('../../config').config;
    const original = { enableTestLogin: cfg.enableTestLogin, nodeEnv: cfg.nodeEnv };
    cfg.enableTestLogin = true;

    cfg.nodeEnv = 'production';
    const prodRes = await authRoutes.handle(new Request('http://localhost/api/auth/test/inject?userId=u1'));
    expect(prodRes.headers.get('set-cookie')).toContain('Secure');

    cfg.nodeEnv = 'development';
    const devRes = await authRoutes.handle(new Request('http://localhost/api/auth/test/inject?userId=u1'));
    expect(devRes.headers.get('set-cookie')).not.toContain('Secure');

    cfg.enableTestLogin = original.enableTestLogin;
    cfg.nodeEnv = original.nodeEnv;
  });
});
