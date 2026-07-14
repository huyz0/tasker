import { Elysia } from 'elysia';
import { eq, and } from 'drizzle-orm';
import * as schemaMysql from '../../db/schema.mysql';
import * as schemaSqlite from '../../db/schema.sqlite';
import { config } from '../../config';
import { createSessionToken, resolveSessionUserId, SESSION_TTL_MS } from './session';
import { logger } from '../../lib/logger';

function sessionCookie(userId: string): string {
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  return `session=${createSessionToken(userId)}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function clearSessionCookie(): string {
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  return `session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

// Binds the callback to the browser session that started the OAuth flow, so
// an attacker can't get a victim's browser to complete a login as the
// attacker's Google account (login CSRF). The nonce travels in Google's
// `state` param and in a short-lived HttpOnly cookie only this browser
// holds; the callback rejects unless the two match.
function oauthStateCookie(nonce: string): string {
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  return `oauth_state=${nonce}; HttpOnly; Path=/api/auth; Max-Age=300; SameSite=Lax${secure}`;
}

function clearOauthStateCookie(): string {
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  return `oauth_state=; HttpOnly; Path=/api/auth; Max-Age=0; SameSite=Lax${secure}`;
}

function parseOauthStateCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)oauth_state=([^;]+)/);
  return match?.[1] ?? null;
}

// The CLI's `tasker auth login` starts a short-lived localhost HTTP server on
// this port to catch the OAuth handoff, since it has no cookie jar tied to a
// browser session. Must match apps/cli/cmd/auth.go's local listener.
const CLI_CALLBACK_PORT = 3952;

