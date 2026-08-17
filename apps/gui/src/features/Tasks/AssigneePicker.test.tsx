import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssigneePicker } from './AssigneePicker';

const mockAssign = vi.fn();
const mockUnassign = vi.fn();
const mockListMembers = vi.fn();
const mockListAgents = vi.fn();

// Sentinel service objects, matching how the other Tasks suites mock this —
// the real descriptors are opaque, so dispatching on identity is what works.
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  TaskService: 'TaskService',
  OrgService: 'OrgService',
  AgentService: 'AgentService',
}));
vi.mock('use-debounce', () => ({ useDebounce: (v: string) => [v] }));
vi.mock('@connectrpc/connect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@connectrpc/connect')>()),
  createClient: (service: unknown) => {
    if (service === 'OrgService') return { listOrgMembers: (...a: unknown[]) => mockListMembers(...a) };
    if (service === 'AgentService') return { listAgents: (...a: unknown[]) => mockListAgents(...a) };
    return { assignTask: (...a: unknown[]) => mockAssign(...a), unassignTask: (...a: unknown[]) => mockUnassign(...a) };
  },
}));

/** Opens the picker and waits for the search field. */
const openPicker = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Assign…' }));
  return screen.findByLabelText('Search people and agents');
};

const renderPicker = (assignees: any[] = []) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <AssigneePicker taskId="task-1" orgId="org-1" assignees={assignees} />
    </QueryClientProvider>,
  );
  return { ...result, client };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListMembers.mockResolvedValue({ members: [
    { userId: 'u-1', name: 'Ada Lovelace', email: 'ada@x.test', role: 'member' },
    { userId: 'u-2', name: 'Grace Hopper', email: 'grace@x.test', role: 'admin' },
  ], page: { totalCount: 2 } });
  mockListAgents.mockResolvedValue({ agents: [{ id: 'a-1', name: 'Reviewer Bot', orgId: 'org-1' }], page: { totalCount: 1 } });
});

