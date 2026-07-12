import { describe, it, expect } from 'bun:test';
import { createSessionToken, verifySessionToken, parseSessionCookie, parseBearerToken, resolveSessionUserId } from './session';

describe('session tokens', () => {
  it('round-trips a valid token', () => {
    const token = createSessionToken('user-42');
    const session = verifySessionToken(token);
    expect(session?.userId).toBe('user-42');
  });

  it('rejects a tampered token', () => {
    const token = createSessionToken('user-42');
    const [payload] = token.split('.');
    const tampered = `${payload}.deadbeef`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it('parses the session cookie out of a cookie header', () => {
    expect(parseSessionCookie('session=abc.def; Path=/')).toBe('abc.def');
    expect(parseSessionCookie('other=1; session=abc.def')).toBe('abc.def');
    expect(parseSessionCookie(null)).toBeNull();
    expect(parseSessionCookie('other=1')).toBeNull();
  });

  it('parses a bearer token out of an Authorization header', () => {
    expect(parseBearerToken('Bearer abc.def')).toBe('abc.def');
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken('Basic abc.def')).toBeNull();
    expect(parseBearerToken('Bearer ')).toBeNull();
  });

  it('resolves the session user from a bearer header (CLI/agents)', () => {
    const token = createSessionToken('agent-user');
    const userId = resolveSessionUserId({ cookie: null, authorization: `Bearer ${token}` });
    expect(userId).toBe('agent-user');
  });

  it('resolves the session user from a cookie (browser) when no bearer header is present', () => {
    const token = createSessionToken('browser-user');
    const userId = resolveSessionUserId({ cookie: `session=${token}`, authorization: null });
    expect(userId).toBe('browser-user');
  });

  it('prefers the bearer header over the cookie when both are present', () => {
    const bearerToken = createSessionToken('bearer-user');
    const cookieToken = createSessionToken('cookie-user');
    const userId = resolveSessionUserId({ cookie: `session=${cookieToken}`, authorization: `Bearer ${bearerToken}` });
    expect(userId).toBe('bearer-user');
  });

  it('returns null when neither a bearer header nor a cookie is present', () => {
    expect(resolveSessionUserId({ cookie: null, authorization: null })).toBeNull();
  });

  it('returns null for an invalid bearer token', () => {
    expect(resolveSessionUserId({ cookie: null, authorization: 'Bearer garbage' })).toBeNull();
  });
});
