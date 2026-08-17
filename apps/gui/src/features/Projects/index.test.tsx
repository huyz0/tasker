import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const {
  mockListTemplates, mockListProjects, mockCreateProject, mockCreateTemplate, mockArchiveProject, mockUpdateProject,
  mockUpdateTemplate, mockListTasks, mockListRoles, mockListGrants, mockGrantRole, mockRevokeGrant, mockListOrgMembers,
} = vi.hoisted(() => ({
  mockListTemplates: vi.fn(),
  mockListProjects: vi.fn(),
  mockCreateProject: vi.fn(),
  mockCreateTemplate: vi.fn(),
  mockArchiveProject: vi.fn(),
  mockUpdateProject: vi.fn(),
  mockUpdateTemplate: vi.fn(),
  mockListTasks: vi.fn(),
  mockListRoles: vi.fn(),
  mockListGrants: vi.fn(),
  mockGrantRole: vi.fn(),
  mockRevokeGrant: vi.fn(),
  mockListOrgMembers: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({
    listTemplates: mockListTemplates,
    listProjects: mockListProjects,
    createProject: mockCreateProject,
    createTemplate: mockCreateTemplate,
    archiveProject: mockArchiveProject,
    updateProject: mockUpdateProject,
    updateTemplate: mockUpdateTemplate,
    listTasks: mockListTasks,
    listRoles: mockListRoles,
    listGrants: mockListGrants,
    grantRole: mockGrantRole,
    revokeGrant: mockRevokeGrant,
    listOrgMembers: mockListOrgMembers,
  })),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  ProjectService: {},
  ProjectTemplateService: {},
  TaskService: {},
  RoleService: {},
  OrgService: {},
}));
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

