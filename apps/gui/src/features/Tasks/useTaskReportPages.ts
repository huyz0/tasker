import { useState } from 'react';
import { useInfiniteQuery, useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import type { PageResponse } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useTaskReportAccess, type TaskReportOwner, type TaskReportSource, type TaskReportReadReceipt } from './taskReportAccess';

interface Position { cursor: string; prior: string[]; }
interface PageEnvelope { page?: PageResponse; }
interface ReadPage<T> { response: T; receipt: TaskReportReadReceipt; }

/** One visible page: failed navigation retains it, and refresh never walks older pages. */
export function useTaskReportPages<T extends PageEnvelope>(owner: TaskReportOwner, source: TaskReportSource,
  key: QueryKey, read: (cursor: string, signal: AbortSignal) => Promise<T>, pollMs?: number) {
  const cache = useQueryClient(), access = useTaskReportAccess(owner, source);
  const [accepted, setAccepted] = useState(false);
  const query = useInfiniteQuery<ReadPage<T>, Error, InfiniteData<ReadPage<T>, Position>, QueryKey, Position>({
    queryKey: key,
    queryFn: async ({ pageParam, signal }) => {
      const receipt = access.begin();
      try {
        const response = await read(pageParam.cursor, signal); signal.throwIfAborted();
        return { response, receipt };
      } catch (error) { if (!signal.aborted) access.failed(error, receipt); throw error; }
    },
    initialPageParam: { cursor: '', prior: [] } as Position, maxPages: 1,
    getNextPageParam: (last, _pages, position) => last.response.page?.nextCursor
      ? { cursor: last.response.page.nextCursor, prior: [...position.prior, position.cursor] } : undefined,
    getPreviousPageParam: (_first, _pages, position) => position.prior.length
      ? { cursor: position.prior.at(-1)!, prior: position.prior.slice(0, -1) } : undefined,
    enabled: access.allowed(), retry: false, retryOnMount: false, staleTime: 0,
    refetchOnMount: () => access.allowed(), refetchOnWindowFocus: () => access.allowed(), refetchOnReconnect: () => access.allowed(),
    refetchInterval: current => pollMs && access.allowed() && current.state.fetchStatus !== 'fetching' ? pollMs : false,
    refetchIntervalInBackground: false,
  });
  const pages = query.data?.pages.filter(page => access.current(page.receipt)) ?? [];
  const fresh = query.isSuccess && !query.isFetching && query.isFetchedAfterMount && pages.length > 0 && !access.blocked;
  if (access.blocked && accepted) setAccepted(false);
  else if (fresh && !accepted) setAccepted(true);
  const blocked = access.blocked || !(accepted || fresh);
  const refresh = async () => {
    if (!access.blocked) return query.refetch();
    if (!access.canRetry) return;
    await cache.cancelQueries({ queryKey: key, exact: true });
    const before = cache.getQueryState(key)?.dataUpdateCount ?? 0, attempt = access.startRetry();
    try {
      const result = await query.refetch(), after = cache.getQueryState(key)?.dataUpdateCount ?? 0;
      const received = result.data?.pages;
      if (result.isSuccess && after > before && received?.length
        && received.every(page => access.current(page.receipt) && page.receipt.attempt === attempt)) access.accept(received[0]!.receipt, attempt);
      return result;
    } finally { access.finishRetry(attempt); }
  };
  return { query, refresh, blocked, canRetry: access.canRetry,
    error: access.blocked ? access.denial : query.error,
    response: blocked ? undefined : pages[0]?.response,
    position: query.data?.pageParams[0]?.prior.length ?? 0 };
}
