import { describe, it, expect, beforeEach } from 'bun:test';
import { createContextValues } from '@connectrpc/connect';
import { eq } from 'drizzle-orm';
import { createAuthHandler } from './auth.handler';
import { currentUserIdKey } from './session';
import { setupIntegrationTest } from '../../test/setup';
import * as schemaSqlite from '../../db/schema.sqlite';
import { verifyPassword } from '../../lib/credentials';

describe('auth handler getIdentity', () => {
  it('returns the session user when a valid session is present', async () => {
    const users = [
      { id: 'user-a', email: 'a@tasker', name: 'A', createdAt: new Date() },
      { id: 'user-b', email: 'b@tasker', name: 'B', createdAt: new Date() },
    ];
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: (n: number) => users.filter((u) => u.id === 'user-b').slice(0, n),
          }),
          limit: (n: number) => users.slice(0, n),
        }),
      }),
    };
    const handler = createAuthHandler(db);
    const contextValues = createContextValues();
    contextValues.set(currentUserIdKey, 'user-b');

    const result = await handler.getIdentity({}, { values: contextValues } as any);
    expect(result.user.id).toBe('user-b');
  });

  it('rejects when there is no session instead of leaking/impersonating a user', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [],
          }),
        }),
      }),
    };
    const handler = createAuthHandler(db);
    const contextValues = createContextValues();

    await expect(handler.getIdentity({}, { values: contextValues } as any)).rejects.toThrow();
  });

  it('rejects with not-found when the session user id has no matching row', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [],
          }),
        }),
      }),
    };
    const handler = createAuthHandler(db);
    const contextValues = createContextValues();
    contextValues.set(currentUserIdKey, 'user-deleted');

    await expect(handler.getIdentity({}, { values: contextValues } as any)).rejects.toThrow();
  });
});

describe('auth handler setPassword', () => {
  let db: any;
  let handler: ReturnType<typeof createAuthHandler>;

  beforeEach(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    handler = createAuthHandler(db);
    await db.insert(schemaSqlite.users).values({ id: 'user-setpw', email: 'setpw@example.com', createdAt: new Date() });
  });

  const ctxFor = (userId: string) => {
    const contextValues = createContextValues();
    contextValues.set(currentUserIdKey, userId);
    return { values: contextValues } as any;
  };

  it('sets a password for an account that has never had one — no currentPassword required', async () => {
    const result = await handler.setPassword({ newPassword: 'a-brand-new-password-1' }, ctxFor('user-setpw'));
    expect(result).toEqual({ success: true });

    const rows = await db.select().from(schemaSqlite.passwordCredentials)
      .where(eq(schemaSqlite.passwordCredentials.userId, 'user-setpw'));
    expect(rows).toHaveLength(1);
    expect(await verifyPassword('a-brand-new-password-1', rows[0].passwordHash)).toBe(true);
  });

  it('rejects a new password shorter than the minimum', async () => {
    await expect(handler.setPassword({ newPassword: 'short' }, ctxFor('user-setpw'))).rejects.toThrow();
  });

  it('requires the correct currentPassword to replace an existing one', async () => {
    await handler.setPassword({ newPassword: 'the-first-password-1' }, ctxFor('user-setpw'));

    await expect(handler.setPassword(
      { currentPassword: 'wrong-current-password', newPassword: 'the-second-password-2' },
      ctxFor('user-setpw'),
    )).rejects.toThrow();

    // The wrong currentPassword must not have replaced the credential.
    const rows = await db.select().from(schemaSqlite.passwordCredentials)
      .where(eq(schemaSqlite.passwordCredentials.userId, 'user-setpw'));
    expect(await verifyPassword('the-first-password-1', rows[0].passwordHash)).toBe(true);
  });

  it('replaces an existing password when currentPassword verifies', async () => {
    await handler.setPassword({ newPassword: 'the-first-password-1' }, ctxFor('user-setpw'));
    await handler.setPassword(
      { currentPassword: 'the-first-password-1', newPassword: 'the-second-password-2' },
      ctxFor('user-setpw'),
    );

    const rows = await db.select().from(schemaSqlite.passwordCredentials)
      .where(eq(schemaSqlite.passwordCredentials.userId, 'user-setpw'));
    expect(rows).toHaveLength(1); // replaced, not a second row
    expect(await verifyPassword('the-first-password-1', rows[0].passwordHash)).toBe(false);
    expect(await verifyPassword('the-second-password-2', rows[0].passwordHash)).toBe(true);
  });

  it('resets failedAttempts and mustChangePassword on a successful set', async () => {
    await db.insert(schemaSqlite.passwordCredentials).values({
      userId: 'user-setpw', passwordHash: 'irrelevant', updatedAt: new Date(),
      failedAttempts: 3, lockedUntil: null, mustChangePassword: true,
    });
    await handler.setPassword(
      { currentPassword: 'irrelevant', newPassword: 'the-second-password-2' },
      ctxFor('user-setpw'),
    ).catch(() => {}); // the placeholder "hash" won't verify — expected

    // Confirm the guard actually fired (nothing changed) before proving the
    // success path separately below, so this test doesn't pass by accident.
    let rows = await db.select().from(schemaSqlite.passwordCredentials)
      .where(eq(schemaSqlite.passwordCredentials.userId, 'user-setpw'));
    expect(rows[0].failedAttempts).toBe(3);

    const realHash = (await import('../../lib/credentials')).hashPassword;
    await db.update(schemaSqlite.passwordCredentials)
      .set({ passwordHash: await realHash('the-current-real-password'), failedAttempts: 3, mustChangePassword: true })
      .where(eq(schemaSqlite.passwordCredentials.userId, 'user-setpw'));

    await handler.setPassword(
      { currentPassword: 'the-current-real-password', newPassword: 'the-second-password-2' },
      ctxFor('user-setpw'),
    );
    rows = await db.select().from(schemaSqlite.passwordCredentials)
      .where(eq(schemaSqlite.passwordCredentials.userId, 'user-setpw'));
    expect(rows[0].failedAttempts).toBe(0);
    expect(rows[0].mustChangePassword).toBe(false);
  });

  it('rejects when there is no session', async () => {
    const contextValues = createContextValues();
    await expect(handler.setPassword({ newPassword: 'a-brand-new-password-1' }, { values: contextValues } as any))
      .rejects.toThrow();
  });
});