describe('ProjectsWizard', () => {
  beforeEach(() => {
    mockListTemplates.mockReset();
    mockListProjects.mockReset();
    mockCreateProject.mockReset();
    mockCreateTemplate.mockReset();
    mockArchiveProject.mockReset();
    mockUpdateProject.mockReset();
    mockUpdateTemplate.mockReset();
    mockListTasks.mockReset();
    mockListTasks.mockResolvedValue({ tasks: [], page: { totalCount: 0 } });
    mockListRoles.mockReset();
    mockListRoles.mockResolvedValue({ roles: [] });
    mockListGrants.mockReset();
    mockListGrants.mockResolvedValue({ grants: [] });
    mockGrantRole.mockReset();
    mockRevokeGrant.mockReset();
    mockListOrgMembers.mockReset();
    mockListOrgMembers.mockResolvedValue({ members: [] });
    mockAuthUserId = mockUserId;
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = '';
    mockSetActiveProjectId.mockClear();
  });

  it('disables project creation until a name is entered', async () => {
    mockListTemplates.mockResolvedValue({ templates: [{ id: 'tpl-1', name: 'Software', description: 'desc' }] });
    mockListProjects.mockResolvedValue({ projects: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    const useTemplateButton = screen.getByRole('button', { name: 'Use Template' });
    expect(useTemplateButton).toHaveProperty('disabled', true);
  });

  it('creates a project with the user-entered name and the authenticated user as owner', async () => {
    mockListTemplates.mockResolvedValue({ templates: [{ id: 'tpl-1', name: 'Software', description: 'desc' }] });
    mockListProjects.mockResolvedValue({ projects: [] });
    mockCreateProject.mockResolvedValue({ project: { id: 'proj-new', name: 'My Real Project' } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('New project name'), { target: { value: 'My Real Project' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use Template' }));

    await waitFor(() => expect(mockCreateProject).toHaveBeenCalledWith({
      orgId: 'org-1',
      templateId: 'tpl-1',
      name: 'My Real Project',
      ownerId: mockUserId,
      description: '',
    }));
  });

  it('shows an error message when project creation fails', async () => {
    mockListTemplates.mockResolvedValue({ templates: [{ id: 'tpl-1', name: 'Software', description: 'desc' }] });
    mockListProjects.mockResolvedValue({ projects: [] });
    mockCreateProject.mockRejectedValue(new Error('template not found'));
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('New project name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use Template' }));

    await waitFor(() => expect(screen.getByText(/Failed to create project/)).toBeDefined());
  });

  it('renders existing projects', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
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
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
    mockArchiveProject.mockResolvedValue({});

    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(mockArchiveProject).toHaveBeenCalledWith({ projectId: 'proj-1' }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] });
  });

  // M20-T05: archiving the currently-active project used to leave
  // activeProjectId pointing at it forever - Tasks/Artifacts/Dashboard all
  // kept querying an archived project, and the switcher's own auto-select
  // fallback never fires while the id is still non-empty.
  it('clears activeProjectId when the archived project is the active one', async () => {
    mockActiveProjectId = 'proj-1';
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Active Project' }] });
    mockArchiveProject.mockResolvedValue({});
    renderPage();

    await waitFor(() => expect(screen.getByText('Active Project')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(mockArchiveProject).toHaveBeenCalledWith({ projectId: 'proj-1' }));
    expect(mockSetActiveProjectId).toHaveBeenCalledWith('');
  });

  it('leaves activeProjectId untouched when archiving a different project', async () => {
    mockActiveProjectId = 'proj-active';
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-other', name: 'Other Project' }] });
    mockArchiveProject.mockResolvedValue({});
    renderPage();

    await waitFor(() => expect(screen.getByText('Other Project')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(mockArchiveProject).toHaveBeenCalledWith({ projectId: 'proj-other' }));
    expect(mockSetActiveProjectId).not.toHaveBeenCalled();
  });

  // M20-T05: none of the page-level drafts reset on an org switch before
  // this - a project name typed for org A survived into org B.
  it('resets the new-project draft and open edit/create forms when the active org changes', async () => {
    mockListTemplates.mockResolvedValue({ templates: [{ id: 'tpl-1', name: 'Software', description: 'desc' }] });
    mockListProjects.mockResolvedValue({ projects: [] });
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
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [] });
    mockCreateTemplate.mockResolvedValue({ template: { id: 'tpl-new', name: 'New Template' } });
    renderPage();

    await waitFor(() => expect(screen.getByText('+ New Template')).toBeDefined());
    fireEvent.click(screen.getByText('+ New Template'));

    fireEvent.change(screen.getByPlaceholderText('Template name'), { target: { value: 'New Template' } });
    fireEvent.change(screen.getByPlaceholderText('Description (optional)'), { target: { value: 'A description' } });
    fireEvent.click(screen.getByText('Create Template'));

    await waitFor(() => expect(mockCreateTemplate).toHaveBeenCalledWith({
      orgId: 'org-1',
      name: 'New Template',
      description: 'A description',
    }));
  });

  // M14-T09: this screen used to create and rename task types itself, with
  // no view of the statuses/transitions the rename affects. It is now a
  // read-only glance, linking to /task-types for anything that changes one.
  it('loads the next page of projects when Load More is clicked', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects
      .mockResolvedValueOnce({ projects: [{ id: 'proj-1', name: 'Page One Project' }], page: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ projects: [{ id: 'proj-2', name: 'Page Two Project' }], page: {} });
    renderPage();

    await waitFor(() => expect(screen.getByText('Page One Project')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Load More' }));

    await waitFor(() => expect(screen.getByText('Page Two Project')).toBeDefined());
    expect(mockListProjects).toHaveBeenCalledWith({ orgId: 'org-1', page: { cursor: 'cursor-2' } });
    await waitFor(() => expect(screen.getByText('No more items to load')).toBeDefined());
  });

  it('shows empty-state messages for templates and projects', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('No templates yet.')).toBeDefined());
    expect(screen.getByText('No projects yet.')).toBeDefined();
  });

  it('retries fetching templates and projects after a failure', async () => {
    mockListTemplates.mockRejectedValue(new Error('boom'));
    mockListProjects.mockRejectedValue(new Error('boom'));
    renderPage();

    const tryAgainButtons = await screen.findAllByText('Try again');
    expect(tryAgainButtons).toHaveLength(2);

    mockListTemplates.mockClear();
    mockListProjects.mockClear();
    tryAgainButtons.forEach((btn) => fireEvent.click(btn));

    await waitFor(() => {
      expect(mockListTemplates).toHaveBeenCalled();
      expect(mockListProjects).toHaveBeenCalled();
    });
  });

  it('shows an error message when template creation fails', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [] });
    mockCreateTemplate.mockRejectedValue(new Error('name already exists'));
    renderPage();

    await waitFor(() => expect(screen.getByText('+ New Template')).toBeDefined());
    fireEvent.click(screen.getByText('+ New Template'));
    fireEvent.change(screen.getByPlaceholderText('Template name'), { target: { value: 'Dup' } });
    fireEvent.click(screen.getByText('Create Template'));

    await waitFor(() => expect(screen.getByText(/Failed to create template/)).toBeDefined());
  });

  it('does not archive a project when confirmation is cancelled', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));
    await cancelAction();

    expect(mockArchiveProject).not.toHaveBeenCalled();
  });

  it('shows an error message when project deletion fails', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
    mockArchiveProject.mockRejectedValue(new Error('has active tasks'));
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(screen.getByText(/Failed to delete project/)).toBeDefined());
  });

  it('shows an error when creating a project with no authenticated user', async () => {
    mockAuthUserId = null;
    mockListTemplates.mockResolvedValue({ templates: [{ id: 'tpl-1', name: 'Software', description: 'desc' }] });
    mockListProjects.mockResolvedValue({ projects: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('New project name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use Template' }));

    await waitFor(() => expect(screen.getByText(/Failed to create project/)).toBeDefined());
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('does not submit a blank template form', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('+ New Template')).toBeDefined());
    fireEvent.click(screen.getByText('+ New Template'));
    fireEvent.submit(screen.getByPlaceholderText('Template name').closest('form')!);
    expect(mockCreateTemplate).not.toHaveBeenCalled();
  });

  it('shows pending labels while creating a project and a template', async () => {
    mockListTemplates.mockResolvedValue({ templates: [{ id: 'tpl-1', name: 'Software', description: 'desc' }] });
    mockListProjects.mockResolvedValue({ projects: [] });
    let resolveProject: (v: any) => void = () => {};
    mockCreateProject.mockReturnValue(new Promise((resolve) => { resolveProject = resolve; }));
    let resolveTemplate: (v: any) => void = () => {};
    mockCreateTemplate.mockReturnValue(new Promise((resolve) => { resolveTemplate = resolve; }));

    renderPage();
    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText('New project name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use Template' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Creating...' })).toBeInTheDocument());
    resolveProject({ project: { id: 'proj-new', name: 'X' } });

    fireEvent.click(screen.getByText('+ New Template'));
    fireEvent.change(screen.getByPlaceholderText('Template name'), { target: { value: 'Tmpl' } });
    fireEvent.click(screen.getByText('Create Template'));
    await waitFor(() => expect(screen.getByText('Creating...')).toBeInTheDocument());
    resolveTemplate({ template: { id: 'tpl-new', name: 'Tmpl' } });
  });

  it('toggles the new-template form closed via Cancel', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('+ New Template')).toBeDefined());
    fireEvent.click(screen.getByText('+ New Template'));
    expect(screen.getByPlaceholderText('Template name')).toBeDefined();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('Template name')).toBeNull();
  });

  it('renames a project through the GUI', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
    mockUpdateProject.mockResolvedValue({ project: { id: 'proj-1', name: 'Renamed Project' } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));

    const nameInput = screen.getByDisplayValue('Existing Project');
    fireEvent.change(nameInput, { target: { value: 'Renamed Project' } });
    fireEvent.click(screen.getByText('Save'));

    // description is always sent, even untouched - empty here since the
    // fixture project had none, same as how Tasks always sends description.
    await waitFor(() => expect(mockUpdateProject).toHaveBeenCalledWith({ projectId: 'proj-1', name: 'Renamed Project', description: '' }));
  });

  // M16-T02: no description field existed on a project at all before this.
  it('shows, edits, and clears a project description through the GUI', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project', description: 'Ships the thing' }] });
    mockUpdateProject.mockResolvedValue({ project: { id: 'proj-1', name: 'Existing Project', description: 'New description' } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Ships the thing')).toBeDefined());

    fireEvent.click(screen.getByText('Edit'));
    const descriptionInput = screen.getByDisplayValue('Ships the thing');
    fireEvent.change(descriptionInput, { target: { value: 'New description' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(mockUpdateProject).toHaveBeenCalledWith({
      projectId: 'proj-1', name: 'Existing Project', description: 'New description',
    }));
  });

  it('shows a fallback when a project has no description', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
    renderPage();

    expect(await screen.findByText('No description.')).toBeInTheDocument();
  });

  // M16-T03: no task count, or any project-level signal at all, existed on
  // this list before this - "% done" isn't attempted (no universal
  // terminal status across custom task types), just a plain count.
  it("shows each project's task count, read the same way a board column reads its own", async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
    mockListTasks.mockResolvedValue({ tasks: [], page: { totalCount: 47 } });
    renderPage();

    expect(await screen.findByText('47 tasks')).toBeInTheDocument();
    expect(mockListTasks).toHaveBeenCalledWith({ projectId: 'proj-1', page: { limit: 1 } });
  });

  it('says so when a project has no tasks yet, and singularizes exactly one', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [
      { id: 'proj-1', name: 'Empty Project' },
      { id: 'proj-2', name: 'One Task Project' },
    ] });
    mockListTasks.mockImplementation(async ({ projectId }: any) => ({
      tasks: [], page: { totalCount: projectId === 'proj-1' ? 0 : 1 },
    }));
    renderPage();

    expect(await screen.findByText('No tasks yet')).toBeInTheDocument();
    expect(await screen.findByText('1 task')).toBeInTheDocument();
  });

  it('shows a loading state, then reports when the task count fails to load', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
    let rejectCount: (e: Error) => void = () => {};
    mockListTasks.mockReturnValue(new Promise((_resolve, reject) => { rejectCount = reject; }));
    renderPage();

    expect(await screen.findByText('Loading tasks…')).toBeInTheDocument();
    rejectCount(new Error('boom'));
    expect(await screen.findByText('Task count unavailable')).toBeInTheDocument();
  });

  it('sends a description typed into the new-project field', async () => {
    mockListTemplates.mockResolvedValue({ templates: [{ id: 'tpl-1', name: 'Software', description: 'desc' }] });
    mockListProjects.mockResolvedValue({ projects: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('New project name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText('What is this project for? (optional)'), { target: { value: 'A real description' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use Template' }));

    await waitFor(() => expect(mockCreateProject).toHaveBeenCalledWith(expect.objectContaining({ description: 'A real description' })));
  });

  it('cancels editing a project without saving', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByDisplayValue('Existing Project')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Existing Project')).toBeInTheDocument();
    expect(mockUpdateProject).not.toHaveBeenCalled();
  });

  it('shows an error message when renaming a project fails', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
    mockUpdateProject.mockRejectedValue(new Error('not a member'));
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to update project/)).toBeInTheDocument());
  });

  it('does not submit a blank project rename', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    const nameInput = screen.getByDisplayValue('Existing Project');
    fireEvent.change(nameInput, { target: { value: '  ' } });
    fireEvent.submit(nameInput.closest('form')!);

    expect(mockUpdateProject).not.toHaveBeenCalled();
  });

  it('shows a pending label while renaming a project', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
    let resolveUpdate: (v: any) => void = () => {};
    mockUpdateProject.mockReturnValue(new Promise((resolve) => { resolveUpdate = resolve; }));
    renderPage();

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText('Saving...')).toBeInTheDocument());
    resolveUpdate({ project: { id: 'proj-1', name: 'Existing Project' } });
  });

  it('edits a template through the GUI', async () => {
    mockListTemplates.mockResolvedValue({ templates: [{ id: 'tpl-1', name: 'Software', description: 'desc' }] });
    mockListProjects.mockResolvedValue({ projects: [] });
    mockUpdateTemplate.mockResolvedValue({ template: { id: 'tpl-1', name: 'Software Renamed', description: 'new desc' } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));

    fireEvent.change(screen.getByDisplayValue('Software'), { target: { value: 'Software Renamed' } });
    fireEvent.change(screen.getByDisplayValue('desc'), { target: { value: 'new desc' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(mockUpdateTemplate).toHaveBeenCalledWith({ id: 'tpl-1', name: 'Software Renamed', description: 'new desc' }));
  });

  it('does not submit a blank template rename', async () => {
    mockListTemplates.mockResolvedValue({ templates: [{ id: 'tpl-1', name: 'Software', description: 'desc' }] });
    mockListProjects.mockResolvedValue({ projects: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    const nameInput = screen.getByDisplayValue('Software');
    fireEvent.change(nameInput, { target: { value: '  ' } });
    fireEvent.submit(nameInput.closest('form')!);

    expect(mockUpdateTemplate).not.toHaveBeenCalled();
  });

  it('shows a pending label while renaming a template', async () => {
    mockListTemplates.mockResolvedValue({ templates: [{ id: 'tpl-1', name: 'Software', description: 'desc' }] });
    mockListProjects.mockResolvedValue({ projects: [] });
    let resolveUpdate: (v: any) => void = () => {};
    mockUpdateTemplate.mockReturnValue(new Promise((resolve) => { resolveUpdate = resolve; }));
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText('Saving...')).toBeInTheDocument());
    resolveUpdate({ template: { id: 'tpl-1', name: 'Software', description: 'desc' } });
  });

  it('cancels editing a template without saving', async () => {
    mockListTemplates.mockResolvedValue({ templates: [{ id: 'tpl-1', name: 'Software', description: 'desc' }] });
    mockListProjects.mockResolvedValue({ projects: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByDisplayValue('Software')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Software')).toBeInTheDocument();
    expect(mockUpdateTemplate).not.toHaveBeenCalled();
  });

  it('shows an error message when updating a template fails', async () => {
    mockListTemplates.mockResolvedValue({ templates: [{ id: 'tpl-1', name: 'Software', description: 'desc' }] });
    mockListProjects.mockResolvedValue({ projects: [] });
    mockUpdateTemplate.mockRejectedValue(new Error('name already exists'));
    renderPage();

    await waitFor(() => expect(screen.getByText('Software')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to update template/)).toBeInTheDocument());
  });

  // M16-T04: grantRole/listGrants/revokeGrant(scopeType: 'project') have
  // existed and been tested at the API layer since M10 - no GUI screen ever
  // called them with that scope. These tests are that screen.
  describe('project members (scopeType: project)', () => {
    it('is collapsed by default and does not fetch grants until opened', async () => {
      mockListTemplates.mockResolvedValue({ templates: [] });
      mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
      renderPage();

      await screen.findByText('Members');
      expect(mockListGrants).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText('Members'));
      await waitFor(() => expect(mockListGrants).toHaveBeenCalledWith({ scopeType: 'project', scopeId: 'proj-1' }));
    });

    it('lists existing project grants once expanded', async () => {
      mockListTemplates.mockResolvedValue({ templates: [] });
      mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
      mockListGrants.mockResolvedValue({ grants: [
        { id: 'grant-1', subjectType: 'user', subjectId: 'user-2', roleId: 'role-1', roleName: 'QA Lead' },
      ] });
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      expect(await screen.findByText('QA Lead')).toBeInTheDocument();
    });

    it('revokes a project grant', async () => {
      mockListTemplates.mockResolvedValue({ templates: [] });
      mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
      mockListGrants.mockResolvedValue({ grants: [
        { id: 'grant-1', subjectType: 'user', subjectId: 'user-2', roleId: 'role-1', roleName: 'QA Lead' },
      ] });
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      await screen.findByText('QA Lead');
      fireEvent.click(screen.getByLabelText('Revoke QA Lead from this project'));

      await waitFor(() => expect(mockRevokeGrant).toHaveBeenCalledWith({ grantId: 'grant-1' }));
    });

    it('searches org members and grants a role at this project scope', async () => {
      mockListTemplates.mockResolvedValue({ templates: [] });
      mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
      mockListRoles.mockResolvedValue({ roles: [{ id: 'role-1', name: 'QA Lead' }] });
      mockListOrgMembers.mockResolvedValue({ members: [{ userId: 'user-2', name: 'Jamie Reviewer', email: 'jamie@test.com' }] });
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      fireEvent.click(await screen.findByText('+ Grant access'));

      fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'Jamie' } });
      fireEvent.click(await screen.findByText('Jamie Reviewer'));

      fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'role-1' } });
      fireEvent.click(screen.getByText('Grant role'));

      await waitFor(() => expect(mockGrantRole).toHaveBeenCalledWith({
        subjectType: 'user', subjectId: 'user-2', scopeType: 'project', scopeId: 'proj-1', roleId: 'role-1',
      }));
    });

    it('reports a failed grant and a failed revoke', async () => {
      mockListTemplates.mockResolvedValue({ templates: [] });
      mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
      mockListGrants.mockResolvedValue({ grants: [
        { id: 'grant-1', subjectType: 'user', subjectId: 'user-2', roleId: 'role-1', roleName: 'QA Lead' },
      ] });
      mockListRoles.mockResolvedValue({ roles: [{ id: 'role-1', name: 'QA Lead' }] });
      mockListOrgMembers.mockResolvedValue({ members: [{ userId: 'user-3', name: 'New Person', email: 'new@test.com' }] });
      mockGrantRole.mockRejectedValue(new Error('not an org admin'));
      mockRevokeGrant.mockRejectedValue(new Error('grant not found'));
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      await screen.findByText('QA Lead');
      fireEvent.click(screen.getByLabelText('Revoke QA Lead from this project'));
      await waitFor(() => expect(screen.getByText(/Failed to revoke: grant not found/)).toBeInTheDocument());

      fireEvent.click(screen.getByText('+ Grant access'));
      fireEvent.click(await screen.findByText('New Person'));
      fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'role-1' } });
      fireEvent.click(screen.getByText('Grant role'));
      await waitFor(() => expect(screen.getByText(/Failed to grant: not an org admin/)).toBeInTheDocument());
    });

    it('falls back to email for a candidate with no name, and shows "no matches"/"no roles" empty states', async () => {
      mockListTemplates.mockResolvedValue({ templates: [] });
      mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
      mockListRoles.mockResolvedValue({ roles: [] });
      mockListOrgMembers.mockImplementation(async ({ page }: any) =>
        page?.filter === 'nomatch'
          ? { members: [] }
          : { members: [{ userId: 'user-4', name: '', email: 'noname@test.com' }] });
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
      mockListTemplates.mockResolvedValue({ templates: [] });
      mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
      mockListRoles.mockResolvedValue({ roles: [{ id: 'role-1', name: 'QA Lead' }] });
      mockListOrgMembers.mockRejectedValue(new Error('boom'));
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      fireEvent.click(await screen.findByText('+ Grant access'));
      fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'x' } });
      expect(await screen.findByText('Search failed')).toBeInTheDocument();
    });

    it('shows a pending label while granting a role', async () => {
      mockListTemplates.mockResolvedValue({ templates: [] });
      mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
      mockListRoles.mockResolvedValue({ roles: [{ id: 'role-1', name: 'QA Lead' }] });
      mockListOrgMembers.mockResolvedValue({ members: [{ userId: 'user-2', name: 'Jamie Reviewer', email: 'jamie@test.com' }] });
      let resolveGrant: (v: any) => void = () => {};
      mockGrantRole.mockReturnValue(new Promise((resolve) => { resolveGrant = resolve; }));
      renderPage();

      fireEvent.click(await screen.findByText('Members'));
      fireEvent.click(await screen.findByText('+ Grant access'));
      fireEvent.click(await screen.findByText('Jamie Reviewer'));
      fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'role-1' } });
      fireEvent.click(screen.getByText('Grant role'));

      expect(await screen.findByText('Granting…')).toBeInTheDocument();
      resolveGrant({ grant: { id: 'grant-2' } });
    });
  });

  it("falls back to 0 when a task-count response carries no totalCount", async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
    mockListTasks.mockResolvedValue({ tasks: [] });
    renderPage();

    expect(await screen.findByText('No tasks yet')).toBeInTheDocument();
  });
});
