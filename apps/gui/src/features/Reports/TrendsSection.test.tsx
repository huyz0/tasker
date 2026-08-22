import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReportService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';
import { ReportsScreen } from './index';

let mockActiveOrgId: string | null = 'org-1';
let mockActiveProjectId: string | null = 'proj-1';
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    get activeOrgId() { return mockActiveOrgId; },
    get activeProjectId() { return mockActiveProjectId; },
    setActivePageTitle: () => {},
  })),
}));

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

// The trend cards live on the same screen as the exception cards but read from
// their own query; the exceptions fixture stays minimal (one stalled claim so
// the cards branch actually renders) while the trends fixture carries the data
// under test.
const EXCEPTIONS_RESPONSE = {
  stalledClaims: [{
    taskId: 'task-1', taskDisplayId: 'TSK-1', taskTitle: 'Migrate the billing job',
    status: 'in_progress', agentId: 'agent-1', agentName: 'Builder One',
    claimedAt: hoursAgo(30), agentLastSeenAt: hoursAgo(2), neverStarted: true,
  }],
  unclaimed: [], regressions: [], churning: [], agentRows: [], roleRows: [],
  agentCompleted: '6', humanCompleted: '2', priorAgentCompleted: '1', priorHumanCompleted: '3',
};

// A realistic wire fixture: int64 fields (counts, sample sizes) travel as JSON
// strings in Connect JSON, exactly as the real backend emits them.
const TRENDS = {
  collectedSince: '2026-08-01T00:00:00.000Z',
  createdCumulative: [
    { date: '2026-08-19', count: '4' },
    { date: '2026-08-20', count: '6' },
    { date: '2026-08-21', count: '9' },
  ],
  completedCumulative: [
    { date: '2026-08-19', count: '2' },
    { date: '2026-08-20', count: '5' },
    { date: '2026-08-21', count: '7' },
  ],
  recentCompletions: [
    { taskId: 'task-7', taskDisplayId: 'TSK-7', taskTitle: 'Ship the export job', completedAt: hoursAgo(3), byAgent: true },
    { taskId: 'task-8', taskDisplayId: 'TSK-8', taskTitle: 'Review the retention doc', completedAt: hoursAgo(30), byAgent: false },
  ],
  autonomyRate: [
    { date: '2026-08-19', rate: 0.5, sampleSize: '2' },
    { date: '2026-08-20', rate: 1, sampleSize: '3' },
    { date: '2026-08-21', rate: 0, sampleSize: '0' },
  ],
  reworkRate: [
    { date: '2026-08-19', rate: 0, sampleSize: '2' },
    { date: '2026-08-20', rate: 0.25, sampleSize: '3' },
    { date: '2026-08-21', rate: 0, sampleSize: '0' },
  ],
  // Bottom-first, as the server delivers: the terminal band is the floor of
  // the stack.
  cfdBands: [
    {
      status: 'done', isTerminal: true,
      counts: [{ date: '2026-08-19', count: '2' }, { date: '2026-08-20', count: '5' }, { date: '2026-08-21', count: '7' }],
    },
    {
      status: 'in_progress', isTerminal: false,
      counts: [{ date: '2026-08-19', count: '3' }, { date: '2026-08-20', count: '2' }, { date: '2026-08-21', count: '3' }],
    },
    {
      status: 'todo', isTerminal: false,
      counts: [{ date: '2026-08-19', count: '4' }, { date: '2026-08-20', count: '3' }, { date: '2026-08-21', count: '2' }],
    },
  ],
  cfdTaskTypeId: 'tt-build',
  taskTypeOptions: [
    { id: 'tt-build', name: 'Build', taskCount: '14' },
    { id: 'tt-review', name: 'Review', taskCount: '3' },
    { id: 'untyped', name: 'Untyped', taskCount: '2' },
  ],
};

