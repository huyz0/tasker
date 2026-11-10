import { spyOn } from 'storybook/test';
import { BACKEND_URL } from '../src/lib/backendUrl';

type TokenState = 'empty' | 'loading' | 'denied' | 'error' | 'issuing' | 'issue-failed' | 'ready' | 'copy-failed' | 'verifying' | 'verified' | 'refused' | 'offline' | 'unexpected' | 'revoked' | 'expired' | 'long';
export const fixtureCredential = { agentId: 'agent-storybook', orgId: 'org-storybook', tokenId: 'token-storybook', scopes: ['tasks:read'], plaintext: 'tskr_storybook_synthetic_secret_not_a_credential' };
export function agentTokenFixture(state: TokenState = 'empty') {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const token = { id: fixtureCredential.tokenId, agentId: fixtureCredential.agentId, orgId: fixtureCredential.orgId,
    name: state === 'long' ? `Release${'W'.repeat(120)}漢😀` : 'Release worker', scopes: fixtureCredential.scopes,
    tokenPrefix: 'tskr_demo', expiresAt: new Date(Date.now() + (state === 'expired' ? -1 : 90) * 86400000).toISOString(), revokedAt: state === 'revoked' ? '2026-11-10T10:00:00Z' : '', expired: state === 'expired' };
  let issued = state === 'revoked' || state === 'expired', used = false;
  const mock = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (!request.url.startsWith(`${BACKEND_URL}/`)) return nativeFetch(input, init);
    const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const fail = (code: string, message: string, status = 400) => json({ code, message }, status);
    const hold = () => new Promise<Response>((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
    if (request.url.endsWith('/api/client-errors')) return json({});
    if (request.url.endsWith('/ListAgentTokens')) {
      if (state === 'loading') return hold();
      if (state === 'denied') return fail('permission_denied', 'Administrator access required.', 403);
      if (state === 'error') return fail('unavailable', 'Token service offline.', 503);
      return json({ tokens: issued ? [{ ...token, lastUsedAt: used ? '2026-11-10T10:00:00Z' : '' }] : [] });
    }
    if (request.url.endsWith('/CreateAgentToken')) {
      if (state === 'issuing') return hold();
      if (state === 'issue-failed') return fail('permission_denied', 'Token creation refused.', 403);
      issued = true; return json({ token, plaintext: fixtureCredential.plaintext });
    }
    if (request.url.endsWith('/GetIdentity')) {
      if (state === 'verifying') return hold();
      if (state === 'refused') return fail('unauthenticated', 'Invalid credential.', 401);
      if (state === 'offline') throw new TypeError('Network unavailable');
      if (state === 'unexpected') return json({ user: { id: 'human-storybook', name: 'Administrator' } });
      used = true; return json({ agent: { id: fixtureCredential.agentId, orgId: fixtureCredential.orgId, tokenId: fixtureCredential.tokenId, scopes: fixtureCredential.scopes, name: 'Release worker' } });
    }
    if (request.url.endsWith('/RevokeAgentToken')) return json({ success: true });
    return nativeFetch(input, init);
  });
  const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { if (state === 'copy-failed') throw new Error('Clipboard unavailable'); } } });
  return () => { mock.mockRestore(); if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard); else Reflect.deleteProperty(navigator, 'clipboard'); };
}
