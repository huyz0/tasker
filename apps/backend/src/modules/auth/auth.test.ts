import { describe, it, expect } from 'bun:test';
import { authRoutes } from './auth';

describe('Auth Routes (Google OAuth 2.1)', () => {
  it('should redirect to Google consent screen on /api/auth/google/login', async () => {
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('accounts.google.com/o/oauth2/v2/auth');
  });

  it('should issue a session cookie and redirect to dashboard on /api/auth/google/callback', async () => {
    // MOCK: Sending a fake code '123' to the callback
    const req = new Request('http://localhost/api/auth/google/callback?code=123');
    const res = await authRoutes.handle(req);
    
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    // Check if Set-Cookie header is properly applied
    expect(res.headers.get('set-cookie')).toContain('MOCK_JWT_OR_SESSION_TOKEN');
    expect(res.headers.get('set-cookie')).toContain('HttpOnly');
  });
});
