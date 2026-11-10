import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@connectrpc/connect';
import { AuthService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { http, HttpResponse } from 'msw';
import { server } from '../test/mockRpc';
import { BACKEND_URL, resolveBackendUrl } from './backendUrl';
import { workerConfiguration, verifyAgentCredential } from './agentCredential';

const expected = { agentId: 'agent-1', orgId: 'org-1', tokenId: 'token-1', scopes: ['tasks:read', 'comments:write'] };
const identity = { id: expected.agentId, orgId: expected.orgId, tokenId: expected.tokenId, scopes: expected.scopes, name: 'Release worker' };
const endpoint = `${BACKEND_URL}/tasker.health.v1.AuthService/GetIdentity`;

describe('deployment API destination', () => {
  it('uses development localhost and the actual production origin/custom port', () => {
    expect(resolveBackendUrl(undefined, true, 'https://tasker.example:8443')).toBe('http://localhost:8080');
    expect(resolveBackendUrl(undefined, false, 'https://tasker.example:8443')).toBe('https://tasker.example:8443');
  });
  it.each([true, false])('normalizes a trusted prefixed override in development=%s', development => {
    expect(resolveBackendUrl('https://api.example:9443/tasker///', development, 'https://ui.example')).toBe('https://api.example:9443/tasker');
  });
  it.each(['', '/api', 'javascript:alert(1)', 'https://secret:password@api.example', 'https://api.example/?secret=secret', 'https://api.example/#secret'])('rejects invalid trusted input without echoing it (%#)', configured => {
    expect(() => resolveBackendUrl(configured, false, 'https://ui.example')).toThrow('Invalid Tasker API configuration.');
    try { resolveBackendUrl(configured, false, 'https://ui.example'); } catch (error) { if (configured) expect(String(error)).not.toContain(configured); }
  });
  it('never invents a production localhost when the document origin is unusable', () => {
    expect(() => resolveBackendUrl(undefined, false, 'null')).toThrow('Invalid Tasker API configuration.');
  });
});

describe('existing external client configuration', () => {
  it('produces shell-safe literal values without evaluating worker-controlled text', () => {
    const config = workerConfiguration('shell', { endpoint: 'https://api.example/tasker', orgId: "org-'$(touch bad)", projectId: 'project\nnext' }, 'tskr_$(bad)');
    expect(config).toContain("export TASKER_BACKEND_URL='https://api.example/tasker'");
    expect(config).toContain("export TASKER_ORG_ID='org-'\"'\"'$(touch bad)'");
    expect(config).toContain("export TASKER_TOKEN='tskr_$(bad)'");
    expect(config).toContain('tasker auth whoami');
  });
  it('serializes valid MCP stdio JSON, with optional project and exact credential', () => {
    const config = JSON.parse(workerConfiguration('mcp', { endpoint: 'https://api.example/tasker', orgId: 'org"\\\n', projectId: 'project-1' }, 'tskr_"\\\n'));
    expect(config.mcpServers.tasker).toEqual({ command: 'tasker', args: ['mcp'], env: { TASKER_BACKEND_URL: 'https://api.example/tasker', TASKER_ORG_ID: 'org"\\\n', TASKER_PROJECT_ID: 'project-1', TASKER_TOKEN: 'tskr_"\\\n' } });
    expect(JSON.parse(workerConfiguration('mcp', { endpoint: BACKEND_URL, orgId: 'org-1' }, '<TOKEN>')).mcpServers.tasker.env).not.toHaveProperty('TASKER_PROJECT_ID');
  });
});

describe('exact issued credential identity proof', () => {
  it('makes a fresh cookie-free redirect-rejecting request with the exact bearer and signal', async () => {
    let calls = 0;
    server.use(http.post(endpoint, async ({ request }) => {
      calls++; expect(request.headers.get('authorization')).toBe('Bearer tskr_fixture'); expect(request.credentials).toBe('omit'); expect(request.redirect).toBe('error');
      return HttpResponse.json({ agent: identity });
    }));
    const controller = new AbortController();
    const result = await verifyAgentCredential('tskr_fixture', expected, controller.signal);
    expect(result).toMatchObject({ agentId: 'agent-1', name: 'Release worker', orgId: 'org-1', scopes: expected.scopes });
    expect(Number.isNaN(Date.parse(result.verifiedAt))).toBe(false);
    await verifyAgentCredential('tskr_fixture', expected, controller.signal); expect(calls).toBe(2);
  });
  it.each([
    { user: { id: 'administrator', name: 'Administrator' } },
    { agent: { ...identity, id: 'other' } }, { agent: { ...identity, orgId: 'foreign' } },
    { agent: { ...identity, tokenId: 'other' } }, { agent: { ...identity, scopes: ['tasks:read'] } },
    { agent: { ...identity, scopes: ['tasks:read', 'tasks:read'] } },
  ])('refuses human or mismatched issued identity (%#)', async response => {
    server.use(http.post(endpoint, () => HttpResponse.json(response)));
    await expect(verifyAgentCredential('tskr_fixture', expected, new AbortController().signal)).rejects.toThrow('The API returned a different identity.');
  });
  it('accepts scope order differences while checking all exact scopes', async () => {
    server.use(http.post(endpoint, () => HttpResponse.json({ agent: { ...identity, scopes: [...expected.scopes].reverse() } })));
    expect(await verifyAgentCredential('tskr_fixture', expected, new AbortController().signal)).toMatchObject({ agentId: 'agent-1' });
  });
  it.each([401, 403])('sanitizes credential refusal %s rather than retaining raw errors', async status => {
    server.use(http.post(endpoint, () => HttpResponse.json({ code: status === 401 ? 'unauthenticated' : 'permission_denied', message: 'tskr_fixture Authorization: Bearer tskr_fixture' }, { status })));
    await expect(verifyAgentCredential('tskr_fixture', expected, new AbortController().signal)).rejects.toThrow('Token refused. It may be expired or revoked.');
  });
  it('sanitizes unavailable responses and request failures', async () => {
    server.use(http.post(endpoint, () => HttpResponse.error()));
    await expect(verifyAgentCredential('tskr_fixture', expected, new AbortController().signal)).rejects.toThrow('Could not reach the API. Check connectivity and retry.');
  });
  it('honors cancellation', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(verifyAgentCredential('tskr_fixture', expected, controller.signal)).rejects.toThrow('Verification canceled.');
  });
});


