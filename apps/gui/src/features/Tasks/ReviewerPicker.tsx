import { useState } from 'react';
import { ListState } from '../../components/ui/ListState';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { useDebounce } from 'use-debounce';
import { transport } from '../../lib/connectTransport';
import { TaskService, OrgService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';

const taskClient = createClient(TaskService, transport);
const orgClient = createClient(OrgService, transport);

const PAGE = 10;

/**
 * Reviewers on a task.
 *
 * People only — `task_reviewers` references `users`, and an agent reviewing its
 * own work is not a review. That is why this is a separate control from
 * `AssigneePicker` rather than the same one with a flag: the two answer
 * different questions and draw from different sets.
 *
 * The search is server-side for the reason M05-T04 learned the hard way: an
 * organization can hold 100,000 members, and fetching them to filter in the
 * browser does not work at that size.
 */
export function ReviewerPicker({ taskId, orgId }: { taskId: string; orgId: string }) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 250);

  const reviewersQuery = useQuery({
    queryKey: ['taskReviewers', taskId],
    queryFn: async () => (await taskClient.listTaskReviewers({ taskId })).reviewers,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['taskReviewers', taskId] });

  const candidates = useQuery({
    queryKey: ['reviewerCandidates', orgId, debouncedSearch],
    enabled: isAdding && !!orgId,
    queryFn: async () => {
      const r = await orgClient.listOrgMembers({ orgId, page: { limit: PAGE, filter: debouncedSearch || undefined } });
      return { members: r.members, total: Number(r.page?.totalCount ?? r.members.length) };
    },
  });

  const addMutation = useMutation({
    mutationFn: async (userId: string) => { await taskClient.addTaskReviewer({ taskId, userId }); },
    onSuccess: () => { setIsAdding(false); setSearch(''); invalidate(); },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => { await taskClient.removeTaskReviewer({ taskId, userId }); },
    onSuccess: invalidate,
  });

  const reviewers = reviewersQuery.data ?? [];
  const existing = new Set(reviewers.map((r: any) => r.userId));
  const people = (candidates.data?.members ?? []).filter((m: any) => !existing.has(m.userId));

  return (
    <div className="flex flex-col gap-2">
      {reviewersQuery.isLoading || reviewersQuery.error || reviewers.length === 0 ? (
        // A failed `listReviewers` used to render "No reviewers", which is the
        // same words the task uses when it genuinely has none (M06-T11).
        <ListState
          isLoading={reviewersQuery.isLoading}
          error={reviewersQuery.error}
          isEmpty
          loadingMessage="Loading reviewers…"
          emptyMessage="No reviewers"
          emptyAction={<p className="text-xs">Add one below to have them review this task.</p>}
          onRetry={() => reviewersQuery.refetch()}
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {reviewers.map((r: any) => (
            <li key={r.id} className="flex items-center gap-2 text-xs">
              <span className="truncate">{r.name}</span>
              <button
                aria-label={`Remove ${r.name} as a reviewer`}
                onClick={() => removeMutation.mutate(r.userId)}
                disabled={removeMutation.isPending}
                className="ml-auto text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {isAdding ? (
        <div className="flex flex-col gap-1 border rounded-md p-2 bg-card">
          <label className="text-xs font-medium" htmlFor={`reviewer-search-${taskId}`}>Search people</label>
          <input
            id={`reviewer-search-${taskId}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or email"
            className="text-xs rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
          />
          {candidates.isLoading && <span className="text-xs text-muted-foreground">Searching…</span>}
          {candidates.error && (
            <ListState
              isLoading={false}
              error={candidates.error}
              isEmpty={false}
              emptyMessage=""
              onRetry={() => candidates.refetch()}
            />
          )}
          {people.map((m: any) => (
            <button
              key={m.userId}
              onClick={() => addMutation.mutate(m.userId)}
              disabled={addMutation.isPending}
              className="text-left text-xs px-1 py-0.5 rounded hover:bg-accent disabled:opacity-50"
            >
              {m.name || m.email}
            </button>
          ))}
          {candidates.isSuccess && people.length === 0 && (
            <span className="text-xs text-muted-foreground">
              {debouncedSearch ? 'Nobody matches that.' : 'Everyone is already reviewing.'}
            </span>
          )}
          {candidates.isSuccess && (candidates.data?.total ?? 0) > people.length && (
            <span role="status" className="text-xs text-muted-foreground">
              Showing {people.length} of {candidates.data?.total} — keep typing to narrow it down.
            </span>
          )}
          <button onClick={() => { setIsAdding(false); setSearch(''); }} className="self-start text-xs text-muted-foreground mt-1">
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={() => setIsAdding(true)} className="self-start text-xs text-primary hover:underline">
          Add reviewer…
        </button>
      )}

      {addMutation.isError && (
        <span className="text-xs text-destructive">Failed to add reviewer: {(addMutation.error as Error).message}</span>
      )}
      {removeMutation.isError && (
        <span className="text-xs text-destructive">Failed to remove reviewer: {(removeMutation.error as Error).message}</span>
      )}
    </div>
  );
}
