import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { AttentionService, type AttentionItem } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { transport } from '../../lib/connectTransport';
import { useAttentionAccess } from './attentionAccess';

const client = createClient(AttentionService, transport);
export const ATTENTION_KINDS = ['question', 'approval', 'review', 'stalled_claim'] as const;
export type AttentionKind = typeof ATTENTION_KINDS[number];
export interface AttentionScope { accountId: string; orgId: string; projectId: string; }
export const attentionKey = (scope: AttentionScope, kind: AttentionKind) => ['attention', scope.accountId, scope.orgId, scope.projectId, kind] as const;

export function useAttention(scope: AttentionScope, kind: AttentionKind, active: boolean) {
  const cache = useQueryClient(), access = useAttentionAccess(scope, kind), key = attentionKey(scope, kind);
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: async ({ pageParam, signal }) => {
      const receipt = access.begin();
      try {
        const response = await client.listAttention({ orgId: scope.orgId, projectId: scope.projectId || undefined, kind,
          page: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) } }, { signal });
        signal.throwIfAborted();
        return { response, receipt };
      } catch (error) { if (!signal.aborted) access.failed(error, receipt); throw error; }
    },
    enabled: current => access.allowed() && (active || !current.state.data),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.response.page?.nextCursor || undefined,
    retry: false, retryOnMount: false, staleTime: 0,
    refetchOnMount: () => active && access.allowed(),
    refetchOnWindowFocus: () => active && access.allowed(), refetchOnReconnect: () => active && access.allowed(),
    refetchInterval: current => active && access.allowed() && current.state.fetchStatus !== 'fetching' ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
  const rows = new Map<string, AttentionItem>();
  const pages = access.blocked ? [] : query.data?.pages.filter(page => access.current(page.receipt)) ?? [];
  for (const page of pages) for (const item of page.response.items) rows.set(`${item.kind}:${item.sourceId}`, item);
  const refresh = async () => {
    if (!access.blocked) return query.refetch();
    // Stop this owner's old request before granting a new explicit attempt.
    await cache.cancelQueries({ queryKey: key, exact: true });
    const before = cache.getQueryState(key)?.dataUpdateCount ?? 0, attempt = access.startRetry();
    try {
      const result = await query.refetch(), after = cache.getQueryState(key)?.dataUpdateCount ?? 0;
      const fresh = result.data?.pages;
      if (result.isSuccess && after > before && fresh?.length && fresh.every(page => access.current(page.receipt) && page.receipt.attempt === attempt)) access.accept(fresh[0]!.receipt, attempt);
      return result;
    } finally { access.finishRetry(attempt); }
  };
  const error = query.error ?? (access.blocked ? access.denial : undefined);
  return { query: { ...query, error, isPending: query.isPending && !error }, refresh, rows: [...rows.values()], blocked: access.blocked,
    totalCount: pages[0]?.response.page?.totalCount };
}
