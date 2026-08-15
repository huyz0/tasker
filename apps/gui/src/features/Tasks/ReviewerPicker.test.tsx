import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReviewerPicker } from './ReviewerPicker';

const mockList = vi.fn();
const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockListMembers = vi.fn();

vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  TaskService: 'TaskService',
  OrgService: 'OrgService',
}));
vi.mock('use-debounce', () => ({ useDebounce: (v: string) => [v] }));
vi.mock('@connectrpc/connect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@connectrpc/connect')>()),
  createClient: (service: unknown) =>
    service === 'OrgService'
      ? { listOrgMembers: (...a: unknown[]) => mockListMembers(...a) }
      : {
          listTaskReviewers: (...a: unknown[]) => mockList(...a),
          addTaskReviewer: (...a: unknown[]) => mockAdd(...a),
          removeTaskReviewer: (...a: unknown[]) => mockRemove(...a),
        },
}));

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
  vi.clearAllMocks();
  mockList.mockResolvedValue({ reviewers: [] });
  mockListMembers.mockResolvedValue({
    members: [
      { userId: 'u-1', name: 'Ada Lovelace', email: 'ada@x.test' },
      { userId: 'u-2', name: 'Grace Hopper', email: 'grace@x.test' },
    ],
    page: { totalCount: 2 },
  });
});

describe('ReviewerPicker', () => {
  it('says there are no reviewers rather than showing an empty box', async () => {
    renderIt();
    expect(await screen.findByText('No reviewers')).toBeInTheDocument();
  });

  it('lists reviewers by name, not by id', async () => {
    mockList.mockResolvedValue({ reviewers: [ada] });
    renderIt();
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    // A raw user id on screen is the failure this replaces — the contract
    // carried only ids until M05-T05.
    expect(screen.queryByText('u-1')).toBeNull();
  });

  it('adds a reviewer', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ada Lovelace' }));
    await waitFor(() => expect(mockAdd).toHaveBeenCalledWith({ taskId: 'task-1', userId: 'u-1' }));
  });

  it('asks the server to filter as you type', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    fireEvent.change(await screen.findByLabelText('Search people'), { target: { value: 'Grace' } });
    // An organization can hold 100,000 members; filtering in the browser does
    // not work at that size (M05-T04).
    await waitFor(() => expect(mockListMembers).toHaveBeenCalledWith(
      expect.objectContaining({ page: expect.objectContaining({ filter: 'Grace', limit: 10 }) }),
    ));
  });

  it('does not offer someone already reviewing', async () => {
    mockList.mockResolvedValue({ reviewers: [ada] });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    await screen.findByRole('button', { name: 'Grace Hopper' });
    expect(screen.queryByRole('button', { name: 'Ada Lovelace' })).toBeNull();
  });

  it('removes a reviewer, naming who', async () => {
    mockList.mockResolvedValue({ reviewers: [ada] });
    renderIt();
    fireEvent.click(await screen.findByLabelText('Remove Ada Lovelace as a reviewer'));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith({ taskId: 'task-1', userId: 'u-1' }));
  });

  it('says how many matched when it is showing only some', async () => {
    mockListMembers.mockResolvedValue({
      members: [{ userId: 'u-1', name: 'Ada Lovelace', email: 'ada@x.test' }],
      page: { totalCount: 100001 },
    });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    expect(await screen.findByText(/Showing 1 of 100001/)).toBeInTheDocument();
  });

  it('distinguishes "nothing matched" from "everyone already reviews"', async () => {
    mockListMembers.mockResolvedValue({ members: [], page: { totalCount: 0 } });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    expect(await screen.findByText('Everyone is already reviewing.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'zzz' } });
    // Telling these apart stops someone retyping a name that was never going
    // to appear.
    expect(await screen.findByText('Nobody matches that.')).toBeInTheDocument();
  });

  it('identifies someone who has a login but no name yet', async () => {
    mockListMembers.mockResolvedValue({
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
    mockListMembers.mockResolvedValue({ members: [{ userId: 'u-1', name: 'Ada Lovelace', email: 'ada@x.test' }] });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    await screen.findByRole('button', { name: 'Ada Lovelace' });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('closes without adding when cancelled', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByLabelText('Search people')).toBeNull());
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('reports a failed add', async () => {
    mockAdd.mockRejectedValue(new Error('permission denied'));
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add reviewer…' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ada Lovelace' }));
    expect(await screen.findByText(/Failed to add reviewer/)).toBeInTheDocument();
  });

  it('reports a failed removal and keeps the row', async () => {
    mockList.mockResolvedValue({ reviewers: [ada] });
    mockRemove.mockRejectedValue(new Error('nope'));
    renderIt();
    fireEvent.click(await screen.findByLabelText('Remove Ada Lovelace as a reviewer'));
    expect(await screen.findByText(/Failed to remove reviewer/)).toBeInTheDocument();
    // The reviewer still exists, so the row still belongs there.
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });
});
