import { describe, it, expect, mock, afterEach } from 'bun:test';
import { authRoutes } from './auth';

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
    expect(res.headers.get('set-cookie')).toContain('SESSION_testuser123_');
    expect(res.headers.get('set-cookie')).toContain('HttpOnly');
    
    globalThis.fetch = originalFetch;
  });
});
