import { describe, it, expect } from 'bun:test';
import { hashPassword, verifyPassword, generateTemporaryPassword, MIN_PASSWORD_LENGTH } from './credentials';

describe('hashPassword / verifyPassword', () => {
  it('round-trips: a hashed password verifies against its own plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects the wrong plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password entirely', hash)).toBe(false);
  });

  it('never stores the plaintext in the hash', async () => {
    const hash = await hashPassword('a-very-searchable-plaintext-marker');
    expect(hash).not.toContain('a-very-searchable-plaintext-marker');
  });

  it('is argon2id, self-describing its parameters', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$/);
  });

  it('salts independently — hashing the same password twice never produces the same hash', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same password', a)).toBe(true);
    expect(await verifyPassword('same password', b)).toBe(true);
  });

  it('verifies a hash produced under different cost parameters — the whole point of PHC-format storage', async () => {
    // Simulates a hash minted before a future cost-parameter change: lower
    // memory/time cost than this module's (Bun's) default. verifyPassword
    // must not assume today's parameters — it must read them from the hash.
    const oldHash = await Bun.password.hash('legacy password', {
      algorithm: 'argon2id',
      memoryCost: 19456,
      timeCost: 2,
    });
    expect(await verifyPassword('legacy password', oldHash)).toBe(true);
    expect(await verifyPassword('wrong', oldHash)).toBe(false);
  });

  it('never throws on a malformed or foreign-format hash', async () => {
    expect(await verifyPassword('anything', 'not-a-real-hash')).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
    expect(await verifyPassword('', 'not-a-real-hash')).toBe(false);
    // A bcrypt hash from a hypothetical prior system - a different format
    // entirely, not just a bad argon2id string.
    expect(await verifyPassword('anything', '$2b$10$abcdefghijklmnopqrstuv')).toBe(false);
  });
});

describe('MIN_PASSWORD_LENGTH', () => {
  it('is a real minimum, not zero or absurdly low', () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
  });
});

describe('generateTemporaryPassword (M13-T10)', () => {
  it('clears MIN_PASSWORD_LENGTH with margin', () => {
    expect(generateTemporaryPassword().length).toBeGreaterThan(MIN_PASSWORD_LENGTH);
  });

  it('is a fresh random value every call, not a fixture string', () => {
    const values = new Set(Array.from({ length: 20 }, () => generateTemporaryPassword()));
    expect(values.size).toBe(20);
  });

  it('is verifiable through the same hashPassword/verifyPassword path as any other password', async () => {
    const temp = generateTemporaryPassword();
    const hash = await hashPassword(temp);
    expect(await verifyPassword(temp, hash)).toBe(true);
  });

  it('is transcription-friendly base64url — no characters a URL or a typed copy-paste would mangle', () => {
    expect(generateTemporaryPassword()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
