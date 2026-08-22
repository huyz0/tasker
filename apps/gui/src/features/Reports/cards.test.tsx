import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReportService, TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending } from '../../test/mockRpc';
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

const CLAIM_NEVER_STARTED = {
  taskId: 'task-1', taskDisplayId: 'TSK-1', taskTitle: 'Migrate the billing job',
  status: 'in_progress', agentId: 'agent-1', agentName: 'Builder One',
  claimedAt: hoursAgo(30), agentLastSeenAt: hoursAgo(2), neverStarted: true,
};
const CLAIM_WENT_QUIET = {
  taskId: 'task-2', taskDisplayId: 'TSK-2', taskTitle: 'Speed up the search index',
  status: 'in_progress', agentId: 'agent-2', agentName: 'Fixer Two',
  claimedAt: hoursAgo(50), lastSignalAt: hoursAgo(28), agentLastSeenAt: hoursAgo(28), neverStarted: false,
};

const BASE_RESPONSE = {
  stalledClaims: [CLAIM_NEVER_STARTED, CLAIM_WENT_QUIET],
  unclaimed: [],
  regressions: [
    {
      taskId: 'task-4', taskDisplayId: 'TSK-4', taskTitle: 'Fix the login redirect',
      fromStatus: 'done', toStatus: 'in_progress', occurredAt: hoursAgo(5),
      actorType: 'agent', holderAgentId: 'agent-2', holderAgentName: 'Fixer Two',
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
    {
      subjectId: 'agent-gone', subjectName: '(deleted agent)', claimed: '2', completed: '1',
      reopened: '1', handedOff: '0', takenAway: '1', autonomousCompleted: '0',
      openNow: '0',
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

// The T09 trend cards share the screen; at-rest trends keep this file about
// the exception cards. TrendsSection.test.tsx owns the populated states.
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
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Reports exception cards', () => {
  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
    mockRpc(ReportService, 'GetReportExceptions', BASE_RESPONSE);
    mockRpc(ReportService, 'GetReportTrends', EMPTY_TRENDS);
  });

  describe('stalled work', () => {
    it('distinguishes never-started from went-quiet claims', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('Migrate the billing job')).toBeInTheDocument());

      expect(screen.getByText('never started')).toBeInTheDocument();
      expect(screen.getByText('went quiet')).toBeInTheDocument();
      // The never-started row has no signal to date; the went-quiet one does.
      expect(screen.getByText(/no signal since claim/)).toBeInTheDocument();
      expect(screen.getByText(/last signal 1d ago/)).toBeInTheDocument();
    });

    it('unassigns a stalled claim behind a confirmation, with the task’s own assignee pair', async () => {
      // Once the unassign lands, the server no longer reports the row.
      let unassigned = false;
      mockRpc(ReportService, 'GetReportExceptions', () =>
        unassigned
          ? { ...BASE_RESPONSE, stalledClaims: [CLAIM_WENT_QUIET] }
          : BASE_RESPONSE,
      );
      const unassignRequests: Array<{ taskId?: string; agentId?: string }> = [];
      mockRpc(TaskService, 'UnassignTask', (body) => {
        unassignRequests.push(body);
        unassigned = true;
        return { success: true };
      });

      renderPage();
      await waitFor(() => expect(screen.getByText('Migrate the billing job')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Unassign Migrate the billing job' }));

      // The confirmation names the task and the agent, then fires the RPC.
      const dialog = await screen.findByTestId('confirm-dialog');
      expect(within(dialog).getByText(/Builder One/)).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Unassign' }));

      await waitFor(() => expect(unassignRequests).toHaveLength(1));
      expect(unassignRequests[0]).toMatchObject({ taskId: 'task-1', agentId: 'agent-1' });

      // Success invalidates ['reports'], and the refetched window no longer
      // holds the row.
      await waitFor(() => expect(screen.queryByText('Migrate the billing job')).toBeNull());
      expect(screen.getByText('Speed up the search index')).toBeInTheDocument();
    });

    it('fires nothing when the confirmation is cancelled', async () => {
      const unassignRequests: unknown[] = [];
      mockRpc(TaskService, 'UnassignTask', (body) => {
        unassignRequests.push(body);
        return { success: true };
      });

      renderPage();
      await waitFor(() => expect(screen.getByText('Migrate the billing job')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Unassign Migrate the billing job' }));
      const dialog = await screen.findByTestId('confirm-dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).toBeNull());
      expect(unassignRequests).toHaveLength(0);
      expect(screen.getByText('Migrate the billing job')).toBeInTheDocument();
    });

    it('disables only the row whose unassign is in flight', async () => {
      mockRpcPending(TaskService, 'UnassignTask');
      renderPage();
      await waitFor(() => expect(screen.getByText('Migrate the billing job')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Unassign Migrate the billing job' }));
      const dialog = await screen.findByTestId('confirm-dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Unassign' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Unassign Migrate the billing job' })).toBeDisabled(),
      );
      // The M20 lesson: a shared mutation object must not disable its
      // neighbours while only one row is in flight.
      expect(screen.getByRole('button', { name: 'Unassign Speed up the search index' })).toBeEnabled();
    });

    it('surfaces the server’s own words when the unassign fails', async () => {
      mockRpcError(TaskService, 'UnassignTask', 'permission_denied', 'you may not release this claim');
      renderPage();
      await waitFor(() => expect(screen.getByText('Migrate the billing job')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Unassign Migrate the billing job' }));
      const dialog = await screen.findByTestId('confirm-dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Unassign' }));

      await waitFor(() => expect(screen.getByText(/Failed to unassign: .*you may not release this claim/)).toBeInTheDocument());
      // The row is still there — nothing was released.
      expect(screen.getByText('Migrate the billing job')).toBeInTheDocument();
    });

    it('renders a claim that predates activity collection without a claimed-at age', async () => {
      mockRpc(ReportService, 'GetReportExceptions', {
        ...BASE_RESPONSE,
        stalledClaims: [{
          taskId: 'task-9', taskDisplayId: 'TSK-9', taskTitle: 'Restore the nightly export',
          status: 'in_progress', agentId: 'agent-3', agentName: 'Scout Three',
          lastSignalAt: hoursAgo(30), neverStarted: false,
        }],
      });
      renderPage();
      await waitFor(() => expect(screen.getByText('Restore the nightly export')).toBeInTheDocument());
      expect(screen.queryByText(/claimed .* ago/)).toBeNull();
    });

    it('says something specific when nothing is stalled', async () => {
      mockRpc(ReportService, 'GetReportExceptions', { ...BASE_RESPONSE, stalledClaims: [] });
      renderPage();
      await waitFor(() =>
        expect(screen.getByText('Nothing stalled — every claimed task has recent activity.')).toBeInTheDocument(),
      );
    });
  });

  describe('went backwards', () => {
    it('renders the transition, the actor and the holder, with "(deleted agent)" for a purged actor', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('Fix the login redirect')).toBeInTheDocument());

      expect(screen.getByText(/done → in_progress/)).toBeInTheDocument();
      // actorName is absent on the fixture: the acting agent has been purged.
      expect(screen.getByText(/by \(deleted agent\)/)).toBeInTheDocument();
      expect(screen.getByText(/held by Fixer Two/)).toBeInTheDocument();
    });

    it('has a specific empty state', async () => {
      mockRpc(ReportService, 'GetReportExceptions', { ...BASE_RESPONSE, regressions: [] });
      renderPage();
      await waitFor(() =>
        expect(screen.getByText('No terminal work reopened in this window.')).toBeInTheDocument(),
      );
    });

    it('omits the holder when the regression event had none', async () => {
      mockRpc(ReportService, 'GetReportExceptions', {
        ...BASE_RESPONSE,
        regressions: [{
          taskId: 'task-6', taskDisplayId: 'TSK-6', taskTitle: 'Harden the webhook retries',
          fromStatus: 'done', toStatus: 'todo', occurredAt: hoursAgo(3),
          actorType: 'user', actorName: 'Huy Nguyen',
        }],
      });
      renderPage();
      await waitFor(() => expect(screen.getByText(/by Huy Nguyen/)).toBeInTheDocument());
      expect(screen.queryByText(/held by/)).toBeNull();
    });
  });

  describe('churning tasks', () => {
    it('shows the handoff count, the still-claimed warning and the handoffs cross-link', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('Refactor the mailer')).toBeInTheDocument());

      expect(screen.getByText(/3 handoffs/)).toBeInTheDocument();
      // claimHeld: the last handing-off agent still holds the claim, so no
      // other agent can pick the task up.
      expect(screen.getByText('still claimed')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'View handoff notes' })).toHaveAttribute('href', '/handoffs');
    });

    it('shows no still-claimed warning when the claim was released', async () => {
      mockRpc(ReportService, 'GetReportExceptions', {
        ...BASE_RESPONSE,
        churning: [{
          taskId: 'task-5', taskDisplayId: 'TSK-5', taskTitle: 'Refactor the mailer',
          handoffCount: '2', lastAgentId: 'agent-2', lastAgentName: 'Fixer Two',
          lastHandoffAt: hoursAgo(8), claimHeld: false,
        }],
      });
      renderPage();
      await waitFor(() => expect(screen.getByText('Refactor the mailer')).toBeInTheDocument());
      expect(screen.queryByText('still claimed')).toBeNull();
    });
  });

  describe('fleet scorecard', () => {
    it('renders a real table with the outcome columns and a purged agent as given', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByRole('cell', { name: 'Builder One' })).toBeInTheDocument());

      // Scoped to the card: the trend charts each expose an sr-only table of
      // their own, so a bare getByRole('table') is ambiguous on this screen.
      const card = screen.getByRole('heading', { name: 'Fleet scorecard' }).closest('section') as HTMLElement;
      const table = within(card).getByRole('table');
      for (const column of ['Name', 'Claimed', 'Completed', 'Reopened', 'Handed off', 'Taken away', 'Autonomous', 'Open now', 'Last active']) {
        expect(within(table).getByRole('columnheader', { name: column })).toBeInTheDocument();
      }
      expect(screen.getByRole('cell', { name: '(deleted agent)' })).toBeInTheDocument();
    });

    it('says so when no agent activity was recorded, while other cards still have data', async () => {
      mockRpc(ReportService, 'GetReportExceptions', { ...BASE_RESPONSE, agentRows: [], roleRows: [] });
      renderPage();
      await waitFor(() =>
        expect(screen.getByText('No agent activity recorded in this window.')).toBeInTheDocument(),
      );
    });

    it('toggles between per-agent and per-role rows', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByRole('cell', { name: 'Builder One' })).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Roles' }));
      expect(screen.getByRole('cell', { name: 'Builder' })).toBeInTheDocument();
      expect(screen.queryByRole('cell', { name: 'Builder One' })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
      expect(screen.getByRole('cell', { name: 'Builder One' })).toBeInTheDocument();
    });
  });
});
