import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockListTasks, mockUpdateTaskStatus, mockListComments } = vi.hoisted(() => ({
  mockListTasks: vi.fn(),
  mockUpdateTaskStatus: vi.fn(),
  mockListComments: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn((service: unknown) => {
    if (service === 'CommentService') return { listComments: mockListComments, createComment: vi.fn() };
    return { listTasks: mockListTasks, updateTaskStatus: mockUpdateTaskStatus };
  }),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  TaskService: {},
  CommentService: 'CommentService',
}));
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    activeProjectId: 'proj-1',
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
    mockListComments.mockReset();
    mockListComments.mockResolvedValue({ comments: [] });
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
});
