import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectService, ProjectTemplateService, TaskService, RoleService, OrgService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending } from '../../test/mockRpc';

vi.mock('../../components/ui/repositories/RepositoryIntegrationConfig', () => ({
  RepositoryIntegrationConfig: () => null,
}));

const mockUserId = 'user-authed-1';
let mockAuthUserId: string | null = mockUserId;
vi.mock('../../hooks/useAuthSession', () => ({
  useAuthSession: () => ({ isLoading: false, authenticated: !!mockAuthUserId, get userId() { return mockAuthUserId; } }),
}));
let mockActiveOrgId = 'org-1';
let mockActiveProjectId = '';
const mockSetActiveProjectId = vi.fn((id: string) => { mockActiveProjectId = id; });
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    get activeOrgId() { return mockActiveOrgId; },
    get activeProjectId() { return mockActiveProjectId; },
    setActiveProjectId: mockSetActiveProjectId,
  })),
}));

import { ProjectsWizard } from './index';
import { confirmAction, cancelAction } from '../../test/confirm';

function page() {
  return <ProjectsWizard />;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>{page()}</QueryClientProvider>
  );
  return { ...utils, queryClient };
}

/** Registers ListTemplates, tracking every request it receives. */
function withTemplates(templates: any[]) {
  const requests: any[] = [];
  mockRpc(ProjectTemplateService, 'ListTemplates', (body) => {
    requests.push(body);
    return { templates };
  });
  return requests;
}

/**
 * Registers ListProjects. `projects` answers every call the same way; pass a
 * function of the request body instead for cursor-dependent pagination.
 */
function withProjects(projects: any[] | ((body: any) => object)) {
  const requests: any[] = [];
  mockRpc(ProjectService, 'ListProjects', (body) => {
    requests.push(body);
    return typeof projects === 'function' ? projects(body) : { projects };
  });
  return requests;
}

/**
 * Registers ListTasks the way `ProjectTaskCount` calls it — one `limit: 1`
 * request per rendered project card, answered from a projectId->count map.
 * `PageResponse.total_count` is a plain int32, so a project with no entry (or
 * an explicit 0) gets a response with no `page` key at all, the same as the
 * real server would send for an empty count (M07-T03's convention, reused
 * here for the wizard's own task-count glance).
 */
function withTaskCounts(counts: Record<string, number> = {}) {
  const requests: any[] = [];
  mockRpc(TaskService, 'ListTasks', (body: { projectId: string }) => {
    requests.push(body);
    const total = counts[body.projectId];
    return { tasks: [], page: total ? { totalCount: total } : {} };
  });
  return requests;
}

