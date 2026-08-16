import { Elysia } from 'elysia';
import { eq, and } from 'drizzle-orm';
import * as schemaMysql from '../../db/schema.mysql';
import * as schemaSqlite from '../../db/schema.sqlite';
import { config } from '../../config';
import { createSessionToken, resolveSessionPayload, SESSION_TTL_MS } from './session';
import { logger } from '../../lib/logger';
import { problemDetails } from '../../lib/problemDetails';
import { revokeSession, isSessionRevoked } from '../../lib/sessionRevocation';
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from '../../lib/credentials';
import { rateLimitProblem } from '../../lib/rateLimit';

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

function authTables() {
  const isStandalone = process.env.STANDALONE === "true";
  return isStandalone
    ? { users: schemaSqlite.users, invitations: schemaSqlite.invitations, members: schemaSqlite.organizationMembers, linkedIdentities: schemaSqlite.linkedIdentities, passwordCredentials: schemaSqlite.passwordCredentials }
    : { users: schemaMysql.users, invitations: schemaMysql.invitations, members: schemaMysql.organizationMembers, linkedIdentities: schemaMysql.linkedIdentities, passwordCredentials: schemaMysql.passwordCredentials };
}

/**
 * Accepts every pending invitation matching `email`, joining the invited org
 * and consuming the invite. Shared by every path that can create or resolve
 * a user (Google login, local registration) so "accept an invite" is one
 * piece of logic rather than one per auth method (M13-T06 / ADR-0012's
 * "converge on the same session issuance path", extended to invitation
 * acceptance too, since both flows need it).
 *
 * A no-op when `email` is absent, which is the normal case for a local
 * account registered with no email at all - matching by username instead is
 * M13-T09's job. Runs on every login, not just the first, since a user may
 * accept new invitations sent after their account already exists.
 */
async function consumePendingInvitations(db: any, userId: string, email: string | null | undefined): Promise<void> {
  if (!email) return;
  const { invitations, members } = authTables();
  const pendingInvites = await db.select().from(invitations).where(eq((invitations as any).email, email));
  const now = Date.now();
  for (const invite of pendingInvites) {
    // Expired invitations are skipped rather than deleted. They stay visible to
    // an admin through listInvitations (M03-T12), where an invite that lapsed
    // unredeemed is useful information; deleting it here would make it vanish
    // at the moment the person finally tried to use it.
    //
    // A null expiresAt is an invitation issued before M03-T11 and remains
    // valid - see the migration's note.
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= now) continue;

    const alreadyMember = await db.select().from(members)
      .where(and(eq((members as any).orgId, invite.orgId), eq((members as any).userId, userId)))
      .limit(1);
    if (alreadyMember.length === 0) {
      await db.insert(members).values({ orgId: invite.orgId, userId, role: invite.role || 'member', joinedAt: new Date() });
    }
    await db.delete(invitations).where(eq((invitations as any).id, invite.id));
  }
}

/**
 * Derives a username the same provably-unique way the M13-T02 backfill
 * migration does (email local part + the user's own id), for a brand-new
 * account created by a path other than `registerLocalUser` - so every
 * user-creating path leaves `username` set, not just the local one.
 */
function deriveUsernameFromEmail(email: string, userId: string): string {
  const localPart = email.split('@')[0]?.toLowerCase() || 'user';
  return `${localPart}-${userId}`;
}

/**
 * Upserts the users row for this Google profile and returns the resolved
 * `userId` - the caller must use this, not `profile.id`, to issue the
 * session (M13-T08 note below explains why they can now differ).
 *
 * Resolution order (M13-T08):
 * 1. A `linked_identities` row for `(provider: 'google', providerUserId:
 *    profile.id)` - if one exists, its `userId` is authoritative. This
 *    covers every user who existed before M13 (T04's migration backfilled
 *    one for each) and anyone who has since linked Google to a local
 *    account (T08's `linkIdentity` flow). Resolving `users.id ===
 *    profile.id` instead here would silently create a second, duplicate
 *    account the first time such a person used "Sign in with Google" again
 *    - the exact defect linking would otherwise introduce.
 * 2. No linked identity: a Google id genuinely never seen before. Same
 *    shape as every Google login before M13 - `users.id` becomes
 *    `profile.id` - plus a `linked_identities` row is created alongside it,
 *    so this account resolves through step 1 from here on rather than
 *    falling through this branch (and the "no username" gap) every time.
 *
 * Login was previously never persisting a users row at all - getIdentity
 * and every users.id foreign key would only work for rows a test had
 * inserted by hand - and every branch here still ends by accepting pending
 * invitations for this email via `consumePendingInvitations`.
 */
