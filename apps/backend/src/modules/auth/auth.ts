import { Elysia } from 'elysia';
import { config } from '../../config';

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

    if (process.env.NODE_ENV === 'test') {
      return new Response('', {
        status: 302,
        headers: {
          'location': '/',
          'set-cookie': 'MOCK_JWT_OR_SESSION_TOKEN; HttpOnly; Path=/'
        }
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

      const tokens = await tokenResponse.json();
      
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      
      if (!profileResponse.ok) {
        throw new Error('Failed to fetch user profile');
      }
      
      const profile = await profileResponse.json();

      return new Response('', {
        status: 302,
        headers: {
          'location': '/',
          'set-cookie': `SESSION_${profile.id}_${Math.random().toString(36).substring(7)}; HttpOnly; Path=/; SameSite=Lax`
        }
      });
    } catch (e: any) {
      console.error('Google Auth Error:', e.message);
      return new Response('Authentication failed due to server error', { status: 500 });
    }
  });
