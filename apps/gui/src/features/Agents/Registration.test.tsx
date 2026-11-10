import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { AgentService, DashboardService, EventService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { http, HttpResponse } from 'msw';
import { BACKEND_URL } from '../../lib/backendUrl';
import { mockRpc, mockRpcPending, server } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { AgentsDashboard } from './index';
import { useLiveEvents } from '../../hooks/useLiveEvents';
import { confirmAction } from '../../test/confirm';

const scope = vi.hoisted(() => ({ orgId: 'org-1' }));
vi.mock('../../store/layout', () => ({ useLayoutStore: (selector: (state: { activeOrgId: string; activeProjectId: string; setActivePageTitle: () => void }) => unknown) => selector({ activeOrgId: scope.orgId, activeProjectId: '', setActivePageTitle: () => undefined }) }));
const role = { id: 'role-1', orgId: 'org-1', name: 'Researcher', systemPrompt: 'Inspect work', capabilities: '[]' };
const existing = { id: 'agent-1', name: 'Existing worker', orgId: 'org-1', agentRoleId: 'role-1' };
function view(element = <AgentsDashboard />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); client.setQueryData(['authSession'], { authenticated: true, userId: 'user-1' });
  return renderScoped(element, { queryClient: client, initialEntry: '/agents?org=org-1' });
}
async function registerDraft(name = 'Release worker', roleId = 'role-1') {
  fireEvent.click(await screen.findByRole('button', { name: 'Register agent' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Agent name' }), { target: { value: name } });
  await screen.findByRole('option', { name: 'Researcher' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), { target: { value: roleId } });
}
function roleDraft() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Role name' }), { target: { value: 'Release reviewer' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'System prompt' }), { target: { value: 'Inspect release evidence' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Capabilities' }), { target: { value: '["review"]' } });
}
beforeEach(() => {
  scope.orgId = 'org-1'; mockRpc(AgentService, 'ListAgents', { agents: [existing], page: { totalCount: 1 } });
  mockRpc(AgentService, 'ListAgentRoles', { roles: [role] }); mockRpc(DashboardService, 'GetDashboard', { agents: [] });
  mockRpc(AgentService, 'ListAgentTokens', { tokens: [] });
});