async function completeLogin(db: any, profile: GoogleProfile): Promise<string> {
  const { users, linkedIdentities } = authTables();

  const linked = await db.select().from(linkedIdentities)
    .where(and(eq((linkedIdentities as any).provider, 'google'), eq((linkedIdentities as any).providerUserId, profile.id)))
    .limit(1);

  let userId: string;
  if (linked.length > 0) {
    userId = linked[0].userId;
    const existing = await db.select().from(users).where(eq((users as any).id, userId)).limit(1);
    if (existing.length > 0) {
      await db.update(users)
        .set({ name: profile.name || existing[0].name, avatarUrl: profile.picture || existing[0].avatarUrl })
        .where(eq((users as any).id, userId));
    }
    // existing.length === 0 would mean a dangling linked_identities row
    // pointing at a deleted user - defensive; nothing purges users today,
    // so this is not reachable, and this function is not the place to
    // decide what "a link to nobody" means.
  } else {
    userId = profile.id;
    const existingById = await db.select().from(users).where(eq((users as any).id, userId)).limit(1);
    if (existingById.length === 0) {
      await db.insert(users).values({
        id: userId,
        email: profile.email,
        username: profile.email ? deriveUsernameFromEmail(profile.email, userId) : null,
        name: profile.name || null,
        avatarUrl: profile.picture || null,
        createdAt: new Date(),
      });
      await db.insert(linkedIdentities).values({
        id: `li-${crypto.randomUUID()}`,
        userId,
        provider: 'google',
        providerUserId: profile.id,
        linkedAt: new Date(),
      });
    } else {
      // A users.id equal to this Google id already exists with no linked
      // row - a pre-M13 account T04's backfill has not (yet) reached.
      // Preserve the exact pre-M13 behavior rather than erroring, and do
      // not mint a second linked_identities row here: the backfill
      // migration, not a login request, is responsible for that row.
      await db.update(users)
        .set({ name: profile.name || existingById[0].name, avatarUrl: profile.picture || existingById[0].avatarUrl })
        .where(eq((users as any).id, userId));
    }
  }

  await consumePendingInvitations(db, userId, profile.email);
  return userId;
}

/**
 * Creates a local account: a username and password, no email or external
 * provider required at all (ADR-0012). `email` is optional - when given, it
 * both goes on the `users` row and is used to resolve any pending
 * invitation, the same way Google's flow already does.
 *
 * Throws with a message rather than a `ConnectError`/status code: this is
 * called from an Elysia HTTP route (unauthenticated, so it cannot use the
 * ConnectRPC principal/error machinery the rest of the backend does), and
 * the route maps the message to a `problemDetails` response.
 */
async function registerLocalUser(db: any, input: { username: string; password: string; email?: string; name?: string }): Promise<string> {
  const { users, passwordCredentials } = authTables();
  const username = input.username.trim();
  if (username.length < 3) throw new Error('username must be at least 3 characters');
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const existingUsername = await db.select().from(users).where(eq((users as any).username, username)).limit(1);
  if (existingUsername.length > 0) throw new Error('username is already taken');

  const userId = `u-${crypto.randomUUID()}`;
  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  await db.insert(users).values({
    id: userId,
    email: input.email || null,
    username,
    name: input.name || null,
    avatarUrl: null,
    createdAt: now,
  });
  await db.insert(passwordCredentials).values({
    userId,
    passwordHash,
    updatedAt: now,
    failedAttempts: 0,
    lockedUntil: null,
    mustChangePassword: false,
  });

  await consumePendingInvitations(db, userId, input.email);
  return userId;
}

