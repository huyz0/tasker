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

  it('reports the authenticated user for a Bearer token, same as every RPC, even with no cookie jar', async () => {
    const token = createSessionToken('user-cli-42');
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/session', {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(await res.json()).toEqual({ authenticated: true, userId: 'user-cli-42' });
  });
});

describe('Auth logout', () => {
  it('clears the session cookie on /api/auth/logout', async () => {
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/logout', { method: 'POST' }));
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toContain('session=;');
    expect(setCookie).toContain('Max-Age=0');
  });

  it('leaves the caller unauthenticated when checking session status after logout', async () => {
    const token = createSessionToken('user-42');
    const logoutRes = await authRoutes.handle(new Request('http://localhost/api/auth/logout', { method: 'POST' }));
    const clearedCookie = logoutRes.headers.get('set-cookie')!.split(';')[0];

    const sessionRes = await authRoutes.handle(new Request('http://localhost/api/auth/session', {
      headers: { cookie: clearedCookie || `session=${token}` },
    }));
    expect(await sessionRes.json()).toEqual({ authenticated: false, userId: null });
  });
});

/**
 * Extracts the `state` query param a /login redirect sent to Google, plus
 * the oauth_state cookie it set - the two pieces the callback needs to
 * complete a legitimate flow (and that a CSRF attempt can't produce
 * together, since it never received our set-cookie response).
 */
function extractLoginFlow(loginRes: Response): { state: string; cookie: string } {
  const location = loginRes.headers.get('location')!;
  const state = new URL(location).searchParams.get('state')!;
  const cookie = loginRes.headers.get('set-cookie')!;
  return { state, cookie };
}

describe('Auth Routes (Google OAuth 2.1)', () => {
  it('should redirect to Google consent screen on /api/auth/google/login', async () => {
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(res.headers.get('location')).toContain('state=web%3A');
  });

  it('should set an HttpOnly oauth_state cookie binding the callback to this browser session', async () => {
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain('oauth_state=');
    expect(cookie).toContain('HttpOnly');
  });

  it('should carry a cli state flag through the consent screen redirect when ?cli=true', async () => {
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/google/login?cli=true'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('state=cli%3A');
  });

  it('should reject the callback when the state param does not match the oauth_state cookie (login CSRF)', async () => {
    const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    const { cookie } = extractLoginFlow(loginRes);

    const res = await authRoutes.handle(new Request('http://localhost/api/auth/google/callback?code=123&state=web:attacker-supplied-nonce', {
      headers: { cookie },
    }));
    expect(res.status).toBe(400);
  });

  it('should reject the callback when there is no oauth_state cookie at all', async () => {
    const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    const { state } = extractLoginFlow(loginRes);

    const res = await authRoutes.handle(new Request(`http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`));
    expect(res.status).toBe(400);
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

    const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    const { state, cookie: stateCookie } = extractLoginFlow(loginRes);

    // MOCK: Sending a fake code '123' to the callback, with the state/cookie
    // pair a real browser would carry from the /login redirect.
    const req = new Request(`http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`, {
      headers: { cookie: stateCookie },
    });
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

    const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    const { state, cookie: stateCookie } = extractLoginFlow(loginRes);
    const res = await authRoutes.handle(new Request(`http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`, {
      headers: { cookie: stateCookie },
    }));
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

    const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login?cli=true'));
    const { state, cookie: stateCookie } = extractLoginFlow(loginRes);
    const req = new Request(`http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`, {
      headers: { cookie: stateCookie },
    });
    const res = await authRoutes.handle(req);

    expect(res.status).toBe(302);
    // No session cookie for the CLI flow - only the oauth_state cookie gets cleared.
    expect(res.headers.get('set-cookie')).not.toContain('session=');
    const location = res.headers.get('location')!;
    expect(location).toStartWith('http://localhost:3952/callback?token=');
    const token = new URL(location).searchParams.get('token')!;
    expect(verifySessionToken(token)?.userId).toBe('cli-user-1');

    globalThis.fetch = originalFetch;
  });

  it('should echo the CLI-supplied cliNonce back on the localhost callback', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | Request | URL, options?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'mock_access_token' }), { status: 200 });
      }
      if (urlStr === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return new Response(JSON.stringify({ id: 'cli-user-2', email: 'cli2@example.com' }), { status: 200 });
      }
      return originalFetch(url, options);
    }) as unknown as typeof fetch;

    const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login?cli=true&cliNonce=my-cli-nonce'));
    const { state, cookie: stateCookie } = extractLoginFlow(loginRes);
    expect(state).toContain(':my-cli-nonce');

    const req = new Request(`http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`, {
      headers: { cookie: stateCookie },
    });
    const res = await authRoutes.handle(req);

    const location = res.headers.get('location')!;
    expect(new URL(location).searchParams.get('nonce')).toBe('my-cli-nonce');

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

  it('should set the session cookie to survive a browser restart, not just the current session', async () => {
    const originalEnable = require('../../config').config.enableTestLogin;
    require('../../config').config.enableTestLogin = true;

    const res = await authRoutes.handle(new Request('http://localhost/api/auth/test/inject?userId=u1'));
    const cookie = res.headers.get('set-cookie')!;
    // Without Max-Age/Expires, browsers treat this as a session cookie and
    // drop it on browser close, even though the JWT itself stays valid for
    // SESSION_TTL_MS (7 days) - so persistent login never actually happens.
    expect(cookie).toMatch(/Max-Age=\d+/);
    const maxAge = Number(cookie.match(/Max-Age=(\d+)/)![1]);
    expect(maxAge).toBeGreaterThan(6 * 24 * 60 * 60); // close to 7 days, allowing for rounding

    require('../../config').config.enableTestLogin = originalEnable;
  });
});
