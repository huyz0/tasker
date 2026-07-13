import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockListTasks, mockUpdateTaskStatus, mockDeleteTask, mockListComments, mockListEntityLabels, mockListLabels, mockListPullRequests, mockGetTaskType } = vi.hoisted(() => ({
  mockListTasks: vi.fn(),
  mockUpdateTaskStatus: vi.fn(),
  mockDeleteTask: vi.fn(),
  mockListComments: vi.fn(),
  mockListEntityLabels: vi.fn(),
  mockListLabels: vi.fn(),
  mockListPullRequests: vi.fn(),
  mockGetTaskType: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn((service: unknown) => {
    if (service === 'CommentService') return { listComments: mockListComments, createComment: vi.fn() };
    if (service === 'LabelService') return {
      listEntityLabels: mockListEntityLabels,
      listLabels: mockListLabels,
      attachLabel: vi.fn(),
      detachLabel: vi.fn(),
      createLabel: vi.fn(),
    };
    if (service === 'RepositoryService') return { listPullRequests: mockListPullRequests };
    if (service === 'TaskTypeService') return { getTaskType: mockGetTaskType };
    return { listTasks: mockListTasks, updateTaskStatus: mockUpdateTaskStatus, deleteTask: mockDeleteTask };
  }),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  TaskService: {},
  CommentService: 'CommentService',
  LabelService: 'LabelService',
  RepositoryService: 'RepositoryService',
  TaskTypeService: 'TaskTypeService',
}));
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    activeProjectId: 'proj-1',
    activeOrgId: 'org-1',
  })),
}));

import { TasksWorkbench } from './index';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TasksWorkbench />
    </QueryClientProvider>
  );
}

describe('TasksWorkbench', () => {
  beforeEach(() => {
    mockListTasks.mockReset();
    mockUpdateTaskStatus.mockReset();
    mockDeleteTask.mockReset();
    mockListComments.mockReset();
    mockListComments.mockResolvedValue({ comments: [] });
    mockListEntityLabels.mockReset();
    mockListEntityLabels.mockResolvedValue({ labels: [] });
    mockListLabels.mockReset();
    mockListLabels.mockResolvedValue({ labels: [] });
    mockListPullRequests.mockReset();
    mockListPullRequests.mockResolvedValue({ pullRequests: [] });
    mockGetTaskType.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('updates a task status via the detail panel dropdown', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    mockUpdateTaskStatus.mockResolvedValue({ task: { id: 'task-1', title: 'Fix bug', status: 'in-progress', description: '' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    const select = await screen.findByDisplayValue('Todo');
    fireEvent.change(select, { target: { value: 'in-progress' } });

    await waitFor(() => expect(mockUpdateTaskStatus).toHaveBeenCalledWith({ taskId: 'task-1', status: 'in-progress' }));
  });

  it('shows a pull request badge on a task it is linked to, using real data not a hardcoded placeholder', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-1' }] });
    mockListPullRequests.mockResolvedValue({
      pullRequests: [{ id: 'pr-1', taskId: 'task-1', remotePrId: '42', title: 'ENG-1: fix bug', status: 'open', url: 'http://example.com/pr/42' }],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('#42')).toBeDefined());
  });

  it('shows an error message when the status update fails', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    mockUpdateTaskStatus.mockRejectedValue(new Error('not a member'));

    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    const select = await screen.findByDisplayValue('Todo');
    fireEvent.change(select, { target: { value: 'done' } });

    await waitFor(() => expect(screen.getByText(/Failed to update status/)).toBeDefined());
  });

  it('deletes a task after confirmation and closes the detail panel', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    mockDeleteTask.mockResolvedValue({ success: true });

    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    await waitFor(() => expect(mockDeleteTask).toHaveBeenCalledWith({ taskId: 'task-1' }));
    await waitFor(() => expect(screen.queryByText('Task Details')).toBeNull());
  });

  it('does not delete a task when the confirmation is dismissed', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    expect(mockDeleteTask).not.toHaveBeenCalled();
  });

  it('renders a task using a custom task-type status instead of hiding it', async () => {
    mockListTasks.mockResolvedValue({
      tasks: [{ id: 'task-1', title: 'Custom flow task', status: 'in-review', description: '', taskTypeId: 'tt-1' }],
    });
    mockGetTaskType.mockResolvedValue({
      taskType: { id: 'tt-1' },
      statuses: [{ id: 's-1', name: 'backlog' }, { id: 's-2', name: 'in-review' }, { id: 's-3', name: 'shipped' }],
      transitions: [],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Custom flow task')).toBeDefined());
    expect(screen.getByText('in-review')).toBeDefined();

    fireEvent.click(screen.getByText('Custom flow task'));
    const select = await screen.findByDisplayValue('in-review');
    expect(screen.getByRole('option', { name: 'backlog' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'shipped' })).toBeDefined();

    fireEvent.change(select, { target: { value: 'shipped' } });
    await waitFor(() => expect(mockUpdateTaskStatus).toHaveBeenCalledWith({ taskId: 'task-1', status: 'shipped' }));
  });

  it('shows an error message when task deletion fails', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    mockDeleteTask.mockRejectedValue(new Error('not an admin'));

    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    await waitFor(() => expect(screen.getByText(/Failed to delete task/)).toBeDefined());
  });
});
