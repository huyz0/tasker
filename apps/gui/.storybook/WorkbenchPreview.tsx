import { useEffect, useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import { TaskSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore } from '../src/store/layout';

interface WorkbenchPreviewProps {
  children: ReactNode;
  state?: 'empty' | 'loading' | 'error' | 'populated';
  drawerOpen?: boolean;
}

/** Cache fixtures keep screen previews independent from an authenticated data service. */
export function WorkbenchPreview({ children, state = 'populated', drawerOpen = false }: WorkbenchPreviewProps) {
  const [ready, setReady] = useState(false);
  const [client] = useState(() => {
    const q = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, retryOnMount: false, refetchOnWindowFocus: false } } });
    q.setQueryData(['identity'], { id: 'user-story', name: 'Alex Morgan', email: 'alex@example.test' });
    q.setQueryData(['orgs', 'switcher', ''], { orgs: [{ id: 'org-story', name: 'Product workspace' }], total: 1 });
    q.setQueryData(['projects', 'switcher', 'org-story', ''], { projects: [{ id: 'project-story', name: 'Release' }], total: 1 });
    q.setQueryData(['project', 'project-story'], { id: 'project-story', name: 'Release' });
    q.setQueryData(['notificationCount', 'org-story'], { count: 0n });
    q.setQueryData(['taskTypes', 'org-story'], []);
    q.setQueryData(['pullRequests', 'project-story'], []);
    const statuses = ['todo', 'in-progress', 'done'];
    const tasks = statuses.map((status, i) => create(TaskSchema, { id: `task-${i}`, displayId: `REL-${i + 1}`, title: ['Review release notes', 'Verify the build', 'Prepare the checklist'][i], status, projectId: 'project-story' }));
    for (const status of ['table', ...statuses]) {
      const queryKey = status === 'table'
        ? ['tasks', 'project-story', 'table', '', undefined, undefined, false]
        : ['tasks', 'project-story', 'column', status, '', undefined, false];
      if (state === 'loading' || state === 'error') {
        void q.fetchQuery({ queryKey, queryFn: () => state === 'loading' ? new Promise<never>(() => {}) : Promise.reject(new Error('Permission denied. Ask your workspace administrator for access.')) }).catch(() => undefined);
      } else {
        const rows = state === 'populated' ? tasks.filter(t => status === 'table' || t.status === status) : [];
        q.setQueryData(queryKey, { pages: [{ tasks: rows, page: { totalCount: BigInt(rows.length) } }], pageParams: [undefined] });
      }
    }
    return q;
  });
  useEffect(() => {
    const { activeOrgId, activeProjectId, activePageTitle, sidebarOpen, searchOpen } = useLayoutStore.getState();
    useLayoutStore.setState({ activeOrgId: 'org-story', activeProjectId: 'project-story', sidebarOpen: drawerOpen, searchOpen: false });
    setReady(true);
    return () => { useLayoutStore.setState({ activeOrgId, activeProjectId, activePageTitle, sidebarOpen, searchOpen }); };
  }, [drawerOpen]);
  // AppShell closes the drawer on its initial route effect. Apply the
  // synthetic initial open state after that child's mount, once it is ready.
  useEffect(() => {
    if (ready && drawerOpen) useLayoutStore.setState({ sidebarOpen: true });
  }, [ready, drawerOpen]);
  return ready ? (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/tasks?org=org-story&project=project-story']}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  ) : null;
}
