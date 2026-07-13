import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockListTemplates, mockListProjects, mockCreateProject, mockCreateTemplate, mockListTaskTypes, mockCreateTaskType, mockArchiveProject } = vi.hoisted(() => ({
  mockListTemplates: vi.fn(),
  mockListProjects: vi.fn(),
  mockCreateProject: vi.fn(),
  mockCreateTemplate: vi.fn(),
  mockListTaskTypes: vi.fn(),
  mockCreateTaskType: vi.fn(),
  mockArchiveProject: vi.fn(),
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
    createTaskType: mockCreateTaskType,
    archiveProject: mockArchiveProject,
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
vi.mock('../../hooks/useAuthSession', () => ({
  useAuthSession: () => ({ isLoading: false, authenticated: true, userId: mockUserId }),
}));
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    activeOrgId: 'org-1',
  })),
}));

import { ProjectsWizard } from './index';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ProjectsWizard />
    </QueryClientProvider>
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
    mockCreateTaskType.mockReset();
    mockArchiveProject.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
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

  it('lists and creates task types via real API calls', async () => {
    mockListTemplates.mockResolvedValue({ templates: [] });
    mockListProjects.mockResolvedValue({ projects: [] });
    mockListTaskTypes.mockResolvedValue({ taskTypes: [{ id: 'tt-1', name: 'Bug' }] });
    mockCreateTaskType.mockResolvedValue({ taskType: { id: 'tt-new', name: 'Epic' } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Bug')).toBeDefined());

    fireEvent.click(screen.getByText('+ New Task Type'));
    fireEvent.change(screen.getByPlaceholderText('Task type name (e.g. Bug, Epic)'), { target: { value: 'Epic' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(mockCreateTaskType).toHaveBeenCalledWith({ orgId: 'org-1', name: 'Epic' }));
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
});
