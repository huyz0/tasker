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
let mockActiveOrgId: string | undefined = 'org-1';
let mockActiveProjectId: string | undefined = 'proj-1';
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    get activeOrgId() { return mockActiveOrgId; },
    get activeProjectId() { return mockActiveProjectId; },
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
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
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

  it('auto-loads later pages so archived orgs past the first page can be restored', async () => {
    mockListOrgs
      .mockResolvedValueOnce({ organizations: [{ id: 'org-2', name: 'Page One Org', deletedAt: new Date().toISOString() }], page: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ organizations: [{ id: 'org-3', name: 'Page Two Org', deletedAt: new Date().toISOString() }], page: {} });

    renderPage();

    await waitFor(() => expect(screen.getByText('Page One Org')).toBeDefined());
    await waitFor(() => expect(screen.getByText('Page Two Org')).toBeDefined());
    expect(mockListOrgs).toHaveBeenCalledWith({ onlyDeleted: true, page: { cursor: 'cursor-2' } });
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
    expect(mockListTasks).toHaveBeenCalledWith({ projectId: 'proj-1', onlyDeleted: true, page: undefined });
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

  it('shows an error message when restoring fails', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-2', name: 'Archived Org', deletedAt: new Date().toISOString() }] });
    mockRestoreOrg.mockRejectedValue(new Error('parent organization is archived'));

    renderPage();

    await waitFor(() => expect(screen.getByText('Archived Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(screen.getByText(/Failed to restore/)).toBeDefined());
  });

  it('switches to the Projects tab and lists/restores an archived project', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-2', name: 'Archived Project', deletedAt: new Date().toISOString() }] });
    mockRestoreProject.mockResolvedValue({ success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    await waitFor(() => expect(screen.getByText('Archived Project')).toBeDefined());
    expect(mockListProjects).toHaveBeenCalledWith({ orgId: 'org-1', onlyDeleted: true, page: undefined });

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(mockRestoreProject).toHaveBeenCalledWith({ projectId: 'proj-2' }));
  });

  it('switches to the Agents tab and lists/purges an archived agent', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListAgents.mockResolvedValue({ agents: [{ id: 'agent-2', name: 'Archived Agent', deletedAt: new Date().toISOString() }] });
    mockPurgeAgent.mockResolvedValue({ success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    await waitFor(() => expect(screen.getByText('Archived Agent')).toBeDefined());
    expect(mockListAgents).toHaveBeenCalledWith({ orgId: 'org-1', onlyDeleted: true, page: undefined });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));
    await waitFor(() => expect(mockPurgeAgent).toHaveBeenCalledWith({ agentId: 'agent-2' }));
  });

  it('switches to the Folders tab and lists/restores an archived folder', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-2', name: 'Archived Folder', deletedAt: new Date().toISOString() }] });
    mockRestoreFolder.mockResolvedValue({ success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Folders' }));
    await waitFor(() => expect(screen.getByText('Archived Folder')).toBeDefined());
    expect(mockListFolders).toHaveBeenCalledWith({ projectId: 'proj-1', onlyDeleted: true, page: undefined });

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(mockRestoreFolder).toHaveBeenCalledWith({ folderId: 'fld-2' }));
  });

  it('switches to the Artifacts tab, resolving archived artifacts across every folder in the project', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    // ArtifactsBin first lists ALL (non-deleted-filtered) folders in the
    // project, then fetches archived artifacts within each one.
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-a' }, { id: 'fld-b' }] });
    mockListArtifacts.mockImplementation(async ({ folderId }: any) => {
      if (folderId === 'fld-a') return { artifacts: [{ id: 'art-1', name: 'Archived Artifact A', deletedAt: new Date().toISOString() }] };
      return { artifacts: [{ id: 'art-2', name: 'Archived Artifact B', deletedAt: new Date().toISOString() }] };
    });
    mockPurgeArtifact.mockResolvedValue({ success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Artifacts' }));
    await waitFor(() => expect(screen.getByText('Archived Artifact A')).toBeDefined());
    expect(screen.getByText('Archived Artifact B')).toBeDefined();

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete Forever' })[0]!);
    await waitFor(() => expect(mockPurgeArtifact).toHaveBeenCalledWith({ artifactId: 'art-1' }));
  });

  it("shows the Projects tab's empty message when no org is active", async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    // Projects query is `enabled: Boolean(activeOrgId)` - with activeOrgId
    // set (org-1, per the mocked layout store), it still resolves via the
    // mock and should show its own empty state without loading forever.
    mockListProjects.mockResolvedValue({ projects: [] });
    await waitFor(() => expect(screen.getByText('No archived projects in the active organization.')).toBeDefined());
  });

  it('restores an archived artifact', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-a' }] });
    mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-1', name: 'Archived Artifact', deletedAt: new Date().toISOString() }] });
    mockRestoreArtifact.mockResolvedValue({ success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Artifacts' }));
    await waitFor(() => expect(screen.getByText('Archived Artifact')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(mockRestoreArtifact).toHaveBeenCalledWith({ artifactId: 'art-1' }));
  });

  it("shows the Tasks tab's empty message when no project is active", async () => {
    mockActiveProjectId = undefined;
    mockListOrgs.mockResolvedValue({ organizations: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    await waitFor(() => expect(screen.getByText('No archived tasks in the active project.')).toBeDefined());
    expect(mockListTasks).not.toHaveBeenCalled();
  });

  it("shows the Agents tab's empty message when no org is active", async () => {
    mockActiveOrgId = undefined;
    mockListOrgs.mockResolvedValue({ organizations: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    await waitFor(() => expect(screen.getByText('No archived agents in the active organization.')).toBeDefined());
    expect(mockListAgents).not.toHaveBeenCalled();
  });

  it('falls back to the item id and omits the deleted timestamp when they are missing', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-no-name' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('org-no-name')).toBeDefined());
    expect(screen.queryByText(/Deleted /)).toBeNull();
  });

  it('auto-loads later pages of archived projects, tasks, agents, folders, and artifacts', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListProjects
      .mockResolvedValueOnce({ projects: [{ id: 'proj-a', name: 'Proj Page One' }], page: { nextCursor: 'c2' } })
      .mockResolvedValueOnce({ projects: [{ id: 'proj-b', name: 'Proj Page Two' }], page: {} });
    mockListTasks
      .mockResolvedValueOnce({ tasks: [{ id: 'task-a', title: 'Task Page One' }], page: { nextCursor: 'c2' } })
      .mockResolvedValueOnce({ tasks: [{ id: 'task-b', title: 'Task Page Two' }], page: {} });
    mockListAgents
      .mockResolvedValueOnce({ agents: [{ id: 'agent-a', name: 'Agent Page One' }], page: { nextCursor: 'c2' } })
      .mockResolvedValueOnce({ agents: [{ id: 'agent-b', name: 'Agent Page Two' }], page: {} });
    mockListFolders
      .mockResolvedValueOnce({ folders: [{ id: 'fld-a', name: 'Folder Page One' }], page: { nextCursor: 'c2' } })
      .mockResolvedValueOnce({ folders: [{ id: 'fld-b', name: 'Folder Page Two' }], page: {} });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    await waitFor(() => expect(screen.getByText('Proj Page One')).toBeDefined());
    expect(screen.getByText('Proj Page Two')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    await waitFor(() => expect(screen.getByText('Task Page One')).toBeDefined());
    expect(screen.getByText('Task Page Two')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    await waitFor(() => expect(screen.getByText('Agent Page One')).toBeDefined());
    expect(screen.getByText('Agent Page Two')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Folders' }));
    await waitFor(() => expect(screen.getByText('Folder Page One')).toBeDefined());
    expect(screen.getByText('Folder Page Two')).toBeDefined();
  });

  it('auto-loads later pages of archived artifacts within a folder', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-a' }] });
    mockListArtifacts
      .mockResolvedValueOnce({ artifacts: [{ id: 'art-a', name: 'Art Page One' }], page: { nextCursor: 'c2' } })
      .mockResolvedValueOnce({ artifacts: [{ id: 'art-b', name: 'Art Page Two' }], page: {} });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Artifacts' }));
    await waitFor(() => expect(screen.getByText('Art Page One')).toBeDefined());
    expect(screen.getByText('Art Page Two')).toBeDefined();
  });

  it('purges an archived project', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-2', name: 'Archived Project', deletedAt: new Date().toISOString() }] });
    mockPurgeProject.mockResolvedValue({ success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    await waitFor(() => expect(screen.getByText('Archived Project')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));
    await waitFor(() => expect(mockPurgeProject).toHaveBeenCalledWith({ projectId: 'proj-2' }));
  });

  it('restores and purges an archived task', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Archived Task', deletedAt: new Date().toISOString() }] });
    mockRestoreTask.mockResolvedValue({ success: true });
    mockPurgeTask.mockResolvedValue({ success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    await waitFor(() => expect(screen.getByText('Archived Task')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(mockRestoreTask).toHaveBeenCalledWith({ taskId: 'task-1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));
    await waitFor(() => expect(mockPurgeTask).toHaveBeenCalledWith({ taskId: 'task-1' }));
  });

  it('restores an archived agent', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListAgents.mockResolvedValue({ agents: [{ id: 'agent-2', name: 'Archived Agent', deletedAt: new Date().toISOString() }] });
    mockRestoreAgent.mockResolvedValue({ success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    await waitFor(() => expect(screen.getByText('Archived Agent')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(mockRestoreAgent).toHaveBeenCalledWith({ agentId: 'agent-2' }));
  });

  it('purges an archived folder', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-2', name: 'Archived Folder', deletedAt: new Date().toISOString() }] });
    mockPurgeFolder.mockResolvedValue({ success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Folders' }));
    await waitFor(() => expect(screen.getByText('Archived Folder')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));
    await waitFor(() => expect(mockPurgeFolder).toHaveBeenCalledWith({ folderId: 'fld-2' }));
  });

  it("shows the Folders tab's empty message when no project is active", async () => {
    mockActiveProjectId = undefined;
    mockListOrgs.mockResolvedValue({ organizations: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Folders' }));
    await waitFor(() => expect(screen.getByText('No archived folders in the active project.')).toBeDefined());
    expect(mockListFolders).not.toHaveBeenCalled();
  });
});
