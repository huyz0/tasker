import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskService, OrgService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';
import { ReviewerPicker } from './ReviewerPicker';

vi.mock('use-debounce', () => ({ useDebounce: (v: string) => [v] }));

/** Registers AddTaskReviewer/RemoveTaskReviewer and records every request each receives. */
function withAddRemove() {
  const addRequests: any[] = [];
  const removeRequests: any[] = [];
  mockRpc(TaskService, 'AddTaskReviewer', (body) => {
    addRequests.push(body);
    return {};
  });
  mockRpc(TaskService, 'RemoveTaskReviewer', (body) => {
    removeRequests.push(body);
    return {};
  });
  return { addRequests, removeRequests };
}

/** Registers ListOrgMembers and records every request it receives. */
function withListMembers(response: object) {
  const requests: any[] = [];
  mockRpc(OrgService, 'ListOrgMembers', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

const renderIt = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReviewerPicker taskId="task-1" orgId="org-1" />
    </QueryClientProvider>,
  );
};

const ada = { id: 'r-1', taskId: 'task-1', userId: 'u-1', name: 'Ada Lovelace' };

beforeEach(() => {
  mockRpc(TaskService, 'ListTaskReviewers', { reviewers: [] });
  withListMembers({
    members: [
      { userId: 'u-1', name: 'Ada Lovelace', email: 'ada@x.test' },
      { userId: 'u-2', name: 'Grace Hopper', email: 'grace@x.test' },
    ],
    page: { totalCount: 2 },
  });
  withAddRemove();
});

describe('ReviewerPicker', () => {
  it('says there are no reviewers rather than showing an empty box', async () => {
    renderIt();
    expect(await screen.findByText('No reviewers')).toBeInTheDocument();
  });

  it('lists reviewers by name, not by id', async () => {
    mockRpc(TaskService, 'ListTaskReviewers', { reviewers: [ada] });
    renderIt();
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    // A raw user id on screen is the failure this replaces — the contract
    // carried only ids until M05-T05.
    expect(screen.queryByText('u-1')).toBeNull();
  });

  it('adds a reviewer', async () => {
    const { addRequests } = withAddRemove();
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ada Lovelace' }));
    await waitFor(() => expect(addRequests).toContainEqual({ taskId: 'task-1', userId: 'u-1' }));
  });

  it('asks the server to filter as you type', async () => {
    const requests = withListMembers({ members: [], page: { totalCount: 0 } });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    fireEvent.change(await screen.findByLabelText('Search people'), { target: { value: 'Grace' } });
    // An organization can hold 100,000 members; filtering in the browser does
    // not work at that size (M05-T04).
    await waitFor(() => expect(requests).toContainEqual(
      expect.objectContaining({ page: expect.objectContaining({ filter: 'Grace', limit: 10 }) }),
    ));
  });

  it('does not offer someone already reviewing', async () => {
    mockRpc(TaskService, 'ListTaskReviewers', { reviewers: [ada] });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    await screen.findByRole('button', { name: 'Grace Hopper' });
    expect(screen.queryByRole('button', { name: 'Ada Lovelace' })).toBeNull();
  });

  it('removes a reviewer, naming who', async () => {
    mockRpc(TaskService, 'ListTaskReviewers', { reviewers: [ada] });
    const { removeRequests } = withAddRemove();
    renderIt();
    fireEvent.click(await screen.findByLabelText('Remove Ada Lovelace as a reviewer'));
    await waitFor(() => expect(removeRequests).toContainEqual({ taskId: 'task-1', userId: 'u-1' }));
  });

  it('says how many matched when it is showing only some', async () => {
    withListMembers({
      members: [{ userId: 'u-1', name: 'Ada Lovelace', email: 'ada@x.test' }],
      page: { totalCount: 100001 },
    });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    expect(await screen.findByText(/Showing 1 of 100001/)).toBeInTheDocument();
  });

  it('distinguishes "nothing matched" from "everyone already reviews"', async () => {
    withListMembers({ members: [], page: { totalCount: 0 } });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    expect(await screen.findByText('Everyone is already reviewing.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'zzz' } });
    // Telling these apart stops someone retyping a name that was never going
    // to appear.
    expect(await screen.findByText('Nobody matches that.')).toBeInTheDocument();
  });

  it('identifies someone who has a login but no name yet', async () => {
    withListMembers({
      members: [{ userId: 'u-9', name: '', email: 'invited@x.test' }],
      page: { totalCount: 1 },
    });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    // An invited member who has never signed in has no name; a blank row cannot
    // be picked.
    expect(await screen.findByRole('button', { name: 'invited@x.test' })).toBeInTheDocument();
  });

  it('does not claim there are more matches when the server sent no count', async () => {
    withListMembers({ members: [{ userId: 'u-1', name: 'Ada Lovelace', email: 'ada@x.test' }] });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    await screen.findByRole('button', { name: 'Ada Lovelace' });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('closes without adding when cancelled', async () => {
    const { addRequests } = withAddRemove();
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByLabelText('Search people')).toBeNull());
    expect(addRequests).toHaveLength(0);
  });

  it('reports a failed add', async () => {
    mockRpcError(TaskService, 'AddTaskReviewer', 'permission_denied', 'permission denied');
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ada Lovelace' }));
    expect(await screen.findByText(/Failed to add reviewer/)).toBeInTheDocument();
  });

  it('reports a failed removal and keeps the row', async () => {
    mockRpc(TaskService, 'ListTaskReviewers', { reviewers: [ada] });
    mockRpcError(TaskService, 'RemoveTaskReviewer', 'unknown', 'nope');
    renderIt();
    fireEvent.click(await screen.findByLabelText('Remove Ada Lovelace as a reviewer'));
    expect(await screen.findByText(/Failed to remove reviewer/)).toBeInTheDocument();
    // The reviewer still exists, so the row still belongs there.
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });
});
