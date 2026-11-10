import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventService, TaskNoteService, TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { http, HttpResponse } from 'msw';
import { BACKEND_URL } from '../../lib/backendUrl';
import { mockRpc, server } from '../../test/mockRpc';
import { useLiveEvents } from '../../hooks/useLiveEvents';
import { TaskContext } from './TaskContext';
import { TaskNotesPanel } from './TaskNotesPanel';
import { TaskReportScopeProvider } from './TaskReportScope';

const receipt = { id: 'ta-event', taskId: 'task-event', orgId: 'org-event', owner: { kind: 'agent', id: 'worker-event', name: 'Recorded event worker' }, claimedAt: '2026-11-08T12:00:00Z' };
function frame(subject: string) {
  const json = new TextEncoder().encode(JSON.stringify({ subject, orgId: 'org-event', occurredAt: '2026-11-10T12:00:00Z', payloadJson: '{}' }));
  const bytes = new Uint8Array(5 + json.length); new DataView(bytes.buffer).setUint32(1, json.length, false); bytes.set(json, 5); return bytes;
}
function LiveReports() {
  const { status } = useLiveEvents({ orgId: 'org-event' });
  return <TaskReportScopeProvider accountId="user-event" orgId="org-event" taskId="task-event">
    <output aria-label="Report event connection">{status}</output>
    <TaskContext taskId="task-event" usage={{ $typeName: 'tasker.health.v1.UsageTotals', reports: 1n, inputTokens: 1n, outputTokens: 0n, costMicros: 0n }} />
    <TaskNotesPanel taskId="task-event" />
  </TaskReportScopeProvider>;
}
function open() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  server.use(http.post(`${BACKEND_URL}/${EventService.typeName}/SubscribeEvents`, () => new HttpResponse(new ReadableStream<Uint8Array>({ start(value) {
    controller = value; value.enqueue(frame('stream.ready'));
  } }), { headers: { 'content-type': 'application/connect+json' } })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['authSession'], { authenticated: true, userId: 'user-event' });
  const view = render(<QueryClientProvider client={client}><LiveReports /></QueryClientProvider>);
  return { ...view, send: (subject: string) => controller.enqueue(frame(subject)) };
}

describe('Claim reports consume actual Connect event frames', () => {
  it('reads current ownership after the release event instead of inferring a process outcome', async () => {
    let released = false;
    mockRpc(TaskService, 'ListTaskAttempts', () => ({ attempts: [{ ...receipt,
      ...(released ? { releasedAt: '2026-11-08T12:01:00Z', releaseReason: 'released' } : {}) }], page: { totalCount: 1 } }));
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [], page: { totalCount: 0 } });
    const view = open(); fireEvent.click(screen.getByText('Claim history'));
    await screen.findByText('Ownership not recorded as ended');
    await waitFor(() => expect(screen.getByLabelText('Report event connection')).toHaveTextContent('live'));
    released = true; act(() => view.send('domain.task.released'));
    expect(await screen.findByText('Ownership released')).toBeInTheDocument();
    expect(screen.queryByText(/running|process stopped|succeeded/i)).not.toBeInTheDocument();
  });
  it('reads delayed usage after its native task event and keeps task-wide totals labeled', async () => {
    let delayed = false;
    mockRpc(TaskService, 'ListTaskAttempts', { attempts: [receipt], page: { totalCount: 1 } });
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [], page: { totalCount: 0 } });
    mockRpc(TaskService, 'ListUsageRecords', () => ({ records: [{ id: 'usage-event', taskId: receipt.taskId,
      reportedByName: delayed ? 'Delayed report arrived' : 'Initial report', inputTokens: '1', outputTokens: '0', costMicros: '0', createdAt: receipt.claimedAt }], page: { totalCount: 1 } }));
    const view = open(); fireEvent.click(screen.getByText('Usage records')); await screen.findByText('Initial report');
    await waitFor(() => expect(screen.getByLabelText('Report event connection')).toHaveTextContent('live'));
    delayed = true; act(() => view.send('domain.task.usage_reported'));
    expect(await screen.findByText('Delayed report arrived')).toBeInTheDocument();
    expect(screen.getByText('Task-wide totals')).toBeInTheDocument();
  });
});
