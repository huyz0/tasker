import { describe, it, expect } from 'bun:test';
import { createContextValues } from '@connectrpc/connect';
import { createAuthHandler } from './auth.handler';
import { currentUserIdKey } from './session';

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
