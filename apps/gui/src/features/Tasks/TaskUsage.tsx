import type { UsageTotals } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { formatCount, formatMicros } from '../../lib/format';

interface TaskUsageProps {
  usage?: UsageTotals;
}

/**
 * What agents reported this task's work cost (M40, ADR-0033). Read-only: the
 * numbers are the agents' own reports, totalled by the server.
 */
export function TaskUsage({ usage }: TaskUsageProps) {
  if (!usage || usage.reports === 0n) {
    return <p className="text-sm text-muted-foreground">No agent has reported usage for this task.</p>;
  }
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm" aria-label="Usage and cost">
      <div>
        <dt className="text-xs text-muted-foreground">Cost</dt>
        <dd className="font-semibold tabular-nums">{formatMicros(usage.costMicros)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Input tokens</dt>
        <dd className="tabular-nums">{formatCount(usage.inputTokens)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Output tokens</dt>
        <dd className="tabular-nums">{formatCount(usage.outputTokens)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Reports</dt>
        <dd className="tabular-nums">{formatCount(usage.reports)}</dd>
      </div>
    </dl>
  );
}
