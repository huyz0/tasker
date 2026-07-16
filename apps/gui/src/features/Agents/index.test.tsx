import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockListAgents, mockListAgentRoles, mockCreateAgent, mockArchiveAgent, mockUpdateAgent, mockUpdateAgentRole } = vi.hoisted(() => ({
  mockListAgents: vi.fn(),
  mockListAgentRoles: vi.fn(),
  mockCreateAgent: vi.fn(),
  mockArchiveAgent: vi.fn(),
  mockUpdateAgent: vi.fn(),
  mockUpdateAgentRole: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({
    listAgents: mockListAgents,
    listAgentRoles: mockListAgentRoles,
    createAgent: mockCreateAgent,
    archiveAgent: mockArchiveAgent,
    updateAgent: mockUpdateAgent,
    updateAgentRole: mockUpdateAgentRole,
  })),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  AgentService: {},
}));
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    activeOrgId: 'org-1',
  })),
}));

import { AgentsDashboard } from './index';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AgentsDashboard />
    </QueryClientProvider>
  );
  return { ...utils, queryClient };
}

describe('AgentsDashboard', () => {
  beforeEach(() => {
    mockListAgents.mockReset();
    mockListAgentRoles.mockReset();
    mockCreateAgent.mockReset();
    mockArchiveAgent.mockReset();
    mockUpdateAgent.mockReset();
    mockUpdateAgentRole.mockReset();
    mockListAgentRoles.mockResolvedValue({ roles: [{ id: 'role-1', name: 'Researcher', systemPrompt: '', capabilities: '' }] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows the resolved role name instead of the raw role ID', async () => {
    mockListAgents.mockResolvedValue({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    expect(screen.getAllByText('Researcher').length).toBeGreaterThan(0);
  });

  it('auto-loads later pages so agents past the first page are not hidden', async () => {
    mockListAgents
      .mockResolvedValueOnce({ agents: [{ id: 'agent-1', name: 'Page One Agent', agentRoleId: 'role-1' }], page: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ agents: [{ id: 'agent-2', name: 'Page Two Agent', agentRoleId: 'role-1' }], page: {} });

    renderPage();

    await waitFor(() => expect(screen.getByText('Page One Agent')).toBeDefined());
    await waitFor(() => expect(screen.getByText('Page Two Agent')).toBeDefined());
    expect(mockListAgents).toHaveBeenCalledWith({ orgId: 'org-1', page: { cursor: 'cursor-2' } });
  });

  it('deploys a new agent via the form', async () => {
    mockListAgents.mockResolvedValue({ agents: [] });
    mockCreateAgent.mockResolvedValue({ agent: { id: 'agent-2', name: 'New Agent', agentRoleId: 'role-1' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('No agent instances deployed yet - deploy one above.')).toBeDefined());
    fireEvent.click(screen.getByText('Deploy Agent'));

    fireEvent.change(screen.getByPlaceholderText('Agent name'), { target: { value: 'New Agent' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'role-1' } });
    fireEvent.click(screen.getByText('Deploy'));

    await waitFor(() => expect(mockCreateAgent).toHaveBeenCalledWith({ orgId: 'org-1', agentRoleId: 'role-1', name: 'New Agent' }));
  });

  it('shows an error message when deploying an agent fails', async () => {
    mockListAgents.mockResolvedValue({ agents: [] });
    mockCreateAgent.mockRejectedValue(new Error('role not found'));

    renderPage();

    await waitFor(() => expect(screen.getByText('No agent instances deployed yet - deploy one above.')).toBeDefined());
    fireEvent.click(screen.getByText('Deploy Agent'));

    fireEvent.change(screen.getByPlaceholderText('Agent name'), { target: { value: 'New Agent' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'role-1' } });
    fireEvent.click(screen.getByText('Deploy'));

    await waitFor(() => expect(screen.getByText('Failed to deploy agent: role not found')).toBeDefined());
  });

  it('archives an agent after confirmation', async () => {
    mockListAgents.mockResolvedValue({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });
    mockArchiveAgent.mockResolvedValue({});

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(mockArchiveAgent).toHaveBeenCalledWith({ agentId: 'agent-1' }));
  });

  it('invalidates the Bin page query key after archiving an agent, so the Bin view refreshes', async () => {
    mockListAgents.mockResolvedValue({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });
    mockArchiveAgent.mockResolvedValue({});

    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(mockArchiveAgent).toHaveBeenCalled());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agents', 'bin', 'org-1'] });
  });

  it('does not archive an agent when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockListAgents.mockResolvedValue({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));

    expect(mockArchiveAgent).not.toHaveBeenCalled();
  });

  it('shows an error message when archiving an agent fails', async () => {
    mockListAgents.mockResolvedValue({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });
    mockArchiveAgent.mockRejectedValue(new Error('agent is busy'));

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(screen.getByText(/Failed to delete agent/)).toBeDefined());
  });

  it('shows the raw role id when no matching role is found', async () => {
    mockListAgents.mockResolvedValue({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-unknown' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    expect(screen.getByText('role-unknown')).toBeDefined();
  });

  it('shows a pending label while deploying an agent', async () => {
    mockListAgents.mockResolvedValue({ agents: [] });
    let resolveCreate: (v: any) => void = () => {};
    mockCreateAgent.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));

    renderPage();
    await waitFor(() => expect(screen.getByText('No agent instances deployed yet - deploy one above.')).toBeDefined());
    fireEvent.click(screen.getByText('Deploy Agent'));
    fireEvent.change(screen.getByPlaceholderText('Agent name'), { target: { value: 'New Agent' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'role-1' } });
    fireEvent.click(screen.getByText('Deploy'));

    await waitFor(() => expect(screen.getByText('Deploying...')).toBeInTheDocument());
    resolveCreate({ agent: { id: 'agent-2', name: 'New Agent', agentRoleId: 'role-1' } });
  });

  it('falls back to an empty role list while roles are still loading', async () => {
    mockListAgents.mockResolvedValue({ agents: [] });
    mockListAgentRoles.mockReturnValue(new Promise(() => {}));

    renderPage();
    await waitFor(() => expect(screen.getByText('No agent instances deployed yet - deploy one above.')).toBeDefined());
    fireEvent.click(screen.getByText('Deploy Agent'));

    expect(screen.getByText('Select a role...')).toBeInTheDocument();
  });

  it('cancels the deploy form', async () => {
    mockListAgents.mockResolvedValue({ agents: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Deploy Agent')).toBeDefined());
    fireEvent.click(screen.getByText('Deploy Agent'));
    expect(screen.getByPlaceholderText('Agent name')).toBeDefined();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('Agent name')).toBeNull();
  });

  it('renames an agent and reassigns its role', async () => {
    mockListAgentRoles.mockResolvedValue({ roles: [
      { id: 'role-1', name: 'Researcher', systemPrompt: '', capabilities: '' },
      { id: 'role-2', name: 'Writer', systemPrompt: '', capabilities: '' },
    ] });
    mockListAgents.mockResolvedValue({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });
    mockUpdateAgent.mockResolvedValue({ agent: { id: 'agent-1', name: 'Agent Smith Renamed', agentRoleId: 'role-2' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    const nameInput = screen.getByDisplayValue('Agent Smith');
    fireEvent.change(nameInput, { target: { value: 'Agent Smith Renamed' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'role-2' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(mockUpdateAgent).toHaveBeenCalledWith({ agentId: 'agent-1', name: 'Agent Smith Renamed', agentRoleId: 'role-2' }));
  });

  it('cancels editing an agent without saving', async () => {
    mockListAgents.mockResolvedValue({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByDisplayValue('Agent Smith')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Agent Smith')).toBeInTheDocument();
    expect(mockUpdateAgent).not.toHaveBeenCalled();
  });

  it('shows an error message when updating an agent fails', async () => {
    mockListAgents.mockResolvedValue({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });
    mockUpdateAgent.mockRejectedValue(new Error('agent not found'));

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    fireEvent.click(screen.getAllByText('Edit')[0]);
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to update agent/)).toBeInTheDocument());
  });

  it('renders "No agent roles yet." when there are none', async () => {
    mockListAgents.mockResolvedValue({ agents: [] });
    mockListAgentRoles.mockResolvedValue({ roles: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('No agent roles yet.')).toBeInTheDocument());
  });

  it('edits an agent role', async () => {
    mockListAgents.mockResolvedValue({ agents: [] });
    mockUpdateAgentRole.mockResolvedValue({ role: { id: 'role-1', name: 'Renamed Role', systemPrompt: 'prompt', capabilities: '{}' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('Researcher')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Edit'));

    const nameInput = screen.getByPlaceholderText('Role name');
    fireEvent.change(nameInput, { target: { value: 'Renamed Role' } });
    fireEvent.change(screen.getByPlaceholderText('System prompt'), { target: { value: 'prompt' } });
    fireEvent.change(screen.getByPlaceholderText('Capabilities (JSON)'), { target: { value: '{}' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(mockUpdateAgentRole).toHaveBeenCalledWith({ id: 'role-1', name: 'Renamed Role', systemPrompt: 'prompt', capabilities: '{}' }));
  });

  it('cancels editing an agent role without saving', async () => {
    mockListAgents.mockResolvedValue({ agents: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('Researcher')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByPlaceholderText('Role name')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Researcher')).toBeInTheDocument();
    expect(mockUpdateAgentRole).not.toHaveBeenCalled();
  });

  it('shows an error message when updating an agent role fails', async () => {
    mockListAgents.mockResolvedValue({ agents: [] });
    mockUpdateAgentRole.mockRejectedValue(new Error('role not found'));

    renderPage();

    await waitFor(() => expect(screen.getByText('Researcher')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByPlaceholderText('System prompt'), { target: { value: 'prompt' } });
    fireEvent.change(screen.getByPlaceholderText('Capabilities (JSON)'), { target: { value: '{}' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to update role/)).toBeInTheDocument());
  });
});
