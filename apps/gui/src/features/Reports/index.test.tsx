import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReportService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending } from '../../test/mockRpc';
import { ReportsScreen } from './index';
import { expectNoA11yViolations } from '../../test/a11y';

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

// A realistic wire fixture: int64 fields travel as strings in Connect JSON,
// exactly as the real backend emits them; the real transport decodes them to
// bigint before the screen sees them.
const RESPONSE = {
  stalledClaims: [
    {
      taskId: 'task-1', taskDisplayId: 'TSK-1', taskTitle: 'Migrate the billing job',
      status: 'in_progress', agentId: 'agent-1', agentName: 'Builder One',
      claimedAt: hoursAgo(30), agentLastSeenAt: hoursAgo(2), neverStarted: true,
    },
    {
      taskId: 'task-2', taskDisplayId: 'TSK-2', taskTitle: 'Speed up the search index',
      status: 'in_progress', agentId: 'agent-2', agentName: 'Fixer Two',
      claimedAt: hoursAgo(50), lastSignalAt: hoursAgo(28), agentLastSeenAt: hoursAgo(28), neverStarted: false,
    },
  ],
  unclaimed: [
    { taskId: 'task-3', taskDisplayId: 'TSK-3', taskTitle: 'Rotate the API keys', status: 'todo', waitingSince: hoursAgo(0.5) },
  ],
  regressions: [
    {
      taskId: 'task-4', taskDisplayId: 'TSK-4', taskTitle: 'Fix the login redirect',
      fromStatus: 'done', toStatus: 'in_progress', occurredAt: hoursAgo(5),
      actorType: 'user', actorName: 'Huy Nguyen', holderAgentId: 'agent-2', holderAgentName: 'Fixer Two',
    },
  ],
  churning: [
    {
      taskId: 'task-5', taskDisplayId: 'TSK-5', taskTitle: 'Refactor the mailer',
      handoffCount: '3', lastAgentId: 'agent-2', lastAgentName: 'Fixer Two',
      lastHandoffAt: hoursAgo(8), claimHeld: true,
    },
  ],
  agentRows: [
    {
      subjectId: 'agent-1', subjectName: 'Builder One', claimed: '5', completed: '4',
      reopened: '2', handedOff: '1', takenAway: '0', autonomousCompleted: '3',
      openNow: '1', lastActiveAt: hoursAgo(2),
    },
  ],
  roleRows: [
    {
      subjectId: 'role-1', subjectName: 'Builder', claimed: '9', completed: '7',
      reopened: '2', handedOff: '2', takenAway: '1', autonomousCompleted: '5',
      openNow: '2', lastActiveAt: hoursAgo(2),
    },
  ],
  agentCompleted: '6', humanCompleted: '2', priorAgentCompleted: '1', priorHumanCompleted: '3',
};

const EMPTY_RESPONSE = {
  stalledClaims: [], unclaimed: [], regressions: [], churning: [],
  agentRows: [], roleRows: [],
  agentCompleted: '0', humanCompleted: '0', priorAgentCompleted: '0', priorHumanCompleted: '0',
};

