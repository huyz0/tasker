import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const { mockListTemplates, mockListProjects, mockCreateProject, mockCreateTemplate, mockListTaskTypes, mockArchiveProject, mockUpdateProject, mockUpdateTemplate } = vi.hoisted(() => ({
  mockListTemplates: vi.fn(),
  mockListProjects: vi.fn(),
  mockCreateProject: vi.fn(),
  mockCreateTemplate: vi.fn(),
  mockListTaskTypes: vi.fn(),
  mockArchiveProject: vi.fn(),
  mockUpdateProject: vi.fn(),
  mockUpdateTemplate: vi.fn(),
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
    listTaskTypes: mockListTaskTypes,
    archiveProject: mockArchiveProject,
    updateProject: mockUpdateProject,
    updateTemplate: mockUpdateTemplate,
  })),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  ProjectService: {},
  ProjectTemplateService: {},
  TaskTypeService: {},
}));
vi.mock('../../components/ui/repositories/RepositoryIntegrationConfig', () => ({
  RepositoryIntegrationConfig: () => null,
}));

const mockUserId = 'user-authed-1';
let mockAuthUserId: string | null = mockUserId;
vi.mock('../../hooks/useAuthSession', () => ({
  useAuthSession: () => ({ isLoading: false, authenticated: !!mockAuthUserId, get userId() { return mockAuthUserId; } }),
}));
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    activeOrgId: 'org-1',
  })),
}));

import { ProjectsWizard } from './index';
import { confirmAction, cancelAction } from '../../test/confirm';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ProjectsWizard />
      </QueryClientProvider>
    </MemoryRouter>
  );
  return { ...utils, queryClient };
}

describe('ProjectsWizard', () => {
  beforeEach(() => {
    mockListTemplates.mockReset();
    mockListProjects.mockReset();
    mockCreateProject.mockReset();
    mockCreateTemplate.mockReset();
    mockListTaskTypes.mockReset();
    mockListTaskTypes.mockResolvedValue({ taskTypes: [] });
    mockArchiveProject.mockReset();
    mockUpdateProject.mockReset();
    mockUpdateTemplate.mockReset();
    mockAuthUserId = mockUserId;
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

  it('invalidates the Bin page query key after archiving a project, so the Bin view refreshes', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [{ id: 'proj-1', name: 'Existing Project' }] });
    mockArchiveProject.mockResolvedValue({});

    const { queryClient } = renderPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(screen.getByText('Existing Project')).toBeDefined());
    fireEvent.click(screen.getByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(mockArchiveProject).toHaveBeenCalledWith({ projectId: 'proj-1' }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 'bin', 'org-1'] });
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
  it('lists task types read-only and links to the Task Types page to manage them', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [] });
    mockListTaskTypes.mockResolvedValue({ taskTypes: [{ id: 'tt-1', name: 'Bug' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Bug')).toBeDefined());
    expect(screen.queryByText('Edit')).toBeNull();

    const manageLink = screen.getByRole('link', { name: 'Manage task types →' });
    expect(manageLink).toHaveAttribute('href', '/task-types');
  });

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

  it('shows empty-state messages for templates, task types, and projects', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('No templates yet.')).toBeDefined());
    expect(screen.getByText('No task types yet.')).toBeDefined();
    expect(screen.getByText('No projects yet.')).toBeDefined();
  });

  it('retries fetching templates, task types, and projects after a failure', async () => {
    mockListTemplates.mockRejectedValue(new Error('boom'));
    mockListTaskTypes.mockRejectedValue(new Error('boom'));
    mockListProjects.mockRejectedValue(new Error('boom'));
    renderPage();

    const tryAgainButtons = await screen.findAllByText('Try again');
    expect(tryAgainButtons).toHaveLength(3);

    mockListTemplates.mockClear();
    mockListTaskTypes.mockClear();
    mockListProjects.mockClear();
    tryAgainButtons.forEach((btn) => fireEvent.click(btn));

    await waitFor(() => {
      expect(mockListTemplates).toHaveBeenCalled();
      expect(mockListTaskTypes).toHaveBeenCalled();
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

    await waitFor(() => expect(mockUpdateProject).toHaveBeenCalledWith({ projectId: 'proj-1', name: 'Renamed Project' }));
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

});