describe('registering an external worker identity', () => {
  it('uses registration language and states who starts the worker', async () => {
    mockRpc(AgentService, 'ListAgents', { agents: [] }); view();
    expect(await screen.findByRole('heading', { name: 'Registered agents' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Register agent' })).toBeVisible();
    expect(await screen.findByText('No agents registered yet.')).toBeVisible();
    expect(screen.getByText(/run the worker in your own environment/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Deploy/ })).not.toBeInTheDocument();
  });

  it('preserves the name and role across cancel and reopen in the current scope', async () => {
    view(); await registerDraft(); fireEvent.click(screen.getByRole('button', { name: 'Cancel registration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Register agent' }));
    expect(screen.getByRole('textbox', { name: 'Agent name' })).toHaveValue('Release worker');
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveValue('role-1');
  });

  it('guides an empty role catalogue into existing role creation without losing the name', async () => {
    let created = false;
    mockRpc(AgentService, 'ListAgentRoles', () => ({ roles: created ? [{ ...role, id: 'role-new', name: 'Release reviewer' }] : [] }));
    mockRpc(AgentService, 'CreateAgentRole', () => { created = true; return { role: { ...role, id: 'role-new', name: 'Release reviewer' } }; });
    view(); fireEvent.click(await screen.findByRole('button', { name: 'Register agent' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent name' }), { target: { value: 'My worker' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Create a role' }));
    roleDraft(); fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Role' })).toHaveValue('role-new'));
    expect(screen.getByRole('textbox', { name: 'Agent name' })).toHaveValue('My worker');
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveFocus();
  });

  it.each(['later choice', 'canceled registration'])('keeps %s when role creation completes late', async mode => {
    const pending = mockRpcPending(AgentService, 'CreateAgentRole');
    mockRpc(AgentService, 'ListAgentRoles', { roles: [role, { ...role, id: 'role-2', name: 'Builder' }, { ...role, id: 'role-new', name: 'Release reviewer' }] });
    view(); await registerDraft(); fireEvent.click(screen.getByRole('button', { name: 'New role' })); roleDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Create role' })); await waitFor(() => expect(pending.requests).toHaveLength(1));
    if (mode === 'later choice') fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), { target: { value: 'role-2' } });
    else fireEvent.click(screen.getByRole('button', { name: 'Cancel registration' }));
    await act(async () => pending.resolve({ role: { ...role, id: 'role-new', name: 'Release reviewer' } }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'New role' })).toBeVisible());
    if (mode === 'later choice') expect(screen.getByRole('combobox', { name: 'Role' })).toHaveValue('role-2');
    else expect(screen.queryByRole('textbox', { name: 'Agent name' })).not.toBeInTheDocument();
  });

  it('keeps a canceled registration retired when the server creates it later', async () => {
    const pending = mockRpcPending(AgentService, 'CreateAgent'); view(); await registerDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Register' })); await waitFor(() => expect(pending.requests).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel registration' }));
    fireEvent.click(screen.getByRole('button', { name: 'Register agent' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent name' }), { target: { value: 'Later draft' } });
    await act(async () => pending.resolve({ agent: { ...existing, id: 'late-agent', name: 'Release worker' } }));
    expect(screen.queryByRole('region', { name: /^Connect / })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Agent name' })).toHaveValue('Later draft');
  });

  it('opens the returned agent connection outside loaded rows and closes to the list heading', async () => {
    const tokenReads: string[] = [];
    mockRpc(AgentService, 'ListAgents', { agents: [existing], page: { totalCount: 125, nextCursor: 'more' } });
    mockRpc(AgentService, 'ListAgentTokens', request => { tokenReads.push(request.agentId); return { tokens: [] }; });
    mockRpc(AgentService, 'CreateAgent', { agent: { ...existing, id: 'new-agent', name: 'Release worker' } });
    view(); await registerDraft(); fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    const connection = await screen.findByRole('region', { name: 'Connect Release worker' });
    expect(within(connection).getByRole('heading', { name: 'Connect Release worker' })).toHaveFocus();
    await waitFor(() => expect(tokenReads).toContain('new-agent'));
    fireEvent.click(within(connection).getByRole('button', { name: 'Close connection setup' }));
    expect(screen.getByRole('heading', { name: 'Registered agents' })).toHaveFocus();
  });

  it('uses one connection section for an existing Tokens action and returns useful focus', async () => {
    view(); const trigger = await screen.findByRole('button', { name: 'Tokens for Existing worker' }); trigger.focus(); fireEvent.click(trigger);
    const connection = await screen.findByRole('region', { name: 'Connect Existing worker' }); expect(screen.getAllByRole('region', { name: /^Connect / })).toHaveLength(1);
    fireEvent.click(within(connection).getByRole('button', { name: 'Close connection setup' })); expect(trigger).toHaveFocus();
  });

  it.each(['organization', 'account'])('keeps a new %s draft and current reads independent of a late old registration', async mode => {
    let identity = 'user-1'; const pending = mockRpcPending(AgentService, 'CreateAgent');
    mockRpc(AgentService, 'ListAgents', request => ({ agents: [{ ...existing, orgId: request.orgId, agentRoleId: request.orgId === 'org-1' ? 'role-1' : 'role-2', id: `${identity}-${request.orgId}`, name: `${identity} ${request.orgId}` }], page: { totalCount: 1 } }));
    mockRpc(AgentService, 'ListAgentRoles', request => ({ roles: [{ ...role, orgId: request.orgId, id: request.orgId === 'org-1' ? 'role-1' : 'role-2' }] }));
    const ui = view(); await registerDraft('Old draft'); fireEvent.click(screen.getByRole('button', { name: 'Register' })); await waitFor(() => expect(pending.requests).toHaveLength(1));
    if (mode === 'organization') scope.orgId = 'org-2'; else { identity = 'user-2'; ui.queryClient.setQueryData(['authSession'], { authenticated: true, userId: identity }); }
    ui.rerender(); await screen.findByText(`${identity} ${scope.orgId}`); await registerDraft('New scope draft', mode === 'organization' ? 'role-2' : 'role-1');
    await act(async () => pending.resolve({ agent: { ...existing, id: 'old-created', name: 'Old draft' } }));
    expect(screen.getByRole('textbox', { name: 'Agent name' })).toHaveValue('New scope draft'); expect(screen.queryByRole('region', { name: /^Connect / })).not.toBeInTheDocument();
  });

  it('requires an organization before any registration reads or actions', async () => {
    const reads: string[] = []; scope.orgId = ''; mockRpc(AgentService, 'ListAgents', request => { reads.push(request.orgId); return { agents: [] }; }); view();
    expect(await screen.findByText(/choose an organization/i)).toBeVisible(); expect(screen.queryByRole('button', { name: 'Register agent' })).not.toBeInTheDocument(); expect(reads).toEqual([]);
  });
  it('retires a draft on confirmed logout and starts fresh after signing back in', async () => {
    const ui = view(); await registerDraft('Private draft');
    act(() => ui.queryClient.setQueryData(['authSession'], { authenticated: false, userId: null }));
    expect(await screen.findByText(/sign in to register/i)).toBeVisible();
    act(() => ui.queryClient.setQueryData(['authSession'], { authenticated: true, userId: 'user-1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Register agent' }));
    expect(screen.getByRole('textbox', { name: 'Agent name' })).toHaveValue('');
  });

  it('retains the draft through a transient session verification error with the same confirmed identity', async () => {
    const ui = view(); await registerDraft('Retained draft');
    server.use(http.get(`${BACKEND_URL}/api/auth/session`, () => HttpResponse.json({ message: 'Temporary outage' }, { status: 503 })));
    await act(async () => ui.queryClient.refetchQueries({ queryKey: ['authSession'] }));
    expect(screen.getByRole('textbox', { name: 'Agent name' })).toHaveValue('Retained draft');
  });

  it('preserves a reopened role draft when an earlier role creation finishes', async () => {
    const pending = mockRpcPending(AgentService, 'CreateAgentRole'); view(); await registerDraft();
    fireEvent.click(screen.getByRole('button', { name: 'New role' })); roleDraft(); fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    await waitFor(() => expect(pending.requests).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); fireEvent.click(screen.getByRole('button', { name: 'New role' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Role name' }), { target: { value: 'Later role draft' } });
    await act(async () => pending.resolve({ role: { ...role, id: 'role-late', name: 'Release reviewer' } }));
    expect(screen.getByRole('textbox', { name: 'Role name' })).toHaveValue('Later role draft');
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveValue('role-1');
  });

  it('closes an archived agent setup to the stable list heading before delayed row reconciliation', async () => {
    let pending: ReturnType<typeof mockRpcPending> | undefined;
    mockRpc(AgentService, 'ArchiveAgent', () => { pending = mockRpcPending(AgentService, 'ListAgents'); return { success: true }; });
    view(); fireEvent.click(await screen.findByRole('button', { name: 'Tokens for Existing worker' }));
    await screen.findByRole('region', { name: 'Connect Existing worker' }); fireEvent.click(screen.getByRole('button', { name: 'Delete' })); await confirmAction();
    await waitFor(() => expect(screen.queryByRole('region', { name: /^Connect / })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Registered agents' })).toHaveFocus();
    await act(async () => pending!.resolve({ agents: [] })); expect(await screen.findByText('No agents registered yet.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Registered agents' })).toHaveFocus();
  });

  it('preserves a later connection choice when registration completes', async () => {
    const pending = mockRpcPending(AgentService, 'CreateAgent'); view(); await registerDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Register' })); await waitFor(() => expect(pending.requests).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Tokens for Existing worker' })); const current = await screen.findByRole('region', { name: 'Connect Existing worker' });
    await act(async () => pending.resolve({ agent: { ...existing, id: 'created-later', name: 'Release worker' } }));
    expect(current).toBeVisible(); expect(screen.queryByRole('region', { name: 'Connect Release worker' })).not.toBeInTheDocument();
  });

  it('keeps focus in role writing while registration completes in the background', async () => {
    const pending = mockRpcPending(AgentService, 'CreateAgent'); view(); await registerDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Register' })); await waitFor(() => expect(pending.requests).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'New role' })); const input = screen.getByRole('textbox', { name: 'Role name' }); input.focus();
    fireEvent.change(input, { target: { value: 'My current writing' } });
    await act(async () => pending.resolve({ agent: { ...existing, id: 'created-later', name: 'Release worker' } }));
    await screen.findByRole('region', { name: 'Connect Release worker' }); expect(input).toHaveFocus(); expect(input).toHaveValue('My current writing');
  });

  it('freezes the submitted role fields while creation is pending', async () => {
    const pending = mockRpcPending(AgentService, 'CreateAgentRole'); view();
    fireEvent.click(await screen.findByRole('button', { name: 'New role' })); roleDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Create role' })); await waitFor(() => expect(pending.requests).toHaveLength(1));
    expect(screen.getByRole('textbox', { name: 'Role name' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'System prompt' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Capabilities' })).toBeDisabled();
    await act(async () => pending.resolve({ role: { ...role, id: 'role-new', name: 'Release reviewer' } }));
    expect(screen.queryByRole('textbox', { name: 'Role name' })).not.toBeInTheDocument();
  });

  it('reconciles recorded activity after registration instead of retaining the empty source', async () => {
    let present = false; const agent = { ...existing, id: 'created-agent', name: 'New activity worker' };
    mockRpc(AgentService, 'ListAgents', () => ({ agents: present ? [agent] : [], page: { totalCount: present ? 1 : 0 } }));
    mockRpc(DashboardService, 'GetDashboard', () => ({ agents: present ? [{ id: agent.id, name: agent.name }] : [] }));
    mockRpc(AgentService, 'CreateAgent', () => { present = true; return { agent }; });
    view(); await registerDraft(agent.name); fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(screen.getAllByText(agent.name)).toHaveLength(2));
  });

  it('reconciles the selected identity label and activity after an existing edit', async () => {
    let name = existing.name;
    mockRpc(AgentService, 'ListAgents', () => ({ agents: [{ ...existing, name }], page: { totalCount: 1 } }));
    mockRpc(DashboardService, 'GetDashboard', () => ({ agents: [{ id: existing.id, name }] }));
    mockRpc(AgentService, 'UpdateAgent', request => { name = request.name; return { agent: { ...existing, name } }; });
    view(); fireEvent.click(await screen.findByRole('button', { name: 'Tokens for Existing worker' })); await screen.findByRole('region', { name: 'Connect Existing worker' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!); fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Renamed worker' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('region', { name: 'Connect Renamed worker' })).toBeVisible();
    await waitFor(() => expect(screen.getAllByText('Renamed worker')).toHaveLength(2));
  });

  it('reconciles activity when an existing agent is archived', async () => {
    let present = true;
    mockRpc(AgentService, 'ListAgents', () => ({ agents: present ? [existing] : [], page: { totalCount: present ? 1 : 0 } }));
    mockRpc(DashboardService, 'GetDashboard', () => ({ agents: present ? [{ id: existing.id, name: existing.name }] : [] }));
    mockRpc(AgentService, 'ArchiveAgent', () => { present = false; return { success: true }; });
    view(); await waitFor(() => expect(screen.getAllByText(existing.name)).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' })); await confirmAction();
    expect(await screen.findByText('No agents registered yet.')).toBeVisible(); expect(await screen.findByText('No agents in this organization.')).toBeVisible();
  });

  it('reconciles recorded activity from a native agent-update event', async () => {
    let name = existing.name, controller!: ReadableStreamDefaultController<Uint8Array>;
    function frame(subject: string) {
      const body = new TextEncoder().encode(JSON.stringify({ subject, orgId: 'org-1', occurredAt: '2026-11-10T08:00:00Z' }));
      const bytes = new Uint8Array(body.length + 5); new DataView(bytes.buffer).setUint32(1, body.length, false); bytes.set(body, 5); return bytes;
    }
    function LiveReader() { const { status } = useLiveEvents({ orgId: 'org-1' }); return <><output aria-label="Event connection">{status}</output><AgentsDashboard /></>; }
    server.use(http.post(`${BACKEND_URL}/${EventService.typeName}/SubscribeEvents`, () => new HttpResponse(new ReadableStream<Uint8Array>({ start(value) { controller = value; value.enqueue(frame('stream.ready')); } }), { headers: { 'content-type': 'application/connect+json' } })));
    mockRpc(AgentService, 'ListAgents', () => ({ agents: [{ ...existing, name }], page: { totalCount: 1 } }));
    mockRpc(DashboardService, 'GetDashboard', () => ({ agents: [{ id: existing.id, name }] }));
    view(<LiveReader />); await waitFor(() => expect(screen.getAllByText(existing.name)).toHaveLength(2)); await waitFor(() => expect(screen.getByLabelText('Event connection')).toHaveTextContent('live'));
    name = 'Renamed by peer'; act(() => controller.enqueue(frame('domain.agent.updated')));
    await waitFor(() => expect(screen.getAllByText(name)).toHaveLength(2));
  });

});
