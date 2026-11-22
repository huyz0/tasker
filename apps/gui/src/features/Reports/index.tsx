import { SavedViews } from '../../components/SavedViews/SavedViews';
import { useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useReportView } from '../../hooks/useOperationalView';
import { currentLocation } from '../../lib/liveRouterLocation';
import { useQuery } from '@tanstack/react-query';
import { useLayoutStore } from '../../store/layout';
import { ListState } from '../../components/ui/ListState';
import { reportClient, REPORT_WINDOWS } from './useReportsQueries';
import { StalledWorkCard } from './StalledWorkCard';
import { WentBackwardsCard } from './WentBackwardsCard';
import { ChurningTasksCard } from './ChurningTasksCard';
import { FleetScorecardCard } from './FleetScorecardCard';
import { TrendsSection } from './TrendsSection';
import { AgentSpendCard } from './AgentSpendCard';
import { PageHeader } from '../../components/ui/PageHeader';

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

const REPORT_SECTIONS = [
  { id: 'exceptions', label: 'Exceptions' },
  { id: 'trends', label: 'Trends' },
  { id: 'spend', label: 'Spend' },
] as const;

/** Section locations share the project/window URL and keep independent reads mounted. */
export function ReportsScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const rawSection = location.hash.slice(1);
  const section = REPORT_SECTIONS.find((item) => item.id === rawSection);
  const invalidSection = rawSection !== '' && !section;
  const activeSection = section?.id ?? 'exceptions';
  const title = activeSection === 'exceptions' ? 'Reports' : `Reports — ${section!.label}`;
  const root = useRef<HTMLDivElement>(null);
  const previousHash = useRef(location.hash);
  useLayoutEffect(() => {
    if (previousHash.current !== location.hash) {
      const heading = root.current?.querySelector('h1');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
      previousHash.current = location.hash;
    }
  }, [location.hash]);
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  useEffect(() => setActivePageTitle(title), [setActivePageTitle, title]);

  const view = useReportView();
  const { windowDays } = view.value;

  // History commits before the router render; a fast section activation must
  // preserve the window/scope the user just chose. Modified clicks keep the
  // anchor's native browser behavior.
  const activateSection = (event: MouseEvent<HTMLAnchorElement>, id: (typeof REPORT_SECTIONS)[number]['id']) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || event.currentTarget.target && event.currentTarget.target !== '_self') return;
    event.preventDefault();
    const live = currentLocation(location);
    const hash = `#${id}`;
    if (!/^\/reports\/?$/.test(live.pathname) || live.hash === hash) return;
    navigate({ pathname: live.pathname, search: live.search, hash });
  };


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
    <div ref={root} className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={title}
        description={
          <>
            How work is performed in this project, and whether the agents are carrying it.
            {data && <span className="mt-1 block text-sm text-foreground tabular-nums">{agentShareStat(data)}</span>}
          </>
        }
        toolbar={
          <>
          <SavedViews screen="reports" />
          <div role="group" aria-label="Report window" className="flex shrink-0 gap-0.5 rounded-md border p-0.5">
            {REPORT_WINDOWS.map((days) => (
              <button
                key={days}
                aria-pressed={windowDays === days}
                onClick={() => view.update({ windowDays: days })}
                className={`rounded px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                  windowDays === days
                    ? 'bg-primary-subtle text-primary-subtle-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {days} days
              </button>
            ))}
          </div>
          </>
        }
      />

      <nav aria-label="Report sections" className="flex max-w-full flex-wrap gap-1 border-b">
        {REPORT_SECTIONS.map((item) => (
          <Link
            key={item.id}
            to={{ pathname: location.pathname, search: location.search, hash: `#${item.id}` }}
            onClick={(event) => activateSection(event, item.id)}
            aria-current={activeSection === item.id ? 'location' : undefined}
            className={`inline-flex min-h-row items-center border-b-2 px-3 py-2 type-label outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeSection === item.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {invalidSection && (
        <div role="status" aria-label="Report section recovery" className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-surface-panel p-panel type-body">
          <p>This report section is unavailable. Showing Exceptions.</p>
          <Link onClick={(event) => activateSection(event, 'exceptions')} to={{ pathname: location.pathname, search: location.search, hash: '#exceptions' }} className="inline-flex min-h-row items-center rounded-md border px-3 py-2 type-label hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
            Show exceptions
          </Link>
        </div>
      )}

      {view.invalid.length > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-surface-panel p-panel type-body">
        <p>Some view settings couldn't be applied.</p>
        <button type="button" onClick={view.reset} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Reset view</button>
      </div>}

      <div role="region" aria-label="Exceptions" hidden={activeSection !== 'exceptions'}>
      <ListState
        isLoading={isLoading}
        error={error}
        isEmpty={isEmpty}
        loadingMessage="Loading project reports…"
        emptyMessage="Nothing to report in this window. No stalled work, reopened tasks, churn or agent activity was recorded."
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

      <div role="region" aria-label="Spend" hidden={activeSection !== 'spend'}>
      {/* Spend stays independent of the exceptions read. */}
      <AgentSpendCard projectId={activeProjectId} windowDays={windowDays} />

      </div>

      <div role="region" aria-label="Trends" hidden={activeSection !== 'trends'}>
      <TrendsSection projectId={activeProjectId} windowDays={windowDays} />
      </div>
    </div>
  );
}