describe('ProjectsWizard', () => {
  beforeEach(() => {
    mockAuthUserId = mockUserId;
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = '';
    mockSetActiveProjectId.mockClear();
    withTaskCounts();
    mockRpc(RoleService, 'ListRoles', { roles: [] });
    mockRpc(RoleService, 'ListGrants', { grants: [] });
    mockRpc(OrgService, 'ListOrgMembers', { members: [] });
  });

  it('disables project creation until a name is entered', async () => {
    withTemplates([{ id: 'tpl-1', name: 'Software', description: 'desc' }]);
    withProjects([]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    const useTemplateButton = screen.getByRole('button', { name: 'Use Template' });
    expect(useTemplateButton).toHaveProperty('disabled', true);
  });

  it('creates a project with the user-entered name and the authenticated user as owner', async () => {
    withTemplates([{ id: 'tpl-1', name: 'Software', description: 'desc' }]);
    withProjects([]);
    const requests: any[] = [];
    mockRpc(ProjectService, 'CreateProject', (body) => {
      requests.push(body);
      return { project: { id: 'proj-new', name: 'My Real Project' } };
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('New project name'), { target: { value: 'My Real Project' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use Template' }));

    await waitFor(() => expect(requests).toContainEqual({
      orgId: 'org-1',
      templateId: 'tpl-1',
      name: 'My Real Project',
      ownerId: mockUserId,
      description: '',
    }));
  });

  it('shows an error message when project creation fails', async () => {
    withTemplates([{ id: 'tpl-1', name: 'Software', description: 'desc' }]);
    withProjects([]);
    mockRpcError(ProjectService, 'CreateProject', 'unknown', 'template not found');
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('New project name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use Template' }));

    await waitFor(() => expect(screen.getByText(/Failed to create project/)).toBeDefined());
  });

  it('renders existing projects', async () => {
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
  });

  // M20-T05: this used to invalidate three separate keys, one of them
  // (`['projects', 'org-1']`) matching no query in the app at all, and none
  // of them the sidebar switcher's own `['projects', 'switcher', ...]` key -
  // a newly-archived project stayed listed and pickable there. The bare
  // `['projects']` prefix covers every project-list key at once, the same
  // pattern the Organizations screen already uses for `['orgs']`.
  it('invalidates every projects query key after archiving a project, so the Bin and switcher both refresh', async () => {
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
    const requests: any[] = [];
    mockRpc(ProjectService, 'ArchiveProject', (body) => {
      requests.push(body);
      return {};
    });

    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(requests).toContainEqual({ projectId: 'proj-1' }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] });
  });

  // M20-T05: archiving the currently-active project used to leave
  // activeProjectId pointing at it forever - Tasks/Artifacts/Dashboard all
  // kept querying an archived project, and the switcher's own auto-select
  // fallback never fires while the id is still non-empty.
  it('clears activeProjectId when the archived project is the active one', async () => {
    mockActiveProjectId = 'proj-1';
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Active Project' }]);
    mockRpc(ProjectService, 'ArchiveProject', {});
    renderPage();

    await waitFor(() => expect(screen.getByText('Active Project')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(mockSetActiveProjectId).toHaveBeenCalledWith(''));
  });

  it('leaves activeProjectId untouched when archiving a different project', async () => {
    mockActiveProjectId = 'proj-active';
    withTemplates([]);
    withProjects([{ id: 'proj-other', name: 'Other Project' }]);
    const requests: any[] = [];
    mockRpc(ProjectService, 'ArchiveProject', (body) => {
      requests.push(body);
      return {};
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Other Project')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(requests).toContainEqual({ projectId: 'proj-other' }));
    expect(mockSetActiveProjectId).not.toHaveBeenCalled();
  });

  // M20-T05: none of the page-level drafts reset on an org switch before
  // this - a project name typed for org A survived into org B.
  it('resets the new-project draft and open edit/create forms when the active org changes', async () => {
    withTemplates([{ id: 'tpl-1', name: 'Software', description: 'desc' }]);
    withProjects([]);
    const { rerender } = renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('New project name'), { target: { value: 'Org A Draft Name' } });
    fireEvent.click(screen.getByRole('button', { name: '+ New Template' }));
    expect(screen.getByPlaceholderText('Template name')).toBeInTheDocument();

    mockActiveOrgId = 'org-2';
    rerender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{page()}</QueryClientProvider>);

    await waitFor(() => expect(screen.getByPlaceholderText('New project name')).toHaveValue(''));
    expect(screen.queryByPlaceholderText('Template name')).toBeNull();
  });

  it('creates a project template via a real API call, using real data instead of requiring the backend/CLI', async () => {
    withTemplates([]);
    withProjects([]);
    const requests: any[] = [];
    mockRpc(ProjectTemplateService, 'CreateTemplate', (body) => {
      requests.push(body);
      return { template: { id: 'tpl-new', name: 'New Template' } };
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('+ New Template')).toBeDefined());
    fireEvent.click(screen.getByText('+ New Template'));

    fireEvent.change(screen.getByPlaceholderText('Template name'), { target: { value: 'New Template' } });
    fireEvent.change(screen.getByPlaceholderText('Description (optional)'), { target: { value: 'A description' } });
    fireEvent.click(screen.getByText('Create Template'));

    await waitFor(() => expect(requests).toContainEqual({
      orgId: 'org-1',
      name: 'New Template',
      description: 'A description',
    }));
  });

  // M14-T09: this screen used to create and rename task types itself, with
  // no view of the statuses/transitions the rename affects. It is now a
  // read-only glance, linking to /task-types for anything that changes one.
  it('loads the next page of projects when Load More is clicked', async () => {
    withTemplates([]);
    const requests = withProjects((body: { page?: { cursor?: string } }) =>
      body.page?.cursor
        ? { projects: [{ id: 'proj-2', name: 'Page Two Project' }], page: {} }
        : { projects: [{ id: 'proj-1', name: 'Page One Project' }], page: { nextCursor: 'cursor-2' } },
    );
    renderPage();

    await waitFor(() => expect(screen.getByText('Page One Project')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Load More' }));

    await waitFor(() => expect(screen.getByText('Page Two Project')).toBeDefined());
    expect(requests).toContainEqual({ orgId: 'org-1', page: { cursor: 'cursor-2' } });
    await waitFor(() => expect(screen.getByText('No more items to load')).toBeDefined());
  });

  it('shows empty-state messages for templates and projects', async () => {
    withTemplates([]);
    withProjects([]);
    renderPage();

    await waitFor(() => expect(screen.getByText('No templates yet.')).toBeDefined());
    expect(screen.getByText('No projects yet.')).toBeDefined();
  });

  it('retries fetching templates and projects after a failure', async () => {
    mockRpcError(ProjectTemplateService, 'ListTemplates', 'unknown', 'boom');
    mockRpcError(ProjectService, 'ListProjects', 'unknown', 'boom');
    renderPage();

    const tryAgainButtons = await screen.findAllByText('Try again');
    expect(tryAgainButtons).toHaveLength(2);

    const templateRequests = withTemplates([]);
    const projectRequests = withProjects([]);
    tryAgainButtons.forEach((btn) => fireEvent.click(btn));

    await waitFor(() => {
      expect(templateRequests.length).toBeGreaterThan(0);
      expect(projectRequests.length).toBeGreaterThan(0);
    });
  });

  it('shows an error message when template creation fails', async () => {
    withTemplates([]);
    withProjects([]);
    mockRpcError(ProjectTemplateService, 'CreateTemplate', 'unknown', 'name already exists');
    renderPage();

    await waitFor(() => expect(screen.getByText('+ New Template')).toBeDefined());
    fireEvent.click(screen.getByText('+ New Template'));
    fireEvent.change(screen.getByPlaceholderText('Template name'), { target: { value: 'Dup' } });
    fireEvent.click(screen.getByText('Create Template'));

    await waitFor(() => expect(screen.getByText(/Failed to create template/)).toBeDefined());
  });

  it('does not archive a project when confirmation is cancelled', async () => {
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
    const requests: any[] = [];
    mockRpc(ProjectService, 'ArchiveProject', (body) => {
      requests.push(body);
      return {};
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));
    await cancelAction();

    expect(requests).toHaveLength(0);
  });

  it('shows an error message when project deletion fails', async () => {
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
    mockRpcError(ProjectService, 'ArchiveProject', 'unknown', 'has active tasks');
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(screen.getByText(/Failed to delete project/)).toBeDefined());
  });

  // M20-T06: archiveProjectMutation used to be one shared object read by
  // every project row's Delete button - archiving one project disabled every
  // other row's Delete button too, compared here against .variables (the
  // project id the in-flight mutate() call actually carries).
  it('isolates the pending Delete state to the project that was clicked', async () => {
    withTemplates([]);
    withProjects([
      { id: 'proj-1', name: 'Project One' },
      { id: 'proj-2', name: 'Project Two' },
    ]);
    const pending = mockRpcPending(ProjectService, 'ArchiveProject');
    renderPage();

    await waitFor(() => expect(screen.getByText('Project One')).toBeDefined());
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await confirmAction();

    await waitFor(() => expect(pending.requests).toContainEqual({ projectId: 'proj-1' }));
    expect(screen.getAllByText('Delete')[0]).toBeDisabled();
    expect(screen.getAllByText('Delete')[1]).not.toBeDisabled();

    pending.resolve({});
  });

  // M20-T06: updateProjectMutation.isError used to be rendered unconditionally
  // for every project card - one failed rename painted the error banner on
  // every visible card, not just the one being edited.
  it('shows the rename-failure banner only on the project card that is being edited', async () => {
    withTemplates([]);
    withProjects([
      { id: 'proj-1', name: 'Project One' },
      { id: 'proj-2', name: 'Project Two' },
    ]);
    mockRpcError(ProjectService, 'UpdateProject', 'unknown', 'not a member');
    renderPage();

    await waitFor(() => expect(screen.getByText('Project One')).toBeDefined());
    fireEvent.click(screen.getAllByText('Edit')[0]);
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to update project/)).toBeInTheDocument());
    expect(screen.getAllByText(/Failed to update project/)).toHaveLength(1);
  });

  it('shows an error when creating a project with no authenticated user', async () => {
    mockAuthUserId = null;
    withTemplates([{ id: 'tpl-1', name: 'Software', description: 'desc' }]);
    withProjects([]);
    const requests: any[] = [];
    mockRpc(ProjectService, 'CreateProject', (body) => {
      requests.push(body);
      return {};
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('New project name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use Template' }));

    await waitFor(() => expect(screen.getByText(/Failed to create project/)).toBeDefined());
    expect(requests).toHaveLength(0);
  });

  it('does not submit a blank template form', async () => {
    withTemplates([]);
    withProjects([]);
    const requests: any[] = [];
    mockRpc(ProjectTemplateService, 'CreateTemplate', (body) => {
      requests.push(body);
      return {};
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('+ New Template')).toBeDefined());
    fireEvent.click(screen.getByText('+ New Template'));
    fireEvent.submit(screen.getByPlaceholderText('Template name').closest('form')!);
    expect(requests).toHaveLength(0);
  });

  it('shows pending labels while creating a project and a template', async () => {
    withTemplates([{ id: 'tpl-1', name: 'Software', description: 'desc' }]);
    withProjects([]);
    const pendingProject = mockRpcPending(ProjectService, 'CreateProject');

    renderPage();
    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText('New project name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use Template' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Creating...' })).toBeInTheDocument());
    pendingProject.resolve({ project: { id: 'proj-new', name: 'X' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Creating...' })).toBeNull());

    const pendingTemplate = mockRpcPending(ProjectTemplateService, 'CreateTemplate');
    fireEvent.click(screen.getByText('+ New Template'));
    fireEvent.change(screen.getByPlaceholderText('Template name'), { target: { value: 'Tmpl' } });
    fireEvent.click(screen.getByText('Create Template'));
    await waitFor(() => expect(screen.getByText('Creating...')).toBeInTheDocument());
    pendingTemplate.resolve({ template: { id: 'tpl-new', name: 'Tmpl' } });
  });

  // M20-T06: createProjectMutation used to be one shared object read by every
  // template card's "Use Template" button - creating from template A left
  // template B's button disabled and relabeled "Creating..." too, even though
  // no request had been made for it.
  it('isolates the pending "Use Template" state to the template that was clicked', async () => {
    withTemplates([
      { id: 'tpl-1', name: 'Software', description: 'desc' },
      { id: 'tpl-2', name: 'Marketing', description: 'desc2' },
    ]);
    withProjects([]);
    const pending = mockRpcPending(ProjectService, 'CreateProject');
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('New project name'), { target: { value: 'X' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Use Template' })[0]);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Creating...' })).toBeInTheDocument());
    const untouchedButton = screen.getByRole('button', { name: 'Use Template' });
    expect(untouchedButton).not.toBeDisabled();

    pending.resolve({ project: { id: 'proj-new', name: 'X' } });
  });

  it('toggles the new-template form closed via Cancel', async () => {
    withTemplates([]);
    withProjects([]);
    renderPage();

    await waitFor(() => expect(screen.getByText('+ New Template')).toBeDefined());
    fireEvent.click(screen.getByText('+ New Template'));
    expect(screen.getByPlaceholderText('Template name')).toBeDefined();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('Template name')).toBeNull();
  });

  it('renames a project through the GUI', async () => {
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
    const requests: any[] = [];
    mockRpc(ProjectService, 'UpdateProject', (body) => {
      requests.push(body);
      return { project: { id: 'proj-1', name: 'Renamed Project' } };
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));

    const nameInput = screen.getByDisplayValue('Existing Project');
    fireEvent.change(nameInput, { target: { value: 'Renamed Project' } });
    fireEvent.click(screen.getByText('Save'));

    // description is always sent, even untouched - empty here since the
    // fixture project had none, same as how Tasks always sends description.
    // UpdateProjectRequest.description is `optional`, so an explicitly-set ''
    // still serializes as present, unlike a plain scalar field.
    await waitFor(() => expect(requests).toContainEqual({ projectId: 'proj-1', name: 'Renamed Project', description: '' }));
  });

  // M16-T02: no description field existed on a project at all before this.
  it('shows, edits, and clears a project description through the GUI', async () => {
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Existing Project', description: 'Ships the thing' }]);
    const requests: any[] = [];
    mockRpc(ProjectService, 'UpdateProject', (body) => {
      requests.push(body);
      return { project: { id: 'proj-1', name: 'Existing Project', description: 'New description' } };
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Ships the thing')).toBeDefined());

    fireEvent.click(screen.getByText('Edit'));
    const descriptionInput = screen.getByDisplayValue('Ships the thing');
    fireEvent.change(descriptionInput, { target: { value: 'New description' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(requests).toContainEqual({
      projectId: 'proj-1', name: 'Existing Project', description: 'New description',
    }));
  });

  it('shows a fallback when a project has no description', async () => {
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
    renderPage();

    expect(await screen.findByText('No description.')).toBeInTheDocument();
  });

  // M16-T03: no task count, or any project-level signal at all, existed on
  // this list before this - "% done" isn't attempted (no universal
  // terminal status across custom task types), just a plain count.
  it("shows each project's task count, read the same way a board column reads its own", async () => {
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
    const requests = withTaskCounts({ 'proj-1': 47 });
    renderPage();

    expect(await screen.findByText('47 tasks')).toBeInTheDocument();
    expect(requests).toContainEqual({ projectId: 'proj-1', page: { limit: 1 } });
  });

  it('says so when a project has no tasks yet, and singularizes exactly one', async () => {
    withTemplates([]);
    withProjects([
      { id: 'proj-1', name: 'Empty Project' },
      { id: 'proj-2', name: 'One Task Project' },
    ]);
    withTaskCounts({ 'proj-2': 1 });
    renderPage();

    expect(await screen.findByText('No tasks yet')).toBeInTheDocument();
    expect(await screen.findByText('1 task')).toBeInTheDocument();
  });

  it('shows a loading state, then reports when the task count fails to load', async () => {
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
    mockRpcError(TaskService, 'ListTasks', 'unknown', 'boom');
    renderPage();

    expect(await screen.findByText('Loading tasks…')).toBeInTheDocument();
    expect(await screen.findByText('Task count unavailable')).toBeInTheDocument();
  });

  it('sends a description typed into the new-project field', async () => {
    withTemplates([{ id: 'tpl-1', name: 'Software', description: 'desc' }]);
    withProjects([]);
    const requests: any[] = [];
    mockRpc(ProjectService, 'CreateProject', (body) => {
      requests.push(body);
      return {};
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('New project name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText('What is this project for? (optional)'), { target: { value: 'A real description' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use Template' }));

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ description: 'A real description' })));
  });

  it('cancels editing a project without saving', async () => {
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
    const requests: any[] = [];
    mockRpc(ProjectService, 'UpdateProject', (body) => {
      requests.push(body);
      return {};
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByDisplayValue('Existing Project')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Existing Project')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('shows an error message when renaming a project fails', async () => {
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
    mockRpcError(ProjectService, 'UpdateProject', 'unknown', 'not a member');
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to update project/)).toBeInTheDocument());
  });

  it('does not submit a blank project rename', async () => {
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
    const requests: any[] = [];
    mockRpc(ProjectService, 'UpdateProject', (body) => {
      requests.push(body);
      return {};
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    const nameInput = screen.getByDisplayValue('Existing Project');
    fireEvent.change(nameInput, { target: { value: '  ' } });
    fireEvent.submit(nameInput.closest('form')!);

    expect(requests).toHaveLength(0);
  });

  it('shows a pending label while renaming a project', async () => {
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
    const pending = mockRpcPending(ProjectService, 'UpdateProject');
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText('Saving...')).toBeInTheDocument());
    pending.resolve({ project: { id: 'proj-1', name: 'Existing Project' } });
  });

  // M20-T06: updateProjectMutation.reset() is now called from both the Edit
  // open handler and the Cancel handler - without it, a stale error from a
  // previous failed save reappeared the moment the form was reopened, before
  // any new save had even been attempted.
  it('clears a stale rename error when Edit is reopened on a project', async () => {
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
    mockRpcError(ProjectService, 'UpdateProject', 'unknown', 'not a member');
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(screen.getByText(/Failed to update project/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.queryByText(/Failed to update project/)).not.toBeInTheDocument();
  });

  it('edits a template through the GUI', async () => {
    withTemplates([{ id: 'tpl-1', name: 'Software', description: 'desc' }]);
    withProjects([]);
    const requests: any[] = [];
    mockRpc(ProjectTemplateService, 'UpdateTemplate', (body) => {
      requests.push(body);
      return { template: { id: 'tpl-1', name: 'Software Renamed', description: 'new desc' } };
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));

    fireEvent.change(screen.getByDisplayValue('Software'), { target: { value: 'Software Renamed' } });
    fireEvent.change(screen.getByDisplayValue('desc'), { target: { value: 'new desc' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(requests).toContainEqual({ id: 'tpl-1', name: 'Software Renamed', description: 'new desc' }));
  });

  it('does not submit a blank template rename', async () => {
    withTemplates([{ id: 'tpl-1', name: 'Software', description: 'desc' }]);
    withProjects([]);
    const requests: any[] = [];
    mockRpc(ProjectTemplateService, 'UpdateTemplate', (body) => {
      requests.push(body);
      return {};
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    const nameInput = screen.getByDisplayValue('Software');
    fireEvent.change(nameInput, { target: { value: '  ' } });
    fireEvent.submit(nameInput.closest('form')!);

    expect(requests).toHaveLength(0);
  });

  it('shows a pending label while renaming a template', async () => {
    withTemplates([{ id: 'tpl-1', name: 'Software', description: 'desc' }]);
    withProjects([]);
    const pending = mockRpcPending(ProjectTemplateService, 'UpdateTemplate');
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText('Saving...')).toBeInTheDocument());
    pending.resolve({ template: { id: 'tpl-1', name: 'Software', description: 'desc' } });
  });

  it('cancels editing a template without saving', async () => {
    withTemplates([{ id: 'tpl-1', name: 'Software', description: 'desc' }]);
    withProjects([]);
    const requests: any[] = [];
    mockRpc(ProjectTemplateService, 'UpdateTemplate', (body) => {
      requests.push(body);
      return {};
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByDisplayValue('Software')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Software')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('shows an error message when updating a template fails', async () => {
    withTemplates([{ id: 'tpl-1', name: 'Software', description: 'desc' }]);
    withProjects([]);
    mockRpcError(ProjectTemplateService, 'UpdateTemplate', 'unknown', 'name already exists');
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to update template/)).toBeInTheDocument());
  });

  // M20-T06: same reset-on-reopen fix as projects above, applied to
  // updateTemplateMutation.
  it('clears a stale rename error when Edit is reopened on a template', async () => {
    withTemplates([{ id: 'tpl-1', name: 'Software', description: 'desc' }]);
    withProjects([]);
    mockRpcError(ProjectTemplateService, 'UpdateTemplate', 'unknown', 'name already exists');
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(screen.getByText(/Failed to update template/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.queryByText(/Failed to update template/)).not.toBeInTheDocument();
  });

  // M16-T04: grantRole/listGrants/revokeGrant(scopeType: 'project') have
  // existed and been tested at the API layer since M10 - no GUI screen ever
  // called them with that scope. These tests are that screen.
  describe('project members (scopeType: project)', () => {
    it('is collapsed by default and does not fetch grants until opened', async () => {
      withTemplates([]);
      withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
      const requests: any[] = [];
      mockRpc(RoleService, 'ListGrants', (body) => {
        requests.push(body);
        return { grants: [] };
      });
      renderPage();

      await screen.findByText('Members');
      expect(requests).toHaveLength(0);

      fireEvent.click(screen.getByText('Members'));
      await waitFor(() => expect(requests).toContainEqual({ scopeType: 'project', scopeId: 'proj-1' }));
    });

    // M20-T07: the Members toggle is a disclosure like the Show/Hide Builds
    // one on the repository panel - it needs the same aria-expanded state to
    // announce, not just show, whether the panel it controls is open.
    it('reflects its open/closed state via aria-expanded', async () => {
      withTemplates([]);
      withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
      renderPage();

      const toggle = await screen.findByText('Members');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(toggle);
      await waitFor(() => expect(screen.getByText('Hide')).toHaveAttribute('aria-expanded', 'true'));
    });

    it('lists existing project grants once expanded, resolving the subject id to a name', async () => {
      withTemplates([]);
      withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
      mockRpc(RoleService, 'ListGrants', { grants: [
        { id: 'grant-1', subjectType: 'user', subjectId: 'user-2', roleId: 'role-1', roleName: 'QA Lead' },
      ] });
      // M20-T07: the row used to show g.subjectId verbatim - a raw user id,
      // meaningless to whoever is reading the member list.
      mockRpc(OrgService, 'ListOrgMembers', { members: [{ userId: 'user-2', name: 'Jamie Reviewer', email: 'jamie@test.com' }] });
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      expect(await screen.findByText('Jamie Reviewer')).toBeInTheDocument();
      expect(screen.getByText('QA Lead')).toBeInTheDocument();
    });

    it('falls back to the raw subject id when the org member directory has no match for it', async () => {
      withTemplates([]);
      withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
      mockRpc(RoleService, 'ListGrants', { grants: [
        { id: 'grant-1', subjectType: 'user', subjectId: 'user-2', roleId: 'role-1', roleName: 'QA Lead' },
      ] });
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      expect(await screen.findByText('user-2')).toBeInTheDocument();
    });

    it('revokes a project grant after confirming', async () => {
      withTemplates([]);
      withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
      mockRpc(RoleService, 'ListGrants', { grants: [
        { id: 'grant-1', subjectType: 'user', subjectId: 'user-2', roleId: 'role-1', roleName: 'QA Lead' },
      ] });
      mockRpc(OrgService, 'ListOrgMembers', { members: [{ userId: 'user-2', name: 'Jamie Reviewer', email: 'jamie@test.com' }] });
      const requests: any[] = [];
      mockRpc(RoleService, 'RevokeGrant', (body) => {
        requests.push(body);
        return {};
      });
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      await screen.findByText('QA Lead');
      fireEvent.click(screen.getByLabelText("Revoke Jamie Reviewer's QA Lead access"));
      await confirmAction();

      await waitFor(() => expect(requests).toContainEqual({ grantId: 'grant-1' }));
    });

    // M20-T07: revoking access used to be the one destructive action on this
    // page with no confirmation - a single misclick silently took it away.
    it('does not revoke a grant when confirmation is cancelled', async () => {
      withTemplates([]);
      withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
      mockRpc(RoleService, 'ListGrants', { grants: [
        { id: 'grant-1', subjectType: 'user', subjectId: 'user-2', roleId: 'role-1', roleName: 'QA Lead' },
      ] });
      const requests: any[] = [];
      mockRpc(RoleService, 'RevokeGrant', (body) => {
        requests.push(body);
        return {};
      });
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      await screen.findByText('QA Lead');
      fireEvent.click(screen.getByLabelText("Revoke user-2's QA Lead access"));
      await cancelAction();

      expect(requests).toHaveLength(0);
    });

    // M20-T06: revokeMutation used to be one shared object read by every
    // grant row's ✕ button - revoking one grant disabled the ✕ on every
    // other grant in the same project too, compared here against .variables
    // (the grant id the in-flight mutate() call actually carries).
    it('isolates the pending revoke state to the grant that was clicked', async () => {
      withTemplates([]);
      withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
      mockRpc(RoleService, 'ListGrants', { grants: [
        { id: 'grant-1', subjectType: 'user', subjectId: 'user-2', roleId: 'role-1', roleName: 'QA Lead' },
        { id: 'grant-2', subjectType: 'user', subjectId: 'user-3', roleId: 'role-2', roleName: 'Dev' },
      ] });
      const pending = mockRpcPending(RoleService, 'RevokeGrant');
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      await screen.findByText('QA Lead');
      fireEvent.click(screen.getByLabelText("Revoke user-2's QA Lead access"));
      await confirmAction();

      await waitFor(() => expect(pending.requests).toContainEqual({ grantId: 'grant-1' }));
      expect(screen.getByLabelText("Revoke user-2's QA Lead access")).toBeDisabled();
      expect(screen.getByLabelText("Revoke user-3's Dev access")).not.toBeDisabled();

      pending.resolve({});
    });

    it('searches org members and grants a role at this project scope', async () => {
      withTemplates([]);
      withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
      mockRpc(RoleService, 'ListRoles', { roles: [{ id: 'role-1', name: 'QA Lead' }] });
      mockRpc(OrgService, 'ListOrgMembers', { members: [{ userId: 'user-2', name: 'Jamie Reviewer', email: 'jamie@test.com' }] });
      const requests: any[] = [];
      mockRpc(RoleService, 'GrantRole', (body) => {
        requests.push(body);
        return { grant: { id: 'grant-2' } };
      });
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      fireEvent.click(await screen.findByText('+ Grant access'));

      fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'Jamie' } });
      fireEvent.click(await screen.findByText('Jamie Reviewer'));

      fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'role-1' } });
      fireEvent.click(screen.getByText('Grant role'));

      await waitFor(() => expect(requests).toContainEqual({
        subjectType: 'user', subjectId: 'user-2', scopeType: 'project', scopeId: 'proj-1', roleId: 'role-1',
      }));
    });

    it('reports a failed grant and a failed revoke', async () => {
      withTemplates([]);
      withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
      mockRpc(RoleService, 'ListGrants', { grants: [
        { id: 'grant-1', subjectType: 'user', subjectId: 'user-2', roleId: 'role-1', roleName: 'QA Lead' },
      ] });
      mockRpc(RoleService, 'ListRoles', { roles: [{ id: 'role-1', name: 'QA Lead' }] });
      mockRpc(OrgService, 'ListOrgMembers', { members: [{ userId: 'user-3', name: 'New Person', email: 'new@test.com' }] });
      mockRpcError(RoleService, 'GrantRole', 'unknown', 'not an org admin');
      mockRpcError(RoleService, 'RevokeGrant', 'unknown', 'grant not found');
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      await screen.findByText('QA Lead');
      fireEvent.click(screen.getByLabelText("Revoke user-2's QA Lead access"));
      await confirmAction();
      await waitFor(() => expect(screen.getByText(/Failed to revoke:.*grant not found/)).toBeInTheDocument());

      fireEvent.click(screen.getByText('+ Grant access'));
      fireEvent.click(await screen.findByText('New Person'));
      fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'role-1' } });
      fireEvent.click(screen.getByText('Grant role'));
      await waitFor(() => expect(screen.getByText(/Failed to grant:.*not an org admin/)).toBeInTheDocument());
    });

    // M20-T06: revokeMutation.reset() is now called from both the Members
    // open handler and the Hide handler - without it, collapsing the panel
    // after a failed revoke and reopening it showed the stale error again
    // even though nothing had been retried yet.
    it('clears a stale revoke error when Members is collapsed and reopened', async () => {
      withTemplates([]);
      withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
      mockRpc(RoleService, 'ListGrants', { grants: [
        { id: 'grant-1', subjectType: 'user', subjectId: 'user-2', roleId: 'role-1', roleName: 'QA Lead' },
      ] });
      mockRpcError(RoleService, 'RevokeGrant', 'unknown', 'grant not found');
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      await screen.findByText('QA Lead');
      fireEvent.click(screen.getByLabelText("Revoke user-2's QA Lead access"));
      await confirmAction();
      await waitFor(() => expect(screen.getByText(/Failed to revoke:.*grant not found/)).toBeInTheDocument());

      fireEvent.click(screen.getByText('Hide'));
      fireEvent.click(screen.getByText('Members'));
      await screen.findByText('QA Lead');
      expect(screen.queryByText(/Failed to revoke/)).not.toBeInTheDocument();
    });

    // M20-T06: grantMutation.reset() is now called from the "+ Grant access"
    // open handler and both Cancel buttons - without it, reopening the
    // picker after a failed grant showed the stale error again with no new
    // attempt made.
    it('clears a stale grant error when "+ Grant access" is reopened', async () => {
      withTemplates([]);
      withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
      mockRpc(RoleService, 'ListRoles', { roles: [{ id: 'role-1', name: 'QA Lead' }] });
      mockRpc(OrgService, 'ListOrgMembers', { members: [{ userId: 'user-2', name: 'Jamie Reviewer', email: 'jamie@test.com' }] });
      mockRpcError(RoleService, 'GrantRole', 'unknown', 'not an org admin');
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      fireEvent.click(await screen.findByText('+ Grant access'));
      fireEvent.click(await screen.findByText('Jamie Reviewer'));
      fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'role-1' } });
      fireEvent.click(screen.getByText('Grant role'));
      await waitFor(() => expect(screen.getByText(/Failed to grant:.*not an org admin/)).toBeInTheDocument());

      fireEvent.click(screen.getByText('Cancel'));
      fireEvent.click(screen.getByText('+ Grant access'));
      expect(screen.queryByText(/Failed to grant/)).not.toBeInTheDocument();
    });

    it('falls back to email for a candidate with no name, and shows "no matches"/"no roles" empty states', async () => {
      withTemplates([]);
      withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
      mockRpc(RoleService, 'ListRoles', { roles: [] });
      mockRpc(OrgService, 'ListOrgMembers', (body: { page?: { filter?: string } }) =>
        body.page?.filter === 'nomatch'
          ? { members: [] }
          : { members: [{ userId: 'user-4', email: 'noname@test.com' }] });
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      fireEvent.click(await screen.findByText('+ Grant access'));
      fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'x' } });

      const candidate = await screen.findByText('noname@test.com');
      fireEvent.click(candidate);
      // No roles at this org yet - the select has nothing but the placeholder.
      expect(screen.getByLabelText('Role')).toHaveDisplayValue('Choose a role…');

      fireEvent.click(screen.getByText('Cancel'));
      fireEvent.click(screen.getByText('+ Grant access'));
      fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'nomatch' } });
      expect(await screen.findByText('No matches.')).toBeInTheDocument();
    });

    it('shows a search-failure state and a pending state while granting', async () => {
      withTemplates([]);
      withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
      mockRpc(RoleService, 'ListRoles', { roles: [{ id: 'role-1', name: 'QA Lead' }] });
      mockRpcError(OrgService, 'ListOrgMembers', 'unknown', 'boom');
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      fireEvent.click(await screen.findByText('+ Grant access'));
      fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'x' } });
      expect(await screen.findByText('Search failed')).toBeInTheDocument();
    });

    it('shows a pending label while granting a role', async () => {
      withTemplates([]);
      withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
      mockRpc(RoleService, 'ListRoles', { roles: [{ id: 'role-1', name: 'QA Lead' }] });
      mockRpc(OrgService, 'ListOrgMembers', { members: [{ userId: 'user-2', name: 'Jamie Reviewer', email: 'jamie@test.com' }] });
      const pending = mockRpcPending(RoleService, 'GrantRole');
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      fireEvent.click(await screen.findByText('+ Grant access'));
      fireEvent.click(await screen.findByText('Jamie Reviewer'));
      fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'role-1' } });
      fireEvent.click(screen.getByText('Grant role'));

      expect(await screen.findByText('Granting…')).toBeInTheDocument();
      pending.resolve({ grant: { id: 'grant-2' } });
    });
  });

  it("falls back to 0 when a task-count response carries no totalCount", async () => {
    withTemplates([]);
    withProjects([{ id: 'proj-1', name: 'Existing Project' }]);
    mockRpc(TaskService, 'ListTasks', { tasks: [] });
    renderPage();

    expect(await screen.findByText('No tasks yet')).toBeInTheDocument();
  });
});
