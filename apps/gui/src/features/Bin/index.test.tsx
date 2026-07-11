import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const {
  mockListOrgs, mockRestoreOrg, mockPurgeOrg,
  mockListProjects, mockRestoreProject, mockPurgeProject,
  mockListTasks, mockRestoreTask, mockPurgeTask,
  mockListAgents, mockRestoreAgent, mockPurgeAgent,
  mockListFolders, mockRestoreFolder, mockPurgeFolder,
  mockListArtifacts, mockRestoreArtifact, mockPurgeArtifact,
} = vi.hoisted(() => ({
  mockListOrgs: vi.fn(),
  mockRestoreOrg: vi.fn(),
  mockPurgeOrg: vi.fn(),
  mockListProjects: vi.fn(),
  mockRestoreProject: vi.fn(),
  mockPurgeProject: vi.fn(),
  mockListTasks: vi.fn(),
  mockRestoreTask: vi.fn(),
  mockPurgeTask: vi.fn(),
  mockListAgents: vi.fn(),
  mockRestoreAgent: vi.fn(),
  mockPurgeAgent: vi.fn(),
  mockListFolders: vi.fn(),
  mockRestoreFolder: vi.fn(),
  mockPurgeFolder: vi.fn(),
  mockListArtifacts: vi.fn(),
  mockRestoreArtifact: vi.fn(),
  mockPurgeArtifact: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn((service: unknown) => {
    switch (service) {
      case 'OrgService': return { listOrgs: mockListOrgs, restoreOrg: mockRestoreOrg, purgeOrg: mockPurgeOrg };
      case 'ProjectService': return { listProjects: mockListProjects, restoreProject: mockRestoreProject, purgeProject: mockPurgeProject };
      case 'TaskService': return { listTasks: mockListTasks, restoreTask: mockRestoreTask, purgeTask: mockPurgeTask };
      case 'AgentService': return { listAgents: mockListAgents, restoreAgent: mockRestoreAgent, purgeAgent: mockPurgeAgent };
      case 'ArtifactService': return { listFolders: mockListFolders, restoreFolder: mockRestoreFolder, purgeFolder: mockPurgeFolder, listArtifacts: mockListArtifacts, restoreArtifact: mockRestoreArtifact, purgeArtifact: mockPurgeArtifact };
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
    for (const m of [
      mockListOrgs, mockRestoreOrg, mockPurgeOrg,
      mockListProjects, mockRestoreProject, mockPurgeProject,
      mockListTasks, mockRestoreTask, mockPurgeTask,
      mockListAgents, mockRestoreAgent, mockPurgeAgent,
      mockListFolders, mockRestoreFolder, mockPurgeFolder,
      mockListArtifacts, mockRestoreArtifact, mockPurgeArtifact,
    ]) {
      m.mockReset();
    }
    vi.spyOn(window, 'confirm').mockReturnValue(true);
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

  it('permanently deletes an item after confirmation', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-2', name: 'Archived Org', deletedAt: new Date().toISOString() }] });
    mockPurgeOrg.mockResolvedValue({ success: true });

    renderPage();

    await waitFor(() => expect(screen.getByText('Archived Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));

    await waitFor(() => expect(mockPurgeOrg).toHaveBeenCalledWith({ orgId: 'org-2' }));
  });

  it('does not purge when the confirmation is dismissed', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-2', name: 'Archived Org', deletedAt: new Date().toISOString() }] });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderPage();

    await waitFor(() => expect(screen.getByText('Archived Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));

    expect(mockPurgeOrg).not.toHaveBeenCalled();
  });

  it('shows an error message when purging fails', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-2', name: 'Archived Org', deletedAt: new Date().toISOString() }] });
    mockPurgeOrg.mockRejectedValue(new Error('organization still has projects'));

    renderPage();

    await waitFor(() => expect(screen.getByText('Archived Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));

    await waitFor(() => expect(screen.getByText(/Failed to delete forever/)).toBeDefined());
  });
});