describe('AssigneePicker', () => {
  it('says a task is unassigned rather than showing an empty box', async () => {
    renderPicker([]);
    expect(await screen.findByText('Unassigned')).toBeInTheDocument();
  });

  it('lists every assignee, people and agents alike', async () => {
    renderPicker([
      { userId: 'u-1', agentId: '', name: 'Ada Lovelace' },
      { userId: '', agentId: 'a-1', name: 'Reviewer Bot' },
    ]);
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Reviewer Bot')).toBeInTheDocument();
    // A task can carry several; showing "the assignee" would hide the rest and
    // make the task look less owned than it is.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('marks which assignees are people and which are agents', async () => {
    renderPicker([
      { userId: 'u-1', agentId: '', name: 'Ada Lovelace' },
      { userId: '', agentId: 'a-1', name: 'Reviewer Bot' },
    ]);
    expect(await screen.findByText('person')).toBeInTheDocument();
    expect(screen.getByText('agent')).toBeInTheDocument();
  });

  it('groups candidates into people and agents', async () => {
    renderPicker([]);
    await openPicker();
    await screen.findByRole('button', { name: 'Ada Lovelace' });
    // One control, because the question is "who is doing this" - making someone
    // first pick a *kind* of worker is a step the schema imposed, not the user.
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Agents')).toBeInTheDocument();
  });

  it('asks the server to filter, rather than fetching everyone and filtering here', async () => {
    renderPicker([]);
    const input = await openPicker();
    fireEvent.change(input, { target: { value: 'Ada' } });

    // The first version of this paged through all 100,001 members of M03's
    // fixture to fill a dropdown, and never finished loading.
    await waitFor(() => expect(mockListMembers).toHaveBeenCalledWith(
      expect.objectContaining({ page: expect.objectContaining({ filter: 'Ada', limit: 10 }) }),
    ));
    expect(mockListAgents).toHaveBeenCalledWith(
      expect.objectContaining({ page: expect.objectContaining({ filter: 'Ada' }) }),
    );
  });

  it('says how many matched when it is showing only some', async () => {
    mockListMembers.mockResolvedValue({ members: [{ userId: 'u-1', name: 'Ada Lovelace', email: 'a@x.test' }], page: { totalCount: 100001 } });
    mockListAgents.mockResolvedValue({ agents: [], page: { totalCount: 0 } });
    renderPicker([]);
    await openPicker();
    expect(await screen.findByText(/Showing 1 of 100001/)).toBeInTheDocument();
  });

  it('assigns a person', async () => {
    renderPicker([]);
    await openPicker();
    fireEvent.click(await screen.findByRole('button', { name: 'Ada Lovelace' }));
    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith({ taskId: 'task-1', userId: 'u-1' }));
  });

  it('assigns an agent', async () => {
    renderPicker([]);
    await openPicker();
    fireEvent.click(await screen.findByRole('button', { name: 'Reviewer Bot' }));
    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith({ taskId: 'task-1', agentId: 'a-1' }));
  });

  it('does not offer someone already assigned', async () => {
    renderPicker([{ userId: 'u-1', agentId: '', name: 'Ada Lovelace' }]);
    await openPicker();
    await screen.findByRole('button', { name: 'Grace Hopper' });
    // The server treats a duplicate as success, so re-offering them produces a
    // click that appears to do nothing at all.
    expect(screen.queryByRole('button', { name: 'Ada Lovelace' })).toBeNull();
  });

  it('removes an assignee, naming who is being removed', async () => {
    renderPicker([{ userId: 'u-1', agentId: '', name: 'Ada Lovelace' }]);
    fireEvent.click(await screen.findByLabelText('Remove Ada Lovelace from this task'));
    await waitFor(() => expect(mockUnassign).toHaveBeenCalledWith({ taskId: 'task-1', userId: 'u-1' }));
  });

  it('removes an agent by its agent id, not as a user', async () => {
    renderPicker([{ userId: '', agentId: 'a-1', name: 'Reviewer Bot' }]);
    fireEvent.click(await screen.findByLabelText('Remove Reviewer Bot from this task'));
    await waitFor(() => expect(mockUnassign).toHaveBeenCalledWith({ taskId: 'task-1', agentId: 'a-1' }));
  });

  it('reports a failed assignment instead of silently doing nothing', async () => {
    mockAssign.mockRejectedValue(new Error('permission denied'));
    renderPicker([]);
    await openPicker();
    fireEvent.click(await screen.findByRole('button', { name: 'Ada Lovelace' }));
    expect(await screen.findByText(/Failed to assign/)).toBeInTheDocument();
  });

  it('identifies someone who has a login but no name yet', async () => {
    mockListMembers.mockResolvedValue({
      members: [{ userId: 'u-9', name: '', email: 'invited@x.test', role: 'member' }],
      page: { totalCount: 1 },
    });
    renderPicker([]);
    await openPicker();
    // An invited member who has never signed in has no name. A blank row is
    // unassignable; their email is the only handle anyone has on them.
    expect(await screen.findByRole('button', { name: 'invited@x.test' })).toBeInTheDocument();
  });

  it('does not claim there are more matches when the server sent no count', async () => {
    mockListMembers.mockResolvedValue({ members: [{ userId: 'u-1', name: 'Ada Lovelace', email: 'ada@x.test' }] });
    mockListAgents.mockResolvedValue({ agents: [] });
    renderPicker([]);
    await openPicker();
    await screen.findByRole('button', { name: 'Ada Lovelace' });
    // Falling back to the page length rather than 0 keeps "Showing 1 of 0"
    // off the screen.
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('closes without assigning when cancelled', async () => {
    renderPicker([]);
    await openPicker();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByLabelText('Search people and agents')).toBeNull());
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it('reports a failed removal and keeps the row', async () => {
    mockUnassign.mockRejectedValue(new Error('nope'));
    renderPicker([{ userId: 'u-1', agentId: '', name: 'Ada Lovelace' }]);
    fireEvent.click(await screen.findByLabelText('Remove Ada Lovelace from this task'));
    expect(await screen.findByText(/Failed to remove/)).toBeInTheDocument();
    // The assignment still exists, so the row still belongs there.
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  // M19-T05: this picker also renders inside the task-detail panel, whose
  // assignee list comes from a separate `['task', id]` query - invalidating
  // only `['tasks']` refreshed the board/table but left that panel showing
  // whatever it had already fetched.
  it('invalidates the task-detail query, not just the tasks list, after assigning', async () => {
    // A different test in this file leaves mockAssign rejecting -
    // clearAllMocks resets call history but not a configured
    // resolved/rejected value, so this must set its own to not depend on
    // file order.
    mockAssign.mockResolvedValue(undefined);
    const { client } = renderPicker([]);
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    await openPicker();
    fireEvent.click(await screen.findByRole('button', { name: 'Ada Lovelace' }));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks'] }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['task', 'task-1'] });
  });

  it('invalidates the task-detail query, not just the tasks list, after removing', async () => {
    mockUnassign.mockResolvedValue(undefined);
    const { client } = renderPicker([{ userId: 'u-1', agentId: '', name: 'Ada Lovelace' }]);
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(await screen.findByLabelText('Remove Ada Lovelace from this task'));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks'] }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['task', 'task-1'] });
  });

  it('distinguishes "nobody left" from "nothing matched"', async () => {
    mockListMembers.mockResolvedValue({ members: [], page: { totalCount: 0 } });
    mockListAgents.mockResolvedValue({ agents: [], page: { totalCount: 0 } });
    renderPicker([]);
    const input = await openPicker();
    expect(await screen.findByText('No members or agents left to assign.')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'zzz' } });
    // Telling these apart is what stops someone retyping a name that was never
    // going to appear.
    expect(await screen.findByText('Nobody matches that.')).toBeInTheDocument();
  });
});
