import { createHmac, timingSafeEqual } from 'node:crypto';
import { createContextKey } from '@connectrpc/connect';
import { config } from '../../config';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionPayload {
  userId: string;
  exp: number;
}

const base64url = (input: string) => Buffer.from(input).toString('base64url');

const sign = (payload: string) => createHmac('sha256', config.jwtSecret).update(payload).digest('base64url');

export const createSessionToken = (userId: string): string => {
  const payload: SessionPayload = { userId, exp: Date.now() + SESSION_TTL_MS };
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

export const currentUserIdKey = createContextKey<string | null>(null);
