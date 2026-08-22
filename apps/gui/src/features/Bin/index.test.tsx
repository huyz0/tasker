import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrgService, TeamService, ProjectService, TaskService, AgentService, ArtifactService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';

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

/** Registers one RPC on `service` and returns an array of every request it receives. */
function withRpc(service: { typeName: string }, method: string, response: object) {
  const requests: any[] = [];
  mockRpc(service, method, (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

describe('BinDashboard', () => {
  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
  });

  it('lists archived organizations and restores one', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [{ id: 'org-2', name: 'Archived Org', deletedAt: new Date().toISOString() }] });
    const requests = withRpc(OrgService, 'RestoreOrg', { success: true });

    renderPage();

    await waitFor(() => expect(screen.getByText('Archived Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(requests).toContainEqual({ orgId: 'org-2' }));
  });

  it('issues one request per bin section on mount, and pages the rest on request', async () => {
    const requests: any[] = [];
    mockRpc(OrgService, 'ListOrgs', (body: { page?: { cursor?: string } }) => {
      requests.push(body);
      return body.page?.cursor
        ? { organizations: [{ id: 'org-3', name: 'Page Two Org', deletedAt: new Date().toISOString() }], page: { totalCount: 2 } }
        : { organizations: [{ id: 'org-2', name: 'Page One Org', deletedAt: new Date().toISOString() }], page: { nextCursor: 'cursor-2', totalCount: 2 } };
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Page One Org')).toBeDefined());
    expect(requests).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Load more/ }));
    await waitFor(() => expect(screen.getByText('Page Two Org')).toBeDefined());
    expect(requests[requests.length - 1]).toEqual({ onlyDeleted: true, page: { cursor: 'cursor-2' } });
  });

  it('shows an empty message when there is nothing archived', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
  });

  it('switches tabs and lists archived tasks', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    const requests = withRpc(TaskService, 'ListTasks', { tasks: [{ id: 'task-1', title: 'Archived Task', deletedAt: new Date().toISOString() }] });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    await waitFor(() => expect(screen.getByText('Archived Task')).toBeDefined());
    expect(requests).toContainEqual({ projectId: 'proj-1', onlyDeleted: true, page: {} });
  });

  it('permanently deletes an item after confirmation', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [{ id: 'org-2', name: 'Archived Org', deletedAt: new Date().toISOString() }] });
    const requests = withRpc(OrgService, 'PurgeOrg', { success: true });

    renderPage();

    await waitFor(() => expect(screen.getByText('Archived Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));
    await confirmAction();

    await waitFor(() => expect(requests).toContainEqual({ orgId: 'org-2' }));
  });

  it('does not purge when the confirmation is dismissed', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [{ id: 'org-2', name: 'Archived Org', deletedAt: new Date().toISOString() }] });
    const requests = withRpc(OrgService, 'PurgeOrg', {});

    renderPage();

    await waitFor(() => expect(screen.getByText('Archived Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));
    await cancelAction();

    expect(requests).toHaveLength(0);
  });

  it('shows an error message when purging fails', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [{ id: 'org-2', name: 'Archived Org', deletedAt: new Date().toISOString() }] });
    mockRpcError(OrgService, 'PurgeOrg', 'unknown', 'organization still has projects');

    renderPage();

    await waitFor(() => expect(screen.getByText('Archived Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));
    await confirmAction();

    await waitFor(() => expect(screen.getByText(/Failed to delete forever/)).toBeDefined());
  });

  it('shows an error message when restoring fails', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [{ id: 'org-2', name: 'Archived Org', deletedAt: new Date().toISOString() }] });
    mockRpcError(OrgService, 'RestoreOrg', 'unknown', 'parent organization is archived');

    renderPage();

    await waitFor(() => expect(screen.getByText('Archived Org')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(screen.getByText(/Failed to restore/)).toBeDefined());
  });

  it('switches to the Projects tab and lists/restores an archived project', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    const listRequests = withRpc(ProjectService, 'ListProjects', { projects: [{ id: 'proj-2', name: 'Archived Project', deletedAt: new Date().toISOString() }] });
    const restoreRequests = withRpc(ProjectService, 'RestoreProject', { success: true });

    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    await waitFor(() => expect(screen.getByText('Archived Project')).toBeDefined());
    expect(listRequests).toContainEqual({ orgId: 'org-1', onlyDeleted: true, page: {} });

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(restoreRequests).toContainEqual({ projectId: 'proj-2' }));
    // M20-T05: this used to invalidate three separate keys, one of them
    // (`['projects', 'org-1']`) matching no query in the app, and none of
    // them the sidebar switcher's own `['projects', 'switcher', ...]` key -
    // a restored project never reappeared there. The bare `['projects']`
    // prefix covers every project-list key at once.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] });
  });

  it('switches to the Agents tab and lists/purges an archived agent', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    const listRequests = withRpc(AgentService, 'ListAgents', { agents: [{ id: 'agent-2', name: 'Archived Agent', deletedAt: new Date().toISOString() }] });
    const purgeRequests = withRpc(AgentService, 'PurgeAgent', { success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    await waitFor(() => expect(screen.getByText('Archived Agent')).toBeDefined());
    expect(listRequests).toContainEqual({ orgId: 'org-1', onlyDeleted: true, page: {} });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));
    await confirmAction();
    await waitFor(() => expect(purgeRequests).toContainEqual({ agentId: 'agent-2' }));
  });

  it('switches to the Folders tab and lists/restores an archived folder', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    const listRequests = withRpc(ArtifactService, 'ListFolders', { folders: [{ id: 'fld-2', name: 'Archived Folder', deletedAt: new Date().toISOString() }] });
    const restoreRequests = withRpc(ArtifactService, 'RestoreFolder', { success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Folders' }));
    await waitFor(() => expect(screen.getByText('Archived Folder')).toBeDefined());
    expect(listRequests).toContainEqual({ projectId: 'proj-1', onlyDeleted: true, page: {} });

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(restoreRequests).toContainEqual({ folderId: 'fld-2' }));
  });

  it('switches to the Artifacts tab and lists the project\'s archived artifacts in one request', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    // ArtifactsBin asks the server for the project's archived artifacts in one
    // request. It used to list every folder and then fan out one request per
    // folder, which is what `projectId` on listArtifacts removed (M07-T04).
    withRpc(ArtifactService, 'ListArtifacts', {
      artifacts: [
        { id: 'art-1', name: 'Archived Artifact A', deletedAt: new Date().toISOString() },
        { id: 'art-2', name: 'Archived Artifact B', deletedAt: new Date().toISOString() },
      ],
    });
    const purgeRequests = withRpc(ArtifactService, 'PurgeArtifact', { success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Artifacts' }));
    await waitFor(() => expect(screen.getByText('Archived Artifact A')).toBeDefined());
    expect(screen.getByText('Archived Artifact B')).toBeDefined();

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete Forever' })[0]!);
    await confirmAction();
    await waitFor(() => expect(purgeRequests).toContainEqual({ artifactId: 'art-1' }));
  });

  it("distinguishes an organization with no archived projects from no organization at all", async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    // Set before rendering. It used to be set after the tab click, so the first
    // call rejected on an unstubbed mock and the pane rendered its empty state
    // anyway — the failure was invisible, which is the defect M06-T11 removed.
    withRpc(ProjectService, 'ListProjects', { projects: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    // Projects query is `enabled: Boolean(activeOrgId)` - with activeOrgId
    // set (org-1, per the mocked layout store), it still resolves via the
    // mock and should show its own empty state without loading forever.
    await waitFor(() => expect(screen.getByText('No archived projects in this organization.')).toBeDefined());
  });

  it('restores an archived artifact', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    withRpc(ArtifactService, 'ListFolders', { folders: [{ id: 'fld-a' }] });
    withRpc(ArtifactService, 'ListArtifacts', { artifacts: [{ id: 'art-1', name: 'Archived Artifact', deletedAt: new Date().toISOString() }] });
    const restoreRequests = withRpc(ArtifactService, 'RestoreArtifact', { success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Artifacts' }));
    await waitFor(() => expect(screen.getByText('Archived Artifact')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(restoreRequests).toContainEqual({ artifactId: 'art-1' }));
  });

  it("shows the Tasks tab's empty message when no project is active", async () => {
    mockActiveProjectId = undefined;
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    const requests = withRpc(TaskService, 'ListTasks', {});
    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    await waitFor(() => expect(screen.getByText('Select a project to see its archived tasks.')).toBeDefined());
    expect(requests).toHaveLength(0);
  });

  it("shows the Agents tab's empty message when no org is active", async () => {
    mockActiveOrgId = undefined;
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    const requests = withRpc(AgentService, 'ListAgents', {});
    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    await waitFor(() => expect(screen.getByText('Select an organization to see its archived agents.')).toBeDefined());
    expect(requests).toHaveLength(0);
  });

  it('falls back to the item id and omits the deleted timestamp when they are missing', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [{ id: 'org-no-name' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('org-no-name')).toBeDefined());
    expect(screen.queryByText(/Deleted /)).toBeNull();
  });

  it('issues exactly one request per section on mount, across every tab', async () => {
    // Replaces two tests that asserted each section looped its cursor to
    // exhaustion. That is the behaviour M07-T04 removed; what matters now is
    // that opening a tab costs one request (the milestone's verify line).
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    const projectRequests = withRpc(ProjectService, 'ListProjects', { projects: [{ id: 'proj-a', name: 'Proj Page One' }], page: { nextCursor: 'c2', totalCount: 2 } });
    const taskRequests = withRpc(TaskService, 'ListTasks', { tasks: [{ id: 'task-a', title: 'Task Page One' }], page: {} });
    const agentRequests = withRpc(AgentService, 'ListAgents', { agents: [{ id: 'agent-a', name: 'Agent Page One' }], page: {} });
    const folderRequests = withRpc(ArtifactService, 'ListFolders', { folders: [{ id: 'fld-a', name: 'Folder Page One' }], page: {} });
    const artifactRequests = withRpc(ArtifactService, 'ListArtifacts', { artifacts: [{ id: 'art-a', name: 'Art Page One' }], page: {} });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    for (const [tab, text, requests] of [
      ['Projects', 'Proj Page One', projectRequests],
      ['Tasks', 'Task Page One', taskRequests],
      ['Agents', 'Agent Page One', agentRequests],
      ['Folders', 'Folder Page One', folderRequests],
      ['Artifacts', 'Art Page One', artifactRequests],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: tab }));
      await waitFor(() => expect(screen.getByText(text)).toBeDefined());
      expect(requests).toHaveLength(1);
    }

    // The one section with a next page offers a way to it, and nothing else does.
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    await waitFor(() => expect(screen.getByText('Proj Page One')).toBeDefined());
    expect(screen.getByRole('button', { name: /Load more/ })).toBeInTheDocument();
  });

  it('asks for the archived artifacts of the project directly, not folder by folder', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    const artifactRequests = withRpc(ArtifactService, 'ListArtifacts', { artifacts: [{ id: 'art-a', name: 'Art Page One' }], page: {} });
    const folderRequests = withRpc(ArtifactService, 'ListFolders', {});

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Artifacts' }));
    await waitFor(() => expect(screen.getByText('Art Page One')).toBeDefined());

    expect(artifactRequests).toContainEqual({ projectId: 'proj-1', onlyDeleted: true, page: {} });
    // The folder listing is not involved at all any more.
    expect(folderRequests).toHaveLength(0);
  });

  it('purges an archived project', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    withRpc(ProjectService, 'ListProjects', { projects: [{ id: 'proj-2', name: 'Archived Project', deletedAt: new Date().toISOString() }] });
    const purgeRequests = withRpc(ProjectService, 'PurgeProject', { success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    await waitFor(() => expect(screen.getByText('Archived Project')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));
    await confirmAction();
    await waitFor(() => expect(purgeRequests).toContainEqual({ projectId: 'proj-2' }));
  });

  it('restores and purges an archived task', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    withRpc(TaskService, 'ListTasks', { tasks: [{ id: 'task-1', title: 'Archived Task', deletedAt: new Date().toISOString() }] });
    const restoreRequests = withRpc(TaskService, 'RestoreTask', { success: true });
    const purgeRequests = withRpc(TaskService, 'PurgeTask', { success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    await waitFor(() => expect(screen.getByText('Archived Task')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(restoreRequests).toContainEqual({ taskId: 'task-1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));
    await confirmAction();
    await waitFor(() => expect(purgeRequests).toContainEqual({ taskId: 'task-1' }));
  });

  it('restores an archived agent', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    withRpc(AgentService, 'ListAgents', { agents: [{ id: 'agent-2', name: 'Archived Agent', deletedAt: new Date().toISOString() }] });
    const requests = withRpc(AgentService, 'RestoreAgent', { success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    await waitFor(() => expect(screen.getByText('Archived Agent')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(requests).toContainEqual({ agentId: 'agent-2' }));
  });

  it('purges an archived folder', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    withRpc(ArtifactService, 'ListFolders', { folders: [{ id: 'fld-2', name: 'Archived Folder', deletedAt: new Date().toISOString() }] });
    const requests = withRpc(ArtifactService, 'PurgeFolder', { success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Folders' }));
    await waitFor(() => expect(screen.getByText('Archived Folder')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Delete Forever' }));
    await confirmAction();
    await waitFor(() => expect(requests).toContainEqual({ folderId: 'fld-2' }));
  });

  it("shows the Folders tab's empty message when no project is active", async () => {
    mockActiveProjectId = undefined;
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    const requests = withRpc(ArtifactService, 'ListFolders', {});
    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Folders' }));
    await waitFor(() => expect(screen.getByText('Select a project to see its archived folders.')).toBeDefined());
    expect(requests).toHaveLength(0);
  });

  it('switches to the Teams tab and lists/restores an archived team, with no Delete Forever button', async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    const listRequests = withRpc(TeamService, 'ListTeams', { teams: [{ id: 'team-2', name: 'Archived Team', deletedAt: new Date().toISOString() }] });
    const restoreRequests = withRpc(TeamService, 'RestoreTeam', { success: true });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Teams' }));
    await waitFor(() => expect(screen.getByText('Archived Team')).toBeDefined());
    expect(listRequests).toContainEqual({ orgId: 'org-1', onlyDeleted: true, page: {} });

    // TeamService has no purgeTeam RPC - the row offers Restore only.
    expect(screen.queryByRole('button', { name: 'Delete Forever' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(restoreRequests).toContainEqual({ teamId: 'team-2' }));
  });

  it("shows the Teams tab's empty message when no org is active", async () => {
    mockActiveOrgId = undefined;
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    const requests = withRpc(TeamService, 'ListTeams', {});
    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Teams' }));
    await waitFor(() => expect(screen.getByText('Select an organization to see its archived teams.')).toBeDefined());
    expect(requests).toHaveLength(0);
  });

  it("shows a project's key as its bin row detail", async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    withRpc(ProjectService, 'ListProjects', { projects: [{ id: 'proj-2', name: 'Archived Project', key: 'PROJ', deletedAt: new Date().toISOString() }] });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));

    await waitFor(() => expect(screen.getByText('PROJ')).toBeDefined());
  });

  it("shows a task's status and assignees as its bin row detail", async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    withRpc(TaskService, 'ListTasks', {
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
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    withRpc(TaskService, 'ListTasks', {
      tasks: [{ id: 'task-1', title: 'Archived Task', status: 'todo', assignees: [], deletedAt: new Date().toISOString() }],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));

    await waitFor(() => expect(screen.getByText('todo')).toBeDefined());
  });

  it("shows an artifact's content type and size as its bin row detail", async () => {
    withRpc(OrgService, 'ListOrgs', { organizations: [] });
    withRpc(ArtifactService, 'ListArtifacts', {
      artifacts: [{
        id: 'art-1', name: 'Archived Artifact', contentType: 'image/png', sizeBytes: '2048',
        deletedAt: new Date().toISOString(),
      }],
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('No archived organizations.')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Artifacts' }));

    await waitFor(() => expect(screen.getByText('image/png · 2.0 KB')).toBeDefined());
  });
});
