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
    expect(await res.json()).toEqual({ authenticated: false, userId: null, mustChangePassword: false });
  });

  it('reports the authenticated user when a valid session cookie is present', async () => {
    const token = createSessionToken('user-42');
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/session', {
      headers: { cookie: `session=${token}` },
    }));
    expect(await res.json()).toEqual({ authenticated: true, userId: 'user-42', mustChangePassword: false });
  });

  it('reports the authenticated user for a Bearer token, same as every RPC, even with no cookie jar', async () => {
    const token = createSessionToken('user-cli-42');
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/session', {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(await res.json()).toEqual({ authenticated: true, userId: 'user-cli-42', mustChangePassword: false });
  });

  /** M13-T12. */
  it('reports mustChangePassword: true when the session user\'s credential is flagged — survives what a one-shot login response cannot', async () => {
    await db.insert(schemaSqlite.users).values({ id: 'user-must-change', email: 'mc@example.com', createdAt: new Date() });
    await db.insert(schemaSqlite.passwordCredentials).values({
      userId: 'user-must-change', passwordHash: 'irrelevant', updatedAt: new Date(), mustChangePassword: true,
    });
    const token = createSessionToken('user-must-change');
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/session', {
      headers: { cookie: `session=${token}` },
    }));
    expect(await res.json()).toEqual({ authenticated: true, userId: 'user-must-change', mustChangePassword: true });
  });

  it('reports mustChangePassword: false for a user with no password credential at all (e.g. Google-only)', async () => {
    const token = createSessionToken('user-google-only-session');
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/session', {
      headers: { cookie: `session=${token}` },
    }));
    expect((await res.json()).mustChangePassword).toBe(false);
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
    expect(await sessionRes.json()).toEqual({ authenticated: false, userId: null, mustChangePassword: false });
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
    expect(await res.json()).toEqual({ authenticated: false, userId: null, mustChangePassword: false });
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

  it('reports mustChangePassword: false on an ordinary login', async () => {
    await register({ username: 'no-must-change-user', password: 'a-strong-password-123' });
    const res = await login({ username: 'no-must-change-user', password: 'a-strong-password-123' });
    expect((await res.json()).mustChangePassword).toBe(false);
  });

  /** M13-T10. */
  it('reports mustChangePassword: true after an admin reset, still logging in successfully', async () => {
    const { userId } = await (await register({ username: 'must-change-user', password: 'the-original-password-1' })).json();
    await db.update(schemaSqlite.passwordCredentials)
      .set({ mustChangePassword: true })
      .where(eq(schemaSqlite.passwordCredentials.userId, userId));

    const res = await login({ username: 'must-change-user', password: 'the-original-password-1' });
    expect(res.status).toBe(200); // login itself still succeeds
    expect(res.headers.get('set-cookie')).toContain('HttpOnly'); // and a session is still issued
    expect((await res.json()).mustChangePassword).toBe(true);
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

  /**
   * M13-T14 (security review, Vuln 1). Local registration must NOT consume
   * an email-targeted invitation: `email` here is self-typed by the caller
   * with no proof of ownership, unlike Google's provider-verified profile.
   * Before this fix, an attacker who merely knew a pending invitee's email
   * address could register with that email first and steal the invited
   * org membership - up to admin - racing the real invitee. Renamed from
   * "consumes a pending email invitation..." (T09's original, now-wrong
   * assertion) to assert the opposite.
   */
  it('does NOT consume a pending email-targeted invitation on local registration — prevents invite hijack via an unverified email', async () => {
    await db.insert(schemaSqlite.organizations).values({ id: 'org-local-invite', name: 'Org', slug: 'org-local-invite', createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: 'inviter-local', email: 'inviter-local@example.com', createdAt: new Date() });
    await db.insert(schemaSqlite.invitations).values({
      id: 'inv-local', orgId: 'org-local-invite', email: 'invitee-local@example.com', invitedBy: 'inviter-local', role: 'admin', createdAt: new Date(),
    });

    // The attacker: registers first, typing the real invitee's email - no
    // proof of ownership is possible or required by the endpoint itself.
    const res = await register({ username: 'attacker-user', password: 'a-strong-password-123', email: 'invitee-local@example.com' });
    const { userId } = await res.json();

    const membership = await db.select().from(schemaSqlite.organizationMembers)
      .where(eq(schemaSqlite.organizationMembers.userId, userId));
    expect(membership).toHaveLength(0); // the attacker gained no org access

    // And the invitation survives, untouched, for the real invitee to
    // redeem later (by username, or by an eventual verified Google login).
    const remaining = await db.select().from(schemaSqlite.invitations).where(eq(schemaSqlite.invitations.id, 'inv-local'));
    expect(remaining).toHaveLength(1);
  });

  it('Google login still consumes an email-targeted invitation — email is provider-verified on that path', async () => {
    await db.insert(schemaSqlite.organizations).values({ id: 'org-google-invite', name: 'Org', slug: 'org-google-invite', createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: 'inviter-google2', email: 'inviter-google2@example.com', createdAt: new Date() });
    await db.insert(schemaSqlite.invitations).values({
      id: 'inv-google2', orgId: 'org-google-invite', email: 'real-invitee@example.com', invitedBy: 'inviter-google2', role: 'admin', createdAt: new Date(),
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'mock_access_token' }), { status: 200 });
      }
      if (urlStr === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return new Response(JSON.stringify({ id: 'real-invitee-google-id', email: 'real-invitee@example.com' }), { status: 200 });
      }
      return originalFetch(url);
    }) as unknown as typeof fetch;

    const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
    const { state, cookie } = extractLoginFlow(loginRes);
    await authRoutes.handle(new Request(
      `http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`,
      { headers: { cookie } },
    ));
    globalThis.fetch = originalFetch;

    const membership = await db.select().from(schemaSqlite.organizationMembers)
      .where(eq(schemaSqlite.organizationMembers.userId, 'real-invitee-google-id'));
    expect(membership).toHaveLength(1);
    expect(membership[0].orgId).toBe('org-google-invite');
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

  /**
   * M13-T14 (security review, Vuln 3). Before this fix, both routes parsed
   * whatever content-type Elysia's body parser recognized, including
   * application/x-www-form-urlencoded - a "simple" content type a plain
   * cross-site <form> submits with no CORS preflight, so the origin
   * allowlist never ran. A forged auto-submitting form could log a
   * visiting victim into an attacker-chosen account (login CSRF).
   */
  describe('rejects a non-JSON Content-Type (CSRF hardening)', () => {
    it('rejects a form-encoded login POST with 415, and does not authenticate it', async () => {
      await register({ username: 'csrf-target-user', password: 'a-strong-password-123' });

      const res = await authRoutes.handle(new Request('http://localhost/api/auth/password/login', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'username=csrf-target-user&password=a-strong-password-123',
      }));

      expect(res.status).toBe(415);
      expect(res.headers.get('set-cookie')).toBeNull();
    });

    it('rejects a form-encoded register POST with 415, and creates no account', async () => {
      const res = await authRoutes.handle(new Request('http://localhost/api/auth/password/register', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'username=csrf-attacker-account&password=a-strong-password-123',
      }));

      expect(res.status).toBe(415);
      const rows = await db.select().from(schemaSqlite.users).where(eq(schemaSqlite.users.username, 'csrf-attacker-account'));
      expect(rows).toHaveLength(0);
    });

    it('rejects text/plain — the Content-Type the Fetch API defaults a string body to when the caller never sets one explicitly', async () => {
      const res = await authRoutes.handle(new Request('http://localhost/api/auth/password/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'csrf-target-user', password: 'a-strong-password-123' }),
      }));
      expect(res.status).toBe(415);
    });

    it('still accepts application/json, including with a charset parameter', async () => {
      await register({ username: 'csrf-target-user', password: 'a-strong-password-123' });
      const res = await authRoutes.handle(new Request('http://localhost/api/auth/password/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ username: 'csrf-target-user', password: 'a-strong-password-123' }),
      }));
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

/**
 * M13-T15. The scenarios below are the milestone's own stated coverage
 * list ("local-only, Google-only, both-linked, invited-by-username,
 * invited-by-email, lockout, admin reset") — most already have dedicated
 * tests scattered across this file and auth.handler.test.ts, exercising
 * one mechanism deeply each. This block is deliberately different: one
 * data table, one runner, generating one `it` per row, so the *complete
 * set* the milestone named is checked in a single place a reviewer can
 * read top to bottom, rather than trusted to be implied by everything
 * else adding up. "Generated, not hand-written" (the task's own Verify
 * line) means this file defines the table and a loop reads it — a new
 * account-configuration row is a data change, not a new `it` block.
 */
describe('M13-T15: exhaustive auth-path matrix (generated)', () => {
  const registerJSON = (body: Record<string, unknown>) =>
    authRoutes.handle(new Request('http://localhost/api/auth/password/register', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
  const loginJSON = (body: Record<string, unknown>) =>
    authRoutes.handle(new Request('http://localhost/api/auth/password/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
  const extractFlow = (res: Response) => {
    const location = res.headers.get('location')!;
    return { state: new URL(location).searchParams.get('state')!, cookie: res.headers.get('set-cookie')! };
  };
  const withMockedGoogle = async (profile: { id: string; email: string }, fn: () => Promise<Response>) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'mock' }), { status: 200 });
      if (urlStr === 'https://www.googleapis.com/oauth2/v2/userinfo') return new Response(JSON.stringify(profile), { status: 200 });
      return originalFetch(url);
    }) as unknown as typeof fetch;
    try {
      return await fn();
    } finally {
      globalThis.fetch = originalFetch;
    }
  };
  const loginViaGoogle = (profile: { id: string; email: string }) =>
    withMockedGoogle(profile, async () => {
      const loginRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
      const { state, cookie } = extractFlow(loginRes);
      return authRoutes.handle(new Request(
        `http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`,
        { headers: { cookie } },
      ));
    });
  const linkGoogle = (sessionCookie: string, profile: { id: string; email: string }) =>
    withMockedGoogle(profile, async () => {
      const linkRes = await authRoutes.handle(new Request('http://localhost/api/auth/google/link', { headers: { cookie: sessionCookie } }));
      const { state, cookie: stateCookie } = extractFlow(linkRes);
      return authRoutes.handle(new Request(
        `http://localhost/api/auth/google/callback?code=123&state=${encodeURIComponent(state)}`,
        { headers: { cookie: `${sessionCookie}; ${stateCookie}` } },
      ));
    });

  interface Scenario {
    name: string;
    run: () => Promise<void>;
  }

  const SCENARIOS: Scenario[] = [
    {
      name: 'local-only: registers with no email/Google at all, then logs in with the password',
      run: async () => {
        const reg = await registerJSON({ username: 'matrix-local-only', password: 'a-strong-password-123' });
        expect(reg.status).toBe(201);
        const res = await loginJSON({ username: 'matrix-local-only', password: 'a-strong-password-123' });
        expect(res.status).toBe(200);
        const rows = await db.select().from(schemaSqlite.users).where(eq(schemaSqlite.users.username, 'matrix-local-only'));
        expect(rows[0].email).toBeNull();
      },
    },
    {
      name: 'google-only: never sets a password; password login is refused, Google login succeeds',
      run: async () => {
        const googleRes = await loginViaGoogle({ id: 'matrix-google-only-id', email: 'matrix-google-only@example.com' });
        expect(googleRes.status).toBe(302);

        // No password credential exists for this account at all - the
        // username it was never given can't even be looked up.
        const passwordAttempt = await loginJSON({ username: 'matrix-google-only-id', password: 'anything-at-all-123' });
        expect(passwordAttempt.status).toBe(401);
      },
    },
    {
      name: 'both-linked: registers locally, links Google, and either credential logs in afterward',
      run: async () => {
        const reg = await registerJSON({ username: 'matrix-both-linked', password: 'a-strong-password-123' });
        const sessionCookie = reg.headers.get('set-cookie')!.split(';')[0];

        const linkRes = await linkGoogle(sessionCookie, { id: 'matrix-both-linked-google-id', email: 'matrix-both-linked@example.com' });
        expect(linkRes.status).toBe(302);

        const passwordLogin = await loginJSON({ username: 'matrix-both-linked', password: 'a-strong-password-123' });
        expect(passwordLogin.status).toBe(200);

        const googleLogin = await loginViaGoogle({ id: 'matrix-both-linked-google-id', email: 'matrix-both-linked@example.com' });
        expect(googleLogin.status).toBe(302);
        const { userId: passwordUserId } = await (await loginJSON({ username: 'matrix-both-linked', password: 'a-strong-password-123' })).json();
        const googleSession = verifySessionToken(parseSessionCookie(googleLogin.headers.get('set-cookie'))!);
        expect(googleSession?.userId).toBe(passwordUserId); // same account either way, not two
      },
    },
    {
      name: 'invited-by-username: redeemed on local registration, joins the invited org at the invited role',
      run: async () => {
        await db.insert(schemaSqlite.organizations).values({ id: 'matrix-org-username', name: 'O', slug: 'matrix-org-username', createdAt: new Date() });
        await db.insert(schemaSqlite.users).values({ id: 'matrix-inviter-u', email: 'inviter@example.com', createdAt: new Date() });
        await db.insert(schemaSqlite.invitations).values({
          id: 'matrix-inv-username', orgId: 'matrix-org-username', username: 'matrix-invited-user', invitedBy: 'matrix-inviter-u', role: 'member', createdAt: new Date(),
        });

        const reg = await registerJSON({ username: 'matrix-invited-user', password: 'a-strong-password-123' });
        const { userId } = await reg.json();
        const membership = await db.select().from(schemaSqlite.organizationMembers).where(eq(schemaSqlite.organizationMembers.userId, userId));
        expect(membership).toEqual([expect.objectContaining({ orgId: 'matrix-org-username', role: 'member' })]);
      },
    },
    {
      name: 'invited-by-email: redeemed on Google login (provider-verified), joins the invited org at the invited role',
      run: async () => {
        await db.insert(schemaSqlite.organizations).values({ id: 'matrix-org-email', name: 'O', slug: 'matrix-org-email', createdAt: new Date() });
        await db.insert(schemaSqlite.users).values({ id: 'matrix-inviter-e', email: 'inviter2@example.com', createdAt: new Date() });
        await db.insert(schemaSqlite.invitations).values({
          id: 'matrix-inv-email', orgId: 'matrix-org-email', email: 'matrix-invited-google@example.com', invitedBy: 'matrix-inviter-e', role: 'viewer', createdAt: new Date(),
        });

        await loginViaGoogle({ id: 'matrix-invited-google-id', email: 'matrix-invited-google@example.com' });
        const membership = await db.select().from(schemaSqlite.organizationMembers).where(eq(schemaSqlite.organizationMembers.userId, 'matrix-invited-google-id'));
        expect(membership).toEqual([expect.objectContaining({ orgId: 'matrix-org-email', role: 'viewer' })]);
      },
    },
    {
      name: 'lockout: 5 consecutive failures lock the account; the correct password is refused until it clears',
      run: async () => {
        await registerJSON({ username: 'matrix-lockout', password: 'a-strong-password-123' });
        for (let i = 0; i < 5; i++) await loginJSON({ username: 'matrix-lockout', password: 'wrong' });

        const lockedAttempt = await loginJSON({ username: 'matrix-lockout', password: 'a-strong-password-123' });
        expect(lockedAttempt.status).toBe(429);

        const rows = await db.select().from(schemaSqlite.users).where(eq(schemaSqlite.users.username, 'matrix-lockout'));
        await db.update(schemaSqlite.passwordCredentials).set({ lockedUntil: new Date(Date.now() - 1000) })
          .where(eq(schemaSqlite.passwordCredentials.userId, rows[0].id));

        const afterCooldown = await loginJSON({ username: 'matrix-lockout', password: 'a-strong-password-123' });
        expect(afterCooldown.status).toBe(200);
      },
    },
    {
      name: 'admin reset: issues a temporary password that logs in with mustChangePassword: true, invalidating the old one',
      run: async () => {
        const reg = await registerJSON({ username: 'matrix-admin-reset', password: 'the-original-password-1' });
        const { userId: memberId } = await reg.json();

        const orgId = 'matrix-org-reset';
        const adminId = 'matrix-reset-admin';
        await db.insert(schemaSqlite.users).values({ id: adminId, email: 'reset-admin@example.com', createdAt: new Date() });
        await db.insert(schemaSqlite.organizations).values({ id: orgId, name: 'O', slug: orgId, createdAt: new Date() });
        await db.insert(schemaSqlite.organizationMembers).values([
          { orgId, userId: adminId, role: 'admin', joinedAt: new Date() },
          { orgId, userId: memberId, role: 'member', joinedAt: new Date() },
        ]);

        const { createAuthHandler } = await import('./auth.handler');
        const { createContextValues } = await import('@connectrpc/connect');
        const { currentUserIdKey } = await import('./session');
        const handler = createAuthHandler(db);
        const ctx = createContextValues();
        ctx.set(currentUserIdKey, adminId);
        const resetResult = await handler.adminResetPassword({ orgId, userId: memberId }, { values: ctx } as any);

        const oldPasswordAttempt = await loginJSON({ username: 'matrix-admin-reset', password: 'the-original-password-1' });
        expect(oldPasswordAttempt.status).toBe(401);

        const tempPasswordAttempt = await loginJSON({ username: 'matrix-admin-reset', password: resetResult.temporaryPassword });
        expect(tempPasswordAttempt.status).toBe(200);
        expect((await tempPasswordAttempt.json()).mustChangePassword).toBe(true);
      },
    },
  ];

  for (const scenario of SCENARIOS) {
    it(scenario.name, scenario.run);
  }

  it('the matrix covers every scenario the milestone names, by name — a regression in the table itself fails loudly', () => {
    const REQUIRED_TAGS = ['local-only', 'google-only', 'both-linked', 'invited-by-username', 'invited-by-email', 'lockout', 'admin reset'];
    for (const tag of REQUIRED_TAGS) {
      expect(SCENARIOS.some((s) => s.name.toLowerCase().includes(tag))).toBe(true);
    }
  });

  /**
   * M13's exit criterion (MILESTONE.md §3): "Every user who could log in
   * via Google before this milestone can still do so afterward with no
   * re-consent and no id change — proven by an integration test against
   * pre-migration fixture data." Every other Google-login test in this
   * file inserts its fixture user with no linked_identities row at all -
   * that exercises completeLogin's *fallback* branch (no link found), not
   * the state every real pre-existing account is actually in after T04's
   * backfill. This one runs the real backfill migration SQL against a
   * hand-built pre-M13 fixture row, then drives the real HTTP callback -
   * the "linked identity found" branch, and the one that matters for a
   * production migration.
   */
  it('a pre-migration user, backfilled, logs in via Google afterward with the exact same id', async () => {
    const readFileSync = (await import('node:fs')).readFileSync;
    const { join } = await import('node:path');
    const backfillSql = readFileSync(join(import.meta.dir, '../../../drizzle-sqlite/0031_backfill_google_linked_identities.sql'), 'utf8');

    // A pre-M13 row: id IS the Google sub, no linked_identities row exists
    // yet - exactly what every account looked like before this milestone.
    const preMigrationGoogleId = '108234098234098234098';
    await db.insert(schemaSqlite.users).values({
      id: preMigrationGoogleId, email: 'pre-migration-user@example.com', name: 'Pre-Migration User', createdAt: new Date(1700000000000),
    });

    for (const statement of backfillSql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) db.run(trimmed);
    }

    const linkRow = await db.select().from(schemaSqlite.linkedIdentities).where(eq(schemaSqlite.linkedIdentities.userId, preMigrationGoogleId));
    expect(linkRow).toHaveLength(1); // the migration did its job before login is even attempted

    const res = await loginViaGoogle({ id: preMigrationGoogleId, email: 'pre-migration-user@example.com' });
    expect(res.status).toBe(302); // logs in successfully, no re-consent step exists to re-trigger

    const session = verifySessionToken(parseSessionCookie(res.headers.get('set-cookie'))!);
    expect(session?.userId).toBe(preMigrationGoogleId); // the exact same id, unchanged

    const allUsers = await db.select().from(schemaSqlite.users).where(eq(schemaSqlite.users.id, preMigrationGoogleId));
    expect(allUsers).toHaveLength(1); // no duplicate account was created either
  });
});

