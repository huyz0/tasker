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

    const result = await handler.getIdentity({}, { contextValues } as any);
    expect(result.user.id).toBe('user-b');
  });

  it('falls back to the first user when there is no session', async () => {
    const users = [{ id: 'user-a', email: 'a@tasker', name: 'A', createdAt: new Date() }];
    const db = {
      select: () => ({
        from: () => ({
          limit: (n: number) => users.slice(0, n),
        }),
      }),
    };
    const handler = createAuthHandler(db);
    const contextValues = createContextValues();

    const result = await handler.getIdentity({}, { contextValues } as any);
    expect(result.user.id).toBe('user-a');
  });
});
