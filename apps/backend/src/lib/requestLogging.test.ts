import { describe, it, expect, mock } from 'bun:test';
import { createContextValues } from '@connectrpc/connect';
import { requestLoggingInterceptor, requestIdKey } from './requestLogging';

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

  it('propagates errors after logging, without swallowing them', async () => {
    const req = makeReq();
    const next = mock(async () => {
      throw new Error('downstream failure');
    });

    await expect(requestLoggingInterceptor(next as any)(req as any)).rejects.toThrow('downstream failure');
  });
});
