import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  TaskService, CommentService, LabelService, RepositoryService, TaskTypeService,
  TaskNoteService, OrgService, AgentService, ArtifactService, SearchService, ProjectService,
} from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending, server } from '../../test/mockRpc';
import { http, HttpResponse } from 'msw';
import { BACKEND_URL } from '../../lib/backendUrl';

let mockActiveProjectId = 'proj-1';
let mockActiveOrgId = 'org-1';
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    get activeProjectId() { return mockActiveProjectId; },
    get activeOrgId() { return mockActiveOrgId; },
  })),
}));
// The description editor is lazy-loaded and, per ADR-0018, its own
// RichMarkdownEditor.test.tsx already covers its internal value/onChange
// wiring against a mocked @mdxeditor/editor. This file only needs to prove
// Tasks/index.tsx wires editDescription through to whatever renders here,
// so a plain controlled textarea stands in for it rather than re-mocking
// @mdxeditor/editor a second time.
vi.mock('../../components/ui/RichMarkdownEditor', () => ({
  RichMarkdownEditor: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  ),
}));

import { TasksWorkbench } from './index';
import { confirmAction, cancelAction } from '../../test/confirm';

// The open task is a route param, so every render needs the same `/tasks` and
// `/tasks/:taskId` pair the app mounts. `initialEntry` lets a test start on a
// deep link; `locationRef` lets it assert where a click navigated to.
const locationRef = { current: '' };

function LocationProbe() {
  locationRef.current = useLocation().pathname;
  return null;
}

function page(initialEntry = '/tasks') {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/tasks" element={<TasksWorkbench />} />
        <Route path="/tasks/:taskId" element={<TasksWorkbench />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderPage(initialEntry = '/tasks') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>{page(initialEntry)}</QueryClientProvider>
  );
}

/**
 * Registers ListTasks and GetTask together from one fixture array, mirroring
 * how the real server relates the two: ListTasks answers one status column
 * at a time (the board asks one facet per column, M07-T03) and GetTask looks
 * the id up directly - the deep-link/detail-panel path a loaded column need
 * not cover (M07-T01).
 */
function withTasks(tasks: any[], page: object = {}) {
  const listRequests: any[] = [];
  mockRpc(TaskService, 'ListTasks', (body: { status?: string }) => {
    listRequests.push(body);
    if (!body.status) return { tasks, page };
    const filtered = tasks.filter((t) => (t.status || 'todo') === body.status);
    return { tasks: filtered, page: { totalCount: filtered.length, ...page } };
  });
  mockRpc(TaskService, 'GetTask', (body: { taskId: string }) => {
    const match = tasks.find((t) => t.id === body.taskId);
    return { task: match ?? { id: body.taskId, title: '', status: 'todo', description: '' } };
  });
  return listRequests;
}

