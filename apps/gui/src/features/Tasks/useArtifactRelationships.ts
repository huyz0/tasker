import { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Code, ConnectError, createClient } from '@connectrpc/connect';
import { ArtifactService, type ListTaskArtifactLinksResponse, type TaskArtifactEvidence, type TaskArtifactLink } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { transport } from '../../lib/connectTransport';
import { useTaskReportAccess, type TaskReportReadReceipt } from './taskReportAccess';

const client = createClient(ArtifactService, transport);
export const RELATIONSHIP_WRITES = ['artifactRelationships'] as const;
export interface RelationshipOwner { accountId: string; orgId: string; taskId?: string; artifactId?: string; attemptId?: string; uncorrelatedOnly?: boolean; }
export type EvidenceRow = Pick<TaskArtifactEvidence, 'availability' | 'contentType' | 'storedBytes' | 'artifactCreatedAt'> & { id: string; link: TaskArtifactLink };
export interface RelationshipWrite extends RelationshipOwner { taskId: string; artifactId: string; }
export const relationshipKey = (owner: RelationshipOwner) => ['taskArtifactLinks', owner.accountId, owner.orgId, owner.taskId ? 'task' : 'artifact', owner.taskId || owner.artifactId,
  ...(owner.attemptId !== undefined || owner.uncorrelatedOnly ? ['reports', owner.attemptId ?? '', owner.uncorrelatedOnly === true] : [])] as const;
export const relationshipAccessLost = (error: unknown) => error instanceof ConnectError
  && [Code.PermissionDenied, Code.Unauthenticated, Code.NotFound].includes(error.code);

function rowsFrom(pages: readonly ListTaskArtifactLinksResponse[]): EvidenceRow[] {
  const rows = new Map<string, EvidenceRow>();
  for (const page of pages) {
    const metadata = new Map(page.evidence.flatMap(item => item.link ? [[item.link.id, item] as const] : []));
    const links = new Map(page.links.map(link => [link.id, link]));
    for (const item of page.evidence) if (item.link && !links.has(item.link.id)) links.set(item.link.id, item.link);
    for (const link of links.values()) {
      const item = metadata.get(link.id);
      rows.set(link.id, { id: link.id, link: item?.link ?? link, availability: item?.availability || 'unknown',
        contentType: item?.contentType, storedBytes: item?.storedBytes, artifactCreatedAt: item?.artifactCreatedAt });
    }
  }
  return [...rows.values()];
}

/** One mounted owner. Cached errors never reauthorize an old accepted page. */
export function useArtifactRelationships(owner: RelationshipOwner) {
  const [accepted, setAccepted] = useState(false);
  const cache = useQueryClient(), key = relationshipKey(owner);
  const access = useTaskReportAccess({ accountId: owner.accountId, orgId: owner.orgId,
    taskId: owner.taskId ?? `artifact:${owner.artifactId}` }, 'artifacts');
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: async ({ pageParam, signal }) => {
      const receipt = access.begin();
      try {
        const response = await client.listTaskArtifactLinks({
          ...(owner.taskId ? { taskId: owner.taskId } : { artifactId: owner.artifactId }),
          attemptId: owner.attemptId, uncorrelatedOnly: owner.uncorrelatedOnly,
          page: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
        }, { signal });
        signal.throwIfAborted();
        return { ...response, reportReadReceipt: receipt };
      } catch (error) { if (!signal.aborted) access.failed(error, receipt); throw error; }
    },
    enabled: current => access.allowed() && (!current.state.error || (accepted && !relationshipAccessLost(current.state.error))),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.page?.nextCursor || undefined,
    retry: false, retryOnMount: false, staleTime: 0,
    refetchOnMount: current => access.allowed() && !current.state.error,
    refetchOnWindowFocus: current => access.allowed() && !relationshipAccessLost(current.state.error) && (!current.state.error || accepted),
    refetchOnReconnect: current => access.allowed() && !relationshipAccessLost(current.state.error) && (!current.state.error || accepted),
    refetchInterval: current => !access.allowed() || current.state.fetchStatus === 'fetching' || relationshipAccessLost(current.state.error)
      || (!!current.state.error && !accepted) ? false : 15_000,
    refetchIntervalInBackground: false,
  });
  const denied = access.blocked || relationshipAccessLost(query.error);
  const validPages = query.data?.pages.filter(page => page.reportReadReceipt && access.current(page.reportReadReceipt)) ?? [];
  const fresh = query.isSuccess && !query.isFetching && query.isFetchedAfterMount && validPages.length > 0;
  const blocked = denied || !(fresh || accepted);
  // Settle read acceptance before children become actionable; a queued effect
  // could otherwise re-enable the query after a quick next-page failure.
  if (denied && accepted) setAccepted(false);
  else if (fresh && !accepted) setAccepted(true);
  const rows = blocked ? [] : rowsFrom(validPages);
  const controls = blocked ? undefined : validPages[0];
  const refresh = async () => {
    if (!access.blocked) return query.refetch();
    if (!access.canRetry) return;
    await cache.cancelQueries({ queryKey: key, exact: true });
    const before = cache.getQueryState(key)?.dataUpdateCount ?? 0, attempt = access.startRetry();
    try {
      const result = await query.refetch(), after = cache.getQueryState(key)?.dataUpdateCount ?? 0;
      const pages: { reportReadReceipt: TaskReportReadReceipt }[] | undefined = result.data?.pages;
      if (result.isSuccess && after > before && pages?.length
        && pages.every(page => access.current(page.reportReadReceipt) && page.reportReadReceipt.attempt === attempt)) access.accept(pages[0]!.reportReadReceipt, attempt);
      return result;
    } finally { access.finishRetry(attempt); }
  };
  return { query, rows, blocked, denied, refresh, canRetry: access.canRetry, canLink: controls?.canLink, canUnlink: controls?.canUnlink,
    totalCount: blocked ? undefined : controls?.page?.totalCount };
}
