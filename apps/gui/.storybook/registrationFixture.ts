import { spyOn } from 'storybook/test';
import { BACKEND_URL } from '../src/lib/backendUrl';
import { useLayoutStore } from '../src/store/layout';
type RegistrationState = 'populated' | 'empty' | 'loading' | 'error' | 'no-roles' | 'roles-error' | 'pending' | 'denied' | 'beyond-page' | 'long' | 'no-org' | 'auth-loading' | 'signed-out' | 'role-pending' | 'role-denied';
interface FixtureBody { name?: string; agentId?: string; agentRoleId?: string; systemPrompt?: string; capabilities?: string; page?: { cursor?: string; limit?: number }; }
interface FixtureAgent { id: string; orgId: string; name: string; agentRoleId: string; }
/** Native serialized responses and a fresh scoped store for each preview. */
export function registrationFixture(state: RegistrationState = 'populated') {
  const previous = useLayoutStore.getState(); useLayoutStore.setState({ activeOrgId: state === 'no-org' ? '' : 'org-storybook', activeProjectId: '' });
  const nativeFetch = globalThis.fetch.bind(globalThis);
  let roles = state === 'no-roles' ? [] : [{ id: 'role-storybook', orgId: 'org-storybook', name: 'Release reviewer', systemPrompt: 'Inspect release evidence before handoff.', capabilities: '["review"]' }];
  let agents: FixtureAgent[] = state === 'empty' || state === 'no-roles' ? [] : state === 'beyond-page' ? Array.from({ length: 125 }, (_, index) => ({ id: `agent-${String(index).padStart(3, '0')}`, orgId: 'org-storybook', name: `Registered worker ${index + 1}`, agentRoleId: 'role-storybook' }))
    : [{ id: 'agent-storybook', orgId: 'org-storybook', name: state === 'long' ? `Release${'W'.repeat(120)}漢😀` : 'Release worker', agentRoleId: 'role-storybook' }];
  const mock = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init); if (!request.url.startsWith(`${BACKEND_URL}/`)) return nativeFetch(input, init);
    const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const fail = (code: string, message: string, status = 400) => json({ code, message }, status);
    const hold = () => new Promise<Response>((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
    if (request.url.endsWith('/api/auth/session')) return state === 'auth-loading' ? hold() : json({ authenticated: state !== 'signed-out', userId: state === 'signed-out' ? null : 'user-storybook' });
    if (request.url.endsWith('/api/client-errors')) return json({});
    const body = await request.json() as FixtureBody;
    if (request.url.endsWith('/ListAgents')) {
      if (state === 'loading') return hold(); if (state === 'error') return fail('unavailable', 'The registered-agent list is temporarily offline.', 503);
      const start = Number(body.page?.cursor ?? 0), limit = body.page?.limit || 50, next = Math.min(start + limit, agents.length);
      return json({ agents: agents.slice(start, next), page: { totalCount: agents.length, nextCursor: next < agents.length ? String(next) : undefined } });
    }
    if (request.url.endsWith('/ListAgentRoles')) return state === 'roles-error' ? fail('permission_denied', 'The role catalog is unavailable to this account.', 403) : json({ roles, page: { totalCount: roles.length } });
    if (request.url.endsWith('/GetDashboard')) return json({ agents: agents.slice(0, 8).map(agent => ({ id: agent.id, name: agent.name, openTaskCount: 0 })) });
    if (request.url.endsWith('/ListAgentTokens')) return json({ tokens: [] });
    if (request.url.endsWith('/CreateAgent')) {
      if (state === 'pending') return hold(); if (state === 'denied') return fail('permission_denied', 'Only an authorized administrator can register agents.', 403);
      const agent = { id: 'zz-new-agent', orgId: 'org-storybook', name: body.name ?? '', agentRoleId: body.agentRoleId ?? '' }; agents = [...agents, agent]; return json({ agent });
    }
    if (request.url.endsWith('/CreateAgentRole')) {
      if (state === 'role-pending') return hold(); if (state === 'role-denied') return fail('permission_denied', 'Role creation requires current administrator authority.', 403);
      const role = { id: 'role-new', orgId: 'org-storybook', name: body.name ?? '', systemPrompt: body.systemPrompt ?? '', capabilities: body.capabilities ?? '' }; roles = [...roles, role]; return json({ role }); }
    if (request.url.endsWith('/ArchiveAgent')) { agents = agents.filter(agent => agent.id !== body.agentId); return json({ success: true }); }
    return fail('unimplemented', 'This preview has no fixture for that action.');
  });
  return () => { mock.mockRestore(); useLayoutStore.setState(previous); };
}
