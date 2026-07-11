import { Elysia } from 'elysia';
import { config } from '../../config';
import { createSessionToken, parseSessionCookie, verifySessionToken } from './session';

export const authRoutes = new Elysia()
  .get('/api/auth/google/login', () => {
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: config.googleRedirectUri,
      response_type: 'code',
      scope: 'email profile',
      access_type: 'offline',
      prompt: 'consent'
    });

    return new Response('', {
      status: 302,
      headers: { location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` }
    });
  })
  .get('/api/auth/google/callback', async ({ query }) => {
    const code = query.code as string;
    const error = query.error as string;

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

      return new Response('', {
        status: 302,
        headers: {
          'location': '/',
          'set-cookie': `session=${createSessionToken(profile.id)}; HttpOnly; Path=/; SameSite=Lax`
        }
      });
    } catch (e: any) {
      console.error('Google Auth Error:', e.message);
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
        'set-cookie': `session=${createSessionToken(userId)}; HttpOnly; Path=/; SameSite=Lax`
      }
    });
  });
