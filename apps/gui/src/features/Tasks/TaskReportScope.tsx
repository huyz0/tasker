import { createContext, use, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { TaskAttempt } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useTaskReportAccess, type TaskReportOwner } from './taskReportAccess';

export type TaskReportFilter = { kind: 'all' } | { kind: 'uncorrelated' } | { kind: 'receipt'; receipt: TaskAttempt };
interface ReportScope extends TaskReportOwner {
  filter: TaskReportFilter; blocked: boolean;
  choose(filter: TaskReportFilter, focus?: boolean): void;
  heading: React.RefObject<HTMLHeadingElement | null>;
}
const Scope = createContext<ReportScope | undefined>(undefined);
export const useTaskReportScope = () => use(Scope);
export const reportFilterArguments = (filter: TaskReportFilter) => filter.kind === 'receipt'
  ? { attemptId: filter.receipt.id } : filter.kind === 'uncorrelated' ? { uncorrelatedOnly: true } : {};
export const reportFilterKey = (filter: TaskReportFilter) => filter.kind === 'receipt' ? filter.receipt.id : filter.kind;

export function TaskReportScopeProvider({ children, ...owner }: TaskReportOwner & { children: ReactNode }) {
  const [filter, setFilter] = useState<TaskReportFilter>({ kind: 'all' });
  const heading = useRef<HTMLHeadingElement>(null), access = useTaskReportAccess(owner, 'history');
  useEffect(() => { if (access.blocked) setFilter({ kind: 'all' }); }, [access.blocked]);
  if (!owner.accountId || !owner.orgId || !owner.taskId) return <Scope value={undefined}>{children}</Scope>;
  return <Scope value={{ ...owner, filter: access.blocked ? { kind: 'all' } : filter, blocked: access.blocked, heading,
    choose: (next, focus = false) => { setFilter(next); if (focus) heading.current?.focus(); } }}>{children}</Scope>;
}

export function TaskReportScopeControl() {
  const scope = useTaskReportScope(), id = useId();
  if (!scope) return null;
  return <section className="mt-6 space-y-2" aria-label="Report scope controls">
    <h3 ref={scope.heading} tabIndex={-1} className="type-section-title rounded-sm focus-visible:ring-2 focus-visible:ring-primary/50">Report scope</h3>
    <label htmlFor={id} className="sr-only">Report scope</label>
    <select id={id} value={scope.filter.kind} disabled={scope.blocked}
      className="w-full min-w-0 max-w-full rounded-md border bg-background px-3 py-2 type-body"
      onChange={event => {
        if (event.target.value === 'all') scope.choose({ kind: 'all' });
        else if (event.target.value === 'uncorrelated') scope.choose({ kind: 'uncorrelated' });
      }}>
      <option value="all">All reports</option><option value="uncorrelated">Without claim receipt</option>
      {scope.filter.kind === 'receipt' && <option value="receipt">Claim {scope.filter.receipt.id}</option>}
    </select>
    <p className="type-caption text-muted-foreground">{scope.blocked ? 'Refresh claim history to verify current task access.'
      : scope.filter.kind === 'all' ? 'Evidence, agent notes and usage records for this task.'
        : scope.filter.kind === 'uncorrelated' ? 'Showing recorded reports without a claim receipt.'
          : `Showing reports associated with ${scope.filter.receipt.owner?.name || scope.filter.receipt.owner?.id || 'the recorded owner'}’s claim.`}</p>
  </section>;
}
