import { Elysia } from 'elysia';
import { eq, and } from 'drizzle-orm';
import * as schemaMysql from '../../db/schema.mysql';
import * as schemaSqlite from '../../db/schema.sqlite';
import { config } from '../../config';
import { createSessionToken, parseSessionCookie, verifySessionToken } from './session';
import { logger } from '../../lib/logger';

function sessionCookie(userId: string): string {
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  return `session=${createSessionToken(userId)}; HttpOnly; Path=/; SameSite=Lax${secure}`;
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
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: config.googleRedirectUri,
      response_type: 'code',
      scope: 'email profile',
      access_type: 'offline',
      prompt: 'consent',
      // Google echoes `state` back verbatim on the callback - this is how the
      // callback knows to hand off a bearer token to the CLI's local server
      // instead of setting a browser cookie.
      ...(isCli ? { state: 'cli' } : {}),
    });

    return new Response('', {
      status: 302,
      headers: { location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` }
    });
  })
  .get('/api/auth/google/callback', async ({ query }) => {
    const code = query.code as string;
    const error = query.error as string;
    const isCli = query.state === 'cli';

    if (error) {
      return new Response(`Authentication failed: ${error}`, { status: 400 });
    }

    if (!code) {
      return new Response('No code provided', { status: 400 });
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
        return new Response('', {
          status: 302,
          headers: { location: `http://localhost:${CLI_CALLBACK_PORT}/callback?token=${encodeURIComponent(token)}` }
        });
      }

      return new Response('', {
        status: 302,
        headers: {
          'location': '/',
          'set-cookie': sessionCookie(profile.id)
        }
      });
    } catch (e: any) {
      logger.error({ err: e }, 'auth.google_callback_failed');
      return new Response('Authentication failed due to server error', { status: 500 });
    }
  })
  .get('/api/auth/session', ({ request }) => {
    const token = parseSessionCookie(request.headers.get('cookie'));
    const session = token ? verifySessionToken(token) : null;
    return Response.json({ authenticated: !!session, userId: session?.userId ?? null });
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
