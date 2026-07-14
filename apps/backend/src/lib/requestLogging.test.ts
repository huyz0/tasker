import { describe, it, expect, mock } from 'bun:test';
import { createContextValues } from '@connectrpc/connect';
import { requestLoggingInterceptor, requestIdKey } from './requestLogging';
import { getRequestContext } from './requestContext';
import { createSessionToken } from '../modules/auth/session';

function makeReq(overrides: Partial<any> = {}) {
  const { header, ...rest } = overrides;
  return {
    header: new Headers(header ?? {}),
    contextValues: createContextValues(),
    method: { name: 'GetIdentity', parent: { typeName: 'tasker.health.v1.AuthService' } },
    stream: false,
    ...rest,
  };
}

describe('requestLoggingInterceptor', () => {
  it('generates a request id when the client sends none, and stamps it on both context and response', async () => {
    const req = makeReq();
    const next = mock(async () => ({ stream: false, header: new Headers() }));

    const res = await requestLoggingInterceptor(next as any)(req as any);

    const requestId = req.contextValues.get(requestIdKey);
    expect(requestId).toBeTruthy();
    expect((res as any).header.get('x-request-id')).toBe(requestId);
  });

  it('reuses an incoming x-request-id instead of generating a new one', async () => {
    const req = makeReq({ header: { 'x-request-id': 'client-supplied-id' } });
    const next = mock(async () => ({ stream: false, header: new Headers() }));

    const res = await requestLoggingInterceptor(next as any)(req as any);

    expect(req.contextValues.get(requestIdKey)).toBe('client-supplied-id');
    expect((res as any).header.get('x-request-id')).toBe('client-supplied-id');
  });

  it('binds requestId (and userId, when authenticated) into the request context for the duration of next()', async () => {
    const token = createSessionToken('user-obs-2');
    const req = makeReq({ header: { 'x-request-id': 'ctx-test-id', authorization: `Bearer ${token}` } });

    let seenDuringNext: ReturnType<typeof getRequestContext>;
    const next = mock(async () => {
      seenDuringNext = getRequestContext();
      return { stream: false, header: new Headers() };
    });

    await requestLoggingInterceptor(next as any)(req as any);

    expect(seenDuringNext).toEqual({ requestId: 'ctx-test-id', userId: 'user-obs-2' });
    // The context must not leak past the request - nothing bound it here.
    expect(getRequestContext()).toBeUndefined();
  });

  it('binds a null userId when the request has no valid session, instead of omitting it silently', async () => {
    const req = makeReq({ header: { 'x-request-id': 'ctx-test-anon' } });

    let seenDuringNext: ReturnType<typeof getRequestContext>;
    const next = mock(async () => {
      seenDuringNext = getRequestContext();
      return { stream: false, header: new Headers() };
    });

    await requestLoggingInterceptor(next as any)(req as any);

    expect(seenDuringNext).toEqual({ requestId: 'ctx-test-anon', userId: null });
  });

  it('propagates errors after logging, without swallowing them', async () => {
    const req = makeReq();
    const next = mock(async () => {
      throw new Error('downstream failure');
    });

    await expect(requestLoggingInterceptor(next as any)(req as any)).rejects.toThrow('downstream failure');
  });
});
