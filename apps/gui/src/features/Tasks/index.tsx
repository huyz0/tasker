import { useEffect, useRef, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { useNavigate, useParams } from 'react-router-dom';
import { useLayoutStore } from '../../store/layout';
import { PullRequestBadge } from '../../components/ui/repositories/PullRequestBadge';
import { useQuery, useQueries, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { TaskService, RepositoryService, TaskTypeService, TaskNoteService, ProjectService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import { Comment } from '../../components/ui/comments';
import { Label } from '../../components/ui/labels';
import { AssigneePicker } from './AssigneePicker';
import { ReviewerPicker } from './ReviewerPicker';
import { TaskArtifactLinks } from './TaskArtifactLinks';
import { Dialog } from '../../components/ui/Dialog';
import { fetchAllPages } from '../../lib/fetchAllPages';
import { InlineCreateForm } from '../../components/ui/InlineCreateForm';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Breadcrumbs } from '../../components/layout/Breadcrumbs';
import { ListState } from '../../components/ui/ListState';

const taskClient = createClient(TaskService, transport);
const repositoryClient = createClient(RepositoryService, transport);
const taskTypeClient = createClient(TaskTypeService, transport);
const taskNoteClient = createClient(TaskNoteService, transport);
const projectClient = createClient(ProjectService, transport);

function TaskNotesPanel({ taskId }: { taskId: string }) {
  const { confirm, confirmDialog } = useConfirm();
  const queryClient = useQueryClient();
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState('');
  const queryKey = ['taskNotes', taskId];

  // A deliberate remaining use of `fetchAllPages` (M07 exit criterion 1). The
  // set is one task's notes — bounded by what agents wrote about a single task,
  // not by the size of the project — and the panel is a chronological record
  // that reads wrongly if it silently stops partway. Unlike a folder, there is
  // no realistic shape where this is tens of thousands of rows; if agents ever
  // make it one, this becomes a paged list like the artifacts one.
  const { data: notesData, isLoading, error: notesError, refetch: refetchNotes } = useQuery({
    queryKey,
    queryFn: async () => fetchAllPages(async (cursor) => {
      const resp = await taskNoteClient.listTaskNotes({ taskId, page: cursor ? { cursor } : undefined });
      return { items: resp.taskNotes, nextCursor: resp.page?.nextCursor || undefined };
    }),
  });

  const updateNoteMutation = useMutation({
    mutationFn: async (variables: { taskNoteId: string; content: string }) => {
      await taskNoteClient.updateTaskNote(variables);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setEditingNoteId(null);
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (taskNoteId: string) => {
      await taskNoteClient.deleteTaskNote({ taskNoteId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  if (isLoading || notesError || !notesData || notesData.length === 0) {
    return (
      <ListState
        isLoading={isLoading}
        error={notesError}
        isEmpty
        loadingMessage="Loading notes…"
        emptyMessage="No agent notes yet."
        emptyAction={<p className="text-xs">Agents working this task record what they did here.</p>}
        onRetry={() => refetchNotes()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {notesData.map(note => (
        editingNoteId === note.id ? (
          <form
            key={note.id}
            onSubmit={(e) => {
              e.preventDefault();
              if (editNoteContent.trim()) updateNoteMutation.mutate({ taskNoteId: note.id, content: editNoteContent.trim() });
            }}
            className="flex flex-col gap-2 p-3 rounded-lg bg-muted/50 border"
          >
            <textarea
              autoFocus
              value={editNoteContent}
              onChange={(e) => setEditNoteContent(e.target.value)}
              rows={3}
              className="text-sm rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
            />
            {updateNoteMutation.isError && (
              <p className="text-xs text-destructive">Failed to update note: {(updateNoteMutation.error as Error).message}</p>
            )}
            <div className="flex gap-2 self-end">
              <button type="submit" disabled={!editNoteContent.trim() || updateNoteMutation.isPending} className="px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-md text-xs font-medium">Save</button>
              <button type="button" onClick={() => setEditingNoteId(null)} className="px-3 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-xs font-medium">Cancel</button>
            </div>
          </form>
        ) : (
          <div key={note.id} className="p-3 rounded-lg bg-muted/50 border flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs text-muted-foreground">Agent {note.agentId}</span>
              <span className="flex items-center gap-2">
                <button
                  onClick={() => { setEditingNoteId(note.id); setEditNoteContent(note.content); }}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  Edit
                </button>
                <button
                  onClick={async () => {
                    if (await confirm({
                      title: 'Delete this note?',
                      consequence: 'The note is removed from the task for everyone.',
                      undo: null,
                      confirmLabel: 'Delete',
                    })) {
                      deleteNoteMutation.mutate(note.id);
                    }
                  }}
                  className="text-muted-foreground hover:text-destructive text-xs"
                >
                  Delete
                </button>
              </span>
            </div>
            <p className="text-sm">{note.content}</p>
          </div>
        )
      ))}
      {deleteNoteMutation.isError && (
        <p className="text-xs text-destructive">Failed to delete note: {(deleteNoteMutation.error as Error).message}</p>
      )}
      {confirmDialog}
    </div>
  );
}

// Fallback status set for tasks with no taskTypeId, or whose task type has
// no custom statuses configured - matches the backend's KNOWN_STATUSES.
// Fixed-width ID/Status columns keep those cells snug around their content;
// Title takes the remaining space and Pull Requests gets enough room for a
// couple of badges before wrapping.
const TABLE_COLUMN_WIDTHS = '110px minmax(200px, 1fr) 140px minmax(180px, 260px)';

/** One screenful of cards. A column is a queue to work, not a catalogue. */
const COLUMN_PAGE = 20;

const DEFAULT_STATUS_OPTIONS = [
  { id: 'todo', display: 'Todo' },
  { id: 'in-progress', display: 'In Progress' },
  { id: 'done', display: 'Done' },
];

/**
 * One board column, which fetches and counts itself.
 *
 * The board used to fetch the whole project and group by status in the browser.
 * That is the only way to get a column's contents *and* its count out of a
 * single unfaceted list — and it costs 500 sequential round trips at the
 * 50,000-task scale target. Each column is now its own paginated query with a
 * server-computed `totalCount`, so the board's cost is the number of columns
 * rather than the size of the project (M07-T03).
 *
 * A component per column rather than a loop of hooks: the hook count then
 * belongs to the component instance, so columns can appear and disappear
 * without violating the rules of hooks.
 */
function BoardColumn({
  status,
  display,
  projectId,
  orgId,
  filter,
  isAdding,
  onStartAdding,
  onCancelAdding,
  onCreate,
  isCreating,
  onOpenTask,
  pullRequestsByTaskId,
}: {
  status: string;
  display: string;
  projectId: string;
  orgId: string;
  filter?: string;
  isAdding: boolean;
  onStartAdding: () => void;
  onCancelAdding: () => void;
  onCreate: (title: string) => void;
  isCreating: boolean;
  onOpenTask: (taskId: string) => void;
  pullRequestsByTaskId: Map<string, any[]>;
}) {
  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['tasks', projectId, 'column', status, filter],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) =>
      taskClient.listTasks({
        projectId,
        status,
        page: { cursor: pageParam, limit: COLUMN_PAGE, filter: filter || undefined },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
    enabled: !!projectId,
  });

  const items = data?.pages.flatMap((p) => p.tasks) ?? [];
  // The server's count over the whole column, not the number loaded so far.
  const count = Number(data?.pages[0]?.page?.totalCount ?? 0);

  return (
    // `flex-1` with a floor and a ceiling, not a fixed `w-80`: with the usual
    // three columns this lets them share the 1280px content area instead of
    // 992px of fixed width overrunning a 928px box at rest (measured — the
    // third column was clipped with no visible scrollbar to say so). The
    // floor is what still forces `overflow-x-auto` on a phone or with more
    // than a few statuses, where sharing space would make every column
    // unreadably narrow instead.
    <div className="flex-1 basis-80 min-w-[280px] max-w-sm flex flex-col bg-muted/30 rounded-lg p-3">
      <div className="flex items-center justify-between mb-3 font-medium text-sm">
        <span className="flex items-center gap-2">
          {display}
          <span className="text-xs bg-muted text-muted-foreground px-2 rounded-full">{count}</span>
        </span>
        <button
          aria-label={`Add task to ${display}`}
          onClick={onStartAdding}
          className="text-muted-foreground hover:text-foreground"
        >+</button>
      </div>
      <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
        {(isLoading || error) && (
          <ListState
            isLoading={isLoading}
            error={error}
            isEmpty={false}
            loadingMessage={`Loading ${display.toLowerCase()}…`}
            emptyMessage=""
            onRetry={() => refetch()}
          />
        )}
        {items.map((task: any) => (
          <div
            key={task.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenTask(task.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenTask(task.id);
              }
            }}
            className="bg-card border rounded-md p-3 shadow-sm hover:border-primary cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <div className="text-xs text-muted-foreground mb-1 font-mono">{task.displayId}</div>
            <h4 className="font-medium text-sm leading-tight mb-2">{task.title}</h4>

            <div className="mb-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
              <AssigneePicker taskId={task.id} orgId={orgId} assignees={task.assignees ?? []} />
            </div>

            {(pullRequestsByTaskId.get(task.id)?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {pullRequestsByTaskId.get(task.id)!.map((pr: any) => (
                  <PullRequestBadge key={pr.id} pr={{ remotePrId: `#${pr.remotePrId}`, title: pr.title, status: pr.status, url: pr.url }} />
                ))}
              </div>
            )}
          </div>
        ))}
        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full py-2 text-xs text-muted-foreground bg-background rounded-md border border-dashed hover:border-solid disabled:opacity-50"
          >
            {isFetchingNextPage ? 'Loading…' : `Load more (${items.length} of ${count})`}
          </button>
        )}
        {isAdding ? (
          <InlineCreateForm
            placeholder="Task title"
            isSubmitting={isCreating}
            onSubmit={onCreate}
            onCancel={onCancelAdding}
            className="flex flex-col gap-2 mt-2"
            inputClassName="border p-2 rounded-md text-sm bg-background"
            buttonClassName="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
          />
        ) : (
          <button
            aria-label={`Add task to ${display}`}
            onClick={onStartAdding}
            className="w-full mt-2 py-2 text-muted-foreground bg-background rounded-md border border-dashed hover:border-solid text-sm shadow-sm"
          >+</button>
        )}
      </div>
    </div>
  );
}

export function TasksWorkbench() {
  const { confirm, confirmDialog } = useConfirm();
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  useEffect(() => setActivePageTitle('Tasks Workbench'), [setActivePageTitle]);

  // The open task lives in the URL (`/tasks/:taskId`) rather than in local
  // state, so a shared link, a browser reload and the back button all land on
  // the same detail view instead of an empty board.
  const { taskId: expandedTaskId = null } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const setExpandedTaskId = (id: string | null) => navigate(id ? `/tasks/${id}` : '/tasks');

  const [addingToColumnId, setAddingToColumnId] = useState<string | null>(null);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [sort, setSort] = useState<{ key: 'displayId' | 'title' | 'status'; dir: 'asc' | 'desc' } | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 250);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const queryClient = useQueryClient();

  const createTaskMutation = useMutation({
    mutationFn: async (variables: { title: string; status: string }) => {
      const resp = await taskClient.createTask({ projectId: activeProjectId, title: variables.title, status: variables.status });
      return resp.task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId] });
      setAddingToColumnId(null);
    },
  });

  // The server sorts by column name; the ID header maps to createdAt because
  // displayId is a string ("SEED-100" sorts before "SEED-99") and ids are
  // assigned in creation order, so createdAt is that ordering done correctly.
  const SORT_FIELDS: Record<'displayId' | 'title' | 'status', string> = {
    displayId: 'createdAt',
    title: 'title',
    status: 'status',
  };
  const sortParam = sort ? `${SORT_FIELDS[sort.key]}:${sort.dir}` : undefined;

  // The table view, one page at a time.
  //
  // This was `fetchAllPages` — it looped the cursor until the project was
  // exhausted, which at the 50,000-task scale target is 500 sequential round
  // trips before anything paints. The rows are virtualized, so the pages that
  // matter are the ones the user has scrolled to (M07-T03).
  const {
    data: tablePages,
    isLoading,
    error: tasksError,
    refetch: refetchTasks,
    fetchNextPage: fetchMoreTasks,
    hasNextPage: hasMoreTasks,
    isFetchingNextPage: isFetchingMoreTasks,
  } = useInfiniteQuery({
    // Filter and sort belong in the key: they change which rows come back, so
    // a shared key would serve one query's results for another's question.
    queryKey: ['tasks', activeProjectId, 'table', debouncedSearch, sortParam],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      // Sent on every page, not just the first: the cursor records which field
      // it was built for, and a page requested without them is a page of a
      // different query.
      const page = { cursor: pageParam, filter: debouncedSearch || undefined, sort: sortParam };
      return taskClient.listTasks({ projectId: activeProjectId, page });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
    enabled: !!activeProjectId,
  });
  const tasksData = tablePages?.pages.flatMap((p) => p.tasks);
  const taskTotalCount = Number(tablePages?.pages[0]?.page?.totalCount ?? 0);

  // The open task is fetched by id rather than found among loaded rows: with
  // the board paged per column, the row a deep link names may be on a page
  // nothing has loaded. `getTask` also carries `description`, which the list
  // deliberately projects away (M07-T01).
  const expandedTaskQuery = useQuery({
    queryKey: ['task', expandedTaskId],
    enabled: !!expandedTaskId,
    queryFn: async () => (await taskClient.getTask({ taskId: expandedTaskId! })).task,
  });
  const expandedTask = expandedTaskQuery.data ?? null;

  // The project's own name, for the breadcrumb. `getProject` is the right call
  // when all you hold is an id — the alternative is listing every project to
  // find one.
  const { data: projectData } = useQuery({
    queryKey: ['project', activeProjectId],
    enabled: !!activeProjectId,
    queryFn: async () => (await projectClient.getProject({ id: activeProjectId })).project,
  });

  useEffect(() => setIsEditingTask(false), [expandedTaskId]);

  // Focused-overlay UX (matches Jira/Linear's task-detail pattern): Escape
  // closes it from anywhere, not just via the visible close button.
  useEffect(() => {
    if (!expandedTaskId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedTaskId(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedTaskId]);

  // Task types can define their own custom status sets/state machines
  // (see tasks.handler.ts's validateStatusForTaskType) - fetch each distinct
  // task type actually in use so the board can render columns for them
  // instead of hiding tasks whose status doesn't match the 3 defaults.
  // Sourced from the project's task types rather than from every task in it.
  // The old derivation read `taskTypeId` off the whole-project fetch, which is
  // exactly the fetch this task removes — and a type is worth a column because
  // the project defines it, not because a task happens to be loaded (M07-T03).
  const { data: taskTypesData } = useQuery({
    queryKey: ['taskTypes', activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => (await taskTypeClient.listTaskTypes({ orgId: activeOrgId })).taskTypes,
  });
  const distinctTaskTypeIds = Array.from(new Set((taskTypesData ?? []).map(t => t.id)));
  const taskTypeQueries = useQueries({
    queries: distinctTaskTypeIds.map(taskTypeId => ({
      queryKey: ['taskType', taskTypeId],
      queryFn: async () => taskTypeClient.getTaskType({ id: taskTypeId }),
    })),
  });
  const statusesByTaskType = new Map<string, string[]>();
  distinctTaskTypeIds.forEach((taskTypeId, i) => {
    const statuses = taskTypeQueries[i]?.data?.statuses;
    if (statuses && statuses.length > 0) {
      statusesByTaskType.set(taskTypeId, statuses.map(s => s.name));
    }
  });

  const columnDefs = [...DEFAULT_STATUS_OPTIONS];
  const seenStatusIds = new Set(columnDefs.map(c => c.id));
  for (const statuses of statusesByTaskType.values()) {
    for (const name of statuses) {
      if (!seenStatusIds.has(name)) {
        seenStatusIds.add(name);
        columnDefs.push({ id: name, display: name });
      }
    }
  }
  // The old fallback scanned every task in the project for an unrecognised
  // status and gave it a column. That required the whole-project fetch. The
  // task types above are the authoritative source, and a status no type
  // declares is a data defect rather than a column to invent.


  const { data: pullRequestsData } = useQuery({
    queryKey: ['pullRequests', activeProjectId],
    queryFn: async () => {
      const resp = await repositoryClient.listPullRequests({ projectId: activeProjectId });
      return resp.pullRequests;
    },
    enabled: !!activeProjectId,
  });
  const pullRequestsByTaskId = new Map<string, NonNullable<typeof pullRequestsData>>();
  for (const pr of pullRequestsData ?? []) {
    if (!pr.taskId) continue;
    const existing = pullRequestsByTaskId.get(pr.taskId) ?? [];
    existing.push(pr);
    pullRequestsByTaskId.set(pr.taskId, existing);
  }

  const updateStatusMutation = useMutation({
    mutationFn: async (variables: { taskId: string; status: string }) => {
      const resp = await taskClient.updateTaskStatus(variables);
      return resp.task;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId] }),
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (variables: { taskId: string; title: string; description: string }) => {
      const resp = await taskClient.updateTask(variables);
      return resp.task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId] });
      setIsEditingTask(false);
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await taskClient.deleteTask({ taskId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId] });
      setExpandedTaskId(null);
    },
  });

  // Each column fetches and counts itself (see BoardColumn). Grouping a page of
  // mixed statuses in the browser cannot produce a column's real count, which
  // is why the board used to need every task.
  const columns = columnDefs;

  const expandedTaskStatusOptions = expandedTask?.taskTypeId && statusesByTaskType.has(expandedTask.taskTypeId)
    ? statusesByTaskType.get(expandedTask.taskTypeId)!.map(name => ({ id: name, display: name }))
    : DEFAULT_STATUS_OPTIONS;

  const statusDisplay = (statusId: string) => columnDefs.find(c => c.id === statusId)!.display;

  // The server orders the rows. Sorting them again here would reorder one
  // page's worth of a paginated set and call the result sorted.
  const sortedTasks = tasksData ?? [];

  const toggleSort = (key: 'displayId' | 'title' | 'status') => {
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  const rowVirtualizer = useVirtualizer({
    count: sortedTasks.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 45,
    overscan: 10,
  });

  // Fetch the next page as the last rows come into view. The same shape the
  // member list uses (M03-T16): the virtualizer knows what is on screen, so it
  // is what decides when more is needed.
  const virtualTaskRows = rowVirtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualTaskRows[virtualTaskRows.length - 1];
    if (!last) return;
    if (last.index >= sortedTasks.length - 10 && hasMoreTasks && !isFetchingMoreTasks) {
      fetchMoreTasks();
    }
  }, [virtualTaskRows, sortedTasks.length, hasMoreTasks, isFetchingMoreTasks, fetchMoreTasks]);

  return (
    <div className="h-full flex flex-col gap-6">
      {/* `layout-manifest.md` §3: stacked by default, side-by-side from `md:`.
          This row used to be `flex justify-between` unconditionally, so the
          200px-fixed filter input rendered starting past the viewport's right
          edge on a phone — `main` hides horizontal overflow, so it was not
          scrollable, just gone. `flex-wrap` on the control group is the
          fallback for the width in between: the toggle keeps its size and the
          filter (now `flex-1`) either shrinks to fit or wraps to its own
          line, but never renders off-screen. */}
      <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Tasks Workbench</h1>
          <p className="text-muted-foreground mt-1">Detailed task workbench for humans and autonomous agents.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-md border overflow-hidden text-sm font-medium">
            <button
              onClick={() => setViewMode('card')}
              aria-pressed={viewMode === 'card'}
              className={`px-3 py-2 ${viewMode === 'card' ? 'bg-secondary text-secondary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
            >
              Board
            </button>
            <button
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              className={`px-3 py-2 border-l ${viewMode === 'table' ? 'bg-secondary text-secondary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
            >
              Table
            </button>
          </div>
          <div className="flex flex-col flex-1 min-w-[140px]">
            <label className="sr-only" htmlFor="task-filter">Filter tasks</label>
            <input
              id="task-filter"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter tasks…"
              className="w-full px-3 py-2 rounded-md border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="h-[calc(100vh-260px)] overflow-hidden border rounded-lg flex flex-col" role="table" aria-label="Tasks">
          <div
            role="row"
            className="grid bg-muted/30 text-left text-xs text-muted-foreground uppercase tracking-wide shrink-0"
            style={{ gridTemplateColumns: TABLE_COLUMN_WIDTHS }}
          >
            {(['displayId', 'title', 'status'] as const).map(key => (
              <button
                key={key}
                role="columnheader"
                onClick={() => toggleSort(key)}
                className="px-4 py-2 font-medium text-left flex items-center gap-1 hover:text-foreground"
              >
                {key === 'displayId' ? 'ID' : key === 'title' ? 'Title' : 'Status'}
                {sort?.key === key && <span>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
              </button>
            ))}
            <div role="columnheader" className="px-4 py-2 font-medium">Pull Requests</div>
          </div>
          <ListState
            isLoading={isLoading}
            error={tasksError}
            isEmpty={sortedTasks.length === 0}
            loadingMessage="Loading tasks…"
            emptyMessage="No tasks yet."
            emptyAction={<p className="text-xs">Switch to the board and use “+” on a column to add the first one.</p>}
            onRetry={() => refetchTasks()}
          >
            <div
              ref={tableScrollRef}
              // Only the visible rows exist in the DOM, so the real size is not
              // discoverable by tabbing — aria-rowcount carries it, and it is
              // the server's count of the whole project rather than the number
              // of pages loaded so far.
              role="rowgroup"
              aria-rowcount={taskTotalCount}
              className="flex-1 overflow-auto"
            >
              <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                {virtualTaskRows.map(virtualRow => {
                  const task = sortedTasks[virtualRow.index];
                  return (
                    <div
                      key={task.id}
                      role="row"
                      tabIndex={0}
                      onClick={() => setExpandedTaskId(task.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedTaskId(task.id);
                        }
                      }}
                      className="grid items-center border-t hover:bg-muted/20 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 absolute top-0 left-0 w-full"
                      style={{ gridTemplateColumns: TABLE_COLUMN_WIDTHS, height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <div role="cell" className="px-4 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{task.displayId}</div>
                      <div role="cell" className="px-4 py-2 truncate">{task.title}</div>
                      <div role="cell" className="px-4 py-2">
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                          {statusDisplay(task.status || 'todo')}
                        </span>
                      </div>
                      <div role="cell" className="px-4 py-2">
                        {(pullRequestsByTaskId.get(task.id)?.length ?? 0) > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {pullRequestsByTaskId.get(task.id)!.map(pr => (
                              <PullRequestBadge key={pr.id} pr={{ remotePrId: `#${pr.remotePrId}`, title: pr.title, status: pr.status, url: pr.url }} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ListState>
        </div>
      ) : (
      <div className="flex gap-4 overflow-x-auto scrollbar-thin pb-4 h-full">
          {columns.map(col => (
            <BoardColumn
              key={col.id}
              status={col.id}
              display={col.display}
              projectId={activeProjectId}
              orgId={activeOrgId}
              filter={debouncedSearch}
              isAdding={addingToColumnId === col.id}
              onStartAdding={() => setAddingToColumnId(col.id)}
              onCancelAdding={() => setAddingToColumnId(null)}
              onCreate={(title) => createTaskMutation.mutate({ title, status: col.id })}
              isCreating={createTaskMutation.isPending}
              onOpenTask={setExpandedTaskId}
              pullRequestsByTaskId={pullRequestsByTaskId}
            />
          ))}
        </div>
      )}
      {createTaskMutation.isError && (
        <p className="text-sm text-destructive">Failed to create task: {(createTaskMutation.error as Error).message}</p>
      )}

      {/* Focused task-detail overlay (Jira/Linear pattern): takes over most
          of the screen instead of a cramped permanent side panel, so there's
          room for description, labels, agent notes, and comments at once.
          On `Dialog` since M06-T03 — it previously declared no role, no
          aria-modal, and trapped no focus (ADR-0009). */}
      {expandedTask && (
        <Dialog
          open
          onClose={() => setExpandedTaskId(null)}
          title="Task Details"
          className="w-full max-w-4xl h-full max-h-[90vh] animate-in zoom-in-95"
          headerRight={
            <div className="flex items-center gap-3">
               {!isEditingTask && (
                 <button
                   onClick={() => {
                     setIsEditingTask(true);
                     setEditTitle(expandedTask.title);
                     setEditDescription(expandedTask.description || '');
                   }}
                   className="text-muted-foreground hover:text-foreground text-sm font-medium"
                 >
                   Edit
                 </button>
               )}
               <button
                 onClick={async () => {
                   if (await confirm({
                     title: `Move "${expandedTask.title}" to the bin?`,
                     consequence: 'The task stops appearing on the board and in lists.',
                     undo: 'You can restore it from the Bin.',
                     confirmLabel: 'Move to bin',
                   })) {
                     deleteTaskMutation.mutate(expandedTask.id);
                   }
                 }}
                 disabled={deleteTaskMutation.isPending}
                 className="text-destructive hover:text-destructive/80 text-sm font-medium disabled:opacity-50"
               >
                 {deleteTaskMutation.isPending ? 'Moving to bin...' : 'Delete'}
               </button>
              <button onClick={() => setExpandedTaskId(null)} aria-label="Close task details" className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
          }
        >
           {/* A task reached by a deep link has no history behind it: the
               browser's Back button leaves the app. */}
           <Breadcrumbs
             className="px-4 pt-3 shrink-0"
             items={[
               { label: projectData?.name ?? 'Project', to: '/projects' },
               { label: 'Tasks', to: '/tasks' },
               { label: expandedTask.displayId || expandedTask.title },
             ]}
           />
           {deleteTaskMutation.isError && (
             <p className="text-sm text-destructive px-4 pt-2 shrink-0">Failed to delete task: {(deleteTaskMutation.error as Error).message}</p>
           )}
           <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
           <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
             <div className="text-sm text-primary font-medium mb-1">{expandedTask.displayId}</div>
             {isEditingTask ? (
               <form
                 onSubmit={(e) => {
                   e.preventDefault();
                   if (editTitle.trim()) {
                     updateTaskMutation.mutate({ taskId: expandedTask.id, title: editTitle.trim(), description: editDescription });
                   }
                 }}
                 className="flex flex-col gap-2 mb-4"
               >
                 <input
                   autoFocus
                   value={editTitle}
                   onChange={(e) => setEditTitle(e.target.value)}
                   className="text-xl font-bold rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
                 />
                 <textarea
                   value={editDescription}
                   onChange={(e) => setEditDescription(e.target.value)}
                   rows={4}
                   placeholder="Description (Markdown supported)"
                   className="text-sm rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
                 />
                 {updateTaskMutation.isError && (
                   <p className="text-destructive text-xs">Failed to update task: {(updateTaskMutation.error as Error).message}</p>
                 )}
                 <div className="flex gap-2">
                   <button
                     type="submit"
                     disabled={!editTitle.trim() || updateTaskMutation.isPending}
                     className="px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-md text-xs font-medium"
                   >
                     {updateTaskMutation.isPending ? 'Saving...' : 'Save'}
                   </button>
                   <button
                     type="button"
                     onClick={() => setIsEditingTask(false)}
                     className="px-3 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-xs font-medium"
                   >
                     Cancel
                   </button>
                 </div>
               </form>
             ) : (
               <h3 className="text-xl font-bold mb-4">{expandedTask.title}</h3>
             )}
             {!isEditingTask && (
               <div className="prose prose-sm dark:prose-invert max-w-none">
                  {expandedTask.description ? (
                    <MarkdownRenderer content={expandedTask.description} />
                  ) : (
                    <p className="text-muted-foreground italic">No description provided.</p>
                  )}
               </div>
             )}
             <div className="mt-8">
               <h3 className="text-lg font-semibold tracking-tight mb-4">Comments</h3>
               <Comment.Provider entityId={expandedTask.id} entityType="task">
                 <Comment.List />
                 <Comment.Composer />
               </Comment.Provider>
             </div>
           </div>
           <div className="w-full md:w-72 shrink-0 border-t md:border-t-0 md:border-l p-6 overflow-y-auto custom-scrollbar space-y-6 bg-muted/20">
             <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex justify-between items-center">
                  <span className="w-20">Status:</span>
                  <select
                    value={expandedTask.status || 'todo'}
                    disabled={updateStatusMutation.isPending}
                    onChange={(e) => updateStatusMutation.mutate({ taskId: expandedTask.id, status: e.target.value })}
                    className="text-foreground bg-transparent border rounded-md px-2 py-1 text-sm"
                  >
                    {expandedTaskStatusOptions.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.display}</option>
                    ))}
                  </select>
                </div>
                {updateStatusMutation.isError && (
                  <p className="text-destructive text-xs">Failed to update status: {(updateStatusMutation.error as Error).message}</p>
                )}
                {/* Was a hardcoded "Unassigned", shown whether or not the task
                    had assignees — the detail view's version of M05-T02's chip. */}
                <div className="flex justify-between gap-3">
                  <span className="w-20 shrink-0">Assignee:</span>
                  <div className="flex-1">
                    <AssigneePicker taskId={expandedTask.id} orgId={activeOrgId} assignees={(expandedTask as any).assignees ?? []} />
                  </div>
                </div>
             </div>
             <div>
               <h3 className="text-sm font-semibold tracking-tight mb-3">Reviewers</h3>
               <ReviewerPicker taskId={expandedTask.id} orgId={activeOrgId} />
             </div>
             <div>
               <h3 className="text-sm font-semibold tracking-tight mb-3">Artifacts</h3>
               <TaskArtifactLinks taskId={expandedTask.id} orgId={activeOrgId} />
             </div>
             <div>
               <h3 className="text-sm font-semibold tracking-tight mb-3">Labels</h3>
               <Label.Provider entityId={expandedTask.id} entityType="task" orgId={activeOrgId}>
                 <Label.Chips />
                 <div className="mt-3">
                   <Label.Picker />
                 </div>
               </Label.Provider>
             </div>
             <div>
               <h3 className="text-sm font-semibold tracking-tight mb-3">Agent Notes</h3>
               <TaskNotesPanel taskId={expandedTask.id} />
             </div>
           </div>
           </div>
        </Dialog>
      )}
      {confirmDialog}
    </div>
  );
}