// M13-T07. Consecutive-failure threshold before the *account* locks, and the
// exponential backoff schedule once it does: lockout_seconds = BASE * 2^(n -
// THRESHOLD), capped at MAX. Five free failures covers an honest typo or two
// without friction; each lock past that roughly doubles (30s, 60s, 120s,
// ...) up to an hour, which is long enough to make online guessing
// impractical without permanently exiling a user who forgot their password.
const FAILED_ATTEMPTS_THRESHOLD = 5;
const BASE_LOCKOUT_SECONDS = 30;
const MAX_LOCKOUT_SECONDS = 60 * 60;

function lockoutDurationSeconds(failedAttempts: number): number {
  const exponent = Math.max(0, failedAttempts - FAILED_ATTEMPTS_THRESHOLD);
  return Math.min(MAX_LOCKOUT_SECONDS, BASE_LOCKOUT_SECONDS * 2 ** exponent);
}

export type PasswordLoginResult =
  | { outcome: 'ok'; userId: string }
  | { outcome: 'invalid' }
  | { outcome: 'locked'; retryAfterSeconds: number };

/**
 * Verifies a username/password pair with per-account lockout (M13-T07).
 *
 * `invalid` covers every reason short of a correct, unlocked credential
 * (unknown username, no password credential on the account - e.g. a
 * Google-only user, or a wrong password): one undifferentiated failure mode
 * on purpose, since telling an attacker which part was wrong turns a login
 * form into a username-enumeration oracle.
 *
 * `locked` is reported distinctly, with a real `retryAfterSeconds` -
 * recorded as a deliberate choice, not an oversight: hiding lockout state
 * behind the generic `invalid` response is the more paranoid option, but
 * `registerLocalUser`'s "username is already taken" response (T06) already
 * makes username enumeration possible through the *registration* endpoint,
 * so hiding it here again buys little while leaving a genuine user with no
 * way to learn they are locked out rather than simply wrong. Matches this
 * codebase's one existing precedent for the tradeoff (ADR-0008 §5's
 * rate-limit response is distinct and carries Retry-After too).
 *
 * A locked account is refused *before* the password is even checked - a
 * check that only costs time without changing the outcome - and does not
 * consume another attempt.
 */
