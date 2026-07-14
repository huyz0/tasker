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

  it('auto-loads later pages so the Kanban board is not missing tasks past the first page', async () => {
    mockListTasks
      .mockResolvedValueOnce({ tasks: [{ id: 'task-1', title: 'Page One Task', status: 'todo', description: '' }], page: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ tasks: [{ id: 'task-2', title: 'Page Two Task', status: 'todo', description: '' }], page: {} });

    renderPage();

    await waitFor(() => expect(screen.getByText('Page One Task')).toBeDefined());
    await waitFor(() => expect(screen.getByText('Page Two Task')).toBeDefined());
    expect(mockListTasks).toHaveBeenCalledWith({ projectId: 'proj-1', page: { cursor: 'cursor-2' } });
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

  it('expands a task via keyboard Enter', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.keyDown(screen.getByText('Fix bug'), { key: 'Enter' });

    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
  });

  it('shows pending labels while deleting and while updating status', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: 'Some **markdown** body' } ] });
    let resolveDelete: (v: any) => void = () => {};
    mockDeleteTask.mockReturnValue(new Promise((resolve) => { resolveDelete = resolve; }));
    let resolveUpdate: (v: any) => void = () => {};
    mockUpdateTaskStatus.mockReturnValue(new Promise((resolve) => { resolveUpdate = resolve; }));

    renderPage();
    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    const select = await screen.findByDisplayValue('Todo');
    fireEvent.change(select, { target: { value: 'in-progress' } });
    await waitFor(() => expect(select).toBeDisabled());
    resolveUpdate({ task: { id: 'task-1', title: 'Fix bug', status: 'in-progress', description: 'Some **markdown** body' } });

    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);
    await waitFor(() => expect(screen.getByText('Moving to bin...')).toBeInTheDocument());
    resolveDelete({ success: true });
  });

  it('defaults a task with no status to the todo column, both on the board and in the detail panel', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'No status task', description: '' }] });
    mockListPullRequests.mockResolvedValue({
      pullRequests: [{ id: 'pr-1', taskId: '', remotePrId: '1', title: 'orphan pr', status: 'open', url: 'http://x' }],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('No status task')).toBeDefined());
    fireEvent.click(screen.getByText('No status task'));

    await screen.findByDisplayValue('Todo');
  });

  it('ignores non-activation keys on a task card', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.keyDown(screen.getByText('Fix bug'), { key: 'Tab' });

    expect(screen.queryByText('Task Details')).toBeNull();
  });

  it('closes the detail panel via the close button', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Close task details'));

    await waitFor(() => expect(screen.queryByText('Task Details')).toBeNull());
  });
});
