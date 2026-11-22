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
    <div className="relative max-w-full overflow-x-auto">
    <div className="flex items-end gap-px h-16" role="img" aria-label={`Daily spend over ${days.length} days`}>
      {days.map((d) => {
        const pct = max === 0n ? 0 : Number((d.costMicros * 100n) / max);
        return (
          <div
            key={d.key}
            title={`${d.key}: ${formatMicros(d.costMicros)} (${formatCount(d.reports)} report${d.reports === 1n ? '' : 's'})`}
            className="flex-1 min-w-px rounded-t-sm bg-chart-1"
            style={{ height: `${Math.max(pct, d.costMicros > 0n ? 4 : 0)}%` }}
          />
        );
      })}
    </div>
    <div className="sr-only">
    <table>
      <caption>Daily spend data</caption>
      <thead><tr>
        <th scope="col">Day (UTC)</th><th scope="col">Cost</th>
        <th scope="col">Input tokens</th><th scope="col">Output tokens</th><th scope="col">Reports</th>
      </tr></thead>
      <tbody>{days.map((day) => (
        <tr key={day.key}>
          <th scope="row">{day.key}</th><td>{formatMicros(day.costMicros)}</td>
          <td>{formatCount(day.inputTokens)}</td><td>{formatCount(day.outputTokens)}</td><td>{formatCount(day.reports)}</td>
        </tr>
      ))}</tbody>
    </table>
    </div>
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
        emptyAction={<p className="type-caption">Agents report it with `tasker tasks usage report` or the MCP tool `report_usage`.</p>}
        onRetry={() => refetch()}
      >
        {data?.totals && (
          <div className="flex min-w-0 flex-col gap-4 p-2">
            <p className="type-body">
              <span className="type-metric wrap-anywhere">{formatMicros(data.totals.costMicros)}</span>
              <span className="text-muted-foreground"> · {formatCount(data.totals.inputTokens)} input / {formatCount(data.totals.outputTokens)} output tokens · {formatCount(data.totals.reports)} reports</span>
            </p>
            <DailySpend days={data.byDay} />
            <div role="region" aria-label="Agent spend table" tabIndex={0} className="max-w-full overflow-x-auto scrollbar-thin rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <table className="w-full min-w-96 type-body" aria-label="Spend by agent">
              <thead>
                <tr className="type-caption text-muted-foreground text-left">
                  <th scope="col" className="font-medium py-1">Agent</th>
                  <th className="font-medium px-2 py-1 text-right">Cost</th>
                  <th className="font-medium px-2 py-1 text-right">Tokens</th>
                  <th className="font-medium px-2 py-1 text-right">Reports</th>
                </tr>
              </thead>
              <tbody>
                {data.byAgent.map((a) => (
                  <tr key={a.key || 'people'} className="border-t">
                    <td className="py-1.5 pr-4 wrap-anywhere">{a.label}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatMicros(a.costMicros)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatCount(a.inputTokens + a.outputTokens)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatCount(a.reports)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </ListState>
    </ReportPanel>
  );
}
