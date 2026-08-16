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

describe('auth handler listLinkedIdentities / unlinkIdentity', () => {
  let db: any;
  let handler: ReturnType<typeof createAuthHandler>;

  beforeEach(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    handler = createAuthHandler(db);
    await db.insert(schemaSqlite.users).values({ id: 'user-links', email: 'links@example.com', createdAt: new Date() });
  });

  const ctxFor = (userId: string) => {
    const contextValues = createContextValues();
    contextValues.set(currentUserIdKey, userId);
    return { values: contextValues } as any;
  };

  const linkGoogle = (userId: string, providerUserId = `google-${userId}`) =>
    db.insert(schemaSqlite.linkedIdentities).values({
      id: `li-${providerUserId}`, userId, provider: 'google', providerUserId, linkedAt: new Date(),
    });

  it('lists nothing for an account with no linked identity', async () => {
    const result = await handler.listLinkedIdentities({}, ctxFor('user-links'));
    expect(result.identities).toEqual([]);
  });

  /** M13-T12. */
  it('reports hasPassword: false when the caller has never set one', async () => {
    const result = await handler.listLinkedIdentities({}, ctxFor('user-links'));
    expect(result.hasPassword).toBe(false);
  });

  it('reports hasPassword: true once one exists', async () => {
    await handler.setPassword({ newPassword: 'a-brand-new-password-1' }, ctxFor('user-links'));
    const result = await handler.listLinkedIdentities({}, ctxFor('user-links'));
    expect(result.hasPassword).toBe(true);
  });

  it('lists a linked identity', async () => {
    await linkGoogle('user-links');
    const result = await handler.listLinkedIdentities({}, ctxFor('user-links'));
    expect(result.identities).toHaveLength(1);
    expect(result.identities[0].provider).toBe('google');
  });

  it('only lists the caller\'s own linked identities, not another user\'s', async () => {
    await db.insert(schemaSqlite.users).values({ id: 'user-other-links', email: 'other@example.com', createdAt: new Date() });
    await linkGoogle('user-other-links');
    const result = await handler.listLinkedIdentities({}, ctxFor('user-links'));
    expect(result.identities).toEqual([]);
  });

  it('unlinks a provider identity when another sign-in method remains', async () => {
    await linkGoogle('user-links');
    await db.insert(schemaSqlite.passwordCredentials).values({
      userId: 'user-links', passwordHash: 'irrelevant', updatedAt: new Date(),
    });
    const result = await handler.unlinkIdentity({ provider: 'google' }, ctxFor('user-links'));
    expect(result).toEqual({ success: true });
    const rows = await db.select().from(schemaSqlite.linkedIdentities).where(eq(schemaSqlite.linkedIdentities.userId, 'user-links'));
    expect(rows).toHaveLength(0);
  });

  it('refuses to unlink the account\'s last remaining sign-in method (ADR-0012 SS5)', async () => {
    await linkGoogle('user-links'); // no password credential — this is the only method
    await expect(handler.unlinkIdentity({ provider: 'google' }, ctxFor('user-links'))).rejects.toThrow();
    const rows = await db.select().from(schemaSqlite.linkedIdentities).where(eq(schemaSqlite.linkedIdentities.userId, 'user-links'));
    expect(rows).toHaveLength(1); // not removed
  });

  it('allows unlinking one of two linked identities, keeping the other', async () => {
    await linkGoogle('user-links', 'google-a');
    await db.insert(schemaSqlite.linkedIdentities).values({
      id: 'li-github-a', userId: 'user-links', provider: 'github', providerUserId: 'github-a', linkedAt: new Date(),
    });
    await handler.unlinkIdentity({ provider: 'google' }, ctxFor('user-links'));
    const rows = await db.select().from(schemaSqlite.linkedIdentities).where(eq(schemaSqlite.linkedIdentities.userId, 'user-links'));
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe('github');
  });

  it('errors with NotFound when unlinking a provider that is not actually linked', async () => {
    await expect(handler.unlinkIdentity({ provider: 'google' }, ctxFor('user-links'))).rejects.toThrow();
  });

  it('rejects listLinkedIdentities/unlinkIdentity with no session', async () => {
    const contextValues = createContextValues();
    await expect(handler.listLinkedIdentities({}, { values: contextValues } as any)).rejects.toThrow();
    await expect(handler.unlinkIdentity({ provider: 'google' }, { values: contextValues } as any)).rejects.toThrow();
  });
});

