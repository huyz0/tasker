import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockListAgents, mockListAgentRoles, mockCreateAgent, mockArchiveAgent } = vi.hoisted(() => ({
  mockListAgents: vi.fn(),
  mockListAgentRoles: vi.fn(),
  mockCreateAgent: vi.fn(),
  mockArchiveAgent: vi.fn(),
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
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentsDashboard />
    </QueryClientProvider>
  );
}

describe('AgentsDashboard', () => {
  beforeEach(() => {
    mockListAgents.mockReset();
    mockListAgentRoles.mockReset();
    mockCreateAgent.mockReset();
    mockArchiveAgent.mockReset();
    mockListAgentRoles.mockResolvedValue({ roles: [{ id: 'role-1', name: 'Researcher', systemPrompt: '', capabilities: '' }] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows the resolved role name instead of the raw role ID', async () => {
    mockListAgents.mockResolvedValue({ agents: [{ id: 'agent-1', name: 'Agent Smith', agentRoleId: 'role-1' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('Agent Smith')).toBeDefined());
    expect(screen.getByText('Researcher')).toBeDefined();
  });

  it('deploys a new agent via the form', async () => {
    mockListAgents.mockResolvedValue({ agents: [] });
    mockCreateAgent.mockResolvedValue({ agent: { id: 'agent-2', name: 'New Agent', agentRoleId: 'role-1' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('No agent instances deployed yet.')).toBeDefined());
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

    await waitFor(() => expect(screen.getByText('No agent instances deployed yet.')).toBeDefined());
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
});
