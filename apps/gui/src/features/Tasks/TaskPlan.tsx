import type { PlanStep } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';

const MARKS: Record<string, { symbol: string; label: string; className: string }> = {
  done: { symbol: '✓', label: 'Done', className: 'text-success' },
  in_progress: { symbol: '▶', label: 'In progress', className: 'text-primary' },
  skipped: { symbol: '–', label: 'Skipped', className: 'text-muted-foreground' },
  pending: { symbol: '○', label: 'Pending', className: 'text-muted-foreground' },
};

interface TaskPlanProps {
  steps: PlanStep[];
}

/**
 * The working agent's plan for a task (M38, ADR-0031), with how far through
 * it the agent is. Read-only: the plan is the agent's, replaced whole each time
 * it updates, so there is nothing for a person to edit here.
 */
export function TaskPlan({ steps }: TaskPlanProps) {
  if (steps.length === 0) return <p className="text-sm text-muted-foreground">The agent has not shared a plan.</p>;
  const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const pct = Math.round((done / steps.length) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-label="Plan progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
          className="h-2 flex-1 rounded-full bg-muted overflow-hidden"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{done} of {steps.length}</span>
      </div>
      <ol className="flex flex-col gap-1" aria-label="Plan steps">
        {steps.map((s, i) => {
          const mark = MARKS[s.status] ?? MARKS.pending!;
          return (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span aria-hidden="true" className={`w-4 shrink-0 text-center ${mark.className}`}>{mark.symbol}</span>
              <span className="sr-only">{mark.label}: </span>
              <span className={s.status === 'skipped' ? 'line-through text-muted-foreground' : s.status === 'in_progress' ? 'font-medium' : ''}>{s.title}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
