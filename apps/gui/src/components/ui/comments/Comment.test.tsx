import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { expect, test, describe, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommentService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending } from '../../../test/mockRpc';
import { Comment } from './index';
import { useComments } from './CommentContext';
import { confirmAction, cancelAction } from '../../../test/confirm';

vi.mock('../../../hooks/useAuthSession', () => ({
  useAuthSession: vi.fn(() => ({ isLoading: false, authenticated: true, userId: 'user-1' })),
}));

// The rich editor is lazy-loaded behind Suspense, so rendering the real one
// here would mean awaiting a chunk to assert on a text field. Its own
// RichMarkdownEditor.test.tsx already covers the value/onChange wiring
// against a mocked @mdxeditor/editor (ADR-0018); these tests only need
// something that holds text, so the Lazy wrapper stands in as a plain
// controlled textarea — the same substitution Tasks/index.test.tsx makes.
vi.mock('../LazyRichMarkdownEditor', () => ({
  LazyRichMarkdownEditor: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
  ),
}));

/** Registers ListComments and records every request it receives. */
function withListComments(response: object | ((body: any) => object)) {
  const requests: any[] = [];
  mockRpc(CommentService, 'ListComments', (body) => {
    requests.push(body);
    return typeof response === 'function' ? response(body) : response;
  });
  return requests;
}

