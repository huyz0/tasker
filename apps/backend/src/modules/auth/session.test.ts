import { describe, it, expect } from 'bun:test';
import { createSessionToken, verifySessionToken, parseSessionCookie } from './session';

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
});
