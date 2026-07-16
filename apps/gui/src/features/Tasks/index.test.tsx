import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockListTasks, mockUpdateTaskStatus, mockDeleteTask, mockUpdateTask, mockCreateTask, mockListComments, mockListEntityLabels, mockListLabels, mockListPullRequests, mockGetTaskType, mockListTaskNotes, mockUpdateTaskNote, mockDeleteTaskNote } = vi.hoisted(() => ({
  mockListTasks: vi.fn(),
  mockUpdateTaskStatus: vi.fn(),
  mockDeleteTask: vi.fn(),
  mockUpdateTask: vi.fn(),
  mockCreateTask: vi.fn(),
  mockListComments: vi.fn(),
  mockListEntityLabels: vi.fn(),
  mockListLabels: vi.fn(),
  mockListPullRequests: vi.fn(),
  mockGetTaskType: vi.fn(),
  mockListTaskNotes: vi.fn(),
  mockUpdateTaskNote: vi.fn(),
  mockDeleteTaskNote: vi.fn(),
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
    if (service === 'TaskNoteService') return { listTaskNotes: mockListTaskNotes, updateTaskNote: mockUpdateTaskNote, deleteTaskNote: mockDeleteTaskNote };
    return { listTasks: mockListTasks, updateTaskStatus: mockUpdateTaskStatus, deleteTask: mockDeleteTask, updateTask: mockUpdateTask, createTask: mockCreateTask };
  }),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  TaskService: {},
  CommentService: 'CommentService',
  LabelService: 'LabelService',
  RepositoryService: 'RepositoryService',
  TaskTypeService: 'TaskTypeService',
  TaskNoteService: 'TaskNoteService',
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
    mockUpdateTask.mockReset();
    mockCreateTask.mockReset();
    mockUpdateTaskNote.mockReset();
    mockDeleteTaskNote.mockReset();
    mockListComments.mockReset();
    mockListComments.mockResolvedValue({ comments: [] });
    mockListEntityLabels.mockReset();
    mockListEntityLabels.mockResolvedValue({ labels: [] });
    mockListLabels.mockReset();
    mockListLabels.mockResolvedValue({ labels: [] });
    mockListPullRequests.mockReset();
    mockListPullRequests.mockResolvedValue({ pullRequests: [] });
    mockListTaskNotes.mockReset();
    mockListTaskNotes.mockResolvedValue({ taskNotes: [] });
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

  it('edits a task title and description through the GUI', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: 'Old desc' }] });
    mockUpdateTask.mockResolvedValue({ task: { id: 'task-1', title: 'Fix the bug', status: 'todo', description: 'New desc' } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));

    const titleInput = screen.getByDisplayValue('Fix bug');
    fireEvent.change(titleInput, { target: { value: 'Fix the bug' } });
    fireEvent.change(screen.getByDisplayValue('Old desc'), { target: { value: 'New desc' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith({ taskId: 'task-1', title: 'Fix the bug', description: 'New desc' }));
  });

  it('cancels editing a task without saving', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));
    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByDisplayValue('Fix bug')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getAllByText('Fix bug').length).toBeGreaterThan(0);
    expect(mockUpdateTask).not.toHaveBeenCalled();
  });

  it('shows an error message when updating a task fails', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    mockUpdateTask.mockRejectedValue(new Error('task not found'));
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));
    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to update task/)).toBeInTheDocument());
  });

  it('resets edit mode when a different task is expanded', async () => {
    mockListTasks.mockResolvedValue({ tasks: [
      { id: 'task-1', title: 'Fix bug', status: 'todo', description: '' },
      { id: 'task-2', title: 'Write docs', status: 'todo', description: '' },
    ] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));
    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByDisplayValue('Fix bug')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Write docs'));
    await waitFor(() => expect(screen.queryByDisplayValue('Fix bug')).toBeNull());
  });

  it('shows agent notes for a task and edits one', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    mockListTaskNotes.mockResolvedValue({ taskNotes: [{ id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Investigated root cause' }] });
    mockUpdateTaskNote.mockResolvedValue({ taskNote: { id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Updated finding' } });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Investigated root cause')).toBeInTheDocument());
    const noteCard = screen.getByText('Investigated root cause').closest('.p-3')! as HTMLElement;
    fireEvent.click(within(noteCard).getByText('Edit'));

    const noteInput = screen.getByDisplayValue('Investigated root cause');
    fireEvent.change(noteInput, { target: { value: 'Updated finding' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(mockUpdateTaskNote).toHaveBeenCalledWith({ taskNoteId: 'note-1', content: 'Updated finding' }));
  });

  it('deletes an agent note after confirmation', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    mockListTaskNotes.mockResolvedValue({ taskNotes: [{ id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Investigated root cause' }] });
    mockDeleteTaskNote.mockResolvedValue({ success: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Investigated root cause')).toBeInTheDocument());
    const noteCard = screen.getByText('Investigated root cause').closest('.p-3')! as HTMLElement;
    fireEvent.click(within(noteCard).getByText('Delete'));

    await waitFor(() => expect(mockDeleteTaskNote).toHaveBeenCalledWith({ taskNoteId: 'note-1' }));
  });

  it('shows "No agent notes yet." when a task has no notes', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('No agent notes yet.')).toBeInTheDocument());
  });

  it('shows an error message when updating an agent note fails', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    mockListTaskNotes.mockResolvedValue({ taskNotes: [{ id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Investigated root cause' }] });
    mockUpdateTaskNote.mockRejectedValue(new Error('note not found'));
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Investigated root cause')).toBeInTheDocument());
    const noteCard = screen.getByText('Investigated root cause').closest('.p-3')! as HTMLElement;
    fireEvent.click(within(noteCard).getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to update note/)).toBeInTheDocument());
  });

  it('cancels editing an agent note without saving', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    mockListTaskNotes.mockResolvedValue({ taskNotes: [{ id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Investigated root cause' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Investigated root cause')).toBeInTheDocument());
    const noteCard = screen.getByText('Investigated root cause').closest('.p-3')! as HTMLElement;
    fireEvent.click(within(noteCard).getByText('Edit'));
    expect(screen.getByDisplayValue('Investigated root cause')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Investigated root cause')).toBeInTheDocument();
    expect(mockUpdateTaskNote).not.toHaveBeenCalled();
  });

  it('shows an error message when deleting an agent note fails', async () => {
    mockListTasks.mockResolvedValue({ tasks: [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] });
    mockListTaskNotes.mockResolvedValue({ taskNotes: [{ id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Investigated root cause' }] });
    mockDeleteTaskNote.mockRejectedValue(new Error('note not found'));
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Investigated root cause')).toBeInTheDocument());
    const noteCard = screen.getByText('Investigated root cause').closest('.p-3')! as HTMLElement;
    fireEvent.click(within(noteCard).getByText('Delete'));

    await waitFor(() => expect(screen.getByText(/Failed to delete note/)).toBeInTheDocument());
  });

  it('creates a task via the column\'s bottom Add button', async () => {
    mockListTasks.mockResolvedValue({ tasks: [] });
    mockCreateTask.mockResolvedValue({ task: { id: 'task-new', title: 'New task', status: 'todo', description: '' } });
    renderPage();

    await waitFor(() => expect(screen.getAllByLabelText('Add task to Todo')[0]).toBeDefined());
    const addButtons = screen.getAllByLabelText('Add task to Todo');
    fireEvent.click(addButtons[addButtons.length - 1]);

    const input = screen.getByPlaceholderText('Task title');
    fireEvent.change(input, { target: { value: 'New task' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(mockCreateTask).toHaveBeenCalledWith({ projectId: 'proj-1', title: 'New task', status: 'todo' }));
  });

  it('cancels the inline task-create form on blur when empty', async () => {
    mockListTasks.mockResolvedValue({ tasks: [] });
    renderPage();

    await waitFor(() => expect(screen.getAllByLabelText('Add task to Todo')[0]).toBeDefined());
    const addButtons = screen.getAllByLabelText('Add task to Todo');
    fireEvent.click(addButtons[addButtons.length - 1]);

    const input = screen.getByPlaceholderText('Task title');
    expect(input).toBeInTheDocument();
    fireEvent.blur(input);
    expect(screen.queryByPlaceholderText('Task title')).toBeNull();
  });

  it('shows an error message when creating a task fails', async () => {
    mockListTasks.mockResolvedValue({ tasks: [] });
    mockCreateTask.mockRejectedValue(new Error('title is required'));
    renderPage();

    await waitFor(() => expect(screen.getAllByLabelText('Add task to Todo')[0]).toBeDefined());
    const addButtons = screen.getAllByLabelText('Add task to Todo');
    fireEvent.click(addButtons[addButtons.length - 1]);

    const input = screen.getByPlaceholderText('Task title');
    fireEvent.change(input, { target: { value: 'New task' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(screen.getByText(/Failed to create task/)).toBeInTheDocument());
  });
});
