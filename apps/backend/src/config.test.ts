import { describe, it, expect } from 'bun:test';

// config.ts validates env vars once at import time (a singleton), so the only
// reliable way to exercise its fail-fast behavior for different env
// combinations is to run it in a fresh subprocess per scenario.
async function loadConfigWith(env: Record<string, string | undefined>) {
  const proc = Bun.spawn({
    cmd: ['bun', '-e', 'import("./src/config.ts")'],
    cwd: import.meta.dir + '/..',
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const exitCode = await proc.exited;
  return { exitCode };
}

describe('config production safety checks', () => {
  it('fails fast in production with the default JWT secret', async () => {
    const { exitCode } = await loadConfigWith({
      NODE_ENV: 'production',
      JWT_SECRET: undefined,
      APP_ENCRYPTION_SECRET: 'a-real-encryption-secret32bytes!',
      ENABLE_TEST_LOGIN: 'false',
    });
    expect(exitCode).not.toBe(0);
  });

  it('fails fast in production with the default encryption secret', async () => {
    const { exitCode } = await loadConfigWith({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-real-jwt-secret',
      APP_ENCRYPTION_SECRET: undefined,
      ENABLE_TEST_LOGIN: 'false',
    });
    expect(exitCode).not.toBe(0);
  });

  it('fails fast in production when test login is enabled', async () => {
    const { exitCode } = await loadConfigWith({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-real-jwt-secret',
      APP_ENCRYPTION_SECRET: 'a-real-encryption-secret32bytes!',
      ENABLE_TEST_LOGIN: 'true',
    });
    expect(exitCode).not.toBe(0);
  });

  it('starts cleanly in production with real secrets and test login disabled', async () => {
    const { exitCode } = await loadConfigWith({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-real-jwt-secret',
      APP_ENCRYPTION_SECRET: 'a-real-encryption-secret32bytes!',
      ENABLE_TEST_LOGIN: 'false',
      GOOGLE_CLIENT_ID: 'x',
      GOOGLE_CLIENT_SECRET: 'x',
      GOOGLE_REDIRECT_URI: 'x',
    });
    expect(exitCode).toBe(0);
  });

  it('fails fast in production when the encryption secret is not exactly 32 bytes', async () => {
    const { exitCode } = await loadConfigWith({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-real-jwt-secret',
      APP_ENCRYPTION_SECRET: 'too-short-for-aes-256-gcm',
      ENABLE_TEST_LOGIN: 'false',
    });
    expect(exitCode).not.toBe(0);
  });

  it('allows default secrets outside production (dev/test convenience)', async () => {
    const { exitCode } = await loadConfigWith({
      NODE_ENV: 'development',
      JWT_SECRET: undefined,
      APP_ENCRYPTION_SECRET: undefined,
      ENABLE_TEST_LOGIN: 'true',
    });
    expect(exitCode).toBe(0);
  });

  it('fails fast in production with no CORS allowed origins configured', async () => {
    const { exitCode } = await loadConfigWith({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-real-jwt-secret',
      APP_ENCRYPTION_SECRET: 'a-real-encryption-secret32bytes!',
      ENABLE_TEST_LOGIN: 'false',
      CORS_ALLOWED_ORIGINS: '',
    });
    expect(exitCode).not.toBe(0);
  });

  it('fails fast in production with no Google OAuth client configured', async () => {
    const { exitCode } = await loadConfigWith({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-real-jwt-secret',
      APP_ENCRYPTION_SECRET: 'a-real-encryption-secret32bytes!',
      ENABLE_TEST_LOGIN: 'false',
      CORS_ALLOWED_ORIGINS: 'https://app.example.com',
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
      GOOGLE_REDIRECT_URI: undefined,
    });
    expect(exitCode).not.toBe(0);
  });

  it('starts cleanly in production with CORS_ALLOWED_ORIGINS set', async () => {
    const { exitCode } = await loadConfigWith({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-real-jwt-secret',
      APP_ENCRYPTION_SECRET: 'a-real-encryption-secret32bytes!',
      ENABLE_TEST_LOGIN: 'false',
      GOOGLE_CLIENT_ID: 'x',
      GOOGLE_CLIENT_SECRET: 'x',
      GOOGLE_REDIRECT_URI: 'x',
      CORS_ALLOWED_ORIGINS: 'https://app.example.com',
    });
    expect(exitCode).toBe(0);
  });
});
