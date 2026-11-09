import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Code, ConnectError } from '@connectrpc/connect';
import { ListState } from '../../components/ui/ListState';

const accessUnavailable = (error: unknown) => error instanceof ConnectError
  && [Code.Unauthenticated, Code.PermissionDenied, Code.NotFound].includes(error.code);

/** Keep source pages in Query; only row identity is reconciled for display. */
export function useWorkPages<T extends { id: string }>(
  queryKey: readonly unknown[],
  load: (cursor: string | undefined) => Promise<{ items: T[]; page?: { nextCursor: string; totalCount?: number } }>,
  enabled = true,
  refreshInterval: number | false = false,
) {
  const identity = JSON.stringify(queryKey);
  const [access, setAccess] = useState({ identity, accepted: false });
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => load(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.page?.nextCursor || undefined,
    enabled,
    retry: false,
    refetchInterval: current => accessUnavailable(current.state.error)
      || (!!current.state.error && !(access.identity === identity && access.accepted))
      ? false : refreshInterval,
    refetchIntervalInBackground: false,
  });
  const denied = accessUnavailable(query.error);
  const fresh = query.isSuccess && !query.isFetching;
  // A remounted/changed identity cannot infer authorization from cached rows
  // plus an unavailable error: a preceding denial may have happened off-screen.
  const authorizationBlocked = denied || !(fresh || (access.identity === identity && access.accepted));
  useEffect(() => {
    setAccess(current => {
      const accepted = denied ? false : fresh ? true : current.identity === identity && current.accepted;
      return current.identity === identity && current.accepted === accepted ? current : { identity, accepted };
    });
  }, [identity, denied, fresh]);
  const byId = new Map<string, T>();
  for (const page of query.data?.pages ?? []) for (const item of page.items) byId.set(item.id, item);
  const items = [...byId.values()];
  return { ...query, authorizationBlocked, items, totalCount: Number(query.data?.pages[0]?.page?.totalCount ?? items.length) };
}

/** A result may arrive after switching task/org; its message stays in its scope. */
export function useWorkNotice(scope: string) {
  const [notice, setNotice] = useState<{ scope: string; message: string }>();
  const active = useRef(scope);
  useLayoutEffect(() => { active.current = scope; }, [scope]);
  return [notice?.scope === scope ? notice.message : '', (message: string) => {
    if (active.current === scope) setNotice({ scope, message });
  }] as const;
}

export function WorkNotice({ message }: { message: string }) {
  return message ? <p role="alert" className="rounded-md bg-destructive-subtle p-3 text-sm text-destructive-subtle-foreground">{message}</p> : null;
}

interface WorkPagesProps {
  query: ReturnType<typeof useWorkPages>;
  children: ReactNode;
  listLabel: string;
  kind: 'pending' | 'closed';
  loadingMessage: string;
  emptyMessage: string;
  errorLabel: string;
}

/** Failed refreshes and later pages leave the existing forms mounted. */
export function WorkPages({ query, children, listLabel, kind, loadingMessage, emptyMessage, errorLabel }: WorkPagesProps) {
  const { items, error, isLoading, isFetching, isFetchingNextPage, isFetchNextPageError, hasNextPage, totalCount } = query;
  return (
    <div role="group" aria-label={listLabel} className="flex flex-col gap-2">
      {error && <ListState isLoading={false} error={error} isEmpty={false} emptyMessage="" errorLabel={errorLabel}
        onRetry={() => { if (isFetchNextPageError) void query.fetchNextPage(); else void query.refetch(); }} />}
      {(!error || items.length > 0) && (
        <ListState isLoading={isLoading} error={null} isEmpty={items.length === 0} loadingMessage={loadingMessage} emptyMessage={emptyMessage}>
          <fieldset disabled={query.authorizationBlocked} className="min-w-0">
            <ul className="flex flex-col gap-2" aria-label={listLabel}>{children}</ul>
          </fieldset>
        </ListState>
      )}
      {query.authorizationBlocked && <p role="status" className="text-xs text-muted-foreground">Actions are unavailable until access is verified.</p>}
      {query.data && <p role="status" className="text-xs text-muted-foreground">Showing {items.length} of {totalCount} {kind}</p>}
      {hasNextPage && !error && <button type="button" disabled={isFetching || query.authorizationBlocked} onClick={() => void query.fetchNextPage()}
        className="self-start rounded-md border bg-background px-3 py-1 text-sm hover:bg-muted disabled:text-muted-foreground">
        {isFetchingNextPage ? 'Loading more…' : kind === 'pending' ? 'Load more pending' : 'Load more history'}
      </button>}
    </div>
  );
}

export function WorkHistory({ query, children }: { query: ReturnType<typeof useWorkPages>; children: ReactNode }) {
  const label = query.isLoading ? 'loading…' : query.error && !query.data ? 'unavailable' : query.totalCount;
  return <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">History · {label}</summary>
    <div className="mt-3">{children}</div>
  </details>;
}
