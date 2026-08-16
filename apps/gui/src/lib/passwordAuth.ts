import { BACKEND_URL } from './backendUrl';

/**
 * M13-T11. `/api/auth/password/{register,login}` are plain Elysia HTTP
 * routes, not ConnectRPC methods (see `auth.ts`'s comment on why: they run
 * before any session exists, and need to set a `Set-Cookie` header the same
 * way the Google OAuth callback does) — so this mirrors `authSession.ts`'s
 * shape rather than going through `connectTransport`.
 *
 * Every non-2xx response body is RFC 7807 problem details
 * (`lib/problemDetails.ts` on the backend); `title`/`detail` is what the
 * form shows, not a raw HTTP status.
 */

export class PasswordAuthError extends Error {
  status: number;
  /** Seconds until a locked account or a rate-limited source may retry. */
  retryAfterSeconds?: number;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function throwProblemDetails(res: Response): Promise<never> {
  let title = 'Request failed';
  let detail: string | undefined;
  try {
    const body = await res.json();
    title = body.title || title;
    detail = body.detail;
  } catch {
    // A non-JSON error body (e.g. a proxy's own error page) still needs a
    // message the form can show, rather than throwing on `.json()` itself.
  }
  const retryAfterHeader = res.headers.get('Retry-After');
  throw new PasswordAuthError(
    detail || title,
    res.status,
    retryAfterHeader ? Number(retryAfterHeader) : undefined,
  );
}

export interface PasswordLoginResult {
  userId: string;
  mustChangePassword: boolean;
}

export async function loginWithPassword(username: string, password: string): Promise<PasswordLoginResult> {
  const res = await fetch(`${BACKEND_URL}/api/auth/password/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) await throwProblemDetails(res);
  return res.json();
}

export interface RegisterLocalUserInput {
  username: string;
  password: string;
  email?: string;
  name?: string;
}

export async function registerLocalUser(input: RegisterLocalUserInput): Promise<{ userId: string }> {
  const res = await fetch(`${BACKEND_URL}/api/auth/password/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) await throwProblemDetails(res);
  return res.json();
}
