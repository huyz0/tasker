import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Code, ConnectError } from '@connectrpc/connect';
import { TaskInputRequests, QuestionsQueue } from '../src/features/Tasks/InputRequests';
import { TaskApprovals, ApprovalsQueue } from '../src/features/Tasks/Approvals';

type State = 'populated' | 'empty' | 'loading' | 'error' | 'denied' | 'denied-cached' | 'next-error' | 'refresh-error';

/** Infinite-query fixtures render the real panels and their source states. */
export function WorkPreview({ kind, state, organization = false }: {
  kind: 'questions' | 'approvals'; state: State; organization?: boolean;
}) {
  const [client] = useState(() => {
    const q = new QueryClient({ defaultOptions: { queries: {
      retry: false, retryOnMount: false, staleTime: Infinity, refetchOnWindowFocus: false,
    } } });
    const pending = kind === 'questions' ? 'open' : 'pending';
    const closed = kind === 'questions' ? 'answered' : 'rejected';
    const base = [kind === 'questions' ? 'inputRequests' : 'approvals', organization ? 'org' : 'task', organization ? 'org-storybook' : 'task-storybook'];
    const row = (id: string, status: string) => ({ id, status, taskId: 'task-storybook', projectId: 'project-storybook',
      taskDisplayId: 'REL-42', taskTitle: 'Verify migration and release evidence before publication',
      askedByName: 'Release assistant', requestedByName: 'Release assistant',
      question: 'Should the migration preserve existing organization permissions and project ownership?', options: ['Preserve both', 'Review the migration first'],
      fromStatus: 'review', toStatus: 'done', createdAt: '2026-11-09T10:00:00Z',
      ...(status === closed ? { answer: 'Preserve both and record the verification.', answeredByName: 'Ada', decidedByName: 'Ada', reason: 'Verify the evidence before moving this task.' } : {}),
    });
    for (const status of [pending, 'closed']) {
      const key = [...base, status];
      const items = state === 'empty' ? [] : [row(status === pending ? 'pending-storybook' : 'closed-storybook', status === pending ? pending : closed)];
      q.setQueryData(key, { pages: [{ items, page: { totalCount: state === 'empty' ? 0 : 3,
        nextCursor: state === 'empty' ? '' : `next-${status}` } }], pageParams: [undefined] });
      if (status === pending && state === 'loading') {
        q.removeQueries({ queryKey: key, exact: true });
        void q.fetchInfiniteQuery({ queryKey: key, initialPageParam: undefined, queryFn: () => new Promise<never>(() => {}), getNextPageParam: () => undefined });
      }
      if (status === pending && ['error', 'denied', 'denied-cached', 'next-error', 'refresh-error'].includes(state)) {
        // Seed a cached read failure, including the forward-fetch marker used
        // by InfiniteQueryObserver. No service or credentials are needed.
        const query = q.getQueryCache().find({ queryKey: key, exact: true })!;
        query.setState({ status: 'error', fetchStatus: 'idle',
          error: new ConnectError(state.startsWith('denied') ? 'Access is no longer available.' : 'This page is temporarily unavailable.', state.startsWith('denied') ? Code.PermissionDenied : Code.Unavailable),
          errorUpdatedAt: Date.now(),
          ...(state === 'error' || state === 'denied' ? { data: undefined } : {}),
          fetchMeta: state === 'next-error' ? { fetchMore: { direction: 'forward' } } : null,
        });
      }
    }
    return q;
  });
  return <QueryClientProvider client={client}><MemoryRouter initialEntries={['/tasks?org=org-storybook&project=project-storybook']}>
    <div className="min-h-dvh bg-surface-canvas p-panel text-foreground">
      <div className="mx-auto flex max-w-xl flex-col gap-section">
        <div><p className="type-caption text-muted-foreground">{organization ? 'Waiting on people' : 'Task detail'}</p>
          <h2 className="type-section-title">Review the release</h2></div>
        {kind === 'questions' ? organization ? <QuestionsQueue orgId="org-storybook" /> : <TaskInputRequests taskId="task-storybook" />
          : organization ? <ApprovalsQueue orgId="org-storybook" /> : <TaskApprovals taskId="task-storybook" />}
      </div>
    </div>
  </MemoryRouter></QueryClientProvider>;
}
