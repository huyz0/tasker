import { BACKEND_URL } from './backendUrl';

export interface AuthSession {
  authenticated: boolean;
  userId: string | null;
}

export async function fetchAuthSession(): Promise<AuthSession> {
  const res = await fetch(`${BACKEND_URL}/api/auth/session`, { credentials: 'include' });
  if (!res.ok) {
    return { authenticated: false, userId: null };
  }
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
}
