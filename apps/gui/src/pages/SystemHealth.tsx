import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../lib/connectTransport';
import { HealthService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore, type LayoutState } from '../store/layout';
import { ListState } from '../components/ui/ListState';
import { AccountSettings } from '../features/Settings/AccountSettings';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/button';

const healthClient = createClient(HealthService, transport);

// What the backend reports when a dependency is fine: "connected" for NATS,
// "<engine>-ok" / "ok" for the database. Anything else is worth a look.
const isHealthy = (status: string) => status === 'connected' || /(^|-)ok$/.test(status);

/**
 * One dependency's status. An unhealthy one ("disconnected", "closed",
 * "error: …") sat in the same plain monospace as a healthy one, so the one
 * line on the page that mattered read like every other. It now carries the
 * warning tint, an icon and the status text itself — never colour alone.
 */
function StatusValue({ status, latencyMs }: { status: string; latencyMs?: number }) {
  const text = `${status}${latencyMs !== undefined ? ` (${latencyMs}ms)` : ''}`;
  if (isHealthy(status)) return <dd className="tabular-nums">{text}</dd>;
  return (
    <dd>
      <span
        data-status="warning"
        className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 bg-warning-subtle text-warning-subtle-foreground"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{text}</span>
      </span>
    </dd>
  );
}

/**
 * Backend telemetry, moved off the home screen.
 *
 * Database and NATS latency are an operator's concern. They sat on the
 * dashboard because they were the only thing there whose value ever changed —
 * which is a good reason to keep the panel and a bad reason to make it the
 * first thing a delivery manager sees. `/settings` was a placeholder reading
 * "Settings module placeholder area", so one move both fills a dead nav item
 * and gets ops data off the supervision console.
 */
export function SystemHealthPage() {
  const setActivePageTitle = useLayoutStore((s: LayoutState) => s.setActivePageTitle);
  useEffect(() => setActivePageTitle('Settings'), [setActivePageTitle]);

  // Bumping this is what re-runs the ping; the button is the point of the page.
  const [timestamp, setTimestamp] = useState(() => Date.now());

  const { data: health, isLoading, error, refetch } = useQuery({
    queryKey: ['healthPing', timestamp],
    queryFn: async () => await healthClient.ping({}),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Account, backend status and connection telemetry." />

      <AccountSettings />

      <div className="p-6 border rounded-lg bg-card text-card-foreground shadow-sm max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium">System health</h2>
          {/* Outline, not primary: this page's one primary action is the
              password form above; a second violet button competed with it. */}
          <Button variant="outline" onClick={() => setTimestamp(Date.now())}>
            Ping backend
          </Button>
        </div>

        {isLoading || error || !health ? (
          <ListState
            isLoading={isLoading}
            error={error}
            isEmpty
            loadingMessage="Loading telemetry…"
            emptyMessage="No telemetry returned."
            emptyAction={<p className="text-xs">Use “Ping backend” to try again.</p>}
            onRetry={() => refetch()}
          />
        ) : (
          <dl className="bg-muted p-4 rounded-md text-sm font-mono flex flex-col gap-2">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Message:</dt>
              <dd>{health.message}</dd>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-muted-foreground">Database:</dt>
              <StatusValue status={health.dbStatus} latencyMs={health.dbLatencyMs} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-muted-foreground">NATS:</dt>
              <StatusValue status={health.natsStatus} latencyMs={health.natsLatencyMs} />
            </div>
            {health.version && (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Version:</dt>
                <dd>{health.version}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </div>
  );
}
