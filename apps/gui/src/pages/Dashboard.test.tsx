import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const { mockGetDashboard } = vi.hoisted(() => ({ mockGetDashboard: vi.fn() }));

vi.mock('@connectrpc/connect-web', () => ({ createConnectTransport: vi.fn(() => ({})) }));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({ getDashboard: mockGetDashboard })),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({ DashboardService: {} }));

let mockActiveOrgId = 'org-1';
let mockActiveProjectId = 'proj-1';
vi.mock('../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    get activeOrgId() { return mockActiveOrgId; },
    get activeProjectId() { return mockActiveProjectId; },
  })),
}));

import { Dashboard } from './Dashboard';

const EMPTY = {
  awaitingReview: [], awaitingReviewCount: 0n,
  disagreements: [], disagreementCount: 0n,
  agents: [], recentActivity: [],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><Dashboard /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    mockGetDashboard.mockReset();
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
  });

  it('asks the server once, rather than counting entities itself', async () => {
    mockGetDashboard.mockResolvedValue(EMPTY);
    renderPage();
    await waitFor(() => expect(mockGetDashboard).toHaveBeenCalledTimes(1));
    expect(mockGetDashboard).toHaveBeenCalledWith({ orgId: 'org-1', projectId: 'proj-1' });
  });

  it('shows the review queue with the count of everything behind it', async () => {
    // The panel lists a page; the number is the whole queue. Showing the
    // rendered count instead would understate the backlog, which is the
    // mistake the old board made before per-column counts (M07-T03).
    mockGetDashboard.mockResolvedValue({
      ...EMPTY,
      awaitingReview: [{ id: 't1', displayId: 'ENG-1', title: 'Needs a look', status: 'in-progress', projectId: 'proj-1' }],
      awaitingReviewCount: 17n,
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Needs a look')).toBeInTheDocument());
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Needs a look/ })).toHaveAttribute('href', '/tasks/t1');
  });

  it('reports a task claiming done while its pull request is open', async () => {
    mockGetDashboard.mockResolvedValue({
      ...EMPTY,
      disagreements: [{
        task: { id: 't9', displayId: 'ENG-9', title: 'Claimed finished', status: 'done', projectId: 'proj-1' },
        pullRequestId: '42', pullRequestTitle: 'wip', pullRequestStatus: 'open', pullRequestUrl: 'http://x/42',
      }],
      disagreementCount: 1n,
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Claimed finished')).toBeInTheDocument());
    expect(screen.getByText(/PR #42 open/)).toBeInTheDocument();
  });

  it('marks an agent silent past a day, and one that never called at all', async () => {
    mockGetDashboard.mockResolvedValue({
      ...EMPTY,
      agents: [
        { id: 'a1', name: 'Quiet', lastUsedAt: new Date(Date.now() - 9 * 86_400_000).toISOString(), openTaskCount: 3n },
        { id: 'a2', name: 'Busy', lastUsedAt: new Date().toISOString(), openTaskCount: 0n },
        { id: 'a3', name: 'NeverStarted', lastUsedAt: undefined, openTaskCount: 0n },
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Quiet')).toBeInTheDocument());
    expect(screen.getByText('9d ago')).toBeInTheDocument();
    expect(screen.getByText('active in the last hour')).toBeInTheDocument();
    // "never called" is a deployment that did not start — a different failure
    // from one that stopped, and it must not read as simply old.
    expect(screen.getByText('never called')).toBeInTheDocument();
    expect(screen.getByText('3 open')).toBeInTheDocument();
  });

  it('does not show an open-work count for an agent holding nothing', async () => {
    mockGetDashboard.mockResolvedValue({
      ...EMPTY,
      agents: [{ id: 'a2', name: 'Idle', lastUsedAt: new Date().toISOString(), openTaskCount: 0n }],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Idle')).toBeInTheDocument());
    expect(screen.queryByText('0 open')).toBeNull();
  });

  it('distinguishes a note from a comment in the activity feed', async () => {
    mockGetDashboard.mockResolvedValue({
      ...EMPTY,
      recentActivity: [
        { taskId: 't1', taskDisplayId: 'ENG-1', taskTitle: 'T', agentId: 'a1', agentName: 'Scout', kind: 'note', excerpt: 'ran the migration', createdAt: new Date().toISOString() },
        { taskId: 't2', taskDisplayId: 'ENG-2', taskTitle: 'T', agentId: 'a1', agentName: 'Scout', kind: 'comment', excerpt: 'opened a PR', createdAt: new Date().toISOString() },
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('ran the migration')).toBeInTheDocument());
    expect(screen.getByText('noted on')).toBeInTheDocument();
    expect(screen.getByText('commented on')).toBeInTheDocument();
  });

  it('says each panel is empty rather than leaving a blank card', async () => {
    mockGetDashboard.mockResolvedValue(EMPTY);
    renderPage();

    await waitFor(() => expect(screen.getByText('Nothing is waiting on your review.')).toBeInTheDocument());
    expect(screen.getByText('Every finished task has a settled pull request.')).toBeInTheDocument();
    expect(screen.getByText('No agents in this organization.')).toBeInTheDocument();
    expect(screen.getByText('No agent activity yet.')).toBeInTheDocument();
  });

  it('scopes to the organization alone when no project is chosen', async () => {
    mockActiveProjectId = '';
    mockGetDashboard.mockResolvedValue(EMPTY);
    renderPage();
    await waitFor(() => expect(mockGetDashboard).toHaveBeenCalledTimes(1));
    // `projectId: ''` would narrow to a project that does not exist and return
    // an empty screen; the org-wide answer is the right default.
    expect(mockGetDashboard).toHaveBeenCalledWith({ orgId: 'org-1', projectId: undefined });
  });

  it('reads an hours-old agent as still active', async () => {
    mockGetDashboard.mockResolvedValue({
      ...EMPTY,
      agents: [{ id: 'a1', name: 'Recent', lastUsedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(), openTaskCount: 0n }],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('5h ago')).toBeInTheDocument());
  });

  it('surfaces a failed load with a way to retry, instead of empty panels', async () => {
    mockGetDashboard.mockRejectedValue(new Error('unavailable'));
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('unavailable'));
    // Empty panels would read as "nothing needs you", which is the opposite of
    // what a failed load means (M06-T11).
    expect(screen.queryByText('Nothing is waiting on your review.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(mockGetDashboard).toHaveBeenCalledTimes(2));
  });

  it('asks for nothing until an organization is chosen', async () => {
    mockActiveOrgId = '';
    mockGetDashboard.mockResolvedValue(EMPTY);
    renderPage();

    await waitFor(() => expect(screen.getByText('No organization selected.')).toBeInTheDocument());
    expect(mockGetDashboard).not.toHaveBeenCalled();
  });
});
