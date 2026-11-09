import { useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import { SearchResultSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { GlobalSearch, GlobalSearchTrigger } from '../src/components/layout/GlobalSearch';
import { useLayoutStore } from '../src/store/layout';

type PreviewState = 'empty' | 'loading' | 'error' | 'populated' | 'no-match' | 'no-org';

/** Cache fixtures exercise the real palette and debounce without a data service. */
export function SearchPreview({ state }: { state: PreviewState }) {
  const [ready, setReady] = useState(false);
  const [client] = useState(() => {
    const cache = new QueryClient({ defaultOptions: { queries: {
      retry: false, retryOnMount: false, staleTime: Infinity, refetchOnWindowFocus: false,
    } } });
    const queryKey = ['universalSearch', 'release', 'org-search'];
    const results = [
      { id: 'belief-release', type: 'belief', title: 'Reusable release convention', snippet: 'Verify migrations before publishing.' },
      { id: 'artifact-release', type: 'artifact', title: 'Release verification', snippet: 'Checks and supporting evidence.' },
      { id: 'project-release', type: 'project', title: 'Release project', snippet: '' },
      { id: 'task-release', type: 'task', title: 'Review the release', snippet: 'Complete the review checklist.' },
      { id: 'agent-release', type: 'agent', title: 'Release assistant', snippet: '' },
      { id: 'comment-release', type: 'comment', title: 'Release discussion', snippet: 'The migration checks passed.', parentType: 'task', parentId: 'task-release' },
    ].map(result => create(SearchResultSchema, result));
    cache.setQueryData(queryKey, state === 'populated' ? results : []);
    if (state === 'loading') {
      cache.removeQueries({ queryKey, exact: true });
      void cache.fetchQuery({ queryKey, queryFn: () => new Promise<never>(() => {}) });
    }
    if (state === 'error') {
      // A fresh cached value keeps deliberate fixture failure from retrying
      // a live URL when the real input changes to this key.
      void cache.fetchQuery({ queryKey, staleTime: 0, queryFn: () => Promise.reject(new Error('Search is temporarily unavailable. Try again.')) }).catch(() => undefined);
    }
    return cache;
  });
  useEffect(() => {
    const { activeOrgId, activeProjectId, searchOpen } = useLayoutStore.getState();
    useLayoutStore.setState({ activeOrgId: state === 'no-org' ? '' : 'org-search',
      activeProjectId: state === 'no-org' ? '' : 'project-current', searchOpen: true });
    setReady(true);
    return () => useLayoutStore.setState({ activeOrgId, activeProjectId, searchOpen });
  }, [state]);
  return ready ? <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/tasks?org=org-search&project=project-current']}>
      <div className="min-h-[500px] w-full bg-surface-canvas p-panel text-foreground">
        <GlobalSearchTrigger /><GlobalSearch />
      </div>
    </MemoryRouter>
  </QueryClientProvider> : null;
}
