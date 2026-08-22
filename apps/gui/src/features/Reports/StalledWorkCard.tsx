import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { sinceLabel } from '../../lib/sinceLabel';
import { ReportPanel, TaskLink } from './ReportPanel';
import { agoLabel, reportTaskClient } from './useReportsQueries';

// Narrower than the generated `StalledClaim`/`UnclaimedTask` messages — the
// same tradeoff every feature file here makes (see Handoffs/index.tsx).
export type StalledClaimRow = {
  taskId: string;
  taskDisplayId: string;
  taskTitle: string;
  agentId: string;
  agentName: string;
  /** Absent for claims that predate activity collection. */
  claimedAt?: string;
  /** Absent when the agent has produced nothing since claiming. */
  lastSignalAt?: string;
  agentLastSeenAt?: string;
  /** True: no signal since the claim (a broken runner), not a hard task. */
  neverStarted: boolean;
};

export type UnclaimedRow = {
  taskId: string;
  taskDisplayId: string;
  taskTitle: string;
  waitingSince: string;
};

function SectionHeading({ children }: { children: string }) {
  return <h3 className="px-2 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

/**
 * Card 1 — the work a human should free *today*. Agents cannot release their
 * own claims (`unassignTask` is `requireUser`), so every crashed or
 * wandered-off agent claim waits here for the per-row Unassign.
 */
export function StalledWorkCard({ stalledClaims, unclaimed }: {
  stalledClaims: StalledClaimRow[];
  unclaimed: UnclaimedRow[];
}) {
  const { confirm, confirmDialog } = useConfirm();
  const queryClient = useQueryClient();

  const unassignMutation = useMutation({
    mutationFn: async (variables: { taskId: string; agentId: string }) => {
      await reportTaskClient.unassignTask(variables);
    },
    // Every card on this screen derives from the same response, so the whole
    // ['reports'] prefix is stale, not just this list.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports'] }),
  });

  return (
    <ReportPanel
      title="Stalled work"
      subtitle="Claims with no recent signal, and tasks nobody has picked up — what to free today"
    >
      <SectionHeading>Claimed and silent</SectionHeading>
      {unassignMutation.isError && (
        <p className="px-2 pb-1 text-xs text-destructive">
          Failed to unassign: {(unassignMutation.error as Error).message}
        </p>
      )}
      {stalledClaims.length === 0 ? (
        <p className="p-2 text-sm text-muted-foreground">Nothing stalled — every claimed task has recent activity.</p>
      ) : (
        <ul className="divide-y">
          {stalledClaims.map((c) => {
            // Per-row pending: compare the shared mutation's variables to the
            // row, so one in-flight unassign does not disable its neighbours
            // (the M20 lesson).
            const isRowPending = unassignMutation.isPending && unassignMutation.variables?.taskId === c.taskId;
            const seen = sinceLabel(c.agentLastSeenAt);
            return (
              <li key={c.taskId} className="p-2 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <TaskLink taskId={c.taskId} displayId={c.taskDisplayId} title={c.taskTitle} />
                  <button
                    aria-label={`Unassign ${c.taskTitle}`}
                    disabled={isRowPending}
                    onClick={async () => {
                      if (await confirm({
                        title: `Unassign "${c.taskTitle}"?`,
                        consequence: `Releases ${c.agentName}'s claim so the task can be picked up again.`,
                        undo: 'Any agent can claim it again, or you can reassign it from the task view.',
                        confirmLabel: 'Unassign',
                      })) {
                        unassignMutation.mutate({ taskId: c.taskId, agentId: c.agentId });
                      }
                    }}
                    className="shrink-0 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {isRowPending ? 'Unassigning…' : 'Unassign'}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.agentName}
                  {c.claimedAt ? ` · claimed ${agoLabel(c.claimedAt)}` : ''}
                  {' · '}
                  {c.lastSignalAt ? `last signal ${agoLabel(c.lastSignalAt)}` : 'no signal since claim'}
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs rounded px-1.5 py-0.5 ${
                      c.neverStarted
                        ? 'bg-destructive-subtle text-destructive-subtle-foreground'
                        : 'bg-warning-subtle text-warning-subtle-foreground'
                    }`}
                  >
                    {c.neverStarted ? 'never started' : 'went quiet'}
                  </span>
                  <span
                    className={`text-xs rounded px-1.5 py-0.5 ${
                      seen.silent
                        ? 'bg-warning-subtle text-warning-subtle-foreground'
                        : 'bg-success-subtle text-success-subtle-foreground'
                    }`}
                  >
                    agent {seen.text}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SectionHeading>Waiting unclaimed</SectionHeading>
      {unclaimed.length === 0 ? (
        <p className="p-2 text-sm text-muted-foreground">No tasks waiting unclaimed — everything ready has been picked up.</p>
      ) : (
        <ul className="divide-y">
          {unclaimed.map((t) => (
            <li key={t.taskId} className="p-2 flex items-center justify-between gap-2">
              <TaskLink taskId={t.taskId} displayId={t.taskDisplayId} title={t.taskTitle} />
              <span className="shrink-0 text-xs text-muted-foreground">waiting {agoLabel(t.waitingSince)}</span>
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </ReportPanel>
  );
}
