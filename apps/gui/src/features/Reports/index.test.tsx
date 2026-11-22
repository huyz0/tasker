import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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

function HistoryControls() {
  const location = useLocation(), navigate = useNavigate();
  return <><output aria-label="Fixture location">{location.pathname + location.search + location.hash}</output>
    <button onClick={() => navigate(-1)}>Fixture Back</button><button onClick={() => navigate(1)}>Fixture Forward</button></>;
}
function renderPage(entry = '/reports', history = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        {history && <HistoryControls />}
        <Routes>
          <Route path="/reports" element={<ReportsScreen />} />
          <Route path="/tasks/:taskId" element={<div>Task detail page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ReportsScreen', () => {
  it('offers named views beside report settings in a resolved URL project', async () => {
    renderPage('/reports?org=org-1&project=proj-1&days=90');
    expect(await screen.findByRole('button', { name: 'Saved views' })).toBeEnabled();
  });

  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
    mockRpc(ReportService, 'GetReportExceptions', RESPONSE);
    mockRpc(ReportService, 'GetReportTrends', EMPTY_TRENDS);
    mockRpc(ReportService, 'GetUsageReport', { totals: { reports: '0' }, byAgent: [], byProject: [], byDay: [], since: '' });
  });

  it('navigates report sections with preserved scope, window, history and focus', async () => {
    renderPage('/reports?org=org-1&project=proj-1&days=90&marker=keep', true);
    const navigation = await screen.findByRole('navigation', { name: 'Report sections' });
    fireEvent.click(within(navigation).getByRole('link', { name: 'Trends' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Reports — Trends' })).toHaveFocus();
    expect(await screen.findByRole('heading', { name: 'Flow' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Stalled work' })).not.toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'Trends' })).toHaveAttribute('aria-current', 'location');
    expect(screen.getByLabelText('Fixture location')).toHaveTextContent('#trends');
    const sevenDays = screen.getByRole('button', { name: '7 days' });
    sevenDays.focus();fireEvent.click(sevenDays);
    expect(sevenDays).toHaveFocus();
    expect(screen.getByLabelText('Fixture location')).toHaveTextContent('#trends');
    expect(screen.getByLabelText('Fixture location')).toHaveTextContent('marker=keep');
    fireEvent.click(screen.getByRole('button', { name: 'Fixture Back' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true'));
    expect(within(navigation).getByRole('link', { name: 'Trends' })).toHaveAttribute('aria-current', 'location');
    fireEvent.click(screen.getByRole('button', { name: 'Fixture Back' }));
    expect(await screen.findByRole('heading', { name: 'Stalled work' })).toBeVisible();
    expect(within(navigation).getByRole('link', { name: 'Exceptions' })).toHaveAttribute('aria-current', 'location');
    fireEvent.click(screen.getByRole('button', { name: 'Fixture Forward' }));
    expect(await screen.findByRole('heading', { name: 'Flow' })).toBeVisible();
    expect(screen.getByLabelText('Fixture location')).toHaveTextContent('org=org-1');
    expect(screen.getByLabelText('Fixture location')).toHaveTextContent('project=proj-1');
  });

  it('retains a committed window when a section is activated before the router catches up', () => {
    const previousUrl = window.location.href, previousState = window.history.state;
    try {
      renderPage('/reports?org=org-1&project=proj-1&days=7&marker=keep', true);
      window.history.pushState({ key: 'committed-window' }, '', '/reports?org=org-1&project=proj-1&days=90&marker=keep');
      fireEvent.click(screen.getByRole('link', { name: 'Trends' }));
      expect(screen.getByLabelText('Fixture location')).toHaveTextContent('days=90');
      expect(screen.getByLabelText('Fixture location')).toHaveTextContent('marker=keep#trends');
    } finally {
      window.history.replaceState(previousState, '', previousUrl);
    }
  });

  it('opens a direct spend location while exceptions are still loading', async () => {
    mockRpcPending(ReportService, 'GetReportExceptions');
    renderPage('/reports?org=org-1&project=proj-1&days=7#spend');
    expect(await screen.findByRole('heading', { level: 1, name: 'Reports — Spend' })).toBeVisible();
    expect(await screen.findByText('No agent reported usage in this window.')).toBeVisible();
    expect(screen.getByText('Loading project reports…')).not.toBeVisible();
    expect(screen.getByRole('link', { name: 'Spend' })).toHaveAttribute('aria-current', 'location');
  });

  it('recovers a malformed section without dropping project or query settings', async () => {
    renderPage('/reports?org=org-1&project=proj-1&days=90&marker=keep#%E0%A4%', true);
    const notice = await screen.findByRole('status', { name: 'Report section recovery' });
    expect(notice).toHaveTextContent('This report section is unavailable. Showing Exceptions.');
    expect(notice).not.toHaveTextContent('%E0%A4%');
    fireEvent.click(within(notice).getByRole('link', { name: 'Show exceptions' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Reports' })).toHaveFocus();
    expect(screen.queryByRole('status', { name: 'Report section recovery' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Fixture location')).toHaveTextContent('days=90');
    expect(screen.getByLabelText('Fixture location')).toHaveTextContent('marker=keep#exceptions');
  });

  it('uses a deep-linked report window for exceptions, trends and spend', async () => {
    const requests: { source: string; windowDays?: number; days?: number }[] = [];
    mockRpc(ReportService, 'GetReportExceptions', body => { requests.push({ source: 'exceptions', ...body });return RESPONSE; });
    mockRpc(ReportService, 'GetReportTrends', body => { requests.push({ source: 'trends', ...body });return EMPTY_TRENDS; });
    mockRpc(ReportService, 'GetUsageReport', body => { requests.push({ source: 'spend', ...body });return { totals: { reports: '0' }, byAgent: [], byProject: [], byDay: [], since: '' }; });
    renderPage('/reports?org=org-1&project=proj-1&days=90');
    expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests.every(request => request.windowDays === 90 || request.days === 90)).toBe(true);
  });
  it('restores report windows with browser history and keeps unrelated parameters', async () => {
    renderPage('/reports?org=org-1&project=proj-1&marker=keep', true);
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(screen.getByLabelText('Fixture location')).toHaveTextContent('days=7');
    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fixture Back' }));
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Fixture Forward' }));
    expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Fixture location')).toHaveTextContent('org=org-1');
    expect(screen.getByLabelText('Fixture location')).toHaveTextContent('project=proj-1');
    expect(screen.getByLabelText('Fixture location')).toHaveTextContent('marker=keep');
  });
  it('recovers an unsupported report window using the existing default and a scoped reset', async () => {
    renderPage('/reports?org=org-1&project=proj-1&days=999&marker=keep', true);
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(screen.getByLabelText('Fixture location')).not.toHaveTextContent('days=');
    expect(screen.getByLabelText('Fixture location')).toHaveTextContent('project=proj-1');
    expect(screen.getByLabelText('Fixture location')).toHaveTextContent('marker=keep');
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

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Stalled work', 'Went backwards', 'Churning tasks', 'Fleet scorecard',
    ]);
    const navigation = screen.getByRole('navigation', { name: 'Report sections' });
    fireEvent.click(within(navigation).getByRole('link', { name: 'Trends' }));
    await screen.findByRole('heading', { name: 'Flow' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Autonomy and rework', 'Created vs completed', 'Flow',
    ]);
    fireEvent.click(within(navigation).getByRole('link', { name: 'Spend' }));
    expect(await screen.findByRole('heading', { name: 'Agent spend' })).toBeVisible();
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
