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
