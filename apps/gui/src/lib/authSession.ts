import { z } from 'zod/v4';
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

const SessionSchema = z.object({
  authenticated: z.boolean(), userId: z.string().min(1).nullable().default(null),
  mustChangePassword: z.boolean().default(false),
}).refine(session => !session.authenticated || !!session.userId, 'Authenticated session requires an identity');

export async function fetchAuthSession(): Promise<AuthSession> {
  const res = await fetch(`${BACKEND_URL}/api/auth/session`, { credentials: 'include' });
  if (res.status === 401 || res.status === 403) {
    return { authenticated: false, userId: null, mustChangePassword: false };
  }
  if (!res.ok) throw new Error(`Could not verify your session (${res.status}).`);
  return SessionSchema.parse(await res.json());
}

export async function logout(): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  if (!response.ok) throw new Error(`Could not sign out (${response.status}).`);
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
