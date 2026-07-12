import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockPing, mockListOrgs, mockListProjects, mockListAgents, mockListTasks } = vi.hoisted(() => ({
  mockPing: vi.fn(),
  mockListOrgs: vi.fn(),
  mockListProjects: vi.fn(),
  mockListAgents: vi.fn(),
  mockListTasks: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn((service: unknown) => {
    if (service === 'OrgService') return { listOrgs: mockListOrgs };
    if (service === 'ProjectService') return { listProjects: mockListProjects };
    if (service === 'AgentService') return { listAgents: mockListAgents };
    if (service === 'TaskService') return { listTasks: mockListTasks };
    return { ping: mockPing };
  }),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  HealthService: 'HealthService',
  OrgService: 'OrgService',
  ProjectService: 'ProjectService',
  AgentService: 'AgentService',
  TaskService: 'TaskService',
}));
vi.mock('../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    activeOrgId: 'org-1',
    activeProjectId: 'proj-1',
  })),
}));

import { Dashboard } from './Dashboard';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    mockPing.mockReset();
    mockListOrgs.mockReset();
    mockListProjects.mockReset();
    mockListAgents.mockReset();
    mockListTasks.mockReset();
    mockPing.mockResolvedValue({ message: 'pong', dbStatus: 'ok' });
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-1' }, { id: 'org-2' }] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1' }] });
    mockListAgents.mockResolvedValue({ agents: [{ id: 'agent-1' }, { id: 'agent-2' }, { id: 'agent-3' }] });
    mockListTasks.mockResolvedValue({
      tasks: [
        { id: 't1', status: 'todo' },
        { id: 't2', status: 'in-progress' },
        { id: 't3', status: 'in-progress' },
        { id: 't4', status: 'done' },
      ],
    });
  });

  it('shows counts for organizations, projects, agents, and tasks', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Organizations').nextElementSibling?.textContent).toBe('2'));
    expect(screen.getByText('Agents').nextElementSibling?.textContent).toBe('3');
    expect(screen.getByText('Tasks').nextElementSibling?.textContent).toBe('4');
  });

  it('breaks tasks down by status', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Tasks by Status')).toBeDefined());
    expect(screen.getByText('Todo')).toBeDefined();
    expect(screen.getByText('In Progress')).toBeDefined();
    expect(screen.getByText('Done')).toBeDefined();
  });

  it('still shows the health ping card', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText(/pong/)).toBeDefined());
    expect(screen.getByText(/ok/)).toBeDefined();
  });
});
