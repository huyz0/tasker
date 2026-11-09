import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Code, ConnectError, createClient } from '@connectrpc/connect';
import { ArtifactService, type ListTaskArtifactLinksResponse, type TaskArtifactEvidence, type TaskArtifactLink } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { transport } from '../../lib/connectTransport';

const client = createClient(ArtifactService, transport);
export const RELATIONSHIP_WRITES = ['artifactRelationships'] as const;
export interface RelationshipOwner { accountId: string; orgId: string; taskId?: string; artifactId?: string; }
export type EvidenceRow = Pick<TaskArtifactEvidence, 'availability' | 'contentType' | 'storedBytes' | 'artifactCreatedAt'> & { id: string; link: TaskArtifactLink };
export interface RelationshipWrite extends RelationshipOwner { taskId: string; artifactId: string; }
export const relationshipKey = (owner: RelationshipOwner) => ['taskArtifactLinks', owner.accountId, owner.orgId, owner.taskId ? 'task' : 'artifact', owner.taskId || owner.artifactId] as const;
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
  const query = useInfiniteQuery({
    queryKey: relationshipKey(owner),
    queryFn: ({ pageParam, signal }) => client.listTaskArtifactLinks({
      ...(owner.taskId ? { taskId: owner.taskId } : { artifactId: owner.artifactId }),
      page: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
    }, { signal }),
    enabled: current => !current.state.error || (accepted && !relationshipAccessLost(current.state.error)),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.page?.nextCursor || undefined,
    retry: false, retryOnMount: false, staleTime: 0,
    refetchOnMount: current => !current.state.error,
    refetchOnWindowFocus: current => !relationshipAccessLost(current.state.error) && (!current.state.error || accepted),
    refetchOnReconnect: current => !relationshipAccessLost(current.state.error) && (!current.state.error || accepted),
    refetchInterval: current => current.state.fetchStatus === 'fetching' || relationshipAccessLost(current.state.error)
      || (!!current.state.error && !accepted) ? false : 15_000,
    refetchIntervalInBackground: false,
  });
  const denied = relationshipAccessLost(query.error);
  const fresh = query.isSuccess && !query.isFetching && query.isFetchedAfterMount;
  const blocked = denied || !(fresh || accepted);
  // Settle read acceptance before children become actionable; a queued effect
  // could otherwise re-enable the query after a quick next-page failure.
  if (denied && accepted) setAccepted(false);
  else if (fresh && !accepted) setAccepted(true);
  const rows = blocked ? [] : rowsFrom(query.data?.pages ?? []);
  const controls = blocked ? undefined : query.data?.pages[0];
  return { query, rows, blocked, denied, canLink: controls?.canLink, canUnlink: controls?.canUnlink,
    totalCount: blocked ? undefined : query.data?.pages[0]?.page?.totalCount };
}
