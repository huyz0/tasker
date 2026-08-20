import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const {
  mockListOrgs, mockRestoreOrg, mockPurgeOrg,
  mockListTeams, mockRestoreTeam,
  mockListProjects, mockRestoreProject, mockPurgeProject,
  mockListTasks, mockRestoreTask, mockPurgeTask,
  mockListAgents, mockRestoreAgent, mockPurgeAgent,
  mockListFolders, mockRestoreFolder, mockPurgeFolder,
  mockListArtifacts, mockRestoreArtifact, mockPurgeArtifact,
} = vi.hoisted(() => ({
  mockListOrgs: vi.fn(),
  mockRestoreOrg: vi.fn(),
  mockPurgeOrg: vi.fn(),
  mockListTeams: vi.fn(),
  mockRestoreTeam: vi.fn(),
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
      case 'TeamService': return { listTeams: mockListTeams, restoreTeam: mockRestoreTeam };
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
  TeamService: 'TeamService',
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
import { confirmAction, cancelAction } from '../../test/confirm';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <BinDashboard />
    </QueryClientProvider>
  );
  return { ...utils, queryClient };
}

describe('BinDashboard', () => {
  beforeEach(() => {
    for (const m of [
      mockListOrgs, mockRestoreOrg, mockPurgeOrg,
      mockListTeams, mockRestoreTeam,
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
  });

  it('lists archived organizations and restores one', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-2', name: 'Archived Org', deletedAt: new Date().toISOString() }] });
    mockRestoreOrg.mockResolvedValue({ success: true });

    renderPage();

    await waitFor(() => expect(screen.getByText('Archived Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(mockRestoreOrg).toHaveBeenCalledWith({ orgId: 'org-2' }));
  });

  it('issues one request per bin section on mount, and pages the rest on request', async () => {
    mockListOrgs
      .mockResolvedValueOnce({ organizations: [{ id: 'org-2', name: 'Page One Org', deletedAt: new Date().toISOString() }], page: { nextCursor: 'cursor-2', totalCount: 2 } })
      .mockResolvedValueOnce({ organizations: [{ id: 'org-3', name: 'Page Two Org', deletedAt: new Date().toISOString() }], page: { totalCount: 2 } });

    renderPage();
    await waitFor(() => expect(screen.getByText('Page One Org')).toBeDefined());
    expect(mockListOrgs).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Load more/ }));
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
    expect(mockListTasks).toHaveBeenCalledWith({ projectId: 'proj-1', onlyDeleted: true, page: { cursor: undefined } });
  });

  it('permanently deletes an item after confirmation', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-2', name: 'Archived Org', deletedAt: new Date().toISOString() }] });
    mockPurgeOrg.mockResolvedValue({ success: true });

    renderPage();

    await waitFor(() => expect(screen.getByText('Archived Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));
    await confirmAction();

    await waitFor(() => expect(mockPurgeOrg).toHaveBeenCalledWith({ orgId: 'org-2' }));
  });

  it('does not purge when the confirmation is dismissed', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-2', name: 'Archived Org', deletedAt: new Date().toISOString() }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('Archived Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));
    await cancelAction();

    expect(mockPurgeOrg).not.toHaveBeenCalled();
  });

  it('shows an error message when purging fails', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-2', name: 'Archived Org', deletedAt: new Date().toISOString() }] });
    mockPurgeOrg.mockRejectedValue(new Error('organization still has projects'));

    renderPage();

    await waitFor(() => expect(screen.getByText('Archived Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));
    await confirmAction();

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

    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    await waitFor(() => expect(screen.getByText('Archived Project')).toBeDefined());
    expect(mockListProjects).toHaveBeenCalledWith({ orgId: 'org-1', onlyDeleted: true, page: { cursor: undefined } });

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(mockRestoreProject).toHaveBeenCalledWith({ projectId: 'proj-2' }));
    // M20-T05: this used to invalidate three separate keys, one of them
    // (`['projects', 'org-1']`) matching no query in the app, and none of
    // them the sidebar switcher's own `['projects', 'switcher', ...]` key -
    // a restored project never reappeared there. The bare `['projects']`
    // prefix covers every project-list key at once.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] });
  });

  it('switches to the Agents tab and lists/purges an archived agent', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListAgents.mockResolvedValue({ agents: [{ id: 'agent-2', name: 'Archived Agent', deletedAt: new Date().toISOString() }] });
    mockPurgeAgent.mockResolvedValue({ success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    await waitFor(() => expect(screen.getByText('Archived Agent')).toBeDefined());
    expect(mockListAgents).toHaveBeenCalledWith({ orgId: 'org-1', onlyDeleted: true, page: { cursor: undefined } });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));
    await confirmAction();
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
    expect(mockListFolders).toHaveBeenCalledWith({ projectId: 'proj-1', onlyDeleted: true, page: { cursor: undefined } });

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(mockRestoreFolder).toHaveBeenCalledWith({ folderId: 'fld-2' }));
  });

  it('switches to the Artifacts tab and lists the project\'s archived artifacts in one request', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    // ArtifactsBin asks the server for the project's archived artifacts in one
    // request. It used to list every folder and then fan out one request per
    // folder, which is what `projectId` on listArtifacts removed (M07-T04).
    mockListArtifacts.mockResolvedValue({
      artifacts: [
        { id: 'art-1', name: 'Archived Artifact A', deletedAt: new Date().toISOString() },
        { id: 'art-2', name: 'Archived Artifact B', deletedAt: new Date().toISOString() },
      ],
    });
    mockPurgeArtifact.mockResolvedValue({ success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Artifacts' }));
    await waitFor(() => expect(screen.getByText('Archived Artifact A')).toBeDefined());
    expect(screen.getByText('Archived Artifact B')).toBeDefined();

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete Forever' })[0]!);
    await confirmAction();
    await waitFor(() => expect(mockPurgeArtifact).toHaveBeenCalledWith({ artifactId: 'art-1' }));
  });

  it("distinguishes an organization with no archived projects from no organization at all", async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    // Set before rendering. It used to be set after the tab click, so the first
    // call rejected on an unstubbed mock and the pane rendered its empty state
    // anyway — the failure was invisible, which is the defect M06-T11 removed.
    mockListProjects.mockResolvedValue({ projects: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    // Projects query is `enabled: Boolean(activeOrgId)` - with activeOrgId
    // set (org-1, per the mocked layout store), it still resolves via the
    // mock and should show its own empty state without loading forever.
    await waitFor(() => expect(screen.getByText('No archived projects in this organization.')).toBeDefined());
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
    await waitFor(() => expect(screen.getByText('Select a project to see its archived tasks.')).toBeDefined());
    expect(mockListTasks).not.toHaveBeenCalled();
  });

  it("shows the Agents tab's empty message when no org is active", async () => {
    mockActiveOrgId = undefined;
    mockListOrgs.mockResolvedValue({ organizations: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    await waitFor(() => expect(screen.getByText('Select an organization to see its archived agents.')).toBeDefined());
    expect(mockListAgents).not.toHaveBeenCalled();
  });

  it('falls back to the item id and omits the deleted timestamp when they are missing', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [{ id: 'org-no-name' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('org-no-name')).toBeDefined());
    expect(screen.queryByText(/Deleted /)).toBeNull();
  });

  it('issues exactly one request per section on mount, across every tab', async () => {
    // Replaces two tests that asserted each section looped its cursor to
    // exhaustion. That is the behaviour M07-T04 removed; what matters now is
    // that opening a tab costs one request (the milestone's verify line).
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-a', name: 'Proj Page One' }], page: { nextCursor: 'c2', totalCount: 2 } });
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-a', title: 'Task Page One' }], page: {} });
    mockListAgents.mockResolvedValue({ agents: [{ id: 'agent-a', name: 'Agent Page One' }], page: {} });
    mockListFolders.mockResolvedValue({ folders: [{ id: 'fld-a', name: 'Folder Page One' }], page: {} });
    mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-a', name: 'Art Page One' }], page: {} });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    for (const [tab, text, mock] of [
      ['Projects', 'Proj Page One', mockListProjects],
      ['Tasks', 'Task Page One', mockListTasks],
      ['Agents', 'Agent Page One', mockListAgents],
      ['Folders', 'Folder Page One', mockListFolders],
      ['Artifacts', 'Art Page One', mockListArtifacts],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: tab }));
      await waitFor(() => expect(screen.getByText(text)).toBeDefined());
      expect(mock).toHaveBeenCalledTimes(1);
    }

    // The one section with a next page offers a way to it, and nothing else does.
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    await waitFor(() => expect(screen.getByText('Proj Page One')).toBeDefined());
    expect(screen.getByRole('button', { name: /Load more/ })).toBeInTheDocument();
  });

  it('asks for the archived artifacts of the project directly, not folder by folder', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListArtifacts.mockResolvedValue({ artifacts: [{ id: 'art-a', name: 'Art Page One' }], page: {} });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Artifacts' }));
    await waitFor(() => expect(screen.getByText('Art Page One')).toBeDefined());

    expect(mockListArtifacts).toHaveBeenCalledWith({ projectId: 'proj-1', onlyDeleted: true, page: { cursor: undefined } });
    // The folder listing is not involved at all any more.
    expect(mockListFolders).not.toHaveBeenCalled();
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
    await confirmAction();
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
    await confirmAction();
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
    await confirmAction();
    await waitFor(() => expect(mockPurgeFolder).toHaveBeenCalledWith({ folderId: 'fld-2' }));
  });

  it("shows the Folders tab's empty message when no project is active", async () => {
    mockActiveProjectId = undefined;
    mockListOrgs.mockResolvedValue({ organizations: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Folders' }));
    await waitFor(() => expect(screen.getByText('Select a project to see its archived folders.')).toBeDefined());
    expect(mockListFolders).not.toHaveBeenCalled();
  });

  it('switches to the Teams tab and lists/restores an archived team, with no Delete Forever button', async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListTeams.mockResolvedValue({ teams: [{ id: 'team-2', name: 'Archived Team', deletedAt: new Date().toISOString() }] });
    mockRestoreTeam.mockResolvedValue({ success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Teams' }));
    await waitFor(() => expect(screen.getByText('Archived Team')).toBeDefined());
    expect(mockListTeams).toHaveBeenCalledWith({ orgId: 'org-1', onlyDeleted: true, page: { cursor: undefined } });

    // TeamService has no purgeTeam RPC - the row offers Restore only.
    expect(screen.queryByRole('button', { name: 'Delete Forever' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(mockRestoreTeam).toHaveBeenCalledWith({ teamId: 'team-2' }));
  });

  it("shows the Teams tab's empty message when no org is active", async () => {
    mockActiveOrgId = undefined;
    mockListOrgs.mockResolvedValue({ organizations: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Teams' }));
    await waitFor(() => expect(screen.getByText('Select an organization to see its archived teams.')).toBeDefined());
    expect(mockListTeams).not.toHaveBeenCalled();
  });

  it("shows a project's key as its bin row detail", async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-2', name: 'Archived Project', key: 'PROJ', deletedAt: new Date().toISOString() }] });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));

    await waitFor(() => expect(screen.getByText('PROJ')).toBeDefined());
  });

  it("shows a task's status and assignees as its bin row detail", async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListTasks.mockResolvedValue({
      tasks: [{
        id: 'task-1', title: 'Archived Task', status: 'done',
        assignees: [{ userId: 'u1', agentId: '', name: 'Ada' }, { userId: 'u2', agentId: '', name: 'Grace' }],
        deletedAt: new Date().toISOString(),
      }],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));

    await waitFor(() => expect(screen.getByText('done · Ada, Grace')).toBeDefined());
  });

  it("omits the detail line for a task with no assignees, showing just its status", async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListTasks.mockResolvedValue({
      tasks: [{ id: 'task-1', title: 'Archived Task', status: 'todo', assignees: [], deletedAt: new Date().toISOString() }],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));

    await waitFor(() => expect(screen.getByText('todo')).toBeDefined());
  });

  it("shows an artifact's content type and size as its bin row detail", async () => {
    mockListOrgs.mockResolvedValue({ organizations: [] });
    mockListArtifacts.mockResolvedValue({
      artifacts: [{
        id: 'art-1', name: 'Archived Artifact', contentType: 'image/png', sizeBytes: 2048n,
        deletedAt: new Date().toISOString(),
      }],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Artifacts' }));

    await waitFor(() => expect(screen.getByText('image/png · 2.0 KB')).toBeDefined());
  });
});