describe('TasksWorkbench', () => {
  beforeEach(() => {
    mockActiveProjectId = 'proj-1';
    mockActiveOrgId = 'org-1';
    // Board columns for custom statuses come from the project's task types now,
    // not from scanning every task in the project (M07-T03). Default to none;
    // the tests that care declare their own.
    mockRpc(TaskTypeService, 'ListTaskTypes', { taskTypes: [] });
    mockRpc(ProjectService, 'GetProject', { project: { id: 'proj-1', name: 'Seed Project' } });
    mockRpc(CommentService, 'ListComments', { comments: [] });
    mockRpc(LabelService, 'ListEntityLabels', { labels: [] });
    mockRpc(LabelService, 'ListLabels', { labels: [] });
    mockRpc(RepositoryService, 'ListPullRequests', { pullRequests: [] });
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [] });
    // AssigneePicker (M05-T04) reads the member/agent catalogues; ReviewerPicker
    // reads the reviewer list. None of these are under test here.
    mockRpc(OrgService, 'ListOrgMembers', { members: [], page: {} });
    mockRpc(AgentService, 'ListAgents', { agents: [], page: {} });
    mockRpc(TaskService, 'ListTaskReviewers', { reviewers: [] });
    mockRpc(TaskService, 'AssignTask', {});
    mockRpc(TaskService, 'UnassignTask', {});
    mockRpc(TaskService, 'AddTaskReviewer', {});
    mockRpc(TaskService, 'RemoveTaskReviewer', {});
    // TaskArtifactLinks (M05-T06) renders inside the detail panel for every
    // task it opens.
    mockRpc(ArtifactService, 'ListTaskArtifactLinks', { links: [] });
    mockRpc(SearchService, 'UniversalSearch', { results: [] });
  });

  it('updates a task status via the detail panel dropdown', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    const requests: any[] = [];
    mockRpc(TaskService, 'UpdateTaskStatus', (body) => {
      requests.push(body);
      return { task: { id: 'task-1', title: 'Fix bug', status: 'in-progress', description: '' } };
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    const select = await screen.findByDisplayValue('Todo');
    fireEvent.change(select, { target: { value: 'in-progress' } });

    await waitFor(() => expect(requests).toContainEqual({ taskId: 'task-1', status: 'in-progress' }));
  });

  // Native HTML5 drag-and-drop (no dnd-kit), added alongside the existing
  // dropdown rather than replacing it - the dropdown stays the accessible/
  // keyboard path for changing status.
  function fakeDataTransfer() {
    const store: Record<string, string> = {};
    return {
      setData: (k: string, v: string) => { store[k] = v; },
      getData: (k: string) => store[k] ?? '',
      dropEffect: '',
      effectAllowed: '',
    };
  }

  it('moves a task to another column by dragging its card', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    const requests: any[] = [];
    mockRpc(TaskService, 'UpdateTaskStatus', (body) => {
      requests.push(body);
      return { task: { id: 'task-1', title: 'Fix bug', status: 'in-progress', description: '' } };
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());

    const card = screen.getByText('Fix bug').closest('[draggable="true"]') as HTMLElement;
    expect(card).not.toBeNull();
    // The column wrapper is the drop target - the "+" button's grandparent,
    // since the button sits in the column's header row, itself a direct
    // child of the column.
    // The empty column also renders a second "Add task to X" button (the
    // dashed placeholder), so this must take the first match - the one in
    // the column's header row, whose grandparent is the column itself.
    const inProgressColumn = screen.getAllByLabelText('Add task to In Progress')[0].parentElement!.parentElement as HTMLElement;

    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragEnter(inProgressColumn, { dataTransfer });
    fireEvent.drop(inProgressColumn, { dataTransfer });

    await waitFor(() => expect(requests).toContainEqual({ taskId: 'task-1', status: 'in-progress' }));
  });

  it('shows an error if a drag-and-drop status move fails', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    mockRpcError(TaskService, 'UpdateTaskStatus', 'unknown', 'transition not allowed');

    renderPage();
    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());

    const card = screen.getByText('Fix bug').closest('[draggable="true"]') as HTMLElement;
    const doneColumn = screen.getAllByLabelText('Add task to Done')[0].parentElement!.parentElement as HTMLElement;

    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.drop(doneColumn, { dataTransfer });

    expect(await screen.findByText(/Failed to move task:.*transition not allowed/)).toBeInTheDocument();
  });

  it('passes a task\'s existing assignees through to the picker in the detail panel', async () => {
    withTasks([{
      id: 'task-1', title: 'Fix bug', status: 'todo', description: '',
      assignees: [{ userId: 'u-1', agentId: '', name: 'Ada Lovelace' }],
    }]);

    renderPage();
    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
  });

  it('asks the server for one column at a time, rather than the whole project', async () => {
    // This replaces a test that asserted the board looped the cursor until the
    // project was exhausted. That was the defect, not the contract: at the
    // 50,000-task scale target it is 500 sequential round trips before the
    // first column paints (M07-T03).
    const requests = withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }], { totalCount: 1 });

    renderPage();
    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());

    const statusesAsked = requests.map((req) => req.status).filter(Boolean);
    expect(statusesAsked).toEqual(expect.arrayContaining(['todo', 'in-progress', 'done']));
    // Every board request names a status and a bounded page.
    for (const req of requests) {
      if (!req.status) continue;
      expect(req.page.limit).toBe(20);
    }
  });

  it('offers Load more when a column has pages left, and appends them', async () => {
    // A column of 16,667 shows 20. The way to the rest is per column, because
    // the pages belong to the column rather than to the project (M07-T03).
    mockRpc(TaskService, 'ListTasks', (req: any) => {
      if (req.status !== 'todo') return { tasks: [], page: { totalCount: 0 } };
      return req.page?.cursor
        ? { tasks: [{ id: 'task-2', title: 'Second page task', status: 'todo' }], page: { totalCount: 2 } }
        : { tasks: [{ id: 'task-1', title: 'First page task', status: 'todo' }], page: { nextCursor: 'c2', totalCount: 2 } };
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('First page task')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Load more/ }));
    await waitFor(() => expect(screen.getByText('Second page task')).toBeDefined());
    // The first page is still there: pages accumulate rather than replace.
    expect(screen.getByText('First page task')).toBeDefined();
  });

  it('does not offer Load more when the column is fully loaded', async () => {
    withTasks([{ id: 'task-1', title: 'Only task', status: 'todo' }]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Only task')).toBeDefined());
    expect(screen.queryByRole('button', { name: /Load more/ })).toBeNull();
  });

  it('surfaces a failed column without claiming the column is empty', async () => {
    server.use(
      http.post(`${BACKEND_URL}/${TaskService.typeName}/ListTasks`, async ({ request }) => {
        const body = await request.json().catch(() => ({})) as { status?: string };
        if (body.status === 'todo') {
          return HttpResponse.json({ code: 'unavailable', message: 'column unavailable' }, { status: 400 });
        }
        return HttpResponse.json({ tasks: [], page: { totalCount: 0 } });
      }),
    );

    renderPage();
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(/column unavailable/);
  });

  it('reads the open task by id, so a deep link works when its page is not loaded', async () => {
    // The board is paged now, so the task a URL names need not be in any loaded
    // column. `getTask` also carries `description`, which the list projects
    // away (M07-T01).
    mockRpc(TaskService, 'ListTasks', { tasks: [], page: { totalCount: 0 } });
    mockRpc(TaskService, 'GetTask', {
      task: { id: 'task-99', title: 'Deep linked task', status: 'todo', description: 'Body only getTask returns', displayId: 'ENG-99' },
    });

    renderPage('/tasks/task-99');

    await waitFor(() => expect(screen.getByText('Deep linked task')).toBeDefined());
    expect(screen.getByText('Body only getTask returns')).toBeDefined();
  });

  it('shows each column the count the server reports, not the number of cards loaded', async () => {
    // A page of 20 cards in a column of 16,667 must still say 16,667. Counting
    // the rendered cards is exactly what the whole-project fetch existed for.
    mockRpc(TaskService, 'ListTasks', (req: any) => ({
      tasks: req.status === 'todo' ? [{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }] : [],
      page: { totalCount: req.status === 'todo' ? 16667 : 0 },
    }));

    renderPage();
    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    expect(screen.getByText('16667')).toBeInTheDocument();
  });

  it('shows a pull request badge on a task it is linked to, using real data not a hardcoded placeholder', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-1' }]);
    mockRpc(RepositoryService, 'ListPullRequests', {
      pullRequests: [{ id: 'pr-1', taskId: 'task-1', remotePrId: '42', title: 'ENG-1: fix bug', status: 'open', url: 'http://example.com/pr/42' }],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('#42')).toBeDefined());
  });

  it('shows an error message when the status update fails', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    mockRpcError(TaskService, 'UpdateTaskStatus', 'unknown', 'not a member');

    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    const select = await screen.findByDisplayValue('Todo');
    fireEvent.change(select, { target: { value: 'done' } });

    await waitFor(() => expect(screen.getByText(/Failed to update status/)).toBeDefined());
  });

  it('deletes a task after confirmation and closes the detail panel', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    const requests: any[] = [];
    mockRpc(TaskService, 'DeleteTask', (body) => {
      requests.push(body);
      return { success: true };
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);
    await confirmAction();

    await waitFor(() => expect(requests).toContainEqual({ taskId: 'task-1' }));
    await waitFor(() => expect(screen.queryByText('Task Details')).toBeNull());
  });

  it('does not delete a task when the confirmation is dismissed', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    const requests: any[] = [];
    mockRpc(TaskService, 'DeleteTask', (body) => {
      requests.push(body);
      return { success: true };
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);
    await cancelAction();

    expect(requests).toHaveLength(0);
  });

  it('renders a task using a custom task-type status instead of hiding it', async () => {
    withTasks([{ id: 'task-1', title: 'Custom flow task', status: 'in-review', description: '', taskTypeId: 'tt-1' }]);
    mockRpc(TaskTypeService, 'ListTaskTypes', { taskTypes: [{ id: 'tt-1', name: 'Custom' }] });
    mockRpc(TaskTypeService, 'GetTaskType', {
      taskType: { id: 'tt-1' },
      statuses: [{ id: 's-1', name: 'backlog' }, { id: 's-2', name: 'in-review' }, { id: 's-3', name: 'shipped' }],
      transitions: [],
    });
    const requests: any[] = [];
    mockRpc(TaskService, 'UpdateTaskStatus', (body) => {
      requests.push(body);
      return {};
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Custom flow task')).toBeDefined());
    expect(screen.getByText('in-review')).toBeDefined();

    fireEvent.click(screen.getByText('Custom flow task'));
    const select = await screen.findByDisplayValue('in-review');
    expect(screen.getByRole('option', { name: 'backlog' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'shipped' })).toBeDefined();

    fireEvent.change(select, { target: { value: 'shipped' } });
    await waitFor(() => expect(requests).toContainEqual({ taskId: 'task-1', status: 'shipped' }));
  });

  it('shows an error message when task deletion fails', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    mockRpcError(TaskService, 'DeleteTask', 'unknown', 'not an admin');

    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);
    await confirmAction();

    await waitFor(() => expect(screen.getByText(/Failed to delete task/)).toBeDefined());
  });

  it('opens a task from the keyboard, via a real button rather than a div', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    renderPage();

    // The card used to be a `role="button"` div with a hand-written onKeyDown,
    // which nested AssigneePicker's own button inside it — axe flagged
    // `nested-interactive` on every card. The title is a real <button> now, so
    // keyboard activation is the element's own native behaviour rather than
    // something this component reimplements.
    //
    // jsdom does not synthesise a click from Enter the way a browser does, so
    // asserting the element *is* a button is what proves keyboard support here;
    // the e2e suite exercises the real key press against a real browser.
    const title = await screen.findByRole('button', { name: 'Fix bug' });
    expect(title.tagName).toBe('BUTTON');

    fireEvent.click(title);
    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
  });

  it('shows pending labels while deleting and while updating status', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: 'Some **markdown** body' }]);
    const pendingDelete = mockRpcPending(TaskService, 'DeleteTask');
    const pendingUpdate = mockRpcPending(TaskService, 'UpdateTaskStatus');

    renderPage();
    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    const select = await screen.findByDisplayValue('Todo');
    fireEvent.change(select, { target: { value: 'in-progress' } });
    await waitFor(() => expect(select).toBeDisabled());
    pendingUpdate.resolve({ task: { id: 'task-1', title: 'Fix bug', status: 'in-progress', description: 'Some **markdown** body' } });

    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);
    await confirmAction();
    await waitFor(() => expect(screen.getByText('Moving to bin...')).toBeInTheDocument());
    pendingDelete.resolve({ success: true });
  });

  it('defaults a task with no status to the todo column, both on the board and in the detail panel', async () => {
    withTasks([{ id: 'task-1', title: 'No status task', description: '' }]);
    mockRpc(RepositoryService, 'ListPullRequests', {
      pullRequests: [{ id: 'pr-1', taskId: '', remotePrId: '1', title: 'orphan pr', status: 'open', url: 'http://x' }],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('No status task')).toBeDefined());
    fireEvent.click(screen.getByText('No status task'));

    await screen.findByDisplayValue('Todo');
  });

  it('ignores non-activation keys on a task card', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.keyDown(screen.getByText('Fix bug'), { key: 'Tab' });

    expect(screen.queryByText('Task Details')).toBeNull();
  });

  it('closes the detail panel via the close button', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Close task details'));

    await waitFor(() => expect(screen.queryByText('Task Details')).toBeNull());
  });

  it('closes the detail overlay when pressing Escape', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByText('Task Details')).toBeNull());
  });

  it('does not close on unrelated key presses while the overlay is open', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
    fireEvent.keyDown(window, { key: 'Tab' });

    expect(screen.getByText('Task Details')).toBeInTheDocument();
  });

  it('shows a breadcrumb from the project to the task', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'SEED-1' }]);
    const projectRequests: any[] = [];
    mockRpc(ProjectService, 'GetProject', (body) => {
      projectRequests.push(body);
      return { project: { id: 'proj-1', name: 'Seed Project' } };
    });
    renderPage('/tasks/task-1');

    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    // The real project name, resolved from its id — the request that fetches it
    // used the wrong field name at first and the fallback label hid it
    // completely (M06-T08).
    await waitFor(() => expect(crumbs.textContent).toContain('Seed Project'));
    expect(crumbs.textContent).toContain('SEED-1');
    expect(projectRequests).toContainEqual({ id: 'proj-1' });
  });

  it('closes the detail overlay when clicking the backdrop', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
    fireEvent.click(screen.getByTestId('dialog-backdrop'));

    await waitFor(() => expect(screen.queryByText('Task Details')).toBeNull());
  });

  it('does not close the overlay when clicking inside the panel', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
    fireEvent.click(screen.getByText('Task Details'));

    expect(screen.getByText('Task Details')).toBeInTheDocument();
  });

  it('edits a task title and description through the GUI', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: 'Old desc' }]);
    const requests: any[] = [];
    mockRpc(TaskService, 'UpdateTask', (body) => {
      requests.push(body);
      return { task: { id: 'task-1', title: 'Fix the bug', status: 'todo', description: 'New desc' } };
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));

    const titleInput = screen.getByDisplayValue('Fix bug');
    fireEvent.change(titleInput, { target: { value: 'Fix the bug' } });
    // The description field is behind React.lazy/Suspense (M23-T03) — it
    // isn't there on the same tick "Edit" is clicked.
    const descriptionInput = await screen.findByDisplayValue('Old desc');
    fireEvent.change(descriptionInput, { target: { value: 'New desc' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(requests).toContainEqual({ taskId: 'task-1', title: 'Fix the bug', description: 'New desc' }));
  });

  it('shows a pending label while saving a task edit', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    const pending = mockRpcPending(TaskService, 'UpdateTask');
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));
    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText('Saving...')).toBeInTheDocument());
    pending.resolve({ task: { id: 'task-1', title: 'Fix bug', status: 'todo', description: '' } });
  });

  it('cancels editing a task without saving', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    const requests: any[] = [];
    mockRpc(TaskService, 'UpdateTask', (body) => {
      requests.push(body);
      return {};
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));
    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByDisplayValue('Fix bug')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getAllByText('Fix bug').length).toBeGreaterThan(0);
    expect(requests).toHaveLength(0);
  });

  it('shows an error message when updating a task fails', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    mockRpcError(TaskService, 'UpdateTask', 'unknown', 'task not found');
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));
    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to update task/)).toBeInTheDocument());
  });

  it('resets edit mode when a different task is expanded', async () => {
    withTasks([
      { id: 'task-1', title: 'Fix bug', status: 'todo', description: '' },
      { id: 'task-2', title: 'Write docs', status: 'todo', description: '' },
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));
    await waitFor(() => expect(screen.getByText('Task Details')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByDisplayValue('Fix bug')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Write docs'));
    await waitFor(() => expect(screen.queryByDisplayValue('Fix bug')).toBeNull());
  });

  it('shows agent notes for a task and edits one', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [{ id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Investigated root cause' }] });
    const requests: any[] = [];
    mockRpc(TaskNoteService, 'UpdateTaskNote', (body) => {
      requests.push(body);
      return { taskNote: { id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Updated finding' } };
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Investigated root cause')).toBeInTheDocument());
    const noteCard = screen.getByText('Investigated root cause').closest('.p-3')! as HTMLElement;
    fireEvent.click(within(noteCard).getByText('Edit'));

    const noteInput = screen.getByDisplayValue('Investigated root cause');
    fireEvent.change(noteInput, { target: { value: 'Updated finding' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(requests).toContainEqual({ taskNoteId: 'note-1', content: 'Updated finding' }));
  });

  it('deletes an agent note after confirmation', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [{ id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Investigated root cause' }] });
    const requests: any[] = [];
    mockRpc(TaskNoteService, 'DeleteTaskNote', (body) => {
      requests.push(body);
      return { success: true };
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Investigated root cause')).toBeInTheDocument());
    const noteCard = screen.getByText('Investigated root cause').closest('.p-3')! as HTMLElement;
    fireEvent.click(within(noteCard).getByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(requests).toContainEqual({ taskNoteId: 'note-1' }));
  });

  it('shows "No agent notes yet." when a task has no notes', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('No agent notes yet.')).toBeInTheDocument());
  });

  it('shows an error message when updating an agent note fails', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [{ id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Investigated root cause' }] });
    mockRpcError(TaskNoteService, 'UpdateTaskNote', 'unknown', 'note not found');
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Investigated root cause')).toBeInTheDocument());
    const noteCard = screen.getByText('Investigated root cause').closest('.p-3')! as HTMLElement;
    fireEvent.click(within(noteCard).getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to update note/)).toBeInTheDocument());
  });

  it('cancels editing an agent note without saving', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [{ id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Investigated root cause' }] });
    const requests: any[] = [];
    mockRpc(TaskNoteService, 'UpdateTaskNote', (body) => {
      requests.push(body);
      return {};
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Investigated root cause')).toBeInTheDocument());
    const noteCard = screen.getByText('Investigated root cause').closest('.p-3')! as HTMLElement;
    fireEvent.click(within(noteCard).getByText('Edit'));
    expect(screen.getByDisplayValue('Investigated root cause')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Investigated root cause')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('shows an error message when deleting an agent note fails', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [{ id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Investigated root cause' }] });
    mockRpcError(TaskNoteService, 'DeleteTaskNote', 'unknown', 'note not found');
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Investigated root cause')).toBeInTheDocument());
    const noteCard = screen.getByText('Investigated root cause').closest('.p-3')! as HTMLElement;
    fireEvent.click(within(noteCard).getByText('Delete'));
    await confirmAction();

    await waitFor(() => expect(screen.getByText(/Failed to delete note/)).toBeInTheDocument());
  });

  // --- Handoffs summary (M22-T05) ---
  //
  // A compact summary block, separate from the Agent Notes panel above -
  // count, the last few (truncated), and a click-through to the dedicated
  // Handoffs screen. Shares the same ['taskNotes', taskId] query
  // TaskNotesPanel already fetches, so these fixtures reuse ListTaskNotes
  // rather than a second mock.

  it('shows a Handoffs summary, separate from Agent Notes, when the task has a handoff note', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [
      { id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Just a comment', createdAt: '2026-08-19T10:00:00.000Z', noteType: 'comment' },
      { id: 'note-2', taskId: 'task-1', agentId: 'agent-2', content: 'Blocked on review, next: rerun tests', createdAt: '2026-08-19T11:00:00.000Z', noteType: 'handoff' },
    ] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText((_, el) => el?.textContent === 'Handoffs (1)')).toBeInTheDocument());
    // The handoff note's content legitimately appears twice - once as this
    // excerpt, once in the full Agent Notes record below - so this asserts
    // within the labelled summary region specifically, not page-wide.
    const summary = within(screen.getByRole('region', { name: 'Handoffs summary' }));
    expect(summary.getByText('Blocked on review, next: rerun tests')).toBeInTheDocument();
    // The plain comment is not a handoff - it appears only in Agent Notes,
    // never inside the summary region.
    expect(summary.queryByText('Just a comment')).toBeNull();
  });

  it('shows no Handoffs summary at all when the task has no handoff note', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [{ id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Just a comment', createdAt: '2026-08-19T10:00:00.000Z', noteType: 'comment' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText('Just a comment')).toBeInTheDocument());
    expect(screen.queryByText(/^Handoffs/)).toBeNull();
  });

  it('shows only the 3 most recent handoff notes in the summary', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [
      { id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Oldest handoff', createdAt: '2026-08-19T08:00:00.000Z', noteType: 'handoff' },
      { id: 'note-2', taskId: 'task-1', agentId: 'agent-1', content: 'Second handoff', createdAt: '2026-08-19T09:00:00.000Z', noteType: 'handoff' },
      { id: 'note-3', taskId: 'task-1', agentId: 'agent-1', content: 'Third handoff', createdAt: '2026-08-19T10:00:00.000Z', noteType: 'handoff' },
      { id: 'note-4', taskId: 'task-1', agentId: 'agent-1', content: 'Newest handoff', createdAt: '2026-08-19T11:00:00.000Z', noteType: 'handoff' },
    ] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText((_, el) => el?.textContent === 'Handoffs (4)')).toBeInTheDocument());
    const summary = within(screen.getByRole('region', { name: 'Handoffs summary' }));
    expect(summary.getByText('Newest handoff')).toBeInTheDocument();
    expect(summary.getByText('Third handoff')).toBeInTheDocument();
    expect(summary.getByText('Second handoff')).toBeInTheDocument();
    // Still in the full Agent Notes record below, just not in the 3-item
    // summary excerpt.
    expect(summary.queryByText('Oldest handoff')).toBeNull();
    expect(screen.getByText('Oldest handoff')).toBeInTheDocument();
  });

  it('navigates to /handoffs when "View all" is clicked', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '' }]);
    mockRpc(TaskNoteService, 'ListTaskNotes', { taskNotes: [{ id: 'note-1', taskId: 'task-1', agentId: 'agent-1', content: 'Blocked', createdAt: '2026-08-19T10:00:00.000Z', noteType: 'handoff' }] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByText('Fix bug'));

    await waitFor(() => expect(screen.getByText((_, el) => el?.textContent === 'Handoffs (1)')).toBeInTheDocument());
    fireEvent.click(screen.getByText('View all'));

    await waitFor(() => expect(locationRef.current).toBe('/handoffs'));
  });

  it('creates a task via the column\'s bottom Add button', async () => {
    withTasks([]);
    const requests: any[] = [];
    mockRpc(TaskService, 'CreateTask', (body) => {
      requests.push(body);
      return { task: { id: 'task-new', title: 'New task', status: 'todo', description: '' } };
    });
    renderPage();

    await waitFor(() => expect(screen.getAllByLabelText('Add task to Todo')[0]).toBeDefined());
    const addButtons = screen.getAllByLabelText('Add task to Todo');
    fireEvent.click(addButtons[addButtons.length - 1]);

    const input = screen.getByPlaceholderText('Task title');
    fireEvent.change(input, { target: { value: 'New task' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(requests).toContainEqual({ projectId: 'proj-1', title: 'New task', status: 'todo' }));
  });

  it('cancels the inline task-create form on blur when empty', async () => {
    withTasks([]);
    renderPage();

    await waitFor(() => expect(screen.getAllByLabelText('Add task to Todo')[0]).toBeDefined());
    const addButtons = screen.getAllByLabelText('Add task to Todo');
    fireEvent.click(addButtons[addButtons.length - 1]);

    const input = screen.getByPlaceholderText('Task title');
    expect(input).toBeInTheDocument();
    fireEvent.blur(input);
    expect(screen.queryByPlaceholderText('Task title')).toBeNull();
  });

  it('shows an error message when creating a task fails', async () => {
    withTasks([]);
    mockRpcError(TaskService, 'CreateTask', 'unknown', 'title is required');
    renderPage();

    await waitFor(() => expect(screen.getAllByLabelText('Add task to Todo')[0]).toBeDefined());
    const addButtons = screen.getAllByLabelText('Add task to Todo');
    fireEvent.click(addButtons[addButtons.length - 1]);

    const input = screen.getByPlaceholderText('Task title');
    fireEvent.change(input, { target: { value: 'New task' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => expect(screen.getByText(/Failed to create task/)).toBeInTheDocument());
  });

  it('switches to table view and shows tasks as rows', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-1' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    expect(screen.getByText('ENG-1')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Title' })).toBeInTheDocument();
  });

  it('bulk-changes the status of tasks selected in the table', async () => {
    withTasks([
      { id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-1' },
      { id: 'task-2', title: 'Write docs', status: 'todo', description: '', displayId: 'ENG-2' },
    ]);
    const requests: any[] = [];
    mockRpc(TaskService, 'UpdateTaskStatus', (body) => {
      requests.push(body);
      return { task: { id: body.taskId, status: 'in-progress' } };
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    fireEvent.click(screen.getByLabelText('Select Fix bug'));
    fireEvent.click(screen.getByLabelText('Select Write docs'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Change status of selected tasks'), { target: { value: 'in-progress' } });

    await waitFor(() => expect(requests).toContainEqual({ taskId: 'task-1', status: 'in-progress' }));
    expect(requests).toContainEqual({ taskId: 'task-2', status: 'in-progress' });
    // Selection clears on full success - the toolbar disappears.
    await waitFor(() => expect(screen.queryByText('2 selected')).toBeNull());
  });

  it('selects every loaded task via the header checkbox', async () => {
    withTasks([
      { id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-1' },
      { id: 'task-2', title: 'Write docs', status: 'todo', description: '', displayId: 'ENG-2' },
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    fireEvent.click(screen.getByLabelText('Select all loaded tasks'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Fix bug')).toBeChecked();
    expect(screen.getByLabelText('Select Write docs')).toBeChecked();
  });

  it('unchecks every row when the header checkbox is unchecked', async () => {
    withTasks([
      { id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-1' },
      { id: 'task-2', title: 'Write docs', status: 'todo', description: '', displayId: 'ENG-2' },
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    const headerCheckbox = screen.getByLabelText('Select all loaded tasks');
    fireEvent.click(headerCheckbox);
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    fireEvent.click(headerCheckbox);
    expect(screen.queryByText('2 selected')).toBeNull();
    expect(screen.getByLabelText('Select Fix bug')).not.toBeChecked();
  });

  it('shows a pending state while a bulk status change is in flight', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-1' }]);
    const pending = mockRpcPending(TaskService, 'UpdateTaskStatus');
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByLabelText('Select Fix bug'));

    const select = screen.getByLabelText('Change status of selected tasks') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'in-progress' } });

    await waitFor(() => expect(select).toBeDisabled());
    expect(screen.getByText('Updating…')).toBeInTheDocument();
    pending.resolve({ task: { id: 'task-1', status: 'in-progress' } });
  });

  it('clears the bulk selection via the toolbar button', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-1' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    fireEvent.click(screen.getByLabelText('Select Fix bug'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Clear selection'));
    expect(screen.queryByText('1 selected')).toBeNull();
    expect(screen.getByLabelText('Select Fix bug')).not.toBeChecked();
  });

  it('reports a partial failure in a bulk status change without discarding the selection', async () => {
    withTasks([
      { id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-1' },
      { id: 'task-2', title: 'Write docs', status: 'todo', description: '', displayId: 'ENG-2' },
    ]);
    // A per-request conditional error needs the raw handler, not `mockRpc` -
    // task-2 fails, task-1 succeeds.
    server.use(
      http.post(`${BACKEND_URL}/${TaskService.typeName}/UpdateTaskStatus`, async ({ request }) => {
        const body = await request.json().catch(() => ({})) as { taskId?: string };
        if (body.taskId === 'task-2') {
          return HttpResponse.json({ code: 'unknown', message: 'transition not allowed' }, { status: 400 });
        }
        return HttpResponse.json({ task: { id: body.taskId, status: 'in-progress' } });
      }),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    fireEvent.click(screen.getByLabelText('Select all loaded tasks'));
    fireEvent.change(screen.getByLabelText('Change status of selected tasks'), { target: { value: 'in-progress' } });

    expect(await screen.findByText('1 of 2 tasks failed to update')).toBeInTheDocument();
    // A partial failure keeps the selection so the user can see what happened.
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('shows an empty state in table view when there are no tasks', async () => {
    withTasks([]);
    renderPage();

    await waitFor(() => expect(screen.getAllByLabelText('Add task to Todo')[0]).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    await waitFor(() => expect(screen.getByText('No tasks yet.')).toBeInTheDocument());
  });

  it('opens a task detail overlay from a table row, including via keyboard', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-1' }]);
    mockRpc(RepositoryService, 'ListPullRequests', {
      pullRequests: [{ id: 'pr-1', taskId: 'task-1', remotePrId: '42', title: 'ENG-1: fix bug', status: 'open', url: 'http://example.com/pr/42' }],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    expect(screen.getByText('#42')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByText('ENG-1'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Task Details')).toBeInTheDocument());
  });

  it('opens a task detail overlay from a table row via mouse click', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-1' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByText('ENG-1'));

    await waitFor(() => expect(screen.getByText('Task Details')).toBeInTheDocument());
  });

  it('opens a task detail overlay from a table row via keyboard space', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-1' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.keyDown(screen.getByText('ENG-1'), { key: ' ' });

    await waitFor(() => expect(screen.getByText('Task Details')).toBeInTheDocument());
  });

  it('ignores non-activation keys on a table row', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-1' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.keyDown(screen.getByText('ENG-1'), { key: 'Tab' });

    expect(screen.queryByText('Task Details')).toBeNull();
  });

  it('defaults a table row with no status to todo', async () => {
    withTasks([{ id: 'task-1', title: 'No status task', description: '', displayId: 'ENG-1' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('No status task')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    expect(screen.getByText('Todo')).toBeInTheDocument();
  });

  // M19-T04: columnDefs only ever covers the default statuses plus whatever
  // custom task-type statuses have resolved by this render - a status this
  // page has never seen (a race with the task-type query, or a status
  // deleted/renamed after the task was set to it) used to end in a
  // `.find(...)!` that threw straight through the whole table's render,
  // instead of just that one row falling back to showing the raw status.
  it('shows a task row instead of crashing the whole table when its status matches no resolved column', async () => {
    // The board fetches one status column at a time (M07-T03), so a task
    // whose status matches none of them (todo/in-progress/done, and no
    // custom task type is registered here to add another) never appears
    // there - table view has no such facet, so it is the only place this
    // status is ever reachable to render.
    withTasks([
      { id: 'task-1', title: 'Orphaned status task', status: 'archived-elsewhere', description: '', displayId: 'ENG-1' },
      { id: 'task-2', title: 'Normal task', status: 'todo', description: '', displayId: 'ENG-2' },
    ]);
    renderPage();

    // Wait for the board to finish its initial render (a column heading
    // that exists regardless of which tasks loaded) before switching, so
    // the switch isn't racing the board's own fetch.
    await waitFor(() => expect(screen.getAllByLabelText('Add task to Todo')[0]).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    // Both rows render - the unresolved status falls back to its own raw
    // string rather than taking the rest of the table down with it.
    await waitFor(() => expect(screen.getByText('Orphaned status task')).toBeInTheDocument());
    expect(screen.getByText('Normal task')).toBeInTheDocument();
    expect(screen.getByText('archived-elsewhere')).toBeInTheDocument();
  });

  it('asks the server to sort, and cycles asc/desc/off', async () => {
    const requests = withTasks([
      { id: 'task-1', title: 'Zebra task', status: 'todo', description: '', displayId: 'ENG-1' },
      { id: 'task-2', title: 'Apple task', status: 'todo', description: '', displayId: 'ENG-2' },
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Zebra task')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    // Sorting one page of a paginated set in the browser sorts the page, not
    // the set — which is why this asserts on the request and not on the rows.
    fireEvent.click(screen.getByRole('columnheader', { name: /Title/ }));
    await waitFor(() => expect(requests).toContainEqual(
      expect.objectContaining({ page: expect.objectContaining({ sort: 'title:asc' }) }),
    ));

    fireEvent.click(screen.getByRole('columnheader', { name: /Title/ }));
    await waitFor(() => expect(requests).toContainEqual(
      expect.objectContaining({ page: expect.objectContaining({ sort: 'title:desc' }) }),
    ));

    requests.length = 0;
    fireEvent.click(screen.getByRole('columnheader', { name: /Title/ }));
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    // Off: the request carries no sort at all, rather than an empty string -
    // an empty/unset `sort` is proto3's default, so the real JSON codec omits
    // the key entirely.
    for (const req of requests) expect(req.page?.sort).toBeUndefined();
  });

  it('sorts by creation time behind the ID header', async () => {
    const requests = withTasks([
      { id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-2' },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    fireEvent.click(screen.getByRole('columnheader', { name: /^ID/ }));
    // displayId is a string, so sorting by it puts "ENG-100" before "ENG-99".
    // Ids are handed out in creation order, so createdAt is the same ordering
    // done correctly.
    await waitFor(() => expect(requests).toContainEqual(
      expect.objectContaining({ page: expect.objectContaining({ sort: 'createdAt:asc' }) }),
    ));
  });

  it('switching the sort column resets to ascending', async () => {
    const requests = withTasks([
      { id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-2' },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    fireEvent.click(screen.getByRole('columnheader', { name: /Title/ }));
    fireEvent.click(screen.getByRole('columnheader', { name: /Title/ }));
    fireEvent.click(screen.getByRole('columnheader', { name: /Status/ }));
    await waitFor(() => expect(requests).toContainEqual(
      expect.objectContaining({ page: expect.objectContaining({ sort: 'status:asc' }) }),
    ));
  });

  it('asks the server to filter, rather than filtering what it already has', async () => {
    const requests = withTasks([
      { id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-1' },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Filter tasks'), { target: { value: 'bug' } });

    // A project holds more tasks than one page; filtering in the browser hides
    // rows that were never fetched and calls the remainder the result.
    await waitFor(() => expect(requests).toContainEqual(
      expect.objectContaining({ page: expect.objectContaining({ filter: 'bug' }) }),
    ));
  });

  it('sends no filter for an empty box', async () => {
    const requests = withTasks([]);
    renderPage();
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    for (const req of requests) {
      expect(req.page?.filter).toBeUndefined();
    }
  });

  it('shows a loading state in table view', async () => {
    const pending = mockRpcPending(TaskService, 'ListTasks');
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    await waitFor(() => expect(screen.getByText('Loading tasks…')).toBeInTheDocument());
    pending.resolve({ tasks: [] });
  });

  it('switches back to board view from table view', async () => {
    withTasks([{ id: 'task-1', title: 'Fix bug', status: 'todo', description: '', displayId: 'ENG-1' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix bug')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByText('ENG-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'Title' })).toBeNull());
    expect(screen.getByText('Fix bug')).toBeInTheDocument();
  });

  describe('URL-driven task detail', () => {
    const task = { id: 'task-1', title: 'Fix bug', status: 'todo', description: 'A broken thing', displayId: 'ENG-1' };

    it('opens the detail overlay straight from /tasks/:taskId without any click', async () => {
      withTasks([task]);

      renderPage('/tasks/task-1');

      await waitFor(() => expect(screen.getByRole('heading', { name: 'Task Details' })).toBeInTheDocument());
      // level 3 is the overlay's title; the board card renders an h4.
      expect(screen.getByRole('heading', { level: 3, name: 'Fix bug' })).toBeInTheDocument();
    });

    it('pushes the task id onto the URL when a card is opened', async () => {
      withTasks([task]);

      renderPage();

      await waitFor(() => expect(screen.getByText('Fix bug')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Fix bug'));

      await waitFor(() => expect(locationRef.current).toBe('/tasks/task-1'));
    });

    it('returns to /tasks when the overlay is closed', async () => {
      withTasks([task]);

      renderPage('/tasks/task-1');

      await waitFor(() => expect(screen.getByRole('heading', { name: 'Task Details' })).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Close task details' }));

      await waitFor(() => expect(locationRef.current).toBe('/tasks'));
      expect(screen.queryByRole('heading', { name: 'Task Details' })).toBeNull();
    });

    it('leaves the overlay closed on a plain /tasks URL', async () => {
      withTasks([task]);

      renderPage();

      await waitFor(() => expect(screen.getByText('Fix bug')).toBeInTheDocument());
      expect(screen.queryByRole('heading', { name: 'Task Details' })).toBeNull();
    });

    // M19-T05: the open task lives in the URL, not local state, so
    // switching the active project/org used to leave it open across the
    // switch - `getTask` kept resolving (or failing) against a task that
    // belongs to whatever project/org was active when the link was
    // followed, not the one the sidebar now shows.
    it('closes the detail overlay when the active project changes', async () => {
      withTasks([task]);

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>{page('/tasks/task-1')}</QueryClientProvider>,
      );
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Task Details' })).toBeInTheDocument());

      mockActiveProjectId = 'proj-2';
      rerender(<QueryClientProvider client={queryClient}>{page('/tasks/task-1')}</QueryClientProvider>);

      await waitFor(() => expect(locationRef.current).toBe('/tasks'));
      expect(screen.queryByRole('heading', { name: 'Task Details' })).toBeNull();
    });

    it('keeps a deep-linked task open while the active project hydrates from empty', async () => {
      // The hard-reload case. On a fresh load of /tasks/:taskId the layout
      // store starts with no project and fills one in a tick later, so the
      // scope changes *after* the first render — which used to be the only
      // thing guarding this effect. The overlay was closed and the URL thrown
      // back to /tasks, so reloading a task link never stayed on the task.
      mockActiveProjectId = '';
      withTasks([task]);

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>{page('/tasks/task-1')}</QueryClientProvider>,
      );

      // The store hydrates: '' -> a real project id.
      mockActiveProjectId = 'proj-1';
      rerender(<QueryClientProvider client={queryClient}>{page('/tasks/task-1')}</QueryClientProvider>);

      await waitFor(() => expect(screen.getByRole('heading', { name: 'Task Details' })).toBeInTheDocument());
      expect(locationRef.current).toBe('/tasks/task-1');
    });

    it('closes the detail overlay when the active org changes', async () => {
      withTasks([task]);

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>{page('/tasks/task-1')}</QueryClientProvider>,
      );
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Task Details' })).toBeInTheDocument());

      mockActiveOrgId = 'org-2';
      rerender(<QueryClientProvider client={queryClient}>{page('/tasks/task-1')}</QueryClientProvider>);

      await waitFor(() => expect(locationRef.current).toBe('/tasks'));
      expect(screen.queryByRole('heading', { name: 'Task Details' })).toBeNull();
    });

    it('does not close the overlay on an ordinary re-render - only when the project/org actually changes', async () => {
      withTasks([task]);

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>{page('/tasks/task-1')}</QueryClientProvider>,
      );
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Task Details' })).toBeInTheDocument());

      // Same project/org, just a re-render (e.g. an unrelated store update).
      rerender(<QueryClientProvider client={queryClient}>{page('/tasks/task-1')}</QueryClientProvider>);

      expect(locationRef.current).toBe('/tasks/task-1');
      expect(screen.getByRole('heading', { name: 'Task Details' })).toBeInTheDocument();
    });
  });
});
