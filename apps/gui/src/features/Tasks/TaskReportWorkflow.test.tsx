import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArtifactService, SearchService, TaskNoteService, TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending } from '../../test/mockRpc';
import { TaskContext } from './TaskContext';
import { TaskArtifactLinks } from './TaskArtifactLinks';
import { TaskNotesPanel } from './TaskNotesPanel';
import { TaskReportScopeProvider } from './TaskReportScope';
import { useSummaryDrafts } from './summaryDrafts';

vi.mock('use-debounce', () => ({ useDebounce: (value: string) => [value] }));
const receipt = { id: 'ta-old', taskId: 'task-A', orgId: 'org-A', owner: { kind: 'agent', id: 'worker-A', name: 'Prior worker' },
  claimedAt: '2026-11-08T12:00:00Z', releasedAt: '2026-11-08T12:01:00Z', releaseReason: 'released' };
const link = { id: 'link-A', taskId: 'task-A', artifactId: 'artifact-A', artifactName: 'all-output.md', taskTitle: 'Task A' };
function view() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(['authSession'], { authenticated: true, userId: 'user-A', mustChangePassword: false });
  return { ...render(<QueryClientProvider client={client}><MemoryRouter>
    <TaskReportScopeProvider accountId="user-A" orgId="org-A" taskId="task-A">
      <TaskContext taskId="task-A" usage={{ $typeName: 'tasker.health.v1.UsageTotals', reports: 3n, inputTokens: 9n, outputTokens: 0n, costMicros: 0n }}>
        <TaskArtifactLinks taskId="task-A" orgId="org-A" />
      </TaskContext>
      <h3>Agent Notes</h3><TaskNotesPanel taskId="task-A" />
    </TaskReportScopeProvider>
  </MemoryRouter></QueryClientProvider>), client };
}
function selectReceipt() { fireEvent.click(screen.getByText('Claim history')); }
const metadata = (links: typeof link[]) => ({ links, page: { totalCount: links.length }, canLink: true, canUnlink: true });
beforeEach(() => {
  useSummaryDrafts.getState().endSession(); useSummaryDrafts.getState().setAccount('user-A');
  mockRpc(TaskService, 'ListTaskAttempts', { attempts: [receipt], page: { totalCount: 1 } });
  mockRpc(ArtifactService, 'ListTaskArtifactLinks', metadata([link]));
  mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [], page: { totalCount: 0 } });
  mockRpc(TaskService, 'ListUsageRecords', { records: [], page: { totalCount: 0 }, totals: { reports: '3', inputTokens: '9' } });
});
afterEach(() => useSummaryDrafts.getState().endSession());

