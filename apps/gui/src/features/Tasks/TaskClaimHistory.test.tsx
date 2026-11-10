import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending } from '../../test/mockRpc';
import { TaskClaimHistory } from './TaskClaimHistory';
import { TaskReportScopeControl, TaskReportScopeProvider } from './TaskReportScope';

const receipt = { id: 'ta-receipt-A', taskId: 'task-A', orgId: 'org-A',
  owner: { kind: 'agent', id: 'agent-A', name: 'Recorded worker' }, claimedAt: '2026-11-08T12:00:00.000Z',
  externalRunId: '<opaque/job/17>' };
const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
function content(client: QueryClient, taskId = 'task-A') {
  return <QueryClientProvider client={client}>
    <TaskReportScopeProvider key={taskId} accountId="user-A" orgId="org-A" taskId={taskId}>
      <TaskReportScopeControl /><TaskClaimHistory />
    </TaskReportScopeProvider>
  </QueryClientProvider>;
}
const open = () => fireEvent.click(screen.getByText('Claim history'));
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

describe('Claim history ownership and source scope', () => {
  it('waits for a confirmed account before exposing scoped report controls', () => {
    const client = makeClient();
    render(<QueryClientProvider client={client}><TaskReportScopeProvider accountId="" orgId="org-A" taskId="task-A">
      <TaskReportScopeControl /><TaskClaimHistory />
    </TaskReportScopeProvider></QueryClientProvider>);
    expect(screen.queryByText('Claim history')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Report scope' })).not.toBeInTheDocument();
  });
  it('loads a bounded page only on opening and keeps absent closure truthful', async () => {
    const requests: unknown[] = [];
    mockRpc(TaskService, 'ListTaskAttempts', body => { requests.push(body); return { attempts: [receipt], page: { totalCount: 1 } }; });
    render(content(makeClient()));
    expect(requests).toEqual([]); open();
    expect(await screen.findByText('Recorded worker')).toBeInTheDocument();
    expect(requests).toEqual([{ taskId: 'task-A', page: { limit: 20 } }]);
    expect(screen.getByText('Ownership not recorded as ended')).toBeInTheDocument();
    expect(screen.getByText('<opaque/job/17>')).toBeInTheDocument();
    expect(screen.queryByText(/running|succeeded|process stopped/i)).not.toBeInTheDocument();
  });
  it('selects a loaded receipt in existing report scope only by explicit action', async () => {
    mockRpc(TaskService, 'ListTaskAttempts', { attempts: [receipt], page: { totalCount: 1 } });
    render(content(makeClient())); open();
    await screen.findByText('Recorded worker');
    expect(screen.getByRole('combobox', { name: 'Report scope' })).toHaveValue('all');
    fireEvent.click(screen.getByRole('button', { name: 'Show associated reports' }));
    expect(screen.getByRole('combobox', { name: 'Report scope' })).toHaveValue('receipt');
    expect(screen.getByRole('heading', { name: 'Report scope' })).toHaveFocus();
    fireEvent.change(screen.getByRole('combobox', { name: 'Report scope' }), { target: { value: 'uncorrelated' } });
    expect(screen.getByRole('combobox', { name: 'Report scope' })).toHaveValue('uncorrelated');
  });
  it('shows actual system closure without inventing a user or execution outcome', async () => {
    mockRpc(TaskService, 'ListTaskAttempts', { attempts: [{ ...receipt, releasedAt: '2026-11-08T12:01:00.000Z',
      releaseReason: 'owner_purged', releasedBy: { kind: 'system' } }], page: { totalCount: 1 } });
    render(content(makeClient())); open();
    expect(await screen.findByText('Ownership ended when the owner was purged')).toBeInTheDocument();
    expect(screen.queryByText(/success|failed|running/i)).not.toBeInTheDocument();
  });
  it('keeps optional missing owner/end-reason metadata neutral', async () => {
    mockRpc(TaskService, 'ListTaskAttempts', { attempts: [{ id: receipt.id, taskId: receipt.taskId, orgId: receipt.orgId,
      claimedAt: receipt.claimedAt, releasedAt: '2026-11-08T12:01:00Z' }], page: { totalCount: 1 } });
    render(content(makeClient())); open();
    expect(await screen.findByText('Owner not recorded')).toBeInTheDocument();
    expect(screen.getByText('Ownership ended')).toBeInTheDocument();
    expect(screen.queryByText('Ownership released')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Agent ·/)).not.toBeInTheDocument();
  });
  it('recovers a real error and explains empty recorded history', async () => {
    mockRpcError(TaskService, 'ListTaskAttempts', 'unavailable', 'History is temporarily unavailable');
    render(content(makeClient())); open();
    expect(await screen.findByRole('alert')).toHaveTextContent('History is temporarily unavailable');
    expect(screen.queryByText('No recorded claims.')).not.toBeInTheDocument();
    mockRpc(TaskService, 'ListTaskAttempts', { attempts: [], page: { totalCount: 0 } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry claim history' }));
    expect(await screen.findByText('No recorded claims.')).toBeInTheDocument();
    expect(screen.getByText(/Earlier claims may not have receipts/)).toBeInTheDocument();
  });
  it('retains its last valid page when an older page fails, then retries that page', async () => {
    const requests: Record<string, unknown>[] = [];
    mockRpc(TaskService, 'ListTaskAttempts', body => { requests.push(body); return { attempts: [receipt], page: { totalCount: 2, nextCursor: 'older-A' } }; });
    render(content(makeClient())); open(); await screen.findByText('Recorded worker');
    mockRpcError(TaskService, 'ListTaskAttempts', 'unavailable', 'Older page unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Older claims' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Older page unavailable');
    expect(screen.getByText('Recorded worker')).toBeInTheDocument();
    mockRpc(TaskService, 'ListTaskAttempts', body => { requests.push(body); return { attempts: [{ ...receipt, id: 'ta-older',
      owner: { ...receipt.owner, name: 'Earlier worker' } }], page: { totalCount: 2 } }; });
    fireEvent.click(screen.getByRole('button', { name: 'Retry older claims' }));
    expect(await screen.findByText('Earlier worker')).toBeInTheDocument();
    expect(requests.at(-1)).toEqual({ taskId: 'task-A', page: { limit: 20, cursor: 'older-A' } });
    expect(screen.queryByText('Recorded worker')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Newer claims' })).toBeEnabled();
  });
  for (const direction of ['Older', 'Newer'] as const) it(`revalidates access through the primary Retry after a ${direction.toLowerCase()}-page denial`, async () => {
    mockRpc(TaskService, 'ListTaskAttempts', { attempts: [receipt], page: { totalCount: 2, nextCursor: 'older-A' } });
    render(content(makeClient())); open(); await screen.findByText('Recorded worker');
    if (direction === 'Newer') {
      mockRpc(TaskService, 'ListTaskAttempts', { attempts: [{ ...receipt, id: 'ta-earlier', owner: { ...receipt.owner, name: 'Earlier worker' } }], page: { totalCount: 2 } });
      fireEvent.click(screen.getByRole('button', { name: 'Older claims' }));
      await screen.findByText('Earlier worker');
    }
    mockRpcError(TaskService, 'ListTaskAttempts', 'permission_denied', 'History access removed');
    fireEvent.click(screen.getByRole('button', { name: `${direction} claims` }));
    expect(await screen.findByRole('alert')).toHaveTextContent('History access removed');
    expect(screen.queryByRole('list', { name: 'Recorded claims' })).not.toBeInTheDocument();
    mockRpc(TaskService, 'ListTaskAttempts', { attempts: [{ ...receipt, owner: { ...receipt.owner, name: 'Freshly verified worker' } }], page: { totalCount: 1 } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry claim history' }));
    expect(await screen.findByText('Freshly verified worker')).toBeInTheDocument();
  });
  it('polls only the visible current page and stops on hidden document/collapse', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const requests: Record<string, unknown>[] = [];
    mockRpc(TaskService, 'ListTaskAttempts', body => { requests.push(body); return { attempts: [receipt],
      page: { totalCount: 2, ...(requests.length === 1 ? { nextCursor: 'older-A' } : {}) } }; });
    render(content(makeClient())); open(); await screen.findByText('Recorded worker');
    fireEvent.click(screen.getByRole('button', { name: 'Older claims' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh claim history' })).toBeEnabled());
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2]).toEqual({ taskId: 'task-A', page: { limit: 20, cursor: 'older-A' } });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(requests).toHaveLength(3);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(requests).toHaveLength(4));
    open();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(requests).toHaveLength(4);
  });
  it('does not restore a denied cached page after remount without an explicit fresh retry', async () => {
    const client = makeClient();
    mockRpc(TaskService, 'ListTaskAttempts', { attempts: [receipt], page: { totalCount: 1 } });
    const view = render(content(client)); open(); await screen.findByText('Recorded worker');
    mockRpcError(TaskService, 'ListTaskAttempts', 'permission_denied', 'History permission removed');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh claim history' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('History permission removed');
    expect(screen.queryByText('Recorded worker')).not.toBeInTheDocument();
    view.unmount();
    mockRpc(TaskService, 'ListTaskAttempts', { attempts: [receipt], page: { totalCount: 1 } });
    render(content(client)); open();
    expect(await screen.findByRole('alert')).toHaveTextContent('History permission removed');
    expect(screen.queryByText('Recorded worker')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry claim history' }));
    expect(await screen.findByText('Recorded worker')).toBeInTheDocument();
  });
  it('discards a late history response after the task changes', async () => {
    const pending = mockRpcPending(TaskService, 'ListTaskAttempts');
    const client = makeClient(), view = render(content(client)); open();
    try {
      await waitFor(() => expect(pending.requests).toHaveLength(1));
      mockRpc(TaskService, 'ListTaskAttempts', { attempts: [{ ...receipt, id: 'ta-B', taskId: 'task-B',
        owner: { ...receipt.owner, name: 'Current task worker' } }], page: { totalCount: 1 } });
      view.rerender(content(client, 'task-B')); open();
      expect(await screen.findByText('Current task worker')).toBeInTheDocument();
      await act(async () => { pending.resolve({ attempts: [receipt], page: { totalCount: 1 } }); });
      expect(screen.queryByText('Recorded worker')).not.toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Report scope' })).toHaveValue('all');
    } finally { pending.resolve({ attempts: [], page: { totalCount: 0 } }); }
  });
});
