import { describe, it, expect, vi } from 'vitest';
import { BACKEND_URL } from './connectTransport';
import { ensureDevSession } from './devAuthBootstrap';

describe('ensureDevSession', () => {
  it('hits the test-login endpoint for the fixed dev user, with credentials included', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    await ensureDevSession();

    expect(fetch).toHaveBeenCalledWith(`${BACKEND_URL}/api/auth/test/inject?userId=dev-user`, { credentials: 'include' });
  });

  it('throws with the response status when the backend rejects the bootstrap request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(ensureDevSession()).rejects.toThrow('dev session bootstrap failed with status 403');
  });
});
