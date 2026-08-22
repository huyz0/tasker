import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { useLayoutStore } from '../../store/layout';
import { ListState } from '../../components/ui/ListState';
import { reportClient, REPORT_WINDOWS } from './useReportsQueries';
import { StalledWorkCard } from './StalledWorkCard';
import { WentBackwardsCard } from './WentBackwardsCard';
import { ChurningTasksCard } from './ChurningTasksCard';
import { FleetScorecardCard } from './FleetScorecardCard';

/**
 * The "Agents completed N% (M% prior window)" header stat, computed from the
 * four counts client-side — the contract deliberately ships counts, not a
 * baked rate, so the numerator and denominator can be shown and a
 * zero-completion window can be named instead of divided by.
 */
function agentShareStat(counts: {
  agentCompleted: bigint;
  humanCompleted: bigint;
  priorAgentCompleted: bigint;
  priorHumanCompleted: bigint;
}): string {
  const agent = Number(counts.agentCompleted);
  const total = agent + Number(counts.humanCompleted);
  if (total === 0) return 'No completions in this window yet.';
  const share = `Agents completed ${Math.round((agent / total) * 100)}% of completed work (${agent} of ${total})`;
  const priorAgent = Number(counts.priorAgentCompleted);
  const priorTotal = priorAgent + Number(counts.priorHumanCompleted);
  if (priorTotal === 0) return `${share} · no completions in the prior window`;
  return `${share} · prior window ${Math.round((priorAgent / priorTotal) * 100)}%`;
}

/**
 * The project Reports screen (M24) — the on-the-loop monitoring surface.
 * Where the Dashboard answers "what needs me right now", this answers "how is
 * work performed in this project, and are the agents carrying it?".
 *
 * One page, no tabs; exception cards lead in urgency order because agents
 * fail discretely — stuck, looping, or marking things done that aren't — not
 * gradually. T09 adds the three trend cards beneath, driven by the same
 * window selector.
 */
export function ReportsScreen() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  useEffect(() => setActivePageTitle('Reports'), [setActivePageTitle]);

  const [windowDays, setWindowDays] = useState<number>(30);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'exceptions', activeProjectId, windowDays],
    enabled: !!activeProjectId,
    queryFn: async () => reportClient.getReportExceptions({ projectId: activeProjectId!, windowDays }),
  });

  if (!activeOrgId) {
    return <p className="p-4 text-sm text-muted-foreground">Select an organization to see project reports.</p>;
  }
  if (!activeProjectId) {
    return <p className="p-4 text-sm text-muted-foreground">Select a project to see its reports.</p>;
  }

  // Screen-level empty only when the whole window is quiet; a mixed window
  // shows every card, each with its own specific empty text.
  const isEmpty = !!data
    && data.stalledClaims.length === 0
    && data.unclaimed.length === 0
    && data.regressions.length === 0
    && data.churning.length === 0
    && data.agentRows.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-3xl font-semibold tracking-tight">Reports</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            How work is performed in this project, and whether the agents are carrying it.
          </p>
          {data && <p className="text-sm mt-1">{agentShareStat(data)}</p>}
        </div>
        <div role="group" aria-label="Report window" className="flex shrink-0 gap-0.5 rounded-md border p-0.5">
          {REPORT_WINDOWS.map((days) => (
            <button
              key={days}
              aria-pressed={windowDays === days}
              onClick={() => setWindowDays(days)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                windowDays === days
                  ? 'bg-primary-subtle text-primary-subtle-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {days} days
            </button>
          ))}
        </div>
      </div>

      <ListState
        isLoading={isLoading}
        error={error}
        isEmpty={isEmpty}
        loadingMessage="Loading project reports…"
        emptyMessage="Nothing to report in this window — no stalled work, reopened tasks, churn or agent activity recorded."
        emptyAction={<p className="text-xs">Exception cards fill in as agents claim and complete work.</p>}
        onRetry={() => refetch()}
      >
        {data && (
          <div className="flex flex-col gap-6">
            <StalledWorkCard stalledClaims={data.stalledClaims} unclaimed={data.unclaimed} />
            <WentBackwardsCard regressions={data.regressions} />
            <ChurningTasksCard churning={data.churning} />
            <FleetScorecardCard agentRows={data.agentRows} roleRows={data.roleRows} />
          </div>
        )}
      </ListState>
    </div>
  );
}