describe('auth handler adminResetPassword', () => {
  let db: any;
  let handler: ReturnType<typeof createAuthHandler>;
  let orgId: string;
  let adminId: string;
  let memberId: string;

  beforeEach(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    handler = createAuthHandler(db);
    const stamp = Date.now() + '-' + Math.random().toString(36).slice(2);
    orgId = 'org-reset-' + stamp;
    adminId = 'user-reset-admin-' + stamp;
    memberId = 'user-reset-member-' + stamp;

    await db.insert(schemaSqlite.users).values([
      { id: adminId, email: `${adminId}@x.test`, createdAt: new Date() },
      { id: memberId, username: `member-${stamp}`, createdAt: new Date() },
    ]);
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: 'Reset Org', slug: orgId, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values([
      { orgId, userId: adminId, role: 'admin', joinedAt: new Date() },
      { orgId, userId: memberId, role: 'member', joinedAt: new Date() },
    ]);
  });

  const ctxFor = (userId: string) => {
    const contextValues = createContextValues();
    contextValues.set(currentUserIdKey, userId);
    return { values: contextValues } as any;
  };

  it('issues a temporary password an admin can relay, and sets mustChangePassword', async () => {
    const result = await handler.adminResetPassword({ orgId, userId: memberId }, ctxFor(adminId));
    expect(result.success).toBe(true);
    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(12);

    const rows = await db.select().from(schemaSqlite.passwordCredentials).where(eq(schemaSqlite.passwordCredentials.userId, memberId));
    expect(rows).toHaveLength(1);
    expect(rows[0].mustChangePassword).toBe(true);
    expect(await verifyPassword(result.temporaryPassword, rows[0].passwordHash)).toBe(true);
  });

  it('replaces an existing password credential rather than erroring', async () => {
    await handler.setPassword({ newPassword: 'the-old-password-123' }, ctxFor(memberId));
    const result = await handler.adminResetPassword({ orgId, userId: memberId }, ctxFor(adminId));
    const rows = await db.select().from(schemaSqlite.passwordCredentials).where(eq(schemaSqlite.passwordCredentials.userId, memberId));
    expect(rows).toHaveLength(1); // replaced, not a second row
    expect(await verifyPassword('the-old-password-123', rows[0].passwordHash)).toBe(false);
    expect(await verifyPassword(result.temporaryPassword, rows[0].passwordHash)).toBe(true);
  });

  it('clears an existing lockout on reset', async () => {
    await db.insert(schemaSqlite.passwordCredentials).values({
      userId: memberId, passwordHash: 'irrelevant', updatedAt: new Date(),
      failedAttempts: 7, lockedUntil: new Date(Date.now() + 60_000),
    });
    await handler.adminResetPassword({ orgId, userId: memberId }, ctxFor(adminId));
    const rows = await db.select().from(schemaSqlite.passwordCredentials).where(eq(schemaSqlite.passwordCredentials.userId, memberId));
    expect(rows[0].failedAttempts).toBe(0);
    expect(rows[0].lockedUntil).toBeNull();
  });

  it('refuses a non-admin member of the org', async () => {
    await expect(handler.adminResetPassword({ orgId, userId: memberId }, ctxFor(memberId))).rejects.toThrow();
  });

  it('refuses an admin of a DIFFERENT org naming this org\'s member', async () => {
    const otherOrgId = 'org-reset-other-' + Date.now();
    const otherAdminId = 'user-reset-other-admin-' + Date.now();
    await db.insert(schemaSqlite.users).values({ id: otherAdminId, email: `${otherAdminId}@x.test`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: otherOrgId, name: 'Other Org', slug: otherOrgId, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: otherOrgId, userId: otherAdminId, role: 'admin', joinedAt: new Date() });

    // Names the real target org and member, but the caller only administers
    // a different org — assertOrgAdmin must still deny this.
    await expect(handler.adminResetPassword({ orgId, userId: memberId }, ctxFor(otherAdminId))).rejects.toThrow();
  });

  it('refuses when the target user is not actually a member of the named org', async () => {
    const strangerId = 'user-reset-stranger-' + Date.now();
    await db.insert(schemaSqlite.users).values({ id: strangerId, email: `${strangerId}@x.test`, createdAt: new Date() });
    await expect(handler.adminResetPassword({ orgId, userId: strangerId }, ctxFor(adminId))).rejects.toThrow();
  });

  it('rejects with no session', async () => {
    const contextValues = createContextValues();
    await expect(handler.adminResetPassword({ orgId, userId: memberId }, { values: contextValues } as any)).rejects.toThrow();
  });
});
