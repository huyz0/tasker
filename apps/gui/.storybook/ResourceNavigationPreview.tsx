import { useEffect, useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useScopeSync } from '../src/hooks/useScope';
import { useLayoutStore } from '../src/store/layout';
import { ArtifactsBrowser } from '../src/features/Artifacts';
import { MemoryExplorer } from '../src/features/Memory';
import { TasksWorkbench } from '../src/features/Tasks';

type ResourceKind = 'tasks' | 'artifacts' | 'memory';
type PreviewState = 'empty' | 'loading' | 'error' | 'populated';
type MemoryTier = 'project' | 'organization' | 'team';

function ScopedScreen({ kind }: { kind: ResourceKind }) {
  useScopeSync();
  return kind === 'tasks' ? <TasksWorkbench /> : kind === 'artifacts' ? <ArtifactsBrowser /> : <MemoryExplorer />;
}

/** Authorized cache fixtures preview the real loading/error/owned routes without credentials. */
export function ResourceNavigationPreview({ kind, state, tier = 'project' }: {
  kind: ResourceKind; state: PreviewState; tier?: MemoryTier;
}) {
  const [ready, setReady] = useState(false);
  const [client] = useState(() => {
    const q = new QueryClient({ defaultOptions: { queries: {
      staleTime: Infinity, retry: false, retryOnMount: false, refetchOnWindowFocus: false,
    } } });
    const orgId = 'org-navigation', projectId = 'project-navigation';
    q.setQueryData(['project', projectId], { id: projectId, orgId, name: 'Release' });
    q.setQueryData(['taskTypes', orgId], []);
    q.setQueryData(['pullRequests', projectId], []);
    for (const status of ['todo', 'in-progress', 'done']) {
      q.setQueryData(['tasks', projectId, 'column', status, '', undefined, false], {
        pages: [{ tasks: [], page: { totalCount: 0n } }], pageParams: [undefined],
      });
    }
    q.setQueryData(['folders', projectId], state === 'empty' ? [] : [{ id: 'folder-navigation', projectId, name: 'Release notes' }]);
    const artifact = { id: 'resource-navigation', folderId: 'folder-navigation', name: 'Verification.md', description: 'Evidence for the release.', contentType: 'text/markdown' };
    q.setQueryData(['artifacts', 'folder-navigation'], { pages: [{ items: [artifact] }], pageParams: [undefined] });
    q.setQueryData(['artifactContent', artifact.id], { content: '# Verification\n\nThe release checks passed.', contentType: 'text/markdown' });
    q.setQueryData(['artifactLocate', artifact.id], { artifact, folderId: artifact.folderId, orgId, projectId });
    q.setQueryData(['taskArtifactLinks', 'artifact', artifact.id], []);
    q.setQueryData(['comments', 'artifact', artifact.id], []);
    q.setQueryData(['entityLabels', 'artifact', artifact.id], []);
    q.setQueryData(['labels', orgId], []);
    const belief = { id: 'resource-navigation', orgId, scopeType: tier,
      scopeId: tier === 'project' ? projectId : tier === 'organization' ? orgId : 'release-team',
      statement: 'Run release verification before publishing.', confidence: 'high', status: 'active', sourceKind: 'user', createdAt: '2026-11-09T09:00:00Z' };
    q.setQueryData(['memoryBelief', belief.id], belief);
    q.setQueryData(['memoryBeliefRelations', belief.id], []);
    q.setQueryData(['memoryBeliefPromotions', belief.id], []);
    const queryKey = [kind === 'tasks' ? 'task' : kind === 'artifacts' ? 'artifactLocate' : 'memoryBelief', 'resource-navigation'];
    if (state === 'loading' || state === 'error') {
      q.removeQueries({ queryKey, exact: true });
      void q.fetchQuery({ queryKey, queryFn: () => state === 'loading'
        ? new Promise<never>(() => {}) : Promise.reject(new Error('Access is unavailable. Contact your workspace administrator.')),
      }).catch(() => undefined);
    }
    return q;
  });
  useEffect(() => {
    const { activeOrgId, activeProjectId, activePageTitle } = useLayoutStore.getState();
    useLayoutStore.setState({ activeOrgId: 'org-navigation', activeProjectId: 'project-navigation' });
    setReady(true);
    return () => useLayoutStore.setState({ activeOrgId, activeProjectId, activePageTitle });
  }, []);
  if (!ready) return null;
  const path = `/${kind}${state === 'empty' ? '' : '/resource-navigation'}?org=org-navigation&project=project-navigation${kind === 'memory' ? `&scope=${tier}` : ''}`;
  return <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[path]}>
      <div className="min-h-dvh bg-surface-canvas p-panel">
        <Routes>
          <Route path={`/${kind}`} element={<ScopedScreen kind={kind} />} />
          <Route path={`/${kind}/:${kind === 'tasks' ? 'taskId' : kind === 'artifacts' ? 'artifactId' : 'beliefId'}`} element={<ScopedScreen kind={kind} />} />
        </Routes>
      </div>
    </MemoryRouter>
  </QueryClientProvider>;
}
