import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { useDebounce } from 'use-debounce';
import { transport } from '../../lib/connectTransport';
import { TaskService, OrgService, AgentService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';

const taskClient = createClient(TaskService, transport);
const orgClient = createClient(OrgService, transport);
const agentClient = createClient(AgentService, transport);

/**
 * How many candidates to show at once. Small on purpose: this is a search
 * result, not a catalogue, and a longer list is more to read rather than more
 * useful.
 */
const PAGE = 10;

export interface Assignee {
  userId: string;
  agentId: string;
  name: string;
}

/**
 * Who is working on a task — people and agents in one control.
 *
 * `task_assignments` is many-to-many and always has been, so this renders a
 * list rather than a single value: showing "the assignee" would display the
 * first row of a set and hide the rest, making a task look unowned when it is
 * not.
 *
 * It **searches** rather than enumerating. The first version of this paged
 * through every member to fill a `<select>`, which against M03's
 * 100,001-member organization issued two thousand requests and never finished
 * loading — the unbounded-list defect M03 spent a milestone removing,
 * reintroduced on the client. The typed text goes to the server's `filter`
 * parameter, which is also what this milestone's sixth exit criterion asks for.
 */
export function AssigneePicker({ taskId, orgId, assignees }: { taskId: string; orgId: string; assignees: Assignee[] }) {
  const queryClient = useQueryClient();
  const [isPicking, setIsPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 250);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tasks'] });

  const candidates = useQuery({
    queryKey: ['assignableCandidates', orgId, debouncedSearch],
    enabled: isPicking && !!orgId,
    queryFn: async () => {
      const page = { limit: PAGE, filter: debouncedSearch || undefined };
      const [members, agents] = await Promise.all([
        orgClient.listOrgMembers({ orgId, page }),
        agentClient.listAgents({ orgId, page }),
      ]);
      return {
        members: members.members,
        agents: agents.agents,
        // What the server matched, not what it returned - the gap is the point.
        memberTotal: Number(members.page?.totalCount ?? members.members.length),
        agentTotal: Number(agents.page?.totalCount ?? agents.agents.length),
      };
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (choice: { kind: 'user' | 'agent'; id: string }) => {
      await taskClient.assignTask(choice.kind === 'agent' ? { taskId, agentId: choice.id } : { taskId, userId: choice.id });
    },
    onSuccess: () => { setIsPicking(false); setSearch(''); invalidate(); },
  });

  const unassignMutation = useMutation({
    mutationFn: async (a: Assignee) => {
      await taskClient.unassignTask(a.agentId ? { taskId, agentId: a.agentId } : { taskId, userId: a.userId });
    },
    onSuccess: invalidate,
  });

  const assignedUserIds = new Set(assignees.filter((a) => a.userId).map((a) => a.userId));
  const assignedAgentIds = new Set(assignees.filter((a) => a.agentId).map((a) => a.agentId));
  const people = (candidates.data?.members ?? []).filter((m: any) => !assignedUserIds.has(m.userId));
  const agents = (candidates.data?.agents ?? []).filter((a: any) => !assignedAgentIds.has(a.id));
  const matched = (candidates.data?.memberTotal ?? 0) + (candidates.data?.agentTotal ?? 0);
  const shown = people.length + agents.length;

  return (
    <div className="flex flex-col gap-2">
      {assignees.length === 0 ? (
        // A normal, actionable state — and the one a manager is looking for.
        <span className="text-xs text-muted-foreground">Unassigned</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {assignees.map((a) => (
            <li key={a.userId || a.agentId} className="flex items-center gap-2 text-xs">
              <span className="truncate">{a.name}</span>
              <span className="text-muted-foreground">{a.agentId ? 'agent' : 'person'}</span>
              <button
                aria-label={`Remove ${a.name} from this task`}
                onClick={() => unassignMutation.mutate(a)}
                disabled={unassignMutation.isPending}
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
          <label className="text-xs font-medium" htmlFor={`assign-search-${taskId}`}>
            Search people and agents
          </label>
          <input
            id={`assign-search-${taskId}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or email"
            className="text-xs rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
          />

          {candidates.isLoading && <span className="text-xs text-muted-foreground">Searching…</span>}

          {people.length > 0 && (
            <>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">People</span>
              {people.map((m: any) => (
                <button
                  key={m.userId}
                  onClick={() => assignMutation.mutate({ kind: 'user', id: m.userId })}
                  disabled={assignMutation.isPending}
                  className="text-left text-xs px-1 py-0.5 rounded hover:bg-accent disabled:opacity-50"
                >
                  {m.name || m.email}
                </button>
              ))}
            </>
          )}

          {agents.length > 0 && (
            <>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Agents</span>
              {agents.map((a: any) => (
                <button
                  key={a.id}
                  onClick={() => assignMutation.mutate({ kind: 'agent', id: a.id })}
                  disabled={assignMutation.isPending}
                  className="text-left text-xs px-1 py-0.5 rounded hover:bg-accent disabled:opacity-50"
                >
                  {a.name}
                </button>
              ))}
            </>
          )}

          {candidates.isSuccess && shown === 0 && (
            <span className="text-xs text-muted-foreground">
              {/* Two different situations. Telling them apart is what stops
                  someone retyping a name that was never going to appear. */}
              {debouncedSearch ? 'Nobody matches that.' : 'No members or agents left to assign.'}
            </span>
          )}

          {candidates.isSuccess && matched > shown && (
            <span role="status" className="text-xs text-muted-foreground">
              Showing {shown} of {matched} — keep typing to narrow it down.
            </span>
          )}

          <button onClick={() => { setIsPicking(false); setSearch(''); }} className="self-start text-xs text-muted-foreground mt-1">
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={() => setIsPicking(true)} className="self-start text-xs text-primary hover:underline">
          Assign…
        </button>
      )}

      {assignMutation.isError && (
        <span className="text-xs text-destructive">Failed to assign: {(assignMutation.error as Error).message}</span>
      )}
      {unassignMutation.isError && (
        <span className="text-xs text-destructive">Failed to remove: {(unassignMutation.error as Error).message}</span>
      )}
    </div>
  );
}
