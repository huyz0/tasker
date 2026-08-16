import { describe, it, expect, mock, afterEach, beforeEach } from 'bun:test';
import { createAuthRoutes } from './auth';
import { createSessionToken, parseSessionCookie, verifySessionToken } from './session';
import { isSessionRevoked } from '../../lib/sessionRevocation';
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

  it('records the jti in revokedSessions so it revokes for real, not just clearing the cookie', async () => {
    const token = createSessionToken('user-revoke-logout');
    const payload = verifySessionToken(token)!;
    expect(await isSessionRevoked(db, payload.jti)).toBe(false);

    await authRoutes.handle(new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { cookie: `session=${token}` },
    }));

    expect(await isSessionRevoked(db, payload.jti)).toBe(true);
  });

  it('rejects a revoked token presented directly as a Bearer header, even without the cookie', async () => {
    const token = createSessionToken('user-revoke-bearer');
    await authRoutes.handle(new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    }));

    const res = await authRoutes.handle(new Request('http://localhost/api/auth/session', {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(await res.json()).toEqual({ authenticated: false, userId: null });
  });

  it('is a no-op when logging out with no active session (no token to revoke)', async () => {
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/logout', { method: 'POST' }));
    expect(res.status).toBe(204);
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

  it('should surface a 400 when Google reports an error on the callback (e.g. the user denied consent)', async () => {
    const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    const { state, cookie } = extractLoginFlow(loginRes);

    const res = await authRoutes.handle(new Request(`http://localhost/api/auth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`, {
      headers: { cookie },
    }));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('access_denied');
  });

  it('should reject the callback when no code is provided', async () => {
    const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    const { state, cookie } = extractLoginFlow(loginRes);

    const res = await authRoutes.handle(new Request(`http://localhost/api/auth/google/callback?state=${encodeURIComponent(state)}`, {
      headers: { cookie },
    }));
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

  it('should return 500 (not crash or leak internals) when Google rejects the token exchange', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | Request | URL, options?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr === 'https://oauth2.googleapis.com/token') {
        return new Response('', { status: 401 });
      }
      return originalFetch(url, options);
    }) as unknown as typeof fetch;

    const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    const { state, cookie: stateCookie } = extractLoginFlow(loginRes);
    const res = await authRoutes.handle(new Request(`http://localhost/api/auth/google/callback?code=bad-code&state=${encodeURIComponent(state)}`, {
      headers: { cookie: stateCookie },
    }));

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Authentication failed due to server error');

    globalThis.fetch = originalFetch;
  });

  it('should return 500 when the token exchange succeeds but fetching the user profile fails', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | Request | URL, options?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'mock_access_token' }), { status: 200 });
      }
      if (urlStr === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return new Response('', { status: 401 });
      }
      return originalFetch(url, options);
    }) as unknown as typeof fetch;

    const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    const { state, cookie: stateCookie } = extractLoginFlow(loginRes);
    const res = await authRoutes.handle(new Request(`http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`, {
      headers: { cookie: stateCookie },
    }));

    expect(res.status).toBe(500);

    globalThis.fetch = originalFetch;
  });

  it('should update an existing user\'s name/avatar on a returning login instead of only inserting on first login', async () => {
    await db.insert(schemaSqlite.users).values({
      id: 'returning-user-1', email: 'returning@example.com', name: 'Old Name', avatarUrl: 'old-avatar.png', createdAt: new Date(),
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | Request | URL, options?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'mock_access_token' }), { status: 200 });
      }
      if (urlStr === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return new Response(JSON.stringify({ id: 'returning-user-1', email: 'returning@example.com', name: 'New Name', picture: 'new-avatar.png' }), { status: 200 });
      }
      return originalFetch(url, options);
    }) as unknown as typeof fetch;

    const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    const { state, cookie: stateCookie } = extractLoginFlow(loginRes);
    const res = await authRoutes.handle(new Request(`http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`, {
      headers: { cookie: stateCookie },
    }));
    expect(res.status).toBe(302);

    const userRows = await db.select().from(schemaSqlite.users).where(eq(schemaSqlite.users.id, 'returning-user-1'));
    expect(userRows).toHaveLength(1);
    expect(userRows[0].name).toBe('New Name');
    expect(userRows[0].avatarUrl).toBe('new-avatar.png');

    globalThis.fetch = originalFetch;
  });

  /**
   * M03-T11. An invitation with no expiry was a standing key to the
   * organization: an address invited once could be redeemed at any point
   * afterwards, including long after whoever sent it had left.
   */
  const loginAs = async (userId: string, email: string) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | Request | URL, options?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'mock_access_token' }), { status: 200 });
      }
      if (urlStr === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return new Response(JSON.stringify({ id: userId, email }), { status: 200 });
      }
      return originalFetch(url, options);
    }) as unknown as typeof fetch;

    const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    const { state, cookie: stateCookie } = extractLoginFlow(loginRes);
    const res = await authRoutes.handle(new Request(`http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`, {
      headers: { cookie: stateCookie },
    }));
    globalThis.fetch = originalFetch;
    return res;
  };

  const seedInvite = async (id: string, email: string, expiresAt: Date | null) => {
    await db.insert(schemaSqlite.organizations).values({ id: `org-${id}`, name: `Org ${id}`, slug: `org-${id}`, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: `inviter-${id}`, email: `inviter-${id}@example.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.invitations).values({
      id, orgId: `org-${id}`, email, invitedBy: `inviter-${id}`, createdAt: new Date(), expiresAt,
    });
  };

  it('does not join a user on an expired invitation', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await seedInvite('inv-expired', 'lapsed@example.com', yesterday);

    const res = await loginAs('lapsed-user', 'lapsed@example.com');
    expect(res.status).toBe(302); // login itself still succeeds

    const membership = await db.select().from(schemaSqlite.organizationMembers)
      .where(eq(schemaSqlite.organizationMembers.userId, 'lapsed-user'));
    expect(membership).toHaveLength(0);
  });

  it('leaves an expired invitation in place rather than consuming it', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await seedInvite('inv-kept', 'kept@example.com', yesterday);

    await loginAs('kept-user', 'kept@example.com');

    // Deleting it here would make the invitation vanish at the exact moment
    // the person finally tried to use it, and hide from the admin that it
    // lapsed unredeemed.
    const remaining = await db.select().from(schemaSqlite.invitations).where(eq(schemaSqlite.invitations.id, 'inv-kept'));
    expect(remaining).toHaveLength(1);
  });

  it('still joins on an invitation that has not expired yet', async () => {
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await seedInvite('inv-live', 'live@example.com', nextWeek);

    await loginAs('live-user', 'live@example.com');

    const membership = await db.select().from(schemaSqlite.organizationMembers)
      .where(eq(schemaSqlite.organizationMembers.userId, 'live-user'));
    expect(membership).toHaveLength(1);
  });

  it('honours an invitation issued before expiry existed', async () => {
    // Rows predating the migration have a null expiresAt. Treating null as
    // "expired at the epoch" would have revoked every outstanding invitation
    // the moment the migration ran.
    await seedInvite('inv-legacy', 'legacy@example.com', null);

    await loginAs('legacy-user', 'legacy@example.com');

    const membership = await db.select().from(schemaSqlite.organizationMembers)
      .where(eq(schemaSqlite.organizationMembers.userId, 'legacy-user'));
    expect(membership).toHaveLength(1);
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
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const body = await res.json();
    expect(body).toMatchObject({ title: 'Test login disabled', status: 403 });

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

/**
 * M13-T06. `email` in these fixtures is deliberately used only where the
 * test is *about* email interaction (invitations); most cases register with
 * none at all, since "no email, no Google account" is this milestone's own
 * exit criterion.
 */
describe('Auth Routes (local password)', () => {
  const register = (body: Record<string, unknown>) =>
    authRoutes.handle(new Request('http://localhost/api/auth/password/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));

  const login = (body: Record<string, unknown>) =>
    authRoutes.handle(new Request('http://localhost/api/auth/password/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));

  it('registers a user with only a username and password — no email, no Google identity at all', async () => {
    const res = await register({ username: 'no-email-user', password: 'a-strong-password-123' });
    expect(res.status).toBe(201);
    const { userId } = await res.json();

    const rows = await db.select().from(schemaSqlite.users).where(eq(schemaSqlite.users.id, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBeNull();
    expect(rows[0].username).toBe('no-email-user');

    const creds = await db.select().from(schemaSqlite.passwordCredentials)
      .where(eq(schemaSqlite.passwordCredentials.userId, userId));
    expect(creds).toHaveLength(1);
    expect(creds[0].passwordHash).not.toContain('a-strong-password-123');
  });

  it('sets a session cookie on registration, the same shape Google login sets', async () => {
    const res = await register({ username: 'cookie-check-user', password: 'a-strong-password-123' });
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    const session = verifySessionToken(parseSessionCookie(cookie)!);
    expect(session?.userId).toBeTruthy();
  });

  it('logs a locally-registered user back in with their username and password', async () => {
    await register({ username: 'login-check-user', password: 'a-strong-password-123' });
    const res = await login({ username: 'login-check-user', password: 'a-strong-password-123' });
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie')!;
    const session = verifySessionToken(parseSessionCookie(cookie)!);

    const rows = await db.select().from(schemaSqlite.users).where(eq(schemaSqlite.users.username, 'login-check-user'));
    expect(session?.userId).toBe(rows[0].id);
  });

  it('rejects the wrong password with a generic message, not "wrong password" specifically', async () => {
    await register({ username: 'wrong-pw-user', password: 'a-strong-password-123' });
    const res = await login({ username: 'wrong-pw-user', password: 'totally-different-password' });
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects an unknown username with the same generic message as a wrong password', async () => {
    const wrongPw = await login({ username: 'nobody-registered-this', password: 'irrelevant-password-1' });
    const wrongUser = await (async () => {
      await register({ username: 'known-user', password: 'a-strong-password-123' });
      return login({ username: 'known-user', password: 'wrong-one-entirely' });
    })();
    const [a, b] = await Promise.all([wrongPw.json(), wrongUser.json()]);
    expect(a.title).toBe(b.title);
    expect(wrongPw.status).toBe(401);
    expect(wrongUser.status).toBe(401);
  });

  it('refuses to log in via password for a Google-only account that has never set one', async () => {
    await db.insert(schemaSqlite.users).values({
      id: 'google-only-1', email: 'g@example.com', username: 'google-only-1', createdAt: new Date(),
    });
    const res = await login({ username: 'google-only-1', password: 'anything-at-all-123' });
    expect(res.status).toBe(401);
  });

  it('refuses a username already taken', async () => {
    await register({ username: 'taken-name', password: 'a-strong-password-123' });
    const res = await register({ username: 'taken-name', password: 'a-different-password-456' });
    expect(res.status).toBe(400);
  });

  it('refuses a password shorter than the minimum', async () => {
    const res = await register({ username: 'short-pw-user', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('refuses a request missing username or password entirely', async () => {
    expect((await register({ password: 'a-strong-password-123' })).status).toBe(400);
    expect((await register({ username: 'no-password-user' })).status).toBe(400);
    expect((await login({ password: 'a-strong-password-123' })).status).toBe(400);
  });

  it('accepts an optional email on registration and stores it', async () => {
    const res = await register({ username: 'has-email-user', password: 'a-strong-password-123', email: 'has-email@example.com' });
    expect(res.status).toBe(201);
    const { userId } = await res.json();
    const rows = await db.select().from(schemaSqlite.users).where(eq(schemaSqlite.users.id, userId));
    expect(rows[0].email).toBe('has-email@example.com');
  });

  it('consumes a pending email invitation on local registration, same as Google login does', async () => {
    await db.insert(schemaSqlite.organizations).values({ id: 'org-local-invite', name: 'Org', slug: 'org-local-invite', createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: 'inviter-local', email: 'inviter-local@example.com', createdAt: new Date() });
    await db.insert(schemaSqlite.invitations).values({
      id: 'inv-local', orgId: 'org-local-invite', email: 'invitee-local@example.com', invitedBy: 'inviter-local', role: 'admin', createdAt: new Date(),
    });

    const res = await register({ username: 'invitee-local-user', password: 'a-strong-password-123', email: 'invitee-local@example.com' });
    const { userId } = await res.json();

    const membership = await db.select().from(schemaSqlite.organizationMembers)
      .where(eq(schemaSqlite.organizationMembers.userId, userId));
    expect(membership).toHaveLength(1);
    expect(membership[0].orgId).toBe('org-local-invite');
    expect(membership[0].role).toBe('admin');
  });

  /** M13-T09. */
  it('consumes a pending username-only invitation on local registration', async () => {
    await db.insert(schemaSqlite.organizations).values({ id: 'org-username-invite', name: 'Org', slug: 'org-username-invite', createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: 'inviter-username', email: 'inviter-username@example.com', createdAt: new Date() });
    await db.insert(schemaSqlite.invitations).values({
      id: 'inv-username', orgId: 'org-username-invite', username: 'invited-handle', invitedBy: 'inviter-username', role: 'viewer', createdAt: new Date(),
    });

    const res = await register({ username: 'invited-handle', password: 'a-strong-password-123' });
    const { userId } = await res.json();

    const membership = await db.select().from(schemaSqlite.organizationMembers)
      .where(eq(schemaSqlite.organizationMembers.userId, userId));
    expect(membership).toHaveLength(1);
    expect(membership[0].orgId).toBe('org-username-invite');
    expect(membership[0].role).toBe('viewer');

    const remaining = await db.select().from(schemaSqlite.invitations).where(eq(schemaSqlite.invitations.id, 'inv-username'));
    expect(remaining).toHaveLength(0);
  });

  it('does not consume a username-only invitation for a different username', async () => {
    await db.insert(schemaSqlite.organizations).values({ id: 'org-username-mismatch', name: 'Org', slug: 'org-username-mismatch', createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: 'inviter-mismatch', email: 'inviter-mismatch@example.com', createdAt: new Date() });
    await db.insert(schemaSqlite.invitations).values({
      id: 'inv-mismatch', orgId: 'org-username-mismatch', username: 'the-invited-one', invitedBy: 'inviter-mismatch', createdAt: new Date(),
    });

    const res = await register({ username: 'a-completely-different-user', password: 'a-strong-password-123' });
    const { userId } = await res.json();
    const membership = await db.select().from(schemaSqlite.organizationMembers)
      .where(eq(schemaSqlite.organizationMembers.userId, userId));
    expect(membership).toHaveLength(0);
  });

  it('does NOT consume a username-only invitation via Google login — a derived username is not a real match', async () => {
    await db.insert(schemaSqlite.organizations).values({ id: 'org-username-google', name: 'Org', slug: 'org-username-google', createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: 'inviter-google-username', email: 'inviter-gu@example.com', createdAt: new Date() });
    // The exact username deriveUsernameFromEmail would produce for this
    // profile, to prove the Google path never even tries to match by
    // username, not merely that some unrelated username doesn't hit.
    await db.insert(schemaSqlite.invitations).values({
      id: 'inv-google-username', orgId: 'org-username-google', username: 'newgoogleuser-google-new-guser-1',
      invitedBy: 'inviter-google-username', createdAt: new Date(),
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'mock_access_token' }), { status: 200 });
      }
      if (urlStr === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return new Response(JSON.stringify({ id: 'google-new-guser-1', email: 'newgoogleuser@example.com' }), { status: 200 });
      }
      return originalFetch(url);
    }) as unknown as typeof fetch;

    const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    const { state, cookie: stateCookie } = extractLoginFlow(loginRes);
    const res = await authRoutes.handle(new Request(
      `http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`,
      { headers: { cookie: stateCookie } },
    ));
    globalThis.fetch = originalFetch;

    expect(res.status).toBe(302);
    const membership = await db.select().from(schemaSqlite.organizationMembers)
      .where(eq(schemaSqlite.organizationMembers.userId, 'google-new-guser-1'));
    expect(membership).toHaveLength(0);
  });

  /**
   * M13-T07. The threshold is 5 consecutive failures; these tests drive it
   * directly rather than mocking time, so the lockout math is exercised for
   * real, not asserted about.
   */
  describe('account lockout', () => {
    it('does not lock before the threshold — 4 wrong passwords still just says invalid', async () => {
      await register({ username: 'lockout-under-threshold', password: 'a-strong-password-123' });
      for (let i = 0; i < 4; i++) {
        const res = await login({ username: 'lockout-under-threshold', password: 'wrong' });
        expect(res.status).toBe(401);
      }
      // The 5th attempt with the *correct* password still succeeds — not locked yet.
      const res = await login({ username: 'lockout-under-threshold', password: 'a-strong-password-123' });
      expect(res.status).toBe(200);
    });

    it('locks the account after 5 consecutive failures, returning 429 with Retry-After', async () => {
      await register({ username: 'lockout-user', password: 'a-strong-password-123' });
      for (let i = 0; i < 5; i++) {
        await login({ username: 'lockout-user', password: 'wrong' });
      }
      const res = await login({ username: 'lockout-user', password: 'wrong' });
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBeTruthy();
      const body = await res.json();
      expect(body.title).toBe('Account temporarily locked');
    });

    it('refuses the CORRECT password once locked — lockout is not just "still wrong"', async () => {
      await register({ username: 'lockout-blocks-correct', password: 'a-strong-password-123' });
      for (let i = 0; i < 5; i++) {
        await login({ username: 'lockout-blocks-correct', password: 'wrong' });
      }
      const res = await login({ username: 'lockout-blocks-correct', password: 'a-strong-password-123' });
      expect(res.status).toBe(429);
      expect(res.headers.get('set-cookie')).toBeNull();
    });

    it('does not increment failedAttempts further while already locked', async () => {
      await register({ username: 'lockout-no-double-count', password: 'a-strong-password-123' });
      for (let i = 0; i < 5; i++) {
        await login({ username: 'lockout-no-double-count', password: 'wrong' });
      }
      const rows = await db.select().from(schemaSqlite.users).where(eq(schemaSqlite.users.username, 'lockout-no-double-count'));
      const before = await db.select().from(schemaSqlite.passwordCredentials)
        .where(eq(schemaSqlite.passwordCredentials.userId, rows[0].id));

      await login({ username: 'lockout-no-double-count', password: 'wrong' });
      await login({ username: 'lockout-no-double-count', password: 'wrong' });

      const after = await db.select().from(schemaSqlite.passwordCredentials)
        .where(eq(schemaSqlite.passwordCredentials.userId, rows[0].id));
      expect(after[0].failedAttempts).toBe(before[0].failedAttempts);
    });

    it('resets failedAttempts to 0 on a successful login', async () => {
      await register({ username: 'lockout-resets', password: 'a-strong-password-123' });
      await login({ username: 'lockout-resets', password: 'wrong' });
      await login({ username: 'lockout-resets', password: 'wrong' });
      await login({ username: 'lockout-resets', password: 'a-strong-password-123' }); // succeeds, resets

      const rows = await db.select().from(schemaSqlite.users).where(eq(schemaSqlite.users.username, 'lockout-resets'));
      const creds = await db.select().from(schemaSqlite.passwordCredentials)
        .where(eq(schemaSqlite.passwordCredentials.userId, rows[0].id));
      expect(creds[0].failedAttempts).toBe(0);
      expect(creds[0].lockedUntil).toBeNull();

      // And 4 more wrong passwords afterward still don't re-lock — proves the
      // counter genuinely reset rather than merely not having grown past 5.
      for (let i = 0; i < 4; i++) {
        expect((await login({ username: 'lockout-resets', password: 'wrong' })).status).toBe(401);
      }
    });

    it('unlocks automatically once retryAfterSeconds has actually elapsed', async () => {
      await register({ username: 'lockout-expires', password: 'a-strong-password-123' });
      for (let i = 0; i < 5; i++) {
        await login({ username: 'lockout-expires', password: 'wrong' });
      }
      const locked = await login({ username: 'lockout-expires', password: 'a-strong-password-123' });
      expect(locked.status).toBe(429);

      // Fast-forward past the lockout by writing an already-past lockedUntil
      // directly, rather than sleeping in a test for real wall-clock time.
      const rows = await db.select().from(schemaSqlite.users).where(eq(schemaSqlite.users.username, 'lockout-expires'));
      await db.update(schemaSqlite.passwordCredentials)
        .set({ lockedUntil: new Date(Date.now() - 1000) })
        .where(eq(schemaSqlite.passwordCredentials.userId, rows[0].id));

      const res = await login({ username: 'lockout-expires', password: 'a-strong-password-123' });
      expect(res.status).toBe(200);
    });
  });
});

/**
 * M13-T08. Linking reuses /api/auth/google/callback (the `link:` state
 * prefix) rather than a second registered redirect URI - see auth.ts's
 * comment on /api/auth/google/link for why.
 */
describe('Auth Routes (link/unlink Google)', () => {
  const register = (body: Record<string, unknown>) =>
    authRoutes.handle(new Request('http://localhost/api/auth/password/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));

  const mockGoogle = (profile: { id: string; email: string }) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'mock_access_token' }), { status: 200 });
      }
      if (urlStr === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return new Response(JSON.stringify(profile), { status: 200 });
      }
      return originalFetch(url);
    }) as unknown as typeof fetch;
    return () => { globalThis.fetch = originalFetch; };
  };

  const registerAndGetSession = async (username: string) => {
    const res = await register({ username, password: 'a-strong-password-123' });
    const cookie = res.headers.get('set-cookie')!.split(';')[0];
    const { userId } = await res.json();
    return { cookie, userId };
  };

  it('refuses to start a link flow with no session', async () => {
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/google/link'));
    expect(res.status).toBe(401);
  });

  it('redirects to Google consent with a link: state when authenticated', async () => {
    const { cookie } = await registerAndGetSession('link-flow-start');
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/google/link', {
      headers: { cookie },
    }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(res.headers.get('location')).toContain('state=link%3A');
    expect(res.headers.get('set-cookie')).toContain('oauth_state=');
  });

  it('links a Google identity to the already-logged-in local account, not a new one', async () => {
    const { cookie, userId } = await registerAndGetSession('link-flow-success');
    const linkRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/link', { headers: { cookie } }));
    const { state, cookie: stateCookie } = extractLoginFlow(linkRes);

    const restoreFetch = mockGoogle({ id: 'google-linked-1', email: 'linked@example.com' });
    const combinedCookie = `${cookie}; ${stateCookie}`;
    const callbackRes = await authRoutes.handle(new Request(
      `http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`,
      { headers: { cookie: combinedCookie } },
    ));
    restoreFetch();

    expect(callbackRes.status).toBe(302);
    // No session cookie set by the link callback - the caller was already
    // logged in; linking must not silently rotate their session.
    expect(callbackRes.headers.get('set-cookie')).not.toContain('session=');

    const links = await db.select().from(schemaSqlite.linkedIdentities)
      .where(eq(schemaSqlite.linkedIdentities.userId, userId));
    expect(links).toHaveLength(1);
    expect(links[0].provider).toBe('google');
    expect(links[0].providerUserId).toBe('google-linked-1');

    // And no second `users` row was created for the Google identity.
    const allUsersWithThatId = await db.select().from(schemaSqlite.users)
      .where(eq(schemaSqlite.users.id, 'google-linked-1'));
    expect(allUsersWithThatId).toHaveLength(0);
  });

  it('refuses to link a Google identity already linked to a different user', async () => {
    const { userId: firstUserId } = await registerAndGetSession('link-conflict-first');
    await db.insert(schemaSqlite.linkedIdentities).values({
      id: 'li-conflict', userId: firstUserId, provider: 'google', providerUserId: 'google-taken', linkedAt: new Date(),
    });

    const { cookie: secondCookie } = await registerAndGetSession('link-conflict-second');
    const linkRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/link', { headers: { cookie: secondCookie } }));
    const { state, cookie: stateCookie } = extractLoginFlow(linkRes);

    const restoreFetch = mockGoogle({ id: 'google-taken', email: 'taken@example.com' });
    const res = await authRoutes.handle(new Request(
      `http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`,
      { headers: { cookie: `${secondCookie}; ${stateCookie}` } },
    ));
    restoreFetch();

    expect(res.status).toBe(409);
    const links = await db.select().from(schemaSqlite.linkedIdentities).where(eq(schemaSqlite.linkedIdentities.providerUserId, 'google-taken'));
    expect(links).toHaveLength(1); // still only the original link
  });

  it('is idempotent — linking the same Google identity to the same account twice does not duplicate', async () => {
    const { cookie, userId } = await registerAndGetSession('link-idempotent');
    const restoreFetch = mockGoogle({ id: 'google-idempotent', email: 'idempotent@example.com' });

    for (let i = 0; i < 2; i++) {
      const linkRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/link', { headers: { cookie } }));
      const { state, cookie: stateCookie } = extractLoginFlow(linkRes);
      const res = await authRoutes.handle(new Request(
        `http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`,
        { headers: { cookie: `${cookie}; ${stateCookie}` } },
      ));
      expect(res.status).toBe(302);
    }
    restoreFetch();

    const links = await db.select().from(schemaSqlite.linkedIdentities).where(eq(schemaSqlite.linkedIdentities.userId, userId));
    expect(links).toHaveLength(1);
  });

  it('refuses the link callback once the session has ended, even with a valid state/nonce', async () => {
    const { cookie } = await registerAndGetSession('link-expired-session');
    const linkRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/link', { headers: { cookie } }));
    const { state, cookie: stateCookie } = extractLoginFlow(linkRes);

    // Log out before completing the flow.
    await authRoutes.handle(new Request('http://localhost/api/auth/logout', { method: 'POST', headers: { cookie } }));

    const restoreFetch = mockGoogle({ id: 'google-session-ended', email: 'ended@example.com' });
    const res = await authRoutes.handle(new Request(
      `http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`,
      { headers: { cookie: `${cookie}; ${stateCookie}` } },
    ));
    restoreFetch();

    expect(res.status).toBe(401);
  });

  /**
   * The defect linking would otherwise introduce: before this fix,
   * `completeLogin` resolved purely by `users.id === profile.id`, so a
   * locally-registered user who links Google and later clicks "Sign in
   * with Google" again would silently get a brand-new second account
   * instead of logging into the one they linked.
   */
  it('logging in via Google after linking resolves to the SAME account, not a new one', async () => {
    const { cookie, userId } = await registerAndGetSession('link-then-login');
    const linkRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/link', { headers: { cookie } }));
    const { state: linkState, cookie: linkStateCookie } = extractLoginFlow(linkRes);
    const restoreFetchForLink = mockGoogle({ id: 'google-link-then-login', email: 'linkthenlogin@example.com' });
    await authRoutes.handle(new Request(
      `http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(linkState)}`,
      { headers: { cookie: `${cookie}; ${linkStateCookie}` } },
    ));
    restoreFetchForLink();

    // Now log in fresh via plain Google login (no session, no `link:` state) —
    // exactly what clicking "Sign in with Google" from a logged-out state does.
    const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    const { state: loginState, cookie: loginStateCookie } = extractLoginFlow(loginRes);
    const restoreFetchForLogin = mockGoogle({ id: 'google-link-then-login', email: 'linkthenlogin@example.com' });
    const callbackRes = await authRoutes.handle(new Request(
      `http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(loginState)}`,
      { headers: { cookie: loginStateCookie } },
    ));
    restoreFetchForLogin();

    expect(callbackRes.status).toBe(302);
    const sessionCookieHeader = callbackRes.headers.get('set-cookie')!;
    const session = verifySessionToken(parseSessionCookie(sessionCookieHeader)!);
    expect(session?.userId).toBe(userId); // the original local account, not a new one

    const allUsers = await db.select().from(schemaSqlite.users).where(eq(schemaSqlite.users.id, 'google-link-then-login'));
    expect(allUsers).toHaveLength(0); // no duplicate account was created
  });
});
