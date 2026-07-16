import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { expect, test, describe, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Comment } from './index';
import { useComments } from './CommentContext';

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

  test('Scenario 3: auto-loads later pages so comments past the first page are shown', async () => {
    mockListComments
      .mockResolvedValueOnce({ comments: [{ id: 'cmt-1', userId: 'user-1', content: 'Page one comment', createdAt: new Date().toISOString() }], page: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ comments: [{ id: 'cmt-2', userId: 'user-1', content: 'Page two comment', createdAt: new Date().toISOString() }], page: {} });

    renderWithProvider(<Comment.List />);

    await waitFor(() => expect(screen.getByText('Page one comment')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Page two comment')).toBeInTheDocument());
    expect(mockListComments).toHaveBeenCalledWith({ entityId: 'task-1', entityType: 'task', page: { cursor: 'cursor-2' } });
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
    expect(agentComment?.querySelector('svg')).toBeInTheDocument();
  });

  test('renders "Unknown" as the author when a comment has neither a userId nor an agentId', async () => {
    mockListComments.mockResolvedValue({
      comments: [{ id: 'cmt-1', content: 'Anonymous note', createdAt: new Date().toISOString() }],
    });

    renderWithProvider(<Comment.List />);

    await waitFor(() => expect(screen.getByText('Unknown')).toBeInTheDocument());
  });

  test('does not submit a blank or whitespace-only comment', async () => {
    mockListComments.mockResolvedValue({ comments: [] });

    renderWithProvider(<><Comment.List /><Comment.Composer /></>);

    const textarea = await screen.findByPlaceholderText('Add your comment... (Markdown supported)');
    fireEvent.change(textarea, { target: { value: '   ' } });
    const form = textarea.closest('form')!;
    fireEvent.submit(form);

    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  test('shows an error message when posting a comment fails', async () => {
    mockListComments.mockResolvedValue({ comments: [] });
    mockCreateComment.mockRejectedValue(new Error('rate limited'));

    renderWithProvider(<><Comment.List /><Comment.Composer /></>);

    const textarea = await screen.findByPlaceholderText('Add your comment... (Markdown supported)');
    await waitFor(() => expect(textarea).not.toBeDisabled());
    fireEvent.change(textarea, { target: { value: 'Hello there' } });
    const button = screen.getByRole('button', { name: /post/i });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText(/Failed to post comment/)).toBeInTheDocument());
    expect(screen.getByText(/rate limited/)).toBeInTheDocument();
  });

  test('throws when useComments is called outside of a CommentProvider', () => {
    function Consumer() {
      useComments();
      return null;
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow('useComments must be used within a CommentProvider');
    spy.mockRestore();
  });
});
