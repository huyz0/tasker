import type { ReactNode } from 'react';
import type { PlanStep, TaskSummary, UsageTotals } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { TaskPlan } from './TaskPlan';
import { TaskUsage } from './TaskUsage';
import { useSummaryDrafts } from './summaryDrafts';
import { TaskSummaryPanel } from './TaskSummary';
import { TaskClaimHistory } from './TaskClaimHistory';
import { TaskReportScopeControl, useTaskReportScope } from './TaskReportScope';
import { TaskUsageRecords } from './TaskUsageRecords';

interface TaskContextProps {
  taskId: string;
  summary?: TaskSummary;
  plan?: PlanStep[];
  usage?: UsageTotals;
  children?: ReactNode;
}

/** Empty optional context stays discoverable; native disclosures retain drafts when closed. */
export function TaskContext({ taskId, summary, plan, usage, children }: TaskContextProps) {
  const draft = useSummaryDrafts(state => state.entries[taskId]);
  const reportScope = useTaskReportScope();
  return (
    <>
      <details open={!!summary || !!draft} className="mt-6">
        <summary className="cursor-pointer rounded-sm py-2 focus-visible:ring-2 focus-visible:ring-primary/50"><h3 className="inline type-section-title">Summary</h3></summary>
        <div className="mt-2"><TaskSummaryPanel taskId={taskId} summary={summary} /></div>
      </details>
      {reportScope && <TaskReportScopeControl />}
      {children}
      {reportScope && <TaskClaimHistory />}
      <details open={!!plan?.length} className="mt-6">
        <summary className="cursor-pointer rounded-sm py-2 focus-visible:ring-2 focus-visible:ring-primary/50"><h3 className="inline type-section-title">Agent plan</h3></summary>
        <div className="mt-2"><TaskPlan steps={plan ?? []} /></div>
      </details>
      <details open={!!usage?.reports} className="mt-6">
        <summary className="cursor-pointer rounded-sm py-2 focus-visible:ring-2 focus-visible:ring-primary/50"><h3 className="inline type-section-title">Usage and cost</h3></summary>
        <div className="mt-2">
          {reportScope && <p className="type-caption text-muted-foreground mb-2">Task-wide totals</p>}
          <TaskUsage usage={usage} />
          {reportScope && <TaskUsageRecords />}
        </div>
      </details>
    </>
  );
}