describe('Task report scope across existing sources', () => {
  it('filters independent bounded sources, retains task-wide totals and preserves Summary drafts', async () => {
    const evidenceRequests: Record<string, unknown>[] = [], noteRequests: Record<string, unknown>[] = [], usageRequests: Record<string, unknown>[] = [];
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', body => { evidenceRequests.push(body); return metadata([{ ...link,
      artifactName: body.attemptId ? 'associated-output.md' : body.uncorrelatedOnly ? 'legacy-output.md' : 'all-output.md' }]); });
    mockRpc(TaskNoteService, 'ListTaskNotes', body => { noteRequests.push(body); return { taskNotes: [{ id: 'note-A', taskId: 'task-A', agentId: 'worker-A',
      content: body.attemptId ? 'Associated note' : body.uncorrelatedOnly ? 'Legacy note' : 'All note', createdAt: '2026-11-08T12:00:00Z' }], page: { totalCount: 1 } }; });
    mockRpc(TaskService, 'ListUsageRecords', body => { usageRequests.push(body); return { records: [{ id: 'usage-A', taskId: 'task-A', reportedByName: body.attemptId ? 'Associated reporter' : 'All reporter',
      inputTokens: '1', outputTokens: '0', costMicros: '0', createdAt: '2026-11-08T12:00:00Z' }], totals: { reports: '3', inputTokens: '9' }, page: { totalCount: 1 } }; });
    view(); await screen.findByText('All note');
    fireEvent.click(screen.getByRole('heading', { name: 'Summary' }));
    fireEvent.click(screen.getByRole('button', { name: 'Write a summary' }));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Keep this unsaved summary' } });
    fireEvent.click(screen.getByText('Usage records'));
    await screen.findByText('All reporter');
    selectReceipt();
    fireEvent.click(await screen.findByRole('button', { name: 'Show associated reports' }));
    expect(await screen.findByRole('link', { name: 'associated-output.md' })).toBeInTheDocument();
    expect(await screen.findByText('Associated note')).toBeInTheDocument();
    expect(await screen.findByText('Associated reporter')).toBeInTheDocument();
    for (const requests of [evidenceRequests, noteRequests, usageRequests]) expect(requests.at(-1)).toEqual({ taskId: 'task-A', attemptId: 'ta-old', page: { limit: 20 } });
    expect(screen.getByLabelText('Summary')).toHaveValue('Keep this unsaved summary');
    expect(screen.getByText('Task-wide totals')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Report scope' }), { target: { value: 'uncorrelated' } });
    expect(await screen.findByRole('link', { name: 'legacy-output.md' })).toBeInTheDocument();
    expect(await screen.findByText('Legacy note')).toBeInTheDocument();
    for (const requests of [evidenceRequests, noteRequests]) expect(requests.at(-1)).toEqual({ taskId: 'task-A', uncorrelatedOnly: true, page: { limit: 20 } });
  });
  for (const association of [undefined, 'ta-other']) {
    it(`keeps human linking unassociated and explains a returned ${association ? 'different receipt' : 'ungrouped link'}`, async () => {
      const writes: Record<string, unknown>[] = [];
      mockRpc(SearchService, 'UniversalSearch', { results: [{ id: 'artifact-new', type: 'artifact', title: 'new-output.md', snippet: '' }] });
      mockRpc(ArtifactService, 'LinkTaskArtifact', body => { writes.push(body); return { link: { ...link, id: 'link-new', artifactId: 'artifact-new', attemptId: association } }; });
      view(); selectReceipt(); fireEvent.click(await screen.findByRole('button', { name: 'Show associated reports' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Link an artifact…' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Search artifacts' }), { target: { value: 'new' } });
      fireEvent.click(await screen.findByRole('button', { name: /new-output.md/ }));
      expect(await screen.findByText(association ? 'Artifact is linked with a different claim receipt.' : 'Artifact linked without a claim receipt.')).toBeInTheDocument();
      expect(writes).toEqual([{ taskId: 'task-A', artifactId: 'artifact-new' }]);
      fireEvent.click(screen.getByRole('button', { name: 'Show all reports' }));
      expect(screen.getByRole('combobox', { name: 'Report scope' })).toHaveValue('all');
    });
  }
  it('does not show a late receipt-specific note after the filter changes', async () => {
    view(); await screen.findByRole('link', { name: 'all-output.md' });
    const pending = mockRpcPending(TaskNoteService, 'ListTaskNotes');
    selectReceipt();
    try {
      fireEvent.click(await screen.findByRole('button', { name: 'Show associated reports' }));
      await waitFor(() => expect(pending.requests).toHaveLength(1));
      mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [{ id: 'legacy', taskId: 'task-A', agentId: 'worker-A', content: 'Current legacy note', createdAt: '' }], page: { totalCount: 1 } });
      fireEvent.change(screen.getByRole('combobox', { name: 'Report scope' }), { target: { value: 'uncorrelated' } });
      expect(await screen.findByText('Current legacy note')).toBeInTheDocument();
      await act(async () => { pending.resolve({ taskNotes: [{ id: 'obsolete', content: 'Obsolete associated note' }], page: { totalCount: 1 } }); });
      expect(screen.queryByText('Obsolete associated note')).not.toBeInTheDocument();
    } finally { pending.resolve({ taskNotes: [], page: { totalCount: 0 } }); }
  });
  it('removes protected source rows/actions when history confirms task access denial', async () => {
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [{ id: 'note-A', taskId: 'task-A', agentId: 'worker-A', content: 'Protected note', createdAt: '' }], page: { totalCount: 1 } });
    view(); selectReceipt(); await screen.findByText('Prior worker');
    await screen.findByText('Protected note'); await screen.findByRole('link', { name: 'all-output.md' });
    mockRpcError(TaskService, 'ListTaskAttempts', 'permission_denied', 'Task read removed');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh claim history' }));
    expect(await screen.findByText(/Task read removed/)).toBeInTheDocument();
    expect(screen.queryByText('Protected note')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'all-output.md' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link an artifact…' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Report scope' })).toBeDisabled();
  });
  it('fences a late history response when usage confirms loss of the same task-read permission', async () => {
    view(); selectReceipt(); await screen.findByText('Prior worker');
    const pending = mockRpcPending(TaskService, 'ListTaskAttempts');
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh claim history' }));
      await waitFor(() => expect(pending.requests).toHaveLength(1));
      mockRpcError(TaskService, 'ListUsageRecords', 'permission_denied', 'Task read removed through usage');
      fireEvent.click(screen.getByText('Usage records'));
      await screen.findByText('Verify task access in Claim history to view usage records.');
      expect(screen.queryByText('Prior worker')).not.toBeInTheDocument();
      await act(async () => { pending.resolve({ attempts: [receipt], page: { totalCount: 1 } }); });
      expect(screen.queryByText('Prior worker')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'all-output.md' })).not.toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Report scope' })).toBeDisabled();
      mockRpc(TaskService, 'ListTaskAttempts', { attempts: [receipt], page: { totalCount: 1 } });
      mockRpc(TaskService, 'ListUsageRecords', { records: [], page: { totalCount: 0 }, totals: { reports: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'Retry claim history' }));
      expect(await screen.findByText('Prior worker')).toBeInTheDocument();
      expect(await screen.findByText('No matching recorded usage reports.')).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Report scope' })).toBeEnabled();
    } finally { pending.resolve({ attempts: [], page: { totalCount: 0 } }); }
  });
  it('revalidates a note page through its primary Retry after source-local permission denial', async () => {
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [{ id: 'note-A', taskId: 'task-A', agentId: 'worker-A', content: 'Current note page', createdAt: '' }],
      page: { totalCount: 2, nextCursor: 'older-notes' } });
    view(); selectReceipt(); await screen.findByText('Prior worker'); await screen.findByText('Current note page');
    mockRpcError(TaskNoteService, 'ListTaskNotes', 'permission_denied', 'Note access removed');
    fireEvent.click(screen.getByRole('button', { name: 'Older notes' }));
    await screen.findByText(/Note access removed/);
    expect(screen.getByText('Prior worker')).toBeInTheDocument();
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [{ id: 'fresh-note', taskId: 'task-A', agentId: 'worker-A', content: 'Freshly authorized note page', createdAt: '' }], page: { totalCount: 1 } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry notes' }));
    expect(await screen.findByText('Freshly authorized note page')).toBeInTheDocument();
  });
  for (const source of ['notes', 'artifacts'] as const) {
    it(`removes shared task reports when ${source} confirms authentication loss`, async () => {
      view(); selectReceipt(); await screen.findByText('Prior worker');
      await screen.findByRole('link', { name: 'all-output.md' });
      if (source === 'notes') mockRpcError(TaskNoteService, 'ListTaskNotes', 'unauthenticated', 'Session ended');
      else mockRpcError(ArtifactService, 'ListTaskArtifactLinks', 'unauthenticated', 'Session ended');
      fireEvent.click(screen.getByRole('button', { name: source === 'notes' ? 'Refresh notes' : 'Refresh evidence' }));
      await waitFor(() => expect(screen.queryByText('Prior worker')).not.toBeInTheDocument());
      expect(screen.queryByRole('link', { name: 'all-output.md' })).not.toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Report scope' })).toBeDisabled();
    });
  }
  it('keeps independently authorized reports when only artifact permission is removed', async () => {
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [{ id: 'note-A', taskId: 'task-A', agentId: 'worker-A', content: 'Still authorized note', createdAt: '' }], page: { totalCount: 1 } });
    view(); selectReceipt(); await screen.findByText('Prior worker'); await screen.findByText('Still authorized note');
    await screen.findByRole('link', { name: 'all-output.md' });
    mockRpcError(ArtifactService, 'ListTaskArtifactLinks', 'permission_denied', 'Only artifact access removed');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh evidence' }));
    await screen.findByText(/Only artifact access removed/);
    expect(screen.getByText('Prior worker')).toBeInTheDocument();
    expect(screen.getByText('Still authorized note')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Report scope' })).toBeEnabled();
  });
});
