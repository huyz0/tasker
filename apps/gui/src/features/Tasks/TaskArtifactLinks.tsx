import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { useDebounce } from 'use-debounce';
import { transport } from '../../lib/connectTransport';
import { ArtifactService, SearchService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';

const artifactClient = createClient(ArtifactService, transport);
const searchClient = createClient(SearchService, transport);

const PAGE = 10;

/**
 * The task ↔ artifact relation, rendered from whichever end the caller is
 * standing at. Pass `taskId` on a task detail to see its artifacts; pass
 * `artifactId` in the artifact viewer to see its tasks.
 *
 * One component rather than two because — unlike assignees and reviewers, which
 * draw from different sets — this is a single table read from two ends. The
 * rows have the same shape either way, so splitting it would duplicate the
 * search, the mutations and the empty states to change two labels.
 *
 * Candidates come from `universalSearch`, which is bounded and already splits
 * its page evenly between tasks and artifacts, so neither type can crowd the
 * other out. It requires a query, so this picker asks for one rather than
 * opening onto a list of everything — which is also what keeps it from
 * repeating M05-T04's enumeration.
 */
export function TaskArtifactLinks({ taskId, artifactId, orgId }: { taskId?: string; artifactId?: string; orgId: string }) {
  const anchor = taskId ? 'task' : 'artifact';
  const queryClient = useQueryClient();
  const [isPicking, setIsPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 250);

  const key = ['taskArtifactLinks', anchor, taskId ?? artifactId];
  const linksQuery = useQuery({
    queryKey: key,
    enabled: !!(taskId || artifactId),
    queryFn: async () =>
      (await artifactClient.listTaskArtifactLinks(taskId ? { taskId } : { artifactId })).links,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const candidates = useQuery({
    queryKey: ['linkCandidates', anchor, orgId, debouncedSearch],
    enabled: isPicking && !!orgId && debouncedSearch.trim().length > 0,
    queryFn: async () => {
      const r = await searchClient.universalSearch({ orgId, query: debouncedSearch, page: { limit: PAGE } });
      // The opposite end of the relation: a task detail is looking for
      // artifacts, the artifact viewer for tasks.
      return r.results.filter((x: any) => x.type === (anchor === 'task' ? 'artifact' : 'task'));
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (otherId: string) => {
      await artifactClient.linkTaskArtifact(
        taskId ? { taskId, artifactId: otherId } : { taskId: otherId, artifactId: artifactId! },
      );
    },
    onSuccess: () => { setIsPicking(false); setSearch(''); invalidate(); },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (link: any) => {
      await artifactClient.unlinkTaskArtifact({ taskId: link.taskId, artifactId: link.artifactId });
    },
    onSuccess: invalidate,
  });

  const links = linksQuery.data ?? [];
  const nameOf = (l: any) => (anchor === 'task' ? l.artifactName : l.taskTitle);
  const linkedIds = new Set(links.map((l: any) => (anchor === 'task' ? l.artifactId : l.taskId)));
  const offered = (candidates.data ?? []).filter((c: any) => !linkedIds.has(c.id));
  const noun = anchor === 'task' ? 'artifact' : 'task';

  return (
    <div className="flex flex-col gap-2">
      {links.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          {anchor === 'task' ? 'No linked artifacts' : 'Not linked to any task'}
        </span>
      ) : (
        <ul className="flex flex-col gap-1">
          {links.map((l: any) => (
            <li key={l.id} className="flex items-center gap-2 text-xs">
              <span className="truncate">{nameOf(l)}</span>
              <button
                aria-label={`Unlink ${nameOf(l)}`}
                onClick={() => unlinkMutation.mutate(l)}
                disabled={unlinkMutation.isPending}
                className="ml-auto text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {isPicking ? (
        <div className="flex flex-col gap-1 border rounded-md p-2 bg-card">
          <label className="text-xs font-medium" htmlFor={`link-search-${anchor}`}>
            {anchor === 'task' ? 'Search artifacts' : 'Search tasks'}
          </label>
          <input
            id={`link-search-${anchor}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or contents"
            className="text-xs rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
          />
          {!debouncedSearch.trim() && (
            // The search is org-wide, so there is no bounded "everything" to
            // show before a query — saying so beats an empty list that reads as
            // "nothing exists".
            <span className="text-xs text-muted-foreground">Type to search.</span>
          )}
          {candidates.isLoading && <span className="text-xs text-muted-foreground">Searching…</span>}
          {offered.map((c: any) => (
            <button
              key={c.id}
              onClick={() => linkMutation.mutate(c.id)}
              disabled={linkMutation.isPending}
              className="text-left text-xs px-1 py-0.5 rounded hover:bg-accent disabled:opacity-50"
            >
              {c.title}
            </button>
          ))}
          {candidates.isSuccess && offered.length === 0 && (
            <span className="text-xs text-muted-foreground">
              {candidates.data?.length ? `Every matching ${noun} is already linked.` : `No ${noun} matches that.`}
            </span>
          )}
          <button
            onClick={() => { setIsPicking(false); setSearch(''); }}
            className="self-start text-xs text-muted-foreground mt-1"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={() => setIsPicking(true)} className="self-start text-xs text-primary hover:underline">
          {anchor === 'task' ? 'Link an artifact…' : 'Link a task…'}
        </button>
      )}

      {linkMutation.isError && (
        <span className="text-xs text-destructive">Failed to link: {(linkMutation.error as Error).message}</span>
      )}
      {unlinkMutation.isError && (
        <span className="text-xs text-destructive">Failed to unlink: {(unlinkMutation.error as Error).message}</span>
      )}
    </div>
  );
}
