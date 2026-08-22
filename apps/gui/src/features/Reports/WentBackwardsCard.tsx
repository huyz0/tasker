import { ReportPanel, TaskLink } from './ReportPanel';
import { agoLabel } from './useReportsQueries';

// Narrower than the generated `StatusRegression` message — the same tradeoff
// every feature file here makes (see Handoffs/index.tsx).
export type RegressionRow = {
  taskId: string;
  taskDisplayId: string;
  taskTitle: string;
  fromStatus: string;
  toStatus: string;
  occurredAt: string;
  /** Absent when the actor has been purged. */
  actorName?: string;
  /** The assignee at the time of the regression, when one was an agent. */
  holderAgentName?: string;
};

/**
 * Card 2 — transitions out of a terminal status: the agent-native
 * reopened-bug signal. Work an agent marked done that was not.
 */
export function WentBackwardsCard({ regressions }: { regressions: RegressionRow[] }) {
  return (
    <ReportPanel
      title="Went backwards"
      subtitle="Finished work reopened in this window — which completions not to trust"
    >
      {regressions.length === 0 ? (
        <p className="p-2 text-sm text-muted-foreground">No terminal work reopened in this window.</p>
      ) : (
        <ul className="divide-y">
          {regressions.map((r) => (
            <li key={`${r.taskId}-${r.occurredAt}`} className="p-2 flex flex-col gap-1">
              <TaskLink taskId={r.taskId} displayId={r.taskDisplayId} title={r.taskTitle} />
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{r.fromStatus} → {r.toStatus}</span>
                {` · ${agoLabel(r.occurredAt)} · by ${r.actorName ?? '(deleted agent)'}`}
                {r.holderAgentName ? ` · held by ${r.holderAgentName}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </ReportPanel>
  );
}
