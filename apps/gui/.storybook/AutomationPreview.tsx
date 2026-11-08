import { useEffect, useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import { WorkflowTemplateSchema, ScheduleSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { WorkflowsScreen } from '../src/features/Workflows';
import { SchedulesScreen } from '../src/features/Schedules';
import { useLayoutStore } from '../src/store/layout';

type PreviewState = 'empty' | 'loading' | 'error' | 'populated' | 'new';

/** Public query-cache APIs provide visual states without a broker, credentials or writes. */
export function AutomationPreview({ kind, state }: { kind: 'workflows' | 'schedules'; state: PreviewState }) {
  const [ready, setReady] = useState(false);
  const [client] = useState(() => {
    const q = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, retryOnMount: false, refetchOnWindowFocus: false } } });
    const workflow = create(WorkflowTemplateSchema, { id: 'workflow-story', orgId: 'org-story', name: 'Release checklist', description: 'Build, verify and ship.', steps: [{ key: 'verify', title: 'Verify the release', priority: 2, dependsOn: [] }] });
    const schedule = create(ScheduleSchema, { id: 'schedule-story', orgId: 'org-story', projectId: 'project-story', name: 'Weekly triage', cadence: 'weekly', weekdays: [1], hourUtc: 9, taskTitle: 'Triage incoming work', active: true, skipIfOpen: true, nextRunAt: '2026-11-09T09:00:00Z' });
    q.setQueryData(['workflows', 'org-story'], state === 'populated' ? [workflow] : []);
    q.setQueryData(['schedules', 'org-story'], state === 'populated' ? [schedule] : []);
    q.setQueryData(['workflow', workflow.id], workflow);
    q.setQueryData(['schedule', schedule.id], schedule);
    q.setQueryData(['scheduleRuns', schedule.id], []);
    q.setQueryData(['projects', 'workflow-start', 'org-story'], [{ id: 'project-story', name: 'Release' }]);
    q.setQueryData(['projects', 'schedules', 'org-story'], [{ id: 'project-story', name: 'Release' }]);
    const queryKey = [kind, 'org-story'];
    if (state === 'loading' || state === 'error') {
      q.removeQueries({ queryKey, exact: true });
      void q.fetchQuery({ queryKey, queryFn: () => state === 'loading' ? new Promise<never>(() => {}) : Promise.reject(new Error('Permission denied. Ask your workspace administrator for access.')) }).catch(() => undefined);
    }
    return q;
  });
  useEffect(() => {
    const { activeOrgId, activeProjectId, activePageTitle } = useLayoutStore.getState();
    useLayoutStore.setState({ activeOrgId: 'org-story', activeProjectId: 'project-story' });
    setReady(true);
    return () => {
      useLayoutStore.setState({ activeOrgId, activeProjectId, activePageTitle });
    };
  }, [client]);
  const id = kind === 'workflows' ? 'workflow-story' : 'schedule-story';
  const path = `/${kind}${state === 'new' ? '/new' : state === 'populated' ? `/${id}` : ''}?org=org-story&project=project-story`;
  if (!ready) return null;
  const screen = kind === 'workflows' ? <WorkflowsScreen /> : <SchedulesScreen />;
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <div className="p-panel bg-surface-canvas min-h-dvh">
          <Routes>
            <Route path={`/${kind}`} element={screen} />
            <Route path="/workflows/:templateId" element={<WorkflowsScreen />} />
            <Route path="/schedules/:scheduleId" element={<SchedulesScreen />} />
          </Routes>
        </div>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
