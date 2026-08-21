import { BACKEND_URL } from './backendUrl';

export interface AuthSession {
  authenticated: boolean;
  userId: string | null;
  // M13-T12. Set once by an admin's password reset (M13-T10) and otherwise
  // only ever returned in the one-shot login response body — read from
  // here too so it survives a reload, not just the moment right after
  // logging in.
  mustChangePassword: boolean;
}

export async function fetchAuthSession(): Promise<AuthSession> {
  const res = await fetch(`${BACKEND_URL}/api/auth/session`, { credentials: 'include' });
  if (!res.ok) {
    return { authenticated: false, userId: null, mustChangePassword: false };
  }
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
}

/**
 * Which sign-in methods this deployment has (M09-T06).
 *
 * The standalone binary ships with no Google credentials, and a "Continue with
 * Google" button that redirects with an empty `client_id` takes the person to
 * a Google error page and leaves them there. The sign-in screen asks first.
 */
export interface AuthProviders {
  google: boolean;
  password: boolean;
}

export async function fetchAuthProviders(): Promise<AuthProviders> {
  const res = await fetch(`${BACKEND_URL}/api/auth/providers`, { credentials: 'include' });
  // A backend too old to answer, or unreachable: assume the method that needs
  // no configuration works and the one that does not, does not. Showing a
  // button that cannot work is the failure worth avoiding here.
  if (!res.ok) return { google: false, password: true };
  return res.json();
}
