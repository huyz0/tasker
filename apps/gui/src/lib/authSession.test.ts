import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BACKEND_URL } from './connectTransport';
import { fetchAuthSession, logout } from './authSession';

describe('authSession', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true, userId: 'user-1' }),
    }));
  });

  it('fetchAuthSession hits the shared BACKEND_URL, not a separately hardcoded one', async () => {
    await fetchAuthSession();
    expect(fetch).toHaveBeenCalledWith(`${BACKEND_URL}/api/auth/session`, { credentials: 'include' });
  });

  it('logout hits the shared BACKEND_URL, not a separately hardcoded one', async () => {
    await logout();
    expect(fetch).toHaveBeenCalledWith(`${BACKEND_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  });
});
