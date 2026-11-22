import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { GetReportExceptionsResponseSchema, GetReportTrendsResponseSchema, GetUsageReportResponseSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore } from '../src/store/layout';
import { REPORT_WINDOWS } from '../src/lib/operationalView';

interface ReportsPreviewProps { children: ReactNode; initialEntry?: string; state?: 'populated' | 'empty' | 'loading' | 'error' | 'denied'; scope?: 'project' | 'organization' | 'none'; }
/** Synthetic, bounded current-project data, with no authenticated service or account. */
export function ReportsPreview({ children, initialEntry = '/reports?org=org-story&project=project-story', state = 'populated', scope = 'project' }: ReportsPreviewProps) {
  const [ready, setReady] = useState(false);
  const [client] = useState(() => {
    const cache = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, retryOnMount: false, refetchOnWindowFocus: false } } });
    for (const days of REPORT_WINDOWS) for (const source of ['exceptions', 'trends', 'usage']) {
      const queryKey = source === 'trends' ? ['reports', source, 'project-story', days, undefined] : ['reports', source, 'project-story', days];
      if (state === 'loading' || state === 'error' || state === 'denied') {
        void cache.fetchQuery({ queryKey, queryFn: () => state === 'loading' ? new Promise<never>(() => {})
          : Promise.reject(new ConnectError(state === 'denied' ? 'You do not have access to these reports.' : 'Reports are temporarily unavailable.', state === 'denied' ? Code.PermissionDenied : Code.Unavailable)) }).catch(() => undefined);
      } else if (source === 'exceptions') cache.setQueryData(queryKey, create(GetReportExceptionsResponseSchema, {
        unclaimed: state === 'populated' ? [{ taskId: 'task-story', taskDisplayId: 'REL-1', taskTitle: 'Review release notes', status: 'todo', waitingSince: new Date(Date.now() - 48 * 3_600_000).toISOString() }] : [],
      }));
      else if (source === 'trends') cache.setQueryData(queryKey, create(GetReportTrendsResponseSchema, {
        collectedSince: '2026-11-01T00:00:00Z',
        ...(state === 'populated' ? {
          createdCumulative: [{ date: '2026-11-01', count: 4n }, { date: '2026-11-02', count: 6n }],
          completedCumulative: [{ date: '2026-11-01', count: 2n }, { date: '2026-11-02', count: 4n }],
          autonomyRate: [{ date: '2026-11-01', rate: 0.5, sampleSize: 2n }, { date: '2026-11-02', rate: 1, sampleSize: 2n }],
          reworkRate: [{ date: '2026-11-01', rate: 0, sampleSize: 2n }, { date: '2026-11-02', rate: 0.5, sampleSize: 2n }],
          cfdBands: [
            { status: 'done', isTerminal: true, counts: [{ date: '2026-11-01', count: 2n }, { date: '2026-11-02', count: 4n }] },
            { status: 'in_progress', counts: [{ date: '2026-11-01', count: 2n }, { date: '2026-11-02', count: 2n }] },
          ],
        } : {}),
        cfdTaskTypeId: 'untyped', taskTypeOptions: [{ id: 'untyped', name: 'Untyped', taskCount: state === 'populated' ? 1n : 0n }],
      }));
      else cache.setQueryData(queryKey, create(GetUsageReportResponseSchema, state === 'populated' ? {
        totals: { reports: 2n, inputTokens: 12000n, outputTokens: 4000n, costMicros: 2500000n },
        byDay: [
          { key: '2026-11-01', costMicros: 0n, reports: 0n },
          { key: '2026-11-02', costMicros: 2500000n, inputTokens: 12000n, outputTokens: 4000n, reports: 2n },
        ],
        byAgent: [{ key: 'release-worker', label: 'Release verification worker', costMicros: 2500000n, inputTokens: 12000n, outputTokens: 4000n, reports: 2n }],
      } : { totals: { reports: 0n } }));
    }
    return cache;
  });
  useEffect(() => {
    const { activeOrgId, activeProjectId, activePageTitle } = useLayoutStore.getState();
    useLayoutStore.setState({ activeOrgId: scope === 'none' ? '' : 'org-story', activeProjectId: scope === 'project' ? 'project-story' : '' });setReady(true);
    return () => { useLayoutStore.setState({ activeOrgId, activeProjectId, activePageTitle }); };
  }, [scope]);
  return ready ? <QueryClientProvider client={client}><MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter></QueryClientProvider> : null;
}
