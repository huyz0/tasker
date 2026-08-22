import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../lib/connectTransport';
import { DashboardService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore, type LayoutState } from '../store/layout';
import { ListState } from '../components/ui/ListState';
import { sinceLabel } from '../lib/sinceLabel';

const dashboardClient = createClient(DashboardService, transport);

/**
 * The home screen answers "what needs me", not "what exists".
 *
 * It used to show four entity counts — organizations, projects, agents, tasks —
 * and the database's latency. Counts of things that exist only ever climb, and
 * none of the four survived the question "what will you do differently because
 * of this number?". They were also at three different scopes on one row, so
 * switching project changed one card and left three still.
 *
 * A supervisor of agent work has three questions, and the panels are them in
 * order: what is waiting on my judgement, where does the record disagree with
 * reality, and which agents have gone quiet. Everything here is one RPC — the
 * server does the joins rather than the browser doing four round trips.
 */

function Panel({ title, subtitle, action, children }: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border rounded-lg bg-card shadow-sm flex flex-col">
      <div className="p-4 border-b flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="p-2 flex-1">{children}</div>
    </section>
  );
}

function TaskRow({ task, children }: { task: any; children?: ReactNode }) {
  return (
    <Link
      to={`/tasks/${task.id}`}
      className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <span className="font-mono text-xs text-muted-foreground shrink-0 pt-0.5">{task.displayId}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm truncate">{task.title}</span>
        {children}
      </span>
    </Link>
  );
}

export function Dashboard() {
  const setActivePageTitle = useLayoutStore((s: LayoutState) => s.setActivePageTitle);
  const activeOrgId = useLayoutStore((s: LayoutState) => s.activeOrgId);
  const activeProjectId = useLayoutStore((s: LayoutState) => s.activeProjectId);
  useEffect(() => setActivePageTitle('Dashboard'), [setActivePageTitle]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard', activeOrgId, activeProjectId],
    enabled: !!activeOrgId,
    queryFn: async () => dashboardClient.getDashboard({ orgId: activeOrgId, projectId: activeProjectId || undefined }),
  });

  if (!activeOrgId) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <ListState
          isLoading={false}
          error={null}
          isEmpty
          emptyMessage="No organization selected."
          emptyAction={<p className="text-xs">Pick one in the sidebar to see what needs you.</p>}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">What needs you, and what your agents have been doing.</p>
      </div>

      {(isLoading || error) && (
        <ListState
          isLoading={isLoading}
          error={error}
          isEmpty={false}
          loadingMessage="Loading your dashboard…"
          emptyMessage=""
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !error && data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel
            title="Waiting on you"
            subtitle="Tasks you are a reviewer on that are not finished"
            action={
              <span className="text-2xl font-semibold tabular-nums">{Number(data.awaitingReviewCount)}</span>
            }
          >
            <ListState
              isLoading={false}
              error={null}
              isEmpty={data.awaitingReview.length === 0}
              emptyMessage="Nothing is waiting on your review."
              emptyAction={<p className="text-xs">Add yourself as a reviewer on a task to see it here.</p>}
            >
              {data.awaitingReview.map((t: any) => (
                <TaskRow key={t.id} task={t}>
                  <span className="text-xs text-muted-foreground">{t.status}</span>
                </TaskRow>
              ))}
            </ListState>
          </Panel>

          <Panel
            title="Done, but the PR is open"
            subtitle="Where the recorded status contradicts the pull request"
            action={
              <span className="text-2xl font-semibold tabular-nums">{Number(data.disagreementCount)}</span>
            }
          >
            <ListState
              isLoading={false}
              error={null}
              isEmpty={data.disagreements.length === 0}
              emptyMessage="Every finished task has a settled pull request."
              emptyAction={<p className="text-xs">Tasks marked done with an open PR appear here.</p>}
            >
              {data.disagreements.map((d: any) => (
                <TaskRow key={d.task.id} task={d.task}>
                  <span className="text-xs text-warning-subtle-foreground bg-warning-subtle rounded px-1.5 py-0.5 inline-block mt-1">
                    PR #{d.pullRequestId} {d.pullRequestStatus}
                  </span>
                </TaskRow>
              ))}
            </ListState>
          </Panel>

          <Panel title="Agents" subtitle="When each was last heard from, and what it is holding">
            <ListState
              isLoading={false}
              error={null}
              isEmpty={data.agents.length === 0}
              emptyMessage="No agents in this organization."
              emptyAction={<Link to="/agents" className="text-xs text-primary hover:underline">Deploy one</Link>}
            >
              {data.agents.map((a: any) => {
                const since = sinceLabel(a.lastUsedAt);
                return (
                  <Link
                    key={a.id}
                    to="/agents"
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    <span className="flex-1 min-w-0 truncate text-sm">{a.name}</span>
                    {Number(a.openTaskCount) > 0 && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {Number(a.openTaskCount)} open
                      </span>
                    )}
                    <span
                      className={`text-xs shrink-0 rounded px-1.5 py-0.5 ${
                        since.silent
                          ? 'bg-warning-subtle text-warning-subtle-foreground'
                          : 'bg-success-subtle text-success-subtle-foreground'
                      }`}
                    >
                      {since.text}
                    </span>
                  </Link>
                );
              })}
            </ListState>
          </Panel>

          <Panel title="Recent agent activity" subtitle="Notes and comments your agents have written">
            <ListState
              isLoading={false}
              error={null}
              isEmpty={data.recentActivity.length === 0}
              emptyMessage="No agent activity yet."
              emptyAction={<p className="text-xs">Notes and comments agents write appear here.</p>}
            >
              {data.recentActivity.map((a: any, i: number) => (
                <Link
                  key={`${a.taskId}-${a.createdAt}-${i}`}
                  to={`/tasks/${a.taskId}`}
                  className="block p-2 rounded-md hover:bg-muted/50 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{a.agentName}</span>
                    <span>{a.kind === 'note' ? 'noted on' : 'commented on'}</span>
                    <span className="font-mono">{a.taskDisplayId}</span>
                  </span>
                  <span className="block text-sm truncate mt-0.5">{a.excerpt}</span>
                </Link>
              ))}
            </ListState>
          </Panel>
        </div>
      )}
    </div>
  );
}