// The T09 trend cards read from their own query; this file is about the
// exception cards, so the trends fixture stays at rest (every chart empty).
// TrendsSection.test.tsx owns the populated states.
const EMPTY_TRENDS = {
  collectedSince: '2026-08-01T00:00:00.000Z',
  createdCumulative: [], completedCumulative: [], recentCompletions: [],
  autonomyRate: [], reworkRate: [], cfdBands: [],
  cfdTaskTypeId: 'untyped',
  taskTypeOptions: [{ id: 'untyped', name: 'Untyped', taskCount: '0' }],
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

describe('ReportsScreen', () => {
  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
    mockRpc(ReportService, 'GetReportExceptions', RESPONSE);
    mockRpc(ReportService, 'GetReportTrends', EMPTY_TRENDS);
  });

  it('asks the user to select an organization when none is active', () => {
    mockActiveOrgId = null;
    renderPage();
    expect(screen.getByText('Select an organization to see project reports.')).toBeInTheDocument();
  });

  it('asks for a project when an org is active but no project is, and never queries', () => {
    mockActiveProjectId = null;
    const requests: unknown[] = [];
    mockRpc(ReportService, 'GetReportExceptions', (body) => {
      requests.push(body);
      return RESPONSE;
    });
    renderPage();
    expect(screen.getByText('Select a project to see its reports.')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('shows a loading message while the request is in flight', () => {
    mockRpcPending(ReportService, 'GetReportExceptions');
    renderPage();
    expect(screen.getByText('Loading project reports…')).toBeInTheDocument();
  });

  it('shows a retryable error when the request fails', async () => {
    mockRpcError(ReportService, 'GetReportExceptions', 'unavailable', 'backend unavailable');
    renderPage();

    await waitFor(() => expect(screen.getByText(/Could not load this list/)).toBeInTheDocument());
    expect(screen.getByText(/backend unavailable/)).toBeInTheDocument();

    mockRpc(ReportService, 'GetReportExceptions', RESPONSE);
    fireEvent.click(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText('Migrate the billing job')).toBeInTheDocument());
  });

  it('renders all four exception cards with server data, in urgency order', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Stalled work' })).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Went backwards' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Churning tasks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fleet scorecard' })).toBeInTheDocument();

    // One datum from each card, and every task row is a link to /tasks/:id.
    expect(screen.getByRole('link', { name: /Migrate the billing job/ })).toHaveAttribute('href', '/tasks/task-1');
    expect(screen.getByRole('link', { name: /Rotate the API keys/ })).toHaveAttribute('href', '/tasks/task-3');
    expect(screen.getByRole('link', { name: /Fix the login redirect/ })).toHaveAttribute('href', '/tasks/task-4');
    expect(screen.getByRole('link', { name: /Refactor the mailer/ })).toHaveAttribute('href', '/tasks/task-5');
    expect(screen.getByRole('cell', { name: 'Builder One' })).toBeInTheDocument();

    // Urgency order is the design: exceptions (stalled, regressions, churn,
    // scorecard) lead because agents fail discretely; the trend cards follow,
    // in document order.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Flow' })).toBeInTheDocument());
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Stalled work', 'Went backwards', 'Churning tasks', 'Fleet scorecard',
      'Autonomy and rework', 'Created vs completed', 'Flow',
    ]);
  });

  it('computes the agent-share header stat from the four counts', async () => {
    renderPage();
    // 6 of 8 completions were agent work; prior window 1 of 4.
    await waitFor(() => expect(screen.getByText(/Agents completed 75% of completed work \(6 of 8\)/)).toBeInTheDocument());
    expect(screen.getByText(/prior window 25%/)).toBeInTheDocument();
  });

  it('is honest about a zero-completion window instead of dividing by zero', async () => {
    mockRpc(ReportService, 'GetReportExceptions', { ...RESPONSE, agentCompleted: '0', humanCompleted: '0' });
    renderPage();
    await waitFor(() => expect(screen.getByText(/No completions in this window yet/)).toBeInTheDocument());
  });

  it('names an empty prior window rather than showing a 0% that means nothing', async () => {
    mockRpc(ReportService, 'GetReportExceptions', { ...RESPONSE, priorAgentCompleted: '0', priorHumanCompleted: '0' });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no completions in the prior window/)).toBeInTheDocument());
  });

  it('refetches with windowDays=90 when the 90-day window is selected', async () => {
    const requests: Array<{ windowDays?: number; projectId?: string }> = [];
    mockRpc(ReportService, 'GetReportExceptions', (body) => {
      requests.push(body);
      return RESPONSE;
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Migrate the billing job')).toBeInTheDocument());
    expect(requests[0]).toMatchObject({ projectId: 'proj-1', windowDays: 30 });

    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    await waitFor(() => expect(requests.some((r) => r.windowDays === 90)).toBe(true));
  });

  it('shows one screen-level empty state when the window has nothing to report', async () => {
    mockRpc(ReportService, 'GetReportExceptions', EMPTY_RESPONSE);
    renderPage();
    await waitFor(() => expect(screen.getByText(/Nothing to report in this window/)).toBeInTheDocument());
  });

  it('has no accessibility violations once populated', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('Migrate the billing job')).toBeInTheDocument());
    await expectNoA11yViolations(container);
  });
});
