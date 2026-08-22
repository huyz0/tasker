import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TaskNoteService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending } from '../../test/mockRpc';
import { HandoffsScreen } from './index';
import { expectNoA11yViolations } from '../../test/a11y';

let mockActiveOrgId: string | null = 'org-1';
let mockActiveProjectId: string | null = 'proj-1';
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    get activeOrgId() { return mockActiveOrgId; },
    get activeProjectId() { return mockActiveProjectId; },
  })),
}));

const locationRef = { current: '' };
function LocationProbe() {
  locationRef.current = useLocation().pathname;
  return null;
}

const ENTRIES = [
  {
    note: { id: 'tnt-1', taskId: 'task-1', agentId: 'agent-1', content: 'Blocked on review, next: rerun tests', createdAt: '2026-08-19T10:00:00.000Z', noteType: 'handoff' },
    taskTitle: 'Fix flaky test',
    taskStatus: 'in_progress',
  },
  {
    note: { id: 'tnt-2', taskId: 'task-2', agentId: 'agent-2', content: 'Migration written, needs a MySQL run before merge', createdAt: '2026-08-19T09:00:00.000Z', noteType: 'handoff' },
    taskTitle: 'Add note_type column',
    taskStatus: 'todo',
  },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/handoffs']}>
        <LocationProbe />
        <Routes>
          <Route path="/handoffs" element={<HandoffsScreen />} />
          <Route path="/tasks/:taskId" element={<div>Task detail page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('HandoffsScreen', () => {
  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
    mockRpc(TaskNoteService, 'ListHandoffNotes', { entries: ENTRIES, page: {} });
  });

  it('lists tasks with a pending handoff note - title, status, excerpt, author, timestamp', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix flaky test')).toBeInTheDocument());
    expect(screen.getByText('Blocked on review, next: rerun tests')).toBeInTheDocument();
    expect(screen.getByText('in_progress')).toBeInTheDocument();
    expect(screen.getByText(/Agent agent-1/)).toBeInTheDocument();

    expect(screen.getByText('Add note_type column')).toBeInTheDocument();
    expect(screen.getByText('Migration written, needs a MySQL run before merge')).toBeInTheDocument();
  });

  it('shows a loading message while the first page is in flight', async () => {
    mockRpcPending(TaskNoteService, 'ListHandoffNotes');
    renderPage();
    expect(screen.getByText('Loading handoffs…')).toBeInTheDocument();
  });

  it('shows an empty message when no task currently has a pending handoff', async () => {
    mockRpc(TaskNoteService, 'ListHandoffNotes', { entries: [], page: {} });
    renderPage();

    await waitFor(() => expect(screen.getByText('No tasks currently have a pending handoff note.')).toBeInTheDocument());
  });

  it('shows a retryable error when the request fails', async () => {
    mockRpcError(TaskNoteService, 'ListHandoffNotes', 'unavailable', 'backend unavailable');
    renderPage();

    await waitFor(() => expect(screen.getByText(/Could not load this list/)).toBeInTheDocument());
    expect(screen.getByText(/backend unavailable/)).toBeInTheDocument();

    mockRpc(TaskNoteService, 'ListHandoffNotes', { entries: ENTRIES, page: {} });
    fireEvent.click(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText('Fix flaky test')).toBeInTheDocument());
  });

  it('navigates to the task on row click', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix flaky test')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Fix flaky test'));

    await waitFor(() => expect(locationRef.current).toBe('/tasks/task-1'));
  });

  it('loads the next page on demand', async () => {
    mockRpc(TaskNoteService, 'ListHandoffNotes', (body: { page?: { cursor?: string } }) =>
      body.page?.cursor
        ? { entries: [ENTRIES[1]], page: {} }
        : { entries: [ENTRIES[0]], page: { nextCursor: 'cursor-2' } },
    );
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix flaky test')).toBeInTheDocument());
    expect(screen.queryByText('Add note_type column')).toBeNull();

    fireEvent.click(screen.getByText('Load more handoffs'));
    await waitFor(() => expect(screen.getByText('Add note_type column')).toBeInTheDocument());
  });

  it('shows "Loading…" on the load-more control while the next page is in flight', async () => {
    mockRpc(TaskNoteService, 'ListHandoffNotes', { entries: [ENTRIES[0]], page: { nextCursor: 'cursor-2' } });
    renderPage();
    await waitFor(() => expect(screen.getByText('Fix flaky test')).toBeInTheDocument());

    const pending = mockRpcPending(TaskNoteService, 'ListHandoffNotes');
    fireEvent.click(screen.getByText('Load more handoffs'));

    await waitFor(() => expect(screen.getByText('Loading…')).toBeInTheDocument());
    pending.resolve({ entries: [ENTRIES[1]], page: {} });
    await waitFor(() => expect(screen.getByText('Add note_type column')).toBeInTheDocument());
  });

  it('asks the user to select an organization when none is active', () => {
    mockActiveOrgId = null;
    renderPage();
    expect(screen.getByText('Select an organization to see its pending handoffs.')).toBeInTheDocument();
  });

  it('asks the user to select a project when an org is active but no project is', () => {
    mockActiveProjectId = null;
    const requests: unknown[] = [];
    mockRpc(TaskNoteService, 'ListHandoffNotes', (body) => {
      requests.push(body);
      return { entries: ENTRIES, page: {} };
    });
    renderPage();
    expect(screen.getByText('Select a project to see its pending handoffs.')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('has no accessibility violations once populated', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('Fix flaky test')).toBeInTheDocument());
    await expectNoA11yViolations(container);
  });
});