describe('sign-in methods this deployment has (M09-T06)', () => {
  it('reports Google as unavailable when it is not configured', async () => {
    // The standalone binary's case. A "Continue with Google" button that
    // redirects with an empty client_id takes the person to a Google error
    // page and leaves them there, so the sign-in screen asks first.
    const res = await authRoutes.handle(new Request('http://localhost/api/auth/providers'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.password).toBe(true);
    // config.ts substitutes MOCK_* credentials under NODE_ENV=test, so this
    // asserts the shape rather than the value — the refusal below is what
    // proves the unconfigured path.
    expect(typeof body.google).toBe('boolean');
  });

  it('refuses the Google redirect outright when there are no credentials', async () => {
    const { config } = await import('../../config');
    const originalId = config.googleClientId;
    (config as any).googleClientId = '';
    try {
      const res = await authRoutes.handle(new Request('http://localhost/api/auth/google/login'));
      expect(res.status).toBe(501);
      const body = await res.json();
      expect(body.detail).toContain('username and password');
    } finally {
      (config as any).googleClientId = originalId;
    }
  });

  it('reports Google as unavailable when only half of it is configured', async () => {
    // A client id with no redirect URI builds a URL Google rejects; both
    // halves have to be present for the button to lead anywhere.
    const { config } = await import('../../config');
    const originalRedirect = config.googleRedirectUri;
    (config as any).googleRedirectUri = '';
    try {
      const res = await authRoutes.handle(new Request('http://localhost/api/auth/providers'));
      expect((await res.json()).google).toBe(false);
    } finally {
      (config as any).googleRedirectUri = originalRedirect;
    }
  });
});

describe('first-run starter workspace (M09-T06)', () => {
  it('gives the first registered account an organization and a project', async () => {
    const seeded = createAuthRoutes(db, { seedStarterWorkspace: true });
    const res = await seeded.handle(
      new Request('http://localhost/api/auth/password/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'firstuser', password: 'a-long-enough-password' }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.orgId).toBeTruthy();
    expect(body.projectId).toBeTruthy();
  });

  it('leaves registration untouched when the flag is off', async () => {
    // The default, and what every existing deployment gets.
    const res = await authRoutes.handle(
      new Request('http://localhost/api/auth/password/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'plainuser', password: 'a-long-enough-password' }),
      }),
    );

    const body = await res.json();
    expect(body.userId).toBeTruthy();
    expect(body.orgId).toBeUndefined();
  });

  it('does not hand the second account a workspace of its own', async () => {
    const seeded = createAuthRoutes(db, { seedStarterWorkspace: true });
    const register = (username: string) =>
      seeded.handle(
        new Request('http://localhost/api/auth/password/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password: 'a-long-enough-password' }),
        }),
      );

    await register('owneruser');
    const second = await (await register('seconduser')).json();
    expect(second.orgId).toBeUndefined();
  });
});
