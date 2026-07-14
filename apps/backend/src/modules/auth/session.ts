import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { createContextKey } from '@connectrpc/connect';
import { config } from '../../config';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionPayload {
  userId: string;
  exp: number;
  // Unique per issued token - lets a specific session be revoked (see
  // revokedSessions table) without invalidating every other session for
  // the same user.
  jti: string;
}

const base64url = (input: string) => Buffer.from(input).toString('base64url');

const sign = (payload: string) => createHmac('sha256', config.jwtSecret).update(payload).digest('base64url');

export const createSessionToken = (userId: string): string => {
  const payload: SessionPayload = { userId, exp: Date.now() + SESSION_TTL_MS, jti: randomUUID() };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
};

export const verifySessionToken = (token: string): SessionPayload | null => {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = sign(encodedPayload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as SessionPayload;
    if (typeof payload.userId !== 'string' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
};

export const parseSessionCookie = (cookieHeader: string | null): string | null => {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(';').map((c) => c.trim()).find((c) => c.startsWith('session='));
  return match ? match.slice('session='.length) : null;
};

/**
 * Same session token format as the browser cookie, just delivered as a
 * bearer header instead - this is how the CLI (and, by extension, AI agents
 * scripting against it) authenticate, since they have no cookie jar tied to
 * a browser session.
 */
export const parseBearerToken = (authorizationHeader: string | null): string | null => {
  if (!authorizationHeader?.startsWith('Bearer ')) return null;
  return authorizationHeader.slice('Bearer '.length).trim() || null;
};

/**
 * Resolves the verified session payload for a request from either an
 * Authorization: Bearer header (CLI/agents) or a session cookie (browser),
 * checking the bearer header first. Returns null if neither is present or
 * valid. This only checks the token's signature/expiry - it does NOT check
 * revocation (see isSessionRevoked in lib/sessionRevocation.ts), since that
 * requires a DB round-trip callers may not want on every log line.
 */
export const resolveSessionPayload = (headers: { cookie: string | null; authorization: string | null }): SessionPayload | null => {
  const token = parseBearerToken(headers.authorization) ?? parseSessionCookie(headers.cookie);
  return token ? verifySessionToken(token) : null;
};

/**
 * Same as resolveSessionPayload, but returns just the userId - the common
 * case for logging/informational contexts that don't need to enforce
 * revocation (see resolveSessionPayload's note).
 */
export const resolveSessionUserId = (headers: { cookie: string | null; authorization: string | null }): string | null => {
  return resolveSessionPayload(headers)?.userId ?? null;
};

export const currentUserIdKey = createContextKey<string | null>(null);
