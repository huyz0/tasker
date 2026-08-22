import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AgentService, DashboardService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending } from '../../test/mockRpc';

vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    activeOrgId: 'org-1',
  })),
}));

import { AgentsDashboard } from './index';
import { confirmAction, cancelAction } from '../../test/confirm';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><AgentsDashboard /></MemoryRouter>
    </QueryClientProvider>
  );
  return { ...utils, queryClient };
}

/** Registers ListAgents and records every request it receives. */
function withListAgents(response: object | ((body: any) => object) = { agents: [] }) {
  const requests: any[] = [];
  mockRpc(AgentService, 'ListAgents', (body) => {
    requests.push(body);
    return typeof response === 'function' ? response(body) : response;
  });
  return requests;
}

/** Registers ListAgentRoles and records every request it receives. */
function withListAgentRoles(response: object | ((body: any) => object) = { roles: [{ id: 'role-1', name: 'Researcher', systemPrompt: '', capabilities: '' }] }) {
  const requests: any[] = [];
  mockRpc(AgentService, 'ListAgentRoles', (body) => {
    requests.push(body);
    return typeof response === 'function' ? response(body) : response;
  });
  return requests;
}

/** Registers CreateAgent and records every request it receives. */
function withCreateAgent(response: object) {
  const requests: any[] = [];
  mockRpc(AgentService, 'CreateAgent', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers CreateAgentRole and records every request it receives. */
function withCreateAgentRole(response: object = { role: { id: 'role-9' } }) {
  const requests: any[] = [];
  mockRpc(AgentService, 'CreateAgentRole', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers ArchiveAgent and records every request it receives. */
function withArchiveAgent(response: object = {}) {
  const requests: any[] = [];
  mockRpc(AgentService, 'ArchiveAgent', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers UpdateAgent and records every request it receives. */
function withUpdateAgent(response: object) {
  const requests: any[] = [];
  mockRpc(AgentService, 'UpdateAgent', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers UpdateAgentRole and records every request it receives. */
function withUpdateAgentRole(response: object) {
  const requests: any[] = [];
  mockRpc(AgentService, 'UpdateAgentRole', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers GetDashboard and records every request it receives. */
function withGetDashboard(response: object = { agents: [] }) {
  const requests: any[] = [];
  mockRpc(DashboardService, 'GetDashboard', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

describe('AgentsDashboard', () => {
  beforeEach(() => {
    withListAgentRoles();
    withCreateAgentRole();
    withGetDashboard();
    // The tokens panel is part of this page: without it the toggle has no
    // visible effect and the test cannot see whether it opened.
    mockRpc(AgentService, 'ListAgentTokens', { tokens: [] });
    mockRpc(AgentService, 'CreateAgentToken', {});
    mockRpc(AgentService, 'RevokeAgentToken', {});
  });

  it('shows the resolved role name instead of the raw role ID', async () => {
    withListAgents({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    expect(screen.getAllByText('Researcher').length).toBeGreaterThan(0);
  });

  it('issues one request on mount, and pages the rest on request', async () => {
    // Replaces a test that asserted the dashboard looped the cursor to
    // exhaustion. The old justification was that it "needs every agent to
    // render deploy/archive actions correctly" — those actions belong to the
    // row they are on, and an unrendered row has no action to render
    // (M07-T04).
    const requests = withListAgents((body: { page?: { cursor?: string } }) =>
      body.page?.cursor
        ? { agents: [{ id: 'agent-2', name: 'Page Two Agent', agentRoleId: 'role-1' }], page: { totalCount: 2 } }
        : { agents: [{ id: 'agent-1', name: 'Page One Agent', agentRoleId: 'role-1' }], page: { nextCursor: 'cursor-2', totalCount: 2 } });

    renderPage();
    await waitFor(() => expect(screen.getByText('Page One Agent')).toBeDefined());
    expect(requests).toHaveLength(1);
    expect(screen.queryByText('Page Two Agent')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Load more/ }));
    await waitFor(() => expect(screen.getByText('Page Two Agent')).toBeDefined());
    expect(requests[requests.length - 1]).toEqual({ orgId: 'org-1', page: { cursor: 'cursor-2' } });
    expect(screen.getByText('Page One Agent')).toBeDefined();
  });

  it('does not offer Load more when the agent list is complete', async () => {
    withListAgents({ agents: [{ id: 'agent-1', name: 'Only Agent', agentRoleId: 'role-1' }], page: {} });
    renderPage();
    await waitFor(() => expect(screen.getByText('Only Agent')).toBeDefined());
    expect(screen.queryByRole('button', { name: /Load more/ })).toBeNull();
  });

  it('deploys a new agent via the form', async () => {
    withListAgents({ agents: [] });
    const requests = withCreateAgent({ agent: { id: 'agent-2', name: 'New Agent', agentRoleId: 'role-1' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('No agent instances deployed yet.')).toBeDefined());
    fireEvent.click(screen.getByText('Deploy Agent'));

    fireEvent.change(screen.getByPlaceholderText('Agent name'), { target: { value: 'New Agent' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'role-1' } });
    fireEvent.click(screen.getByText('Deploy'));

    await waitFor(() => expect(requests).toContainEqual({ orgId: 'org-1', agentRoleId: 'role-1', name: 'New Agent' }));
  });

  it('shows an error message when deploying an agent fails', async () => {
    withListAgents({ agents: [] });
    mockRpcError(AgentService, 'CreateAgent', 'unknown', 'role not found');

    renderPage();

    await waitFor(() => expect(screen.getByText('No agent instances deployed yet.')).toBeDefined());
    fireEvent.click(screen.getByText('Deploy Agent'));

    fireEvent.change(screen.getByPlaceholderText('Agent name'), { target: { value: 'New Agent' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'role-1' } });
    fireEvent.click(screen.getByText('Deploy'));

    await waitFor(() => expect(screen.getByText(/Failed to deploy agent:.*role not found/)).toBeDefined());
  });

  it('archives an agent after confirmation', async () => {
    withListAgents({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });
    const requests = withArchiveAgent();

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(requests).toContainEqual({ agentId: 'agent-1' }));
  });

  it('invalidates the Bin page query key after archiving an agent, so the Bin view refreshes', async () => {
    withListAgents({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });
    const requests = withArchiveAgent();

    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agents', 'bin', 'org-1'] });
  });

  it('does not archive an agent when confirmation is cancelled', async () => {
    withListAgents({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });
    const requests = withArchiveAgent();

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));
    await cancelAction();

    expect(requests).toHaveLength(0);
  });

  it('shows an error message when archiving an agent fails', async () => {
    withListAgents({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });
    mockRpcError(AgentService, 'ArchiveAgent', 'unknown', 'agent is busy');

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(screen.getByText(/Failed to delete agent/)).toBeDefined());
  });

  it('shows the raw role id when no matching role is found', async () => {
    withListAgents({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-unknown' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    expect(screen.getByText('role-unknown')).toBeDefined();
  });

  it('shows a pending label while deploying an agent', async () => {
    withListAgents({ agents: [] });
    const pending = mockRpcPending(AgentService, 'CreateAgent');

    renderPage();
    await waitFor(() => expect(screen.getByText('No agent instances deployed yet.')).toBeDefined());
    fireEvent.click(screen.getByText('Deploy Agent'));
    fireEvent.change(screen.getByPlaceholderText('Agent name'), { target: { value: 'New Agent' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'role-1' } });
    fireEvent.click(screen.getByText('Deploy'));

    await waitFor(() => expect(screen.getByText('Deploying...')).toBeInTheDocument());
    pending.resolve({ agent: { id: 'agent-2', name: 'New Agent', agentRoleId: 'role-1' } });
  });

  it('falls back to an empty role list while roles are still loading', async () => {
    withListAgents({ agents: [] });
    mockRpcPending(AgentService, 'ListAgentRoles');

    renderPage();
    await waitFor(() => expect(screen.getByText('No agent instances deployed yet.')).toBeDefined());
    fireEvent.click(screen.getByText('Deploy Agent'));

    expect(screen.getByText('Select a role...')).toBeInTheDocument();
  });

  it('cancels the deploy form', async () => {
    withListAgents({ agents: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Deploy Agent')).toBeDefined());
    fireEvent.click(screen.getByText('Deploy Agent'));
    expect(screen.getByPlaceholderText('Agent name')).toBeDefined();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('Agent name')).toBeNull();
  });

  it('renames an agent and reassigns its role', async () => {
    withListAgentRoles({ roles: [
      { id: 'role-1', name: 'Researcher', systemPrompt: '', capabilities: '' },
      { id: 'role-2', name: 'Writer', systemPrompt: '', capabilities: '' },
    ] });
    withListAgents({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });
    const requests = withUpdateAgent({ agent: { id: 'agent-1', name: 'Agent Smith Renamed', agentRoleId: 'role-2' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    const nameInput = screen.getByDisplayValue('Agent Smith');
    fireEvent.change(nameInput, { target: { value: 'Agent Smith Renamed' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'role-2' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(requests).toContainEqual({ agentId: 'agent-1', name: 'Agent Smith Renamed', agentRoleId: 'role-2' }));
  });

  it('cancels editing an agent without saving', async () => {
    withListAgents({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });
    const requests = withUpdateAgent({});

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByDisplayValue('Agent Smith')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Agent Smith')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('shows an error message when updating an agent fails', async () => {
    withListAgents({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });
    mockRpcError(AgentService, 'UpdateAgent', 'unknown', 'agent not found');

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    fireEvent.click(screen.getAllByText('Edit')[0]);
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to update agent/)).toBeInTheDocument());
  });

  it('renders "No agent roles yet." when there are none', async () => {
    withListAgents({ agents: [] });
    withListAgentRoles({ roles: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('No agent roles yet.')).toBeInTheDocument());
  });

  it('edits an agent role', async () => {
    withListAgents({ agents: [] });
    const requests = withUpdateAgentRole({ role: { id: 'role-1', name: 'Renamed Role', systemPrompt: 'prompt', capabilities: '{}' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('Researcher')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Edit'));

    const nameInput = screen.getByPlaceholderText('Role name');
    fireEvent.change(nameInput, { target: { value: 'Renamed Role' } });
    fireEvent.change(screen.getByPlaceholderText('System prompt'), { target: { value: 'prompt' } });
    fireEvent.change(screen.getByPlaceholderText('Capabilities (JSON)'), { target: { value: '{}' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(requests).toContainEqual({ id: 'role-1', name: 'Renamed Role', systemPrompt: 'prompt', capabilities: '{}' }));
  });

  it('cancels editing an agent role without saving', async () => {
    withListAgents({ agents: [] });
    const requests = withUpdateAgentRole({});

    renderPage();

    await waitFor(() => expect(screen.getByText('Researcher')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByPlaceholderText('Role name')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Researcher')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('shows an error message when updating an agent role fails', async () => {
    withListAgents({ agents: [] });
    mockRpcError(AgentService, 'UpdateAgentRole', 'unknown', 'role not found');

    renderPage();

    await waitFor(() => expect(screen.getByText('Researcher')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByPlaceholderText('System prompt'), { target: { value: 'prompt' } });
    fireEvent.change(screen.getByPlaceholderText('Capabilities (JSON)'), { target: { value: '{}' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to update role/)).toBeInTheDocument());
  });
  // M03-T10: the roles query read one response, so a role past the server's
  // page size could not be selected when deploying an agent, and any existing
  // agent holding one showed a blank role name. The verify line names the
  // 120th role specifically, so the fixture pages at 100.
  it('makes the 120th agent role selectable', async () => {
    const page = (from: number, to: number) =>
      Array.from({ length: to - from }, (_, i) => ({
        id: `role-${from + i + 1}`,
        name: `Role ${from + i + 1}`,
        systemPrompt: '',
        capabilities: '',
      }));

    withListAgents({ agents: [] });
    withListAgentRoles((body: { page?: { cursor?: string } }) =>
      body.page?.cursor ? { roles: page(100, 130), page: {} } : { roles: page(0, 100), page: { nextCursor: 'cursor-2' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('Deploy Agent')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Deploy Agent'));

    await waitFor(() => expect(screen.getByRole('option', { name: 'Role 120' })).toBeInTheDocument());
    // The first page must still be there — paging should append, not replace.
    expect(screen.getByRole('option', { name: 'Role 1' })).toBeInTheDocument();
  });

  it('resolves the name of an agent holding a role from a later page', async () => {
    withListAgents({
      agents: [{ id: 'agent-1', name: 'Scout', agentRoleId: 'role-120', orgId: 'org-1' }],
    });
    withListAgentRoles((body: { page?: { cursor?: string } }) =>
      body.page?.cursor
        ? { roles: [{ id: 'role-120', name: 'Deep Role', systemPrompt: '', capabilities: '' }], page: {} }
        : {
            roles: Array.from({ length: 100 }, (_, i) => ({ id: `role-${i + 1}`, name: `Role ${i + 1}`, systemPrompt: '', capabilities: '' })),
            page: { nextCursor: 'cursor-2' },
          });

    renderPage();

    // Two occurrences once paging works: the agent's role column and the roles
    // list itself. Before the fix there are none — the role is on page 2, so
    // the list omits it and the agent's cell renders blank, which reads as data
    // loss rather than as a truncated list.
    await waitFor(() => expect(screen.getAllByText('Deep Role')).toHaveLength(2));
  });

  it('creates an agent role, so a new organization can deploy its first agent', async () => {
    withListAgents({ agents: [] });
    withListAgentRoles({ roles: [] });
    const requests = withCreateAgentRole();
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'New Role' }));
    fireEvent.change(screen.getByLabelText('Role name'), { target: { value: 'Reviewer' } });
    fireEvent.change(screen.getByLabelText('System prompt'), { target: { value: 'Review carefully.' } });
    fireEvent.change(screen.getByLabelText('Capabilities'), { target: { value: '["review"]' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));

    // Roles could be edited but never created here, and deploying an agent
    // requires choosing one — so an organization starting from nothing could
    // not deploy its first agent from the browser at all.
    await waitFor(() => expect(requests).toContainEqual({
      orgId: 'org-1', name: 'Reviewer', systemPrompt: 'Review carefully.', capabilities: '["review"]',
    }));
  });

  // M17-T04: capabilities is stored as an opaque JSON string with no
  // server-side shape check - a typo here used to reach the database
  // silently and surface only wherever something later tried to parse it.
  it('rejects invalid JSON in the new-role capabilities field', async () => {
    withListAgents({ agents: [] });
    withListAgentRoles({ roles: [] });
    const requests = withCreateAgentRole();
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'New Role' }));
    fireEvent.change(screen.getByLabelText('Role name'), { target: { value: 'Reviewer' } });
    fireEvent.change(screen.getByLabelText('System prompt'), { target: { value: 'p' } });
    fireEvent.change(screen.getByLabelText('Capabilities'), { target: { value: '{not json' } });

    expect(screen.getByText('Capabilities must be valid JSON.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create role' })).toBeDisabled();
    expect(requests).toHaveLength(0);
  });

  it('rejects invalid JSON when editing a role\'s capabilities', async () => {
    withListAgents({ agents: [] });
    const requests = withUpdateAgentRole({});
    renderPage();

    await waitFor(() => expect(screen.getByText('Researcher')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByPlaceholderText('Capabilities (JSON)'), { target: { value: '{not json' } });

    expect(screen.getByText('Capabilities must be valid JSON.')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeDisabled();
    expect(requests).toHaveLength(0);
  });

  it('reports a failed role creation', async () => {
    withListAgents({ agents: [] });
    withListAgentRoles({ roles: [] });
    mockRpcError(AgentService, 'CreateAgentRole', 'permission_denied', 'permission denied');
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'New Role' }));
    fireEvent.change(screen.getByLabelText('Role name'), { target: { value: 'Reviewer' } });
    fireEvent.change(screen.getByLabelText('System prompt'), { target: { value: 'p' } });
    fireEvent.change(screen.getByLabelText('Capabilities'), { target: { value: '[]' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));

    expect(await screen.findByText(/Failed to create role:.*permission denied/)).toBeInTheDocument();
  });

  // M17-T05: the Agent Activity panel reuses the Dashboard's getDashboard RPC
  // (per-agent lastUsedAt/openTaskCount) rather than a new endpoint.
  it('shows agent activity from the dashboard RPC, quietest first', async () => {
    const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();
    withListAgents({ agents: [] });
    const requests = withGetDashboard({
      agents: [
        { id: 'agent-1', name: 'Silent Bot', lastUsedAt: undefined, openTaskCount: '3' },
        { id: 'agent-2', name: 'Fresh Bot', lastUsedAt: hoursAgo(0), openTaskCount: '0' },
        { id: 'agent-3', name: 'Idle Bot', lastUsedAt: hoursAgo(5), openTaskCount: '0' },
        { id: 'agent-4', name: 'Stale Bot', lastUsedAt: hoursAgo(72), openTaskCount: '0' },
      ],
    });

    renderPage();

    expect(await screen.findByText('Silent Bot')).toBeInTheDocument();
    expect(screen.getByText('never called')).toBeInTheDocument();
    expect(screen.getByText('3 open')).toBeInTheDocument();
    expect(screen.getByText('Fresh Bot')).toBeInTheDocument();
    expect(screen.getByText('active in the last hour')).toBeInTheDocument();
    expect(screen.getByText('5h ago')).toBeInTheDocument();
    expect(screen.getByText('3d ago')).toBeInTheDocument();
    expect(requests).toContainEqual({ orgId: 'org-1' });
  });

  it('shows an empty state for agent activity when the org has no agents', async () => {
    withListAgents({ agents: [] });
    withGetDashboard({ agents: [] });

    renderPage();

    expect(await screen.findAllByText('No agents in this organization.')).not.toHaveLength(0);
  });

  it('points to the Dashboard when the activity panel is showing fewer agents than exist', async () => {
    withListAgents({ agents: [], page: { totalCount: 20 } });
    withGetDashboard({
      agents: Array.from({ length: 8 }, (_, i) => ({ id: `agent-${i}`, name: `Agent ${i}`, openTaskCount: '0' })),
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent 0')).toBeInTheDocument());
    expect(screen.getByText(/Showing the 8 quietest of 20/)).toBeInTheDocument();
  });

  it('reports an error loading agent activity without breaking the rest of the page', async () => {
    withListAgents({ agents: [] });
    mockRpcError(DashboardService, 'GetDashboard', 'unavailable', 'unavailable');

    renderPage();

    expect(await screen.findByText(/unavailable/)).toBeInTheDocument();
    expect(screen.getByText('No agent instances deployed yet.')).toBeInTheDocument();
  });

  it('retries loading agent activity', async () => {
    withListAgents({ agents: [] });
    mockRpcError(DashboardService, 'GetDashboard', 'unavailable', 'unavailable');

    renderPage();

    await screen.findByText(/unavailable/);
    withGetDashboard({ agents: [{ id: 'agent-1', name: 'Recovered Bot', openTaskCount: '0' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByText('Recovered Bot')).toBeInTheDocument());
  });

  it('closes the token panel when the same agent is clicked again', async () => {
    withListAgents({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });
    withListAgentRoles({ roles: [{ id: 'role-1', name: 'Coder', systemPrompt: '', capabilities: '' }] });
    renderPage();

    const toggle = await screen.findByLabelText('Tokens for Agent Smith');
    fireEvent.click(toggle);
    // The panel's own control, not its data: AgentTokens fetches, and this test
    // is about the toggle rather than about tokens.
    expect(await screen.findByRole('button', { name: 'New token' })).toBeInTheDocument();

    // The same control opens and closes it; without the identity check it would
    // only ever open, and the panel could not be dismissed.
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'New token' })).toBeNull());
  });
});
