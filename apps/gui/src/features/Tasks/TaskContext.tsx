import type { PlanStep, TaskSummary, UsageTotals } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { TaskPlan } from './TaskPlan';
import { TaskUsage } from './TaskUsage';
import { TaskSummaryPanel } from './TaskSummary';

interface TaskContextProps {
  taskId: string;
  summary?: TaskSummary;
  plan?: PlanStep[];
  usage?: UsageTotals;
}

/** Empty optional context stays discoverable; native disclosures retain drafts when closed. */
export function TaskContext({ taskId, summary, plan, usage }: TaskContextProps) {
  return (
    <>
      <details open={!!summary} className="mt-6">
        <summary className="cursor-pointer rounded-sm py-2 focus-visible:ring-2 focus-visible:ring-primary/50"><h3 className="inline type-section-title">Summary</h3></summary>
        <div className="mt-2"><TaskSummaryPanel taskId={taskId} summary={summary} /></div>
      </details>
      <details open={!!plan?.length} className="mt-6">
        <summary className="cursor-pointer rounded-sm py-2 focus-visible:ring-2 focus-visible:ring-primary/50"><h3 className="inline type-section-title">Agent plan</h3></summary>
        <div className="mt-2"><TaskPlan steps={plan ?? []} /></div>
      </details>
      <details open={!!usage?.reports} className="mt-6">
        <summary className="cursor-pointer rounded-sm py-2 focus-visible:ring-2 focus-visible:ring-primary/50"><h3 className="inline type-section-title">Usage and cost</h3></summary>
        <div className="mt-2"><TaskUsage usage={usage} /></div>
      </details>
    </>
  );
}