async function attemptPasswordLogin(db: any, username: string, password: string, now: Date = new Date()): Promise<PasswordLoginResult> {
  const { users, passwordCredentials } = authTables();
  const userRows = await db.select().from(users).where(eq((users as any).username, username)).limit(1);
  if (userRows.length === 0) return { outcome: 'invalid' };
  const userId = userRows[0].id;

  const credRows = await db.select().from(passwordCredentials)
    .where(eq((passwordCredentials as any).userId, userId)).limit(1);
  if (credRows.length === 0) return { outcome: 'invalid' };
  const cred = credRows[0];

  if (cred.lockedUntil && new Date(cred.lockedUntil).getTime() > now.getTime()) {
    const retryAfterSeconds = Math.max(1, Math.ceil((new Date(cred.lockedUntil).getTime() - now.getTime()) / 1000));
    return { outcome: 'locked', retryAfterSeconds };
  }

  const ok = await verifyPassword(password, cred.passwordHash);
  if (!ok) {
    const failedAttempts = cred.failedAttempts + 1;
    const patch: Record<string, unknown> = { failedAttempts };
    if (failedAttempts >= FAILED_ATTEMPTS_THRESHOLD) {
      patch.lockedUntil = new Date(now.getTime() + lockoutDurationSeconds(failedAttempts) * 1000);
    }
    await db.update(passwordCredentials).set(patch).where(eq((passwordCredentials as any).userId, userId));
    return { outcome: 'invalid' };
  }

  // A successful login clears the slate, including a lock that has already
  // expired (an expired lockedUntil is inert but stale otherwise).
  if (cred.failedAttempts > 0 || cred.lockedUntil) {
    await db.update(passwordCredentials).set({ failedAttempts: 0, lockedUntil: null })
      .where(eq((passwordCredentials as any).userId, userId));
  }
  return { outcome: 'ok', userId };
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
    const isLink = flow === 'link';

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

    // M13-T08. Re-checked here, not only on `/google/link`: the browser
    // navigates away to Google's consent screen and back, long enough for
    // the session that started a link flow to have been logged out or to
    // have expired in the meantime, and the state/nonce pair alone only
    // proves this callback belongs to a flow this browser started - not
    // that the session is still valid.
    let linkingUserId: string | null = null;
    if (isLink) {
      const payload = resolveSessionPayload({
        cookie: request.headers.get('cookie'),
        authorization: request.headers.get('authorization'),
      });
      if (!payload || await isSessionRevoked(db, payload.jti)) {
        return problemDetails(401, 'Authentication required', 'Your session ended before linking finished. Log in and try again.');
      }
      linkingUserId = payload.userId;
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

      if (isLink && linkingUserId) {
        const { linkedIdentities } = authTables();
        const existingLink = await db.select().from(linkedIdentities)
          .where(and(eq((linkedIdentities as any).provider, 'google'), eq((linkedIdentities as any).providerUserId, profile.id)))
          .limit(1);

        if (existingLink.length > 0 && existingLink[0].userId !== linkingUserId) {
          // Refuse rather than silently re-pointing the link: doing so
          // would let anyone who can complete Google's consent screen for
          // an address steal that identity away from whichever account it
          // was already linked to.
          return problemDetails(409, 'Already linked', 'This Google account is already linked to a different user.');
        }
        if (existingLink.length === 0) {
          await db.insert(linkedIdentities).values({
            id: `li-${crypto.randomUUID()}`,
            userId: linkingUserId,
            provider: 'google',
            providerUserId: profile.id,
            linkedAt: new Date(),
          });
        }
        // existingLink.length > 0 && existingLink[0].userId === linkingUserId:
        // already linked to this same account - idempotent no-op success,
        // not an error, since a double-click or a retried callback happens.

        const headers = new Headers({ location: '/' });
        headers.append('set-cookie', clearOauthStateCookie());
        return new Response('', { status: 302, headers });
      }

      const userId = await completeLogin(db, profile);

      if (isCli) {
        const token = createSessionToken(userId);
        const callbackParams = new URLSearchParams({ token });
        if (cliNonce) callbackParams.set('nonce', cliNonce);
        const headers = new Headers({ location: `http://localhost:${CLI_CALLBACK_PORT}/callback?${callbackParams.toString()}` });
        headers.append('set-cookie', clearOauthStateCookie());
        return new Response('', { status: 302, headers });
      }

      const headers = new Headers({ location: '/' });
      headers.append('set-cookie', sessionCookie(userId));
      headers.append('set-cookie', clearOauthStateCookie());
      return new Response('', { status: 302, headers });
    } catch (e: any) {
      logger.error({ err: e, isLink }, 'auth.google_callback_failed');
      return new Response('Authentication failed due to server error', { status: 500 });
    }
  })
  // M13-T08. "Link an existing Google account to my (already logged in)
  // account" needs the same OAuth redirect dance as login - there is no way
  // to prove ownership of a Google account without one - so this reuses
  // `/api/auth/google/callback` rather than registering a second redirect
  // URI with Google (an operational cost for every deployer, for a URL that
  // would do almost the same thing). The `link:` state prefix is what tells
  // the shared callback which of the two to do; see the callback's own
  // comment for the branch. The linkIdentity/unlinkIdentity RPCs are the
  // read/remove half of this feature - see main.tsp's note on why they
  // don't cover linking itself.
  .get('/api/auth/google/link', ({ request }) => {
    const payload = resolveSessionPayload({
      cookie: request.headers.get('cookie'),
      authorization: request.headers.get('authorization'),
    });
    if (!payload) {
      return problemDetails(401, 'Authentication required', 'Log in before linking a Google account.');
    }

    const nonce = crypto.randomUUID();
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: config.googleRedirectUri,
      response_type: 'code',
      scope: 'email profile',
      access_type: 'offline',
      prompt: 'consent',
      state: `link:${nonce}`,
    });

    return new Response('', {
      status: 302,
      headers: {
        location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        // Reuses the same oauth_state cookie as login: only one OAuth
        // round-trip is ever in flight per browser at a time, so there is
        // nothing to disambiguate beyond what `state`'s prefix already does.
        'set-cookie': oauthStateCookie(nonce),
      },
    });
  })
  // M13-T06. JSON endpoints, not the OAuth redirect dance Google's flow
  // needs - a form POSTs here directly and reads the response, so these
  // return `problemDetails` on failure (the convention this file already
  // uses for the non-browser-navigation routes) and, on success, the same
  // `sessionCookie(...)` the Google callback sets. That shared call is the
  // "converge on the same session issuance path" ADR-0012 asks for: both
  // login methods end up with an identical cookie, checked by the identical
  // `/api/auth/session` route and the identical ConnectRPC interceptor.
  .post('/api/auth/password/register', async ({ body }) => {
    const { username, password, email, name } = (body as any) || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return problemDetails(400, 'Invalid request', 'username and password are required');
    }
    try {
      const userId = await registerLocalUser(db, {
        username,
        password,
        email: typeof email === 'string' ? email : undefined,
        name: typeof name === 'string' ? name : undefined,
      });
      return new Response(JSON.stringify({ userId }), {
        status: 201,
        headers: { 'Content-Type': 'application/json', 'set-cookie': sessionCookie(userId) },
      });
    } catch (e: any) {
      logger.error({ err: e }, 'auth.password_register_failed');
      return problemDetails(400, 'Registration failed', e?.message || 'Unknown error');
    }
  })
  .post('/api/auth/password/login', async ({ body }) => {
    const { username, password } = (body as any) || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return problemDetails(400, 'Invalid request', 'username and password are required');
    }
    const result = await attemptPasswordLogin(db, username, password);
    if (result.outcome === 'locked') {
      const problem = rateLimitProblem(result.retryAfterSeconds, {
        title: 'Account temporarily locked',
        detail: `Too many failed attempts. Try again in ${result.retryAfterSeconds} second${result.retryAfterSeconds === 1 ? '' : 's'}.`,
      });
      return new Response(problem.body, { status: problem.status, headers: problem.headers });
    }
    if (result.outcome === 'invalid') {
      // Same message whether the username doesn't exist, has no password
      // credential, or the password is wrong - see attemptPasswordLogin's
      // comment on why that's deliberate, not an omission.
      return problemDetails(401, 'Invalid credentials', 'The username or password is incorrect.');
    }
    return new Response(JSON.stringify({ userId: result.userId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'set-cookie': sessionCookie(result.userId) },
    });
  })
  .get('/api/auth/session', async ({ request }) => {
    // Every RPC checks the Authorization: Bearer header first, then falls
    // back to the cookie, and also enforces revocation (see
    // sessionInterceptor in index.ts) - this must give the same "am I
    // logged in" answer, or a client could see itself as logged out here
    // while a revoked bearer token still worked against real RPCs (or
    // vice versa: think it's logged out via cookie but the token would
    // still authenticate a direct RPC call).
    const payload = resolveSessionPayload({
      cookie: request.headers.get('cookie'),
      authorization: request.headers.get('authorization'),
    });
    const userId = payload && !(await isSessionRevoked(db, payload.jti)) ? payload.userId : null;
    return Response.json({ authenticated: !!userId, userId });
  })
  // There was previously no way to end a browser session at all - the
  // cookie just sat there, valid, until it hit its 7-day Max-Age. This both
  // clears the cookie (logs the browser out immediately) and records the
  // token's jti in revokedSessions, so a copy of it used directly as a
  // Bearer header stops verifying too - not just "no cookie", but actually
  // revoked (see sessionInterceptor's isSessionRevoked check in index.ts).
  .post('/api/auth/logout', async ({ request }) => {
    const payload = resolveSessionPayload({
      cookie: request.headers.get('cookie'),
      authorization: request.headers.get('authorization'),
    });
    if (payload) {
      await revokeSession(db, payload.jti, payload.userId);
    }
    return new Response('', {
      status: 204,
      headers: { 'set-cookie': clearSessionCookie() },
    });
  })
  .get('/api/auth/test/inject', ({ query }) => {
    if (!config.enableTestLogin) {
      return problemDetails(403, 'Test login disabled', 'ENABLE_TEST_LOGIN is not set on this server.');
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
