import { Link } from 'react-router-dom';
import { ReportPanel, TaskLink } from './ReportPanel';
import { agoLabel } from './useReportsQueries';

// Narrower than the generated `ChurningTask` message — the same tradeoff
// every feature file here makes (see Handoffs/index.tsx).
export type ChurningRow = {
  taskId: string;
  taskDisplayId: string;
  taskTitle: string;
  handoffCount: bigint;
  lastAgentName: string;
  lastHandoffAt: string;
  /** True: the last handing-off agent still holds the claim, so no other agent can pick the task up. */
  claimHeld: boolean;
};

/**
 * Card 3 — tasks bouncing between agents. The handoff notes say why; the
 * still-claimed flag says when a human has to release it (agents cannot
 * self-unassign).
 */
export function ChurningTasksCard({ churning }: { churning: ChurningRow[] }) {
  return (
    <ReportPanel
      title="Churning tasks"
      subtitle="Tasks handed between agents repeatedly — which ones need a human decision"
      action={
        <Link to="/handoffs" className="shrink-0 text-xs text-primary hover:underline">
          View handoff notes
        </Link>
      }
    >
      {churning.length === 0 ? (
        <p className="p-2 text-sm text-muted-foreground">No tasks are bouncing between agents in this window.</p>
      ) : (
        <ul className="divide-y">
          {churning.map((c) => (
            <li key={c.taskId} className="p-2 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <TaskLink taskId={c.taskId} displayId={c.taskDisplayId} title={c.taskTitle} />
                {c.claimHeld && (
                  <span className="shrink-0 text-xs rounded px-1.5 py-0.5 bg-warning-subtle text-warning-subtle-foreground">
                    still claimed
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {`${Number(c.handoffCount)} handoffs · last with ${c.lastAgentName} · ${agoLabel(c.lastHandoffAt)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </ReportPanel>
  );
}
