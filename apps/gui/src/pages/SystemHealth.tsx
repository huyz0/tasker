import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../lib/connectTransport';
import { HealthService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore, type LayoutState } from '../store/layout';
import { ListState } from '../components/ui/ListState';
import { AccountSettings } from '../features/Settings/AccountSettings';

const healthClient = createClient(HealthService, transport);

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
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Account, backend status and connection telemetry.</p>
      </div>

      <AccountSettings />

      <div className="p-6 border rounded-lg bg-card text-card-foreground shadow-sm max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium">System Health</h2>
          <button
            onClick={() => setTimestamp(Date.now())}
            className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors"
          >
            Ping Backend
          </button>
        </div>

        {isLoading || error || !health ? (
          <ListState
            isLoading={isLoading}
            error={error}
            isEmpty
            loadingMessage="Loading telemetry…"
            emptyMessage="No telemetry returned."
            emptyAction={<p className="text-xs">Use “Ping Backend” to try again.</p>}
            onRetry={() => refetch()}
          />
        ) : (
          <dl className="bg-muted p-4 rounded-md text-sm font-mono flex flex-col gap-2">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Message:</dt>
              <dd>{health.message}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Database:</dt>
              <dd>{health.dbStatus}{health.dbLatencyMs !== undefined ? ` (${health.dbLatencyMs}ms)` : ''}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">NATS:</dt>
              <dd>{health.natsStatus}{health.natsLatencyMs !== undefined ? ` (${health.natsLatencyMs}ms)` : ''}</dd>
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
