import { describe, it, expect, mock, afterEach, beforeEach } from 'bun:test';
import { createAuthRoutes } from './auth';
import { createSessionToken, parseSessionCookie, verifySessionToken } from './session';
import { setupIntegrationTest } from '../../test/setup';
import * as schemaSqlite from '../../db/schema.sqlite';
import { eq } from 'drizzle-orm';

let db: any;
let authRoutes: ReturnType<typeof createAuthRoutes>;

beforeEach(async () => {
  const setup = await setupIntegrationTest();
  db = setup.db;
  authRoutes = createAuthRoutes(db);
});

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
    expect(res.headers.get('location')).not.toContain('state=');
  });

  it('should carry a cli state flag through the consent screen redirect when ?cli=true', async () => {
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/google/login?cli=true'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('state=cli');
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

    // Login must persist a users row - previously it never did, so
    // getIdentity and every users.id foreign key would only work for rows a
    // test had inserted by hand.
    const userRows = await db.select().from(schemaSqlite.users).where(eq(schemaSqlite.users.id, 'testuser123'));
    expect(userRows).toHaveLength(1);
    expect(userRows[0].email).toBe('test@example.com');

    globalThis.fetch = originalFetch;
  });

  it('should accept a pending invitation matching the logged-in email, joining the invited org', async () => {
    await db.insert(schemaSqlite.organizations).values({ id: 'org-invited', name: 'Invited Org', slug: 'invited-org', createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: 'inviter-1', email: 'inviter@example.com', createdAt: new Date() });
    await db.insert(schemaSqlite.invitations).values({
      id: 'inv-1',
      orgId: 'org-invited',
      email: 'invitee@example.com',
      invitedBy: 'inviter-1',
      createdAt: new Date(),
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | Request | URL, options?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'mock_access_token' }), { status: 200 });
      }
      if (urlStr === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return new Response(JSON.stringify({ id: 'invitee-user-1', email: 'invitee@example.com' }), { status: 200 });
      }
      return originalFetch(url, options);
    }) as unknown as typeof fetch;

    const res = await authRoutes.handle(new Request('http://localhost/api/auth/google/callback?code=123'));
    expect(res.status).toBe(302);

    const membership = await db.select().from(schemaSqlite.organizationMembers)
      .where(eq(schemaSqlite.organizationMembers.userId, 'invitee-user-1'));
    expect(membership).toHaveLength(1);
    expect(membership[0].orgId).toBe('org-invited');
    expect(membership[0].role).toBe('member');

    // The invitation is consumed on acceptance, not left dangling.
    const remainingInvites = await db.select().from(schemaSqlite.invitations).where(eq(schemaSqlite.invitations.id, 'inv-1'));
    expect(remainingInvites).toHaveLength(0);

    globalThis.fetch = originalFetch;
  });

  it('should hand off a bearer token to the CLI local callback instead of a cookie when state=cli', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | Request | URL, options?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'mock_access_token' }), { status: 200 });
      }
      if (urlStr === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return new Response(JSON.stringify({ id: 'cli-user-1', email: 'cli@example.com' }), { status: 200 });
      }
      return originalFetch(url, options);
    }) as unknown as typeof fetch;

    const req = new Request('http://localhost/api/auth/google/callback?code=123&state=cli');
    const res = await authRoutes.handle(req);

    expect(res.status).toBe(302);
    expect(res.headers.get('set-cookie')).toBeNull();
    const location = res.headers.get('location')!;
    expect(location).toStartWith('http://localhost:3952/callback?token=');
    const token = new URL(location).searchParams.get('token')!;
    expect(verifySessionToken(token)?.userId).toBe('cli-user-1');

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
