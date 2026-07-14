import { describe, it, expect, beforeEach } from 'bun:test';
import { setupIntegrationTest } from '../test/setup';
import { revokeSession, isSessionRevoked } from './sessionRevocation';
import * as schemaSqlite from '../db/schema.sqlite';

let db: any;

beforeEach(async () => {
  const setup = await setupIntegrationTest();
  db = setup.db;
});

async function makeUser(userId: string) {
  await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
}

describe('sessionRevocation', () => {
  it('reports a jti as not revoked when it has never been recorded', async () => {
    expect(await isSessionRevoked(db, 'never-revoked-jti')).toBe(false);
  });

  it('reports a jti as revoked after revokeSession is called for it', async () => {
    const userId = 'user-revoke-1';
    await makeUser(userId);
    await revokeSession(db, 'jti-1', userId);
    expect(await isSessionRevoked(db, 'jti-1')).toBe(true);
  });

  it('does not throw when revoking the same jti twice', async () => {
    const userId = 'user-revoke-2';
    await makeUser(userId);
    await revokeSession(db, 'jti-2', userId);
    await expect(revokeSession(db, 'jti-2', userId)).resolves.toBeUndefined();
    expect(await isSessionRevoked(db, 'jti-2')).toBe(true);
  });

  it('does not revoke unrelated jtis', async () => {
    const userId = 'user-revoke-3';
    await makeUser(userId);
    await revokeSession(db, 'jti-revoked', userId);
    expect(await isSessionRevoked(db, 'jti-untouched')).toBe(false);
  });
});
