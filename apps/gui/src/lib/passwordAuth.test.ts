import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BACKEND_URL } from './backendUrl';
import { loginWithPassword, registerLocalUser, PasswordAuthError } from './passwordAuth';

describe('loginWithPassword', () => {
  it('hits the shared BACKEND_URL with credentials included, not a separately hardcoded one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ userId: 'user-1', mustChangePassword: false }),
    }));

    await loginWithPassword('alice', 'a-strong-password-123');

    expect(fetch).toHaveBeenCalledWith(`${BACKEND_URL}/api/auth/password/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'a-strong-password-123' }),
    });
  });

  it('returns userId and mustChangePassword on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ userId: 'user-1', mustChangePassword: true }),
    }));

    const result = await loginWithPassword('alice', 'a-strong-password-123');
    expect(result).toEqual({ userId: 'user-1', mustChangePassword: true });
  });

  it('throws a PasswordAuthError carrying the problem-details title/detail on invalid credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({ title: 'Invalid credentials', status: 401, detail: 'The username or password is incorrect.' }),
    }));

    await expect(loginWithPassword('alice', 'wrong')).rejects.toMatchObject({
      message: 'The username or password is incorrect.',
      status: 401,
    });
  });

  it('surfaces retryAfterSeconds from the Retry-After header on a lockout (429)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '30' }),
      json: async () => ({ title: 'Account temporarily locked', status: 429, detail: 'Too many failed attempts. Try again in 30 seconds.' }),
    }));

    try {
      await loginWithPassword('alice', 'wrong');
      expect.unreachable('expected loginWithPassword to throw');
    } catch (e) {
      const err = e as PasswordAuthError;
      expect(err.status).toBe(429);
      expect(err.retryAfterSeconds).toBe(30);
    }
  });

  it('falls back to the generic title when the error body has none', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({}),
    }));

    await expect(loginWithPassword('alice', 'x')).rejects.toMatchObject({ message: 'Request failed', status: 500 });
  });

  it('falls back to a generic message when the error body is not valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers(),
      json: async () => { throw new SyntaxError('not json'); },
    }));

    await expect(loginWithPassword('alice', 'x')).rejects.toMatchObject({ message: 'Request failed', status: 502 });
  });
});

describe('registerLocalUser', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ userId: 'user-new' }),
    }));
  });

  it('hits the shared BACKEND_URL and posts the full payload including optional fields', async () => {
    await registerLocalUser({ username: 'bob', password: 'a-strong-password-123', email: 'bob@example.com' });

    expect(fetch).toHaveBeenCalledWith(`${BACKEND_URL}/api/auth/password/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'bob', password: 'a-strong-password-123', email: 'bob@example.com' }),
    });
  });

  it('omits email/name entirely when not given — no email, no Google account required', async () => {
    await registerLocalUser({ username: 'bob', password: 'a-strong-password-123' });

    const [, options] = (fetch as any).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ username: 'bob', password: 'a-strong-password-123' });
  });

  it('throws a PasswordAuthError with the server\'s reason on a taken username', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: async () => ({ title: 'Registration failed', status: 400, detail: 'username is already taken' }),
    }));

    await expect(registerLocalUser({ username: 'taken', password: 'a-strong-password-123' }))
      .rejects.toMatchObject({ message: 'username is already taken', status: 400 });
  });
});
