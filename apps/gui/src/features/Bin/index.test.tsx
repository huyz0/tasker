import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const {
  mockListOrgs, mockRestoreOrg,
  mockListProjects, mockRestoreProject,
  mockListTasks, mockRestoreTask,
  mockListAgents, mockRestoreAgent,
  mockListFolders, mockRestoreFolder,
  mockListArtifacts, mockRestoreArtifact,
} = vi.hoisted(() => ({
  mockListOrgs: vi.fn(),
  mockRestoreOrg: vi.fn(),
  mockListProjects: vi.fn(),
  mockRestoreProject: vi.fn(),
  mockListTasks: vi.fn(),
  mockRestoreTask: vi.fn(),
  mockListAgents: vi.fn(),
  mockRestoreAgent: vi.fn(),
  mockListFolders: vi.fn(),
  mockRestoreFolder: vi.fn(),
  mockListArtifacts: vi.fn(),
  mockRestoreArtifact: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn((service: unknown) => {
    switch (service) {
      case 'OrgService': return { listOrgs: mockListOrgs, restoreOrg: mockRestoreOrg };
      case 'ProjectService': return { listProjects: mockListProjects, restoreProject: mockRestoreProject };
      case 'TaskService': return { listTasks: mockListTasks, restoreTask: mockRestoreTask };
      case 'AgentService': return { listAgents: mockListAgents, restoreAgent: mockRestoreAgent };
      case 'ArtifactService': return { listFolders: mockListFolders, restoreFolder: mockRestoreFolder, listArtifacts: mockListArtifacts, restoreArtifact: mockRestoreArtifact };
      default: return {};
    }
  }),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  OrgService: 'OrgService',
  ProjectService: 'ProjectService',
  TaskService: 'TaskService',
  AgentService: 'AgentService',
  ArtifactService: 'ArtifactService',
}));
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    activeOrgId: 'org-1',
    activeProjectId: 'proj-1',
  })),
}));

import { BinDashboard } from './index';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BinDashboard />
    </QueryClientProvider>
  );
}

describe('BinDashboard', () => {
  beforeEach(() => {
    for (const m of [mockListOrgs, mockRestoreOrg, mockListProjects, mockRestoreProject, mockListTasks, mockRestoreTask, mockListAgents, mockRestoreAgent, mockListFolders, mockRestoreFolder, mockListArtifacts, mockRestoreArtifact]) {
      m.mockReset();
    }
  });

  it('lists archived organizations and restores one', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-2', name: 'Archived Org', deletedAt: new Date().toISOString() }] });
    mockRestoreOrg.mockResolvedValue({ success: true });

    renderPage();

    await waitFor(() => expect(screen.getByText('Archived Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(mockRestoreOrg).toHaveBeenCalledWith({ orgId: 'org-2' }));
  });

  it('shows an empty message when there is nothing archived', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
  });

  it('switches tabs and lists archived tasks', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Archived Task', deletedAt: new Date().toISOString() }] });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    await waitFor(() => expect(screen.getByText('Archived Task')).toBeDefined());
    expect(mockListTasks).toHaveBeenCalledWith({ projectId: 'proj-1', onlyDeleted: true });
  });
});
