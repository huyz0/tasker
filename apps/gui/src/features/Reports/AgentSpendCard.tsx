import { useQuery } from '@tanstack/react-query';
import type { UsageBucket } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { ListState } from '../../components/ui/ListState';
import { formatCount, formatMicros } from '../../lib/format';
import { ReportPanel } from './ReportPanel';
import { reportClient } from './useReportsQueries';

interface DailySpendProps {
  days: UsageBucket[];
}

/** One bar per UTC day, scaled to the window's most expensive day. */
function DailySpend({ days }: DailySpendProps) {
  const max = days.reduce((m, d) => (d.costMicros > m ? d.costMicros : m), 0n);
  return (
    <div className="flex items-end gap-px h-16" role="img" aria-label={`Daily spend over ${days.length} days`}>
      {days.map((d) => {
        const pct = max === 0n ? 0 : Number((d.costMicros * 100n) / max);
        return (
          <div
            key={d.key}
            title={`${d.key}: ${formatMicros(d.costMicros)} (${formatCount(d.reports)} report${d.reports === 1n ? '' : 's'})`}
            className="flex-1 min-w-px rounded-t-sm bg-primary/70"
            style={{ height: `${Math.max(pct, d.costMicros > 0n ? 4 : 0)}%` }}
          />
        );
      })}
    </div>
  );
}

interface AgentSpendCardProps {
  projectId: string;
  windowDays: number;
}

/**
 * Agent spend (M40, ADR-0033): what agents reported this project's work cost
 * over the window, who spent it, and when. Its own query, like the trends, so
 * a failing read never blanks the rest of the screen.
 */
export function AgentSpendCard({ projectId, windowDays }: AgentSpendCardProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'usage', projectId, windowDays],
    queryFn: async () => reportClient.getUsageReport({ projectId, days: windowDays }),
  });
  return (
    <ReportPanel title="Agent spend" subtitle="What agents report their work cost - which agents to tune, and whether spend is trending up.">
      <ListState
        isLoading={isLoading}
        error={error}
        isEmpty={!!data && data.totals?.reports === 0n}
        loadingMessage="Loading agent spend…"
        errorLabel="Could not load agent spend"
        emptyMessage="No agent reported usage in this window."
        emptyAction={<p className="text-xs">Agents report it with `tasker tasks usage report` or the MCP tool `report_usage`.</p>}
        onRetry={() => refetch()}
      >
        {data?.totals && (
          <div className="flex flex-col gap-4 p-2">
            <p className="text-sm">
              <span className="text-2xl font-semibold tabular-nums">{formatMicros(data.totals.costMicros)}</span>
              <span className="text-muted-foreground"> · {formatCount(data.totals.inputTokens)} input / {formatCount(data.totals.outputTokens)} output tokens · {formatCount(data.totals.reports)} reports</span>
            </p>
            <DailySpend days={data.byDay} />
            <table className="w-full text-sm" aria-label="Spend by agent">
              <thead>
                <tr className="text-xs text-muted-foreground text-left">
                  <th className="font-medium py-1">Agent</th>
                  <th className="font-medium py-1 text-right">Cost</th>
                  <th className="font-medium py-1 text-right hidden sm:table-cell">Tokens</th>
                  <th className="font-medium py-1 text-right">Reports</th>
                </tr>
              </thead>
              <tbody>
                {data.byAgent.map((a) => (
                  <tr key={a.key || 'people'} className="border-t">
                    <td className="py-1.5 truncate max-w-0 w-1/2">{a.label}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatMicros(a.costMicros)}</td>
                    <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">{formatCount(a.inputTokens + a.outputTokens)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatCount(a.reports)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListState>
    </ReportPanel>
  );
}