it('uses one trusted prefixed API for normal sessions, cookie-free proof and worker configuration', async () => {
  const prefix = 'https://api.example:9443/tasker'; const credentials: RequestCredentials[] = [];
  server.use(http.get(`${prefix}/api/auth/session`, ({ request }) => { credentials.push(request.credentials); return HttpResponse.json({ authenticated: true, userId: 'user-1' }); }),
    http.post(`${prefix}/tasker.health.v1.AuthService/GetIdentity`, ({ request }) => { credentials.push(request.credentials); return HttpResponse.json({ agent: identity }); }));
  vi.stubEnv('VITE_BACKEND_URL', `${prefix}///`); vi.resetModules();
  try {
    const { BACKEND_URL: configured } = await import('./backendUrl');
    const { transport } = await import('./connectTransport'); const { fetchAuthSession } = await import('./authSession');
    const { verifyAgentCredential: verify, workerConfiguration: configuration } = await import('./agentCredential');
    await fetchAuthSession(); await createClient(AuthService, transport).getIdentity({}); await verify('tskr_fixture', expected, new AbortController().signal);
    expect(credentials).toEqual(['include', 'include', 'omit']);
    expect(JSON.parse(configuration('mcp', { endpoint: configured, orgId: expected.orgId }, '<TOKEN>')).mcpServers.tasker.env.TASKER_BACKEND_URL).toBe(prefix);
  } finally { vi.unstubAllEnvs(); vi.resetModules(); }
});
