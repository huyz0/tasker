import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { useDebounce } from 'use-debounce';
import { transport } from '../../lib/connectTransport';
import { TaskService, type TaskRef } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { ListState } from '../../components/ui/ListState';
import { useScopedTo } from '../../hooks/useScope';

const taskClient = createClient(TaskService, transport);

const PAGE = 10;

type PickMode = 'blocker' | 'parent';

interface TaskRelationsProps {
  taskId: string;
  projectId: string;
}

/**
 * A task's place in the work graph (M35, ADR-0028): what it waits on, what
 * waits on it, its parent and subtasks, and where it was discovered.
 *
 * Blockers and the parent are editable here; the other relations are the
 * other end of someone else's edit and are shown, not changed. Candidates come
 * from `listTasks` over this project with a title filter - bounded, and it
 * needs a query, so the picker never enumerates the project (M05-T04).
 */
export function TaskRelations({ taskId, projectId }: TaskRelationsProps) {
  const queryClient = useQueryClient();
  const scopedTo = useScopedTo();
  const [picking, setPicking] = useState<PickMode | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 250);

  const key = ['taskLinks', taskId];
  const linksQuery = useQuery({
    queryKey: key,
    queryFn: async () => taskClient.listTaskLinks({ taskId }),
  });
  // A link changes the task's blocked count and the board's badges as well as
  // this panel, so all three are refreshed.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
  };

  const candidates = useQuery({
    queryKey: ['relationCandidates', projectId, debouncedSearch],
    enabled: !!picking && debouncedSearch.trim().length > 0,
    queryFn: async () =>
      (await taskClient.listTasks({ projectId, page: { limit: PAGE, filter: debouncedSearch } })).tasks,
  });

  const done = () => { setPicking(null); setSearch(''); invalidate(); };
  const addBlocker = useMutation({
    mutationFn: async (linkedTaskId: string) => { await taskClient.addTaskLink({ taskId, linkedTaskId, kind: 'blocked_by' }); },
    onSuccess: done,
  });
  const removeBlocker = useMutation({
    mutationFn: async (linkedTaskId: string) => { await taskClient.removeTaskLink({ taskId, linkedTaskId, kind: 'blocked_by' }); },
    onSuccess: invalidate,
  });
  const setParent = useMutation({
    mutationFn: async (parent: string) => { await taskClient.updateTask({ taskId, parentTaskId: parent }); },
    onSuccess: done,
  });

  const links = linksQuery.data;
  const taken = new Set([taskId, ...(links?.blockedBy ?? []).map((r) => r.id), ...(links?.parent ? [links.parent.id] : [])]);
  const offered = (candidates.data ?? []).filter((t) => !taken.has(t.id));
  const error = addBlocker.error ?? removeBlocker.error ?? setParent.error;

  const ref = (r: TaskRef, onRemove?: () => void, removeLabel?: string) => (
    <li key={r.id} className="flex items-center gap-2 text-xs">
      <Link
        to={scopedTo(`/tasks/${r.id}`)}
        className={`truncate hover:underline ${r.terminal ? 'line-through text-muted-foreground' : ''}`}
        title={r.terminal ? `${r.title} (finished)` : r.title}
      >
        <span className="font-mono text-muted-foreground mr-1">{r.displayId}</span>
        {r.title}
      </Link>
      {onRemove && (
        <button
          aria-label={removeLabel}
          onClick={onRemove}
          disabled={removeBlocker.isPending || setParent.isPending}
          className="ml-auto text-muted-foreground hover:text-destructive disabled:opacity-50"
        >
          ✕
        </button>
      )}
    </li>
  );

  const section = (title: string, refs: TaskRef[], removable = false) =>
    refs.length > 0 && (
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-1">{title}</h4>
        <ul className="flex flex-col gap-1">
          {refs.map((r) => ref(r, removable ? () => removeBlocker.mutate(r.id) : undefined, `Remove blocker ${r.displayId}`))}
        </ul>
      </div>
    );

  if (linksQuery.isLoading || linksQuery.error || !links) {
    return (
      <ListState
        isLoading={linksQuery.isLoading}
        error={linksQuery.error}
        isEmpty={false}
        emptyMessage=""
        loadingMessage="Loading relations…"
        errorLabel="Could not load relations"
        onRetry={() => linksQuery.refetch()}
      />
    );
  }

  const empty = !links.parent && !links.discoveredFrom &&
    links.blockedBy.length + links.blocks.length + links.children.length + links.discovered.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {empty && <p className="text-xs text-muted-foreground">Not linked to other tasks.</p>}
      {links.parent && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">Parent</h4>
          <ul>{ref(links.parent, () => setParent.mutate(''), 'Remove parent')}</ul>
        </div>
      )}
      {section('Blocked by', links.blockedBy, true)}
      {section('Blocks', links.blocks)}
      {section('Subtasks', links.children)}
      {links.discoveredFrom && section('Discovered from', [links.discoveredFrom])}
      {section('Discovered here', links.discovered)}

      {picking ? (
        <div className="flex flex-col gap-1 border rounded-md p-2 bg-card">
          <label className="text-xs font-medium" htmlFor="relation-search">
            {picking === 'blocker' ? 'Blocked by which task?' : 'Parent task'}
          </label>
          <input
            id="relation-search"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this project's tasks"
            className="text-xs rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
          />
          {!debouncedSearch.trim() && <span className="text-xs text-muted-foreground">Type to search.</span>}
          {candidates.isLoading && <span className="text-xs text-muted-foreground">Searching…</span>}
          {offered.map((t) => (
            <button
              key={t.id}
              onClick={() => (picking === 'blocker' ? addBlocker.mutate(t.id) : setParent.mutate(t.id))}
              disabled={addBlocker.isPending || setParent.isPending}
              className="text-left text-xs px-1 py-0.5 rounded hover:bg-accent disabled:opacity-50"
            >
              <span className="font-mono text-muted-foreground mr-1">{t.displayId}</span>
              {t.title}
            </button>
          ))}
          {candidates.isSuccess && offered.length === 0 && (
            <span className="text-xs text-muted-foreground">No other task matches that.</span>
          )}
          <button onClick={() => { setPicking(null); setSearch(''); }} className="self-start text-xs text-muted-foreground mt-1">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          <button onClick={() => setPicking('blocker')} className="text-xs text-primary hover:underline">Add blocker…</button>
          {!links.parent && (
            <button onClick={() => setPicking('parent')} className="text-xs text-primary hover:underline">Set parent…</button>
          )}
        </div>
      )}
      {error && <span className="text-xs text-destructive">{(error as Error).message}</span>}
    </div>
  );
}
