import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { TaskNoteService, TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending, server } from '../../test/mockRpc';
import { BACKEND_URL } from '../../lib/backendUrl';
import { TaskClaimHistory } from './TaskClaimHistory';
import { TaskNotesPanel } from './TaskNotesPanel';
import { TaskUsageRecords } from './TaskUsageRecords';
import { TaskReportScopeControl, TaskReportScopeProvider } from './TaskReportScope';

const owner = { accountId: 'human', orgId: 'org-A', taskId: 'task-A' };
const createdAt = '2026-11-08T12:00:00Z';
const sources = [
  { name: 'history', service: TaskService, method: 'ListTaskAttempts', disclosure: 'Claim history', suffix: 'claims',
    rows: (name: string) => ({ attempts: [{ id: `receipt-${name}`, taskId: owner.taskId, orgId: owner.orgId,
      owner: { kind: 'user', id: 'recorded-user', name }, claimedAt: createdAt }] }) },
  { name: 'notes', service: TaskNoteService, method: 'ListTaskNotes', disclosure: '', suffix: 'notes',
    rows: (name: string) => ({ taskNotes: [{ id: name, taskId: owner.taskId, agentId: 'worker-A', agentName: 'Worker', content: name, createdAt }] }) },
  { name: 'usage', service: TaskService, method: 'ListUsageRecords', disclosure: 'Usage records', suffix: 'usage records',
    rows: (name: string) => ({ records: [{ id: name, taskId: owner.taskId, reportedByName: name, modelName: 'Reported model',
      inputTokens: '3', outputTokens: '2', costMicros: '1000', createdAt }] }) },
] as const;
function view(source: typeof sources[number]['name']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}><TaskReportScopeProvider {...owner}>
    <TaskReportScopeControl />
    {source === 'history' ? <TaskClaimHistory /> : source === 'notes' ? <TaskNotesPanel taskId={owner.taskId} /> : <TaskUsageRecords />}
  </TaskReportScopeProvider></QueryClientProvider>);
}
beforeEach(() => server.use(http.post(`${BACKEND_URL}/api/client-errors`, () => HttpResponse.json({}))));

describe('Bounded report navigation and transient recovery', () => {
  for (const source of sources) for (const direction of ['Older', 'Newer'] as const) {
    it(`${source.name}: retains a useful page and retries a transient ${direction.toLowerCase()} failure`, async () => {
      const requests: unknown[] = [];
      const respond = () => mockRpc(source.service, source.method, body => {
        requests.push(body); const older = !!body.page?.cursor;
        return { ...source.rows(older ? 'Older recorded report' : 'Current recorded report'),
          page: { totalCount: 2, ...(!older ? { nextCursor: 'older-A' } : {}) } };
      });
      respond(); view(source.name);
      if (source.disclosure) fireEvent.click(screen.getByText(source.disclosure));
      await screen.findByText('Current recorded report');
      if (direction === 'Newer') {
        fireEvent.click(screen.getByRole('button', { name: `Older ${source.suffix}` }));
        await screen.findByText('Older recorded report');
      }
      mockRpcError(source.service, source.method, 'unavailable', 'Page temporarily unavailable');
      fireEvent.click(screen.getByRole('button', { name: `${direction} ${source.suffix}` }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Page temporarily unavailable');
      expect(screen.getByText(direction === 'Older' ? 'Current recorded report' : 'Older recorded report')).toBeVisible();
      respond();
      fireEvent.click(screen.getByRole('button', { name: `Retry ${direction.toLowerCase()} ${source.suffix}` }));
      await screen.findByText(direction === 'Older' ? 'Older recorded report' : 'Current recorded report');
      expect(requests.at(-1)).toEqual({ taskId: owner.taskId, page: { limit: 20, ...(direction === 'Older' ? { cursor: 'older-A' } : {}) } });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: `${direction === 'Older' ? 'Newer' : 'Older'} ${source.suffix}` }));
      expect(await screen.findByText(direction === 'Older' ? 'Current recorded report' : 'Older recorded report')).toBeVisible();
    });
  }
  it('keeps usage lazy, announces loading, and cancels a collapsed read before reopening an empty page', async () => {
    const pending = mockRpcPending(TaskService, 'ListUsageRecords'); view('usage');
    expect(pending.requests).toHaveLength(0);
    fireEvent.click(screen.getByText('Usage records'));
    await waitFor(() => expect(pending.requests).toHaveLength(1));
    expect(screen.getByRole('status')).toHaveTextContent('Loading usage records…');
    expect(screen.getByRole('button', { name: 'Older usage records' })).toBeDisabled();
    fireEvent.click(screen.getByText('Usage records'));
    await act(async () => { pending.resolve({ records: [] }); });
    expect(screen.queryByRole('list', { name: 'Recorded usage reports' })).not.toBeInTheDocument();
    mockRpc(TaskService, 'ListUsageRecords', { records: [] });
    fireEvent.click(screen.getByText('Usage records'));
    expect(await screen.findByText('No matching recorded usage reports.')).toBeVisible();
    expect(screen.getByText('Page 1 · 0 shown')).toBeVisible();
  });
  it('retries the initial usage read, reports only available attribution, and explicitly refreshes', async () => {
    mockRpcError(TaskService, 'ListUsageRecords', 'unavailable', 'Initial usage read unavailable');view('usage');
    fireEvent.click(screen.getByText('Usage records'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Initial usage read unavailable');
    expect(screen.queryByText('No matching recorded usage reports.')).not.toBeInTheDocument();
    mockRpc(TaskService, 'ListUsageRecords', { records: [
      { id: 'r-agent', agentId: 'recorded-agent', modelName: 'Reported model', createdAt },
      { id: 'r-user', userId: 'recorded-user', createdAt }, { id: 'r-missing', createdAt },
    ] });
    fireEvent.click(screen.getByRole('button', { name: 'Retry usage records' }));
    expect(await screen.findByText('recorded-agent')).toBeVisible();
    expect(screen.getByText('recorded-user')).toBeVisible();
    expect(screen.getByText('Reporter not recorded')).toBeVisible();
    expect(screen.getByText(/Reported model/)).toBeVisible();
    mockRpc(TaskService, 'ListUsageRecords', { records: [], page: { totalCount: 0 } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh usage records' }));
    expect(await screen.findByText('No matching recorded usage reports.')).toBeVisible();
  });
  it('withholds scoped readers outside a confirmed report owner', () => {
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><TaskUsageRecords /><TaskNotesPanel taskId={owner.taskId} /><TaskReportScopeControl /></QueryClientProvider>);
    expect(screen.queryByText('Usage records')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Choose a task to view agent notes.');
  });
  it.each([{ id: 'recorded-agent' }, undefined])('uses recorded receipt attribution when a display name is absent (%j)', async recordedOwner => {
    mockRpc(TaskService, 'ListTaskAttempts', { attempts: [{ id: 'ta-A', taskId: owner.taskId, orgId: owner.orgId,
      claimedAt: createdAt, ...(recordedOwner ? { owner: recordedOwner } : {}) }] });
    view('history');fireEvent.click(screen.getByText('Claim history'));
    fireEvent.click(await screen.findByRole('button', { name: 'Show associated reports' }));
    expect(screen.getByText(`Showing reports associated with ${recordedOwner?.id ?? 'the recorded owner'}’s claim.`)).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: 'Report scope' }), { target: { value: 'all' } });
    expect(screen.getByRole('combobox', { name: 'Report scope' })).toHaveValue('all');
  });
});
