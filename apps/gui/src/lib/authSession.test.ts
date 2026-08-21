import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BACKEND_URL } from './connectTransport';
import { fetchAuthSession, fetchAuthProviders, logout } from './authSession';

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

  it('returns an unauthenticated session when the backend responds with a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const session = await fetchAuthSession();

    expect(session).toEqual({ authenticated: false, userId: null, mustChangePassword: false });
  });

  /** M13-T12. */
  it('surfaces mustChangePassword from the backend response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true, userId: 'user-1', mustChangePassword: true }),
    }));

    const session = await fetchAuthSession();

    expect(session.mustChangePassword).toBe(true);
  });
});

describe('fetchAuthProviders (M09-T06)', () => {
  it('reports what the backend says is configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ google: true, password: true }),
    }));

    expect(await fetchAuthProviders()).toEqual({ google: true, password: true });
    expect(fetch).toHaveBeenCalledWith(`${BACKEND_URL}/api/auth/providers`, { credentials: 'include' });
  });

  it('assumes no Google when the backend cannot answer', async () => {
    // A backend too old to have this route, or unreachable. Showing a button
    // that cannot work is the failure worth avoiding, so the fallback hides
    // the method that needs configuration and keeps the one that does not.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    expect(await fetchAuthProviders()).toEqual({ google: false, password: true });
  });
});
