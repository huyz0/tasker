import { BACKEND_URL } from './connectTransport';

// Every backend RPC now requires an authenticated session. Real login (Google
// OAuth) isn't practical to complete automatically in local dev, so this asks
// the backend's dev-only test-login endpoint (gated by ENABLE_TEST_LOGIN on the
// backend, and only ever called here when running `vite dev`, never a
// production build) for a session cookie, so the app isn't broken out of the
// box for local development.
const DEV_USER_ID = 'dev-user';

export async function ensureDevSession(): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/auth/test/inject?userId=${DEV_USER_ID}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`dev session bootstrap failed with status ${res.status}`);
  }
}
