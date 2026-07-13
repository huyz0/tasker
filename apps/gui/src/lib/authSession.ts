export interface AuthSession {
  authenticated: boolean;
  userId: string | null;
}

export async function fetchAuthSession(): Promise<AuthSession> {
  const res = await fetch('http://localhost:8080/api/auth/session', { credentials: 'include' });
  if (!res.ok) {
    return { authenticated: false, userId: null };
  }
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch('http://localhost:8080/api/auth/logout', { method: 'POST', credentials: 'include' });
}