/** A window where no day saw a completion — the rates mean nothing. */
const ZERO_SAMPLE_TRENDS = {
  ...TRENDS,
  recentCompletions: [],
  autonomyRate: TRENDS.autonomyRate.map((d) => ({ ...d, rate: 0, sampleSize: '0' })),
  reworkRate: TRENDS.reworkRate.map((d) => ({ ...d, rate: 0, sampleSize: '0' })),
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/reports" element={<ReportsScreen />} />
          <Route path="/tasks/:taskId" element={<div>Task detail page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Reports trend cards', () => {
  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
    mockRpc(ReportService, 'GetReportExceptions', EXCEPTIONS_RESPONSE);
    mockRpc(ReportService, 'GetReportTrends', TRENDS);
  });

  it('requests trends with the shared window, and refetches when it changes', async () => {
    const requests: Array<{ projectId?: string; windowDays?: number; taskTypeId?: string }> = [];
    mockRpc(ReportService, 'GetReportTrends', (body) => {
      requests.push(body);
      return TRENDS;
    });
    renderPage();

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({ projectId: 'proj-1', windowDays: 30 });
    // Absent taskTypeId: the server picks the project's most-used type.
    expect(requests[0].taskTypeId).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    await waitFor(() => expect(requests.some((r) => r.windowDays === 90)).toBe(true));
  });

  it('renders the three trend charts, with the sr-only tables as the data contract', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('img', { name: 'Autonomy and rework' })).toBeInTheDocument());
    expect(screen.getByRole('img', { name: 'Created vs completed' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cumulative flow' })).toBeInTheDocument();

    // Rates arrive 0..1 and render as percentages — 0.5 is "50%".
    const autonomy = screen.getByRole('table', { name: 'Autonomy and rework' });
    const autonomyHeaders = within(autonomy).getAllByRole('columnheader').map((h) => h.textContent);
    expect(autonomyHeaders).toEqual(['Date', 'Autonomous completions', 'Reworked completions']);
    const autonomyFirst = within(within(autonomy).getAllByRole('row')[1]).getAllByRole('cell').map((c) => c.textContent);
    expect(autonomyFirst).toEqual(['2026-08-19', '50%', '0%']);
    const autonomySecond = within(within(autonomy).getAllByRole('row')[2]).getAllByRole('cell').map((c) => c.textContent);
    expect(autonomySecond).toEqual(['2026-08-20', '100%', '25%']);

    const created = screen.getByRole('table', { name: 'Created vs completed' });
    const createdFirst = within(within(created).getAllByRole('row')[1]).getAllByRole('cell').map((c) => c.textContent);
    expect(createdFirst).toEqual(['2026-08-19', '4', '2']);

    // The CFD table carries one column per band, bottom-first, plus the total.
    const cfd = screen.getByRole('table', { name: 'Cumulative flow' });
    const cfdHeaders = within(cfd).getAllByRole('columnheader').map((h) => h.textContent);
    expect(cfdHeaders).toEqual(['Date', 'done', 'in_progress', 'todo', 'Total']);
    const cfdFirst = within(within(cfd).getAllByRole('row')[1]).getAllByRole('cell').map((c) => c.textContent);
    expect(cfdFirst).toEqual(['2026-08-19', '2', '3', '4', '9']);
  });

  it('names how many days in the window actually had completions', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('2 days with completions in this window')).toBeInTheDocument());
  });

  it('uses the singular for a single sampled day', async () => {
    mockRpc(ReportService, 'GetReportTrends', {
      ...TRENDS,
      autonomyRate: [
        { date: '2026-08-19', rate: 0.5, sampleSize: '2' },
        { date: '2026-08-20', rate: 0, sampleSize: '0' },
        { date: '2026-08-21', rate: 0, sampleSize: '0' },
      ],
      reworkRate: TRENDS.reworkRate.map((d) => ({ ...d, rate: 0, sampleSize: '0' })),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('1 day with completions in this window')).toBeInTheDocument());
  });

  it('shows the honest empty message instead of a zero line when no day had a completion', async () => {
    mockRpc(ReportService, 'GetReportTrends', ZERO_SAMPLE_TRENDS);
    renderPage();

    // The card and its accessible name stay; the zero line does not — an
    // all-zero rate line would assert "0% autonomous" about days with no
    // completions to measure.
    await waitFor(() => expect(screen.getByRole('img', { name: 'Autonomy and rework' })).toBeInTheDocument());
    expect(screen.getByText('No data for this period yet.')).toBeInTheDocument();
    expect(screen.queryByText(/days? with completions in this window/)).toBeNull();
    // And the strip says why it is empty instead of leaving a blank region.
    expect(screen.getByText('Nothing completed in this window yet.')).toBeInTheDocument();
  });

  it('lists recent completions as task links with an age and a by-whom badge', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('link', { name: /Ship the export job/ })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Ship the export job/ })).toHaveAttribute('href', '/tasks/task-7');
    expect(screen.getByRole('link', { name: /Review the retention doc/ })).toHaveAttribute('href', '/tasks/task-8');
    expect(screen.getByText('3h ago')).toBeInTheDocument();
    expect(screen.getByText('agent')).toBeInTheDocument();
    expect(screen.getByText('human')).toBeInTheDocument();
  });

  it('offers the task types with their counts, the server-chosen one selected', async () => {
    renderPage();

    const select = await screen.findByRole('combobox', { name: 'Task type' });
    expect(select).toHaveValue('tt-build');
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Build (14)', 'Review (3)', 'Untyped (2)']);
  });

  it('refetches with the chosen taskTypeId, including the "untyped" scope', async () => {
    const requests: Array<{ taskTypeId?: string }> = [];
    mockRpc(ReportService, 'GetReportTrends', (body: { taskTypeId?: string }) => {
      requests.push(body);
      return { ...TRENDS, cfdTaskTypeId: body.taskTypeId ?? 'tt-build' };
    });
    renderPage();

    const select = await screen.findByRole('combobox', { name: 'Task type' });
    fireEvent.change(select, { target: { value: 'untyped' } });
    await waitFor(() => expect(requests.some((r) => r.taskTypeId === 'untyped')).toBe(true));

    // A task-type change re-keys the query, so the cards remount when the new
    // window arrives — find the select again rather than holding the old node.
    const reloaded = await screen.findByRole('combobox', { name: 'Task type' });
    expect(reloaded).toHaveValue('untyped');
    fireEvent.change(reloaded, { target: { value: 'tt-review' } });
    await waitFor(() => expect(requests.some((r) => r.taskTypeId === 'tt-review')).toBe(true));
  });

  it('labels every chart with the honest collection-start date', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByText('History collected since August 1, 2026')).toHaveLength(3),
    );
  });

  it('shows a retryable trends error while the exception cards still render', async () => {
    mockRpcError(ReportService, 'GetReportTrends', 'unavailable', 'trend backend down');
    renderPage();

    // Independent queries: one failing must not blank the other.
    await waitFor(() => expect(screen.getByText(/trend backend down/)).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Stalled work' })).toBeInTheDocument();
    expect(screen.getByText('Migrate the billing job')).toBeInTheDocument();

    mockRpc(ReportService, 'GetReportTrends', TRENDS);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('img', { name: 'Cumulative flow' })).toBeInTheDocument());
  });
});