interface GoogleProfile {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

/**
 * Upserts the users row for this Google profile (login was previously never
 * persisting one at all - getIdentity and every users.id foreign key would
 * only work for rows a test had inserted by hand), then accepts any pending
 * invitations for this email: joins the invited org and consumes the invite.
 * Runs on every login, not just the first, since a user may accept new
 * invitations sent after their account already exists.
 */
async function completeLogin(db: any, profile: GoogleProfile): Promise<void> {
  const isStandalone = process.env.STANDALONE === "true";
  const users = isStandalone ? schemaSqlite.users : schemaMysql.users;
  const invitations = isStandalone ? schemaSqlite.invitations : schemaMysql.invitations;
  const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;

  const existing = await db.select().from(users).where(eq((users as any).id, profile.id)).limit(1);
  if (existing.length === 0) {
    await db.insert(users).values({
      id: profile.id,
      email: profile.email,
      name: profile.name || null,
      avatarUrl: profile.picture || null,
      createdAt: new Date(),
    });
  } else {
    await db.update(users)
      .set({ name: profile.name || existing[0].name, avatarUrl: profile.picture || existing[0].avatarUrl })
      .where(eq((users as any).id, profile.id));
  }

  const pendingInvites = await db.select().from(invitations).where(eq((invitations as any).email, profile.email));
  for (const invite of pendingInvites) {
    const alreadyMember = await db.select().from(members)
      .where(and(eq((members as any).orgId, invite.orgId), eq((members as any).userId, profile.id)))
      .limit(1);
    if (alreadyMember.length === 0) {
      await db.insert(members).values({ orgId: invite.orgId, userId: profile.id, role: 'member', joinedAt: new Date() });
    }
    await db.delete(invitations).where(eq((invitations as any).id, invite.id));
  }
}

export function createAuthRoutes(db: any) {
  return new Elysia()
  .get('/api/auth/google/login', ({ query }) => {
    const isCli = query.cli === 'true';
    const nonce = crypto.randomUUID();
    // The CLI generates its own nonce and never exposes it to arbitrary web
    // content - only this login URL (which the user opens themselves) and
    // the eventual localhost callback carry it. Echoing it back on the
    // callback lets the CLI's local listener reject a token delivered by
    // anything other than the login flow it actually started.
    const cliNonce = isCli ? (query.cliNonce as string) || '' : '';
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: config.googleRedirectUri,
      response_type: 'code',
      scope: 'email profile',
      access_type: 'offline',
      prompt: 'consent',
      // Google echoes `state` back verbatim on the callback - the "cli:"/"web:"
      // prefix is how the callback knows to hand off a bearer token to the
      // CLI's local server instead of setting a browser cookie; the nonce
      // after it is checked against oauthStateCookie to block login CSRF,
      // and (for cli) the trailing cliNonce is echoed back to the CLI.
      state: isCli ? `cli:${nonce}:${cliNonce}` : `web:${nonce}`,
    });

    return new Response('', {
      status: 302,
      headers: {
        location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        'set-cookie': oauthStateCookie(nonce),
      }
    });
  })
  .get('/api/auth/google/callback', async ({ query, request }) => {
    const code = query.code as string;
    const error = query.error as string;
    const state = (query.state as string) || '';
    const [flow, nonce, cliNonce] = state.split(':');
    const isCli = flow === 'cli';

    if (error) {
      return new Response(`Authentication failed: ${error}`, { status: 400 });
    }

    if (!code) {
      return new Response('No code provided', { status: 400 });
    }

    const expectedNonce = parseOauthStateCookie(request.headers.get('cookie'));
    if (!nonce || !expectedNonce || nonce !== expectedNonce) {
      return new Response('Invalid or missing state', {
        status: 400,
        headers: { 'set-cookie': clearOauthStateCookie() },
      });
    }

    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: config.googleRedirectUri,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange code for token');
      }

      const tokens = (await tokenResponse.json()) as any;
      
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      
      if (!profileResponse.ok) {
        throw new Error('Failed to fetch user profile');
      }
      
      const profile = (await profileResponse.json()) as any;
      await completeLogin(db, profile);

      if (isCli) {
        const token = createSessionToken(profile.id);
        const callbackParams = new URLSearchParams({ token });
        if (cliNonce) callbackParams.set('nonce', cliNonce);
        const headers = new Headers({ location: `http://localhost:${CLI_CALLBACK_PORT}/callback?${callbackParams.toString()}` });
        headers.append('set-cookie', clearOauthStateCookie());
        return new Response('', { status: 302, headers });
      }

      const headers = new Headers({ location: '/' });
      headers.append('set-cookie', sessionCookie(profile.id));
      headers.append('set-cookie', clearOauthStateCookie());
      return new Response('', { status: 302, headers });
    } catch (e: any) {
      logger.error({ err: e }, 'auth.google_callback_failed');
      return new Response('Authentication failed due to server error', { status: 500 });
    }
  })
  .get('/api/auth/session', ({ request }) => {
    // Every RPC checks the Authorization: Bearer header first, then falls
    // back to the cookie (see resolveSessionUserId) - a CLI/agent client
    // authenticating purely via bearer token (no cookie jar) must see the
    // same "am I logged in" answer here that it gets from any real RPC.
    const userId = resolveSessionUserId({
      cookie: request.headers.get('cookie'),
      authorization: request.headers.get('authorization'),
    });
    return Response.json({ authenticated: !!userId, userId });
  })
  // There was previously no way to end a browser session at all - the
  // cookie just sat there, valid, until it hit its 7-day Max-Age. Clearing
  // the cookie here logs the browser out immediately; it doesn't revoke the
  // underlying JWT (sessions are stateless, so a copy of the token used
  // directly as a Bearer header would still verify until it expires), but
  // it closes the "no way to log out at all" gap for the normal browser flow.
  .post('/api/auth/logout', () => {
    return new Response('', {
      status: 204,
      headers: { 'set-cookie': clearSessionCookie() },
    });
  })
  .get('/api/auth/test/inject', ({ query }) => {
    if (!config.enableTestLogin) {
      return new Response('Test login disabled', { status: 403 });
    }
    const userId = (query.userId as string) || 'testuser123';
    return new Response('Mock session injected', {
      status: 200,
      headers: {
        'set-cookie': sessionCookie(userId)
      }
    });
  });
}