/** Registers CreateComment and records every request it receives. */
function withCreateComment(response: object) {
  const requests: any[] = [];
  mockRpc(CommentService, 'CreateComment', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers UpdateComment and records every request it receives. */
function withUpdateComment(response: object) {
  const requests: any[] = [];
  mockRpc(CommentService, 'UpdateComment', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers DeleteComment and records every request it receives. */
function withDeleteComment(response: object = { success: true }) {
  const requests: any[] = [];
  mockRpc(CommentService, 'DeleteComment', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

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
  test('Scenario 1: Creates a comment through the GUI', async () => {
    withListComments({ comments: [] });
    const requests = withCreateComment({ comment: { id: 'cmt-1', userId: 'user-1', content: 'This is a **bold** comment', createdAt: new Date().toISOString() } });

    renderWithProvider(<><Comment.List /><Comment.Composer /></>);

    const textarea = await screen.findByPlaceholderText('Add your comment…');
    await waitFor(() => expect(textarea).not.toBeDisabled());
    fireEvent.change(textarea, { target: { value: 'This is a **bold** comment' } });

    const button = screen.getByRole('button', { name: /post/i });
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({
      entityId: 'task-1',
      entityType: 'task',
      content: 'This is a **bold** comment',
    })));
  });

  test('Scenario 3: auto-loads later pages so comments past the first page are shown', async () => {
    const requests = withListComments((body: { page?: { cursor?: string } }) =>
      body.page?.cursor
        ? { comments: [{ id: 'cmt-2', userId: 'user-1', content: 'Page two comment', createdAt: new Date().toISOString() }], page: {} }
        : { comments: [{ id: 'cmt-1', userId: 'user-1', content: 'Page one comment', createdAt: new Date().toISOString() }], page: { nextCursor: 'cursor-2' } },
    );

    renderWithProvider(<Comment.List />);

    await waitFor(() => expect(screen.getByText('Page one comment')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Page two comment')).toBeInTheDocument());
    expect(requests).toContainEqual({ entityId: 'task-1', entityType: 'task', page: { cursor: 'cursor-2' } });
  });

  test('Scenario 2: Agent comment renders with distinct styling', async () => {
    withListComments({
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
    withListComments({
      comments: [{ id: 'cmt-1', content: 'Anonymous note', createdAt: new Date().toISOString() }],
    });

    renderWithProvider(<Comment.List />);

    await waitFor(() => expect(screen.getByText('Unknown')).toBeInTheDocument());
  });

  test('does not submit a blank or whitespace-only comment', async () => {
    withListComments({ comments: [] });
    const requests = withCreateComment({ comment: { id: 'cmt-1', userId: 'user-1', content: 'x', createdAt: new Date().toISOString() } });

    renderWithProvider(<><Comment.List /><Comment.Composer /></>);

    const textarea = await screen.findByPlaceholderText('Add your comment…');
    fireEvent.change(textarea, { target: { value: '   ' } });
    const form = textarea.closest('form')!;
    fireEvent.submit(form);

    expect(requests).toHaveLength(0);
  });

  test('shows an error message when posting a comment fails', async () => {
    withListComments({ comments: [] });
    mockRpcError(CommentService, 'CreateComment', 'unknown', 'rate limited');

    renderWithProvider(<><Comment.List /><Comment.Composer /></>);

    const textarea = await screen.findByPlaceholderText('Add your comment…');
    await waitFor(() => expect(textarea).not.toBeDisabled());
    fireEvent.change(textarea, { target: { value: 'Hello there' } });
    const button = screen.getByRole('button', { name: /post/i });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText(/Failed to post comment/)).toBeInTheDocument());
    expect(screen.getByText(/rate limited/)).toBeInTheDocument();
  });

  test('shows Edit/Delete controls only for the current user\'s own comments', async () => {
    withListComments({
      comments: [
        { id: 'cmt-1', userId: 'user-1', content: 'My own comment', createdAt: new Date().toISOString() },
        { id: 'cmt-2', userId: 'user-2', content: 'Someone else\'s comment', createdAt: new Date().toISOString() },
      ],
    });

    renderWithProvider(<Comment.List />);

    await waitFor(() => expect(screen.getByText('My own comment')).toBeInTheDocument());
    const ownComment = screen.getByText('My own comment').closest('div.p-4')! as HTMLElement;
    expect(ownComment.querySelector('button')).toBeTruthy();

    const otherComment = screen.getByText('Someone else\'s comment').closest('div.p-4')! as HTMLElement;
    expect(within(otherComment).queryByText('Edit')).not.toBeInTheDocument();
    expect(within(otherComment).queryByText('Delete')).not.toBeInTheDocument();
  });

  test('edits a comment through the GUI', async () => {
    withListComments({
      comments: [{ id: 'cmt-1', userId: 'user-1', content: 'Original text', createdAt: new Date().toISOString() }],
    });
    const requests = withUpdateComment({ comment: { id: 'cmt-1', userId: 'user-1', content: 'Updated text', createdAt: new Date().toISOString() } });

    renderWithProvider(<Comment.List />);

    await waitFor(() => expect(screen.getByText('Original text')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Edit'));

    const textarea = screen.getByDisplayValue('Original text');
    fireEvent.change(textarea, { target: { value: 'Updated text' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({
      commentId: 'cmt-1',
      content: 'Updated text',
    })));
  });

  test('cancels editing a comment without saving', async () => {
    withListComments({
      comments: [{ id: 'cmt-1', userId: 'user-1', content: 'Original text', createdAt: new Date().toISOString() }],
    });
    const requests = withUpdateComment({ comment: { id: 'cmt-1', userId: 'user-1', content: 'Original text', createdAt: new Date().toISOString() } });

    renderWithProvider(<Comment.List />);

    await waitFor(() => expect(screen.getByText('Original text')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByDisplayValue('Original text')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Original text')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  test('deletes a comment through the GUI after confirmation', async () => {
    withListComments({
      comments: [{ id: 'cmt-1', userId: 'user-1', content: 'Delete me', createdAt: new Date().toISOString() }],
    });
    const requests = withDeleteComment();

    renderWithProvider(<Comment.List />);

    await waitFor(() => expect(screen.getByText('Delete me')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ commentId: 'cmt-1' })));
  });

  test('does not delete a comment when the confirmation is declined', async () => {
    withListComments({
      comments: [{ id: 'cmt-1', userId: 'user-1', content: 'Keep me', createdAt: new Date().toISOString() }],
    });
    const requests = withDeleteComment();

    renderWithProvider(<Comment.List />);

    await waitFor(() => expect(screen.getByText('Keep me')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Delete'));
    await cancelAction();

    expect(requests).toHaveLength(0);
  });

  test('shows a pending label while posting a comment', async () => {
    withListComments({ comments: [] });
    const pending = mockRpcPending(CommentService, 'CreateComment');

    renderWithProvider(<><Comment.List /><Comment.Composer /></>);

    const textarea = await screen.findByPlaceholderText('Add your comment…');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /post/i }));

    await waitFor(() => expect(screen.getByText('Posting...')).toBeInTheDocument());
    pending.resolve({ comment: { id: 'cmt-1', userId: 'user-1', content: 'Hello', createdAt: new Date().toISOString() } });
  });

  test('renders the resolved authorName when present, instead of the raw userId', async () => {
    withListComments({
      comments: [{ id: 'cmt-1', userId: 'user-1', authorName: 'Alice', content: 'Hi there', createdAt: new Date().toISOString() }],
    });

    renderWithProvider(<Comment.List />);

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
  });

  test('does not submit an edited comment with blank content', async () => {
    withListComments({
      comments: [{ id: 'cmt-1', userId: 'user-1', content: 'Original', createdAt: new Date().toISOString() }],
    });
    const requests = withUpdateComment({ comment: { id: 'cmt-1', userId: 'user-1', content: 'Original', createdAt: new Date().toISOString() } });

    renderWithProvider(<Comment.List />);

    await waitFor(() => expect(screen.getByText('Original')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Edit'));

    const textarea = screen.getByDisplayValue('Original');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.submit(textarea.closest('form')!);

    expect(requests).toHaveLength(0);
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
