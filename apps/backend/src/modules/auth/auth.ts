import { Elysia } from 'elysia';

export const authRoutes = new Elysia()
  .get('/api/auth/google/login', () => {
    return new Response('', {
      status: 302,
      headers: { location: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=MOCK&redirect_uri=MOCK&response_type=code&scope=email' }
    });
  })
  .get('/api/auth/google/callback', () => {
    return new Response('', {
      status: 302,
      headers: {
        'location': '/',
        'set-cookie': 'MOCK_JWT_OR_SESSION_TOKEN; HttpOnly; Path=/'
      }
    });
  });
