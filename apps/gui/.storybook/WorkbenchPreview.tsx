import { useEffect, useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import { TaskSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore } from '../src/store/layout';
import { parseTaskView, DEFAULT_TASK_VIEW, TASK_SORT_FIELDS } from '../src/lib/operationalView';

interface WorkbenchPreviewProps {
  children: ReactNode;
  state?: 'empty' | 'loading' | 'error' | 'populated';
  drawerOpen?: boolean;
  initialEntry?: string;
}

/** Cache fixtures keep screen previews independent from an authenticated data service. */
export function WorkbenchPreview({ children, state = 'populated', drawerOpen = false, initialEntry = '/tasks?org=org-story&project=project-story' }: WorkbenchPreviewProps) {
  const [ready, setReady] = useState(false);
  const [client] = useState(() => {
    const q = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, retryOnMount: false, refetchOnWindowFocus: false } } });
    q.setQueryData(['identity'], { id: 'user-story', name: 'Alex Morgan', email: 'alex@example.test' });
    q.setQueryData(['orgs', 'switcher', ''], { orgs: [{ id: 'org-story', name: 'Product workspace' }], total: 1 });
    q.setQueryData(['projects', 'switcher', 'org-story', ''], { projects: [{ id: 'project-story', name: 'Release' }], total: 1 });
    q.setQueryData(['project', 'project-story'], { id: 'project-story', name: 'Release' });
    q.setQueryData(['notificationCount', 'org-story'], { count: 0n });
    q.setQueryData(['taskTypes', 'org-story'], []);
    q.setQueryData(['authSession'], { authenticated: true, userId: 'workbench-story-user', mustChangePassword: false });
    q.setQueryData(['pullRequests', 'project-story', 'org-story', 'workbench-story-user'], []);
    const statuses = ['todo', 'in-progress', 'done'];
    const tasks = statuses.map((status, i) => create(TaskSchema, { id: `task-${i}`, displayId: `REL-${i + 1}`, title: ['Review release notes', 'Verify the build', 'Prepare the checklist'][i], status, projectId: 'project-story' }));
    const initial = parseTaskView(new URL(initialEntry, 'https://tasker.invalid').searchParams).value;
    for (const view of [initial, DEFAULT_TASK_VIEW]) for (const status of ['table', ...statuses]) {
      const queryKey = status === 'table'
        ? ['tasks', 'project-story', 'table', view.search, view.sort ? `${TASK_SORT_FIELDS[view.sort.key]}:${view.sort.dir}` : undefined, view.priorityFilter === '' ? undefined : Number(view.priorityFilter), view.readyOnly]
        : ['tasks', 'project-story', 'column', status, view.search, view.priorityFilter === '' ? undefined : Number(view.priorityFilter), view.readyOnly];
      if (state === 'loading' || state === 'error') {
        void q.fetchQuery({ queryKey, queryFn: () => state === 'loading' ? new Promise<never>(() => {}) : Promise.reject(new Error('Permission denied. Ask your workspace administrator for access.')) }).catch(() => undefined);
      } else {
        const rows = state === 'populated' ? tasks.filter(t => (status === 'table' || t.status === status)
          && (!view.search || t.title.toLowerCase().includes(view.search.toLowerCase()))
          && (view.priorityFilter === '' || t.priority === Number(view.priorityFilter))
          && (!view.readyOnly || t.status !== 'done')) : [];
        if (status === 'table' && view.sort) rows.sort((a, b) => {
          const left = view.sort!.key === 'displayId' ? a.id : a[view.sort!.key], right = view.sort!.key === 'displayId' ? b.id : b[view.sort!.key];
          const order = left < right ? -1 : left > right ? 1 : 0;return view.sort!.dir === 'asc' ? order : -order;
        });
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
      <MemoryRouter initialEntries={[initialEntry]}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  ) : null;
}
