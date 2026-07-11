import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { expect, test, describe, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Comment } from './index';

const { mockListComments, mockCreateComment } = vi.hoisted(() => ({
  mockListComments: vi.fn(),
  mockCreateComment: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({ listComments: mockListComments, createComment: mockCreateComment })),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({ CommentService: {} }));

function renderWithProvider(children: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Comment.Provider entityId="task-1" entityType="task">
        {children}
      </Comment.Provider>
    </QueryClientProvider>
  );
}

describe('Comment Compound Component', () => {
  beforeEach(() => {
    mockListComments.mockReset();
    mockCreateComment.mockReset();
  });

  test('Scenario 1: Creates a comment through the GUI', async () => {
    mockListComments.mockResolvedValue({ comments: [] });
    mockCreateComment.mockResolvedValue({ comment: { id: 'cmt-1', userId: 'user-1', content: 'This is a **bold** comment', createdAt: new Date().toISOString() } });

    renderWithProvider(<><Comment.List /><Comment.Composer /></>);

    const textarea = await screen.findByPlaceholderText('Add your comment... (Markdown supported)');
    await waitFor(() => expect(textarea).not.toBeDisabled());
    fireEvent.change(textarea, { target: { value: 'This is a **bold** comment' } });

    const button = screen.getByRole('button', { name: /post/i });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(mockCreateComment).toHaveBeenCalledWith(expect.objectContaining({
      entityId: 'task-1',
      entityType: 'task',
      content: 'This is a **bold** comment',
    }));
  });

  test('Scenario 2: Agent comment renders with distinct styling', async () => {
    mockListComments.mockResolvedValue({
      comments: [
        { id: 'cmt-1', userId: 'user-1', content: 'Standard human feedback', createdAt: new Date().toISOString() },
        { id: 'cmt-2', agentId: 'agent-alpha', content: 'This is my internal reasoning', createdAt: new Date().toISOString() },
      ],
    });

    renderWithProvider(<Comment.List />);

    await waitFor(() => expect(screen.getByText(/User user-1/)).toBeInTheDocument());

    const humanComment = screen.getByText(/User user-1/).closest('div.p-4');
    expect(humanComment).toHaveClass('border-border');

    const agentComment = screen.getByText(/Agent agent-alpha/).closest('div.p-4');
    expect(agentComment).toHaveClass('border-primary/20');
    expect(screen.getByText(/🤖/)).toBeInTheDocument();
  });
});
