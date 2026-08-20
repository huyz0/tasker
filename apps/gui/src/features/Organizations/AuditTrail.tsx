import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { useDebounce } from 'use-debounce';
import { transport } from '../../lib/connectTransport';
import { AuditService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { ListState } from '../../components/ui/ListState';
import { VirtualList } from '../../components/ui/VirtualList';

const auditClient = createClient(AuditService, transport);

/**
 * The organization's audit trail (M08-T06).
 *
 * Answers "who changed this, and when" — the question the milestone names.
 * Read-only, because the trail is written solely by the event consumer's
 * projector; there is deliberately no mutation in the contract to call.
 */

/** Rows are one line plus a detail line — a fixed height, kept beside them. */
const ROW_HEIGHT = 68;

function formatSubject(subject: string): string {
  // "domain.agent.token_created" -> "agent · token created". The domain
  // prefix is on every row and carries no information once you know you are
  // looking at the audit trail.
  const withoutPrefix = subject.replace(/^domain\./, '');
  const [entity, ...rest] = withoutPrefix.split('.');
  const action = rest.join('.').replace(/_/g, ' ');
  return action ? `${entity} · ${action}` : withoutPrefix;
}

function describeActor(actorType: string, actorId?: string): string {
  // "system" is a real answer, not a missing one: a retention sweep has no
  // principal behind it. Saying so beats rendering an empty cell that reads
  // as "we failed to record this".
  if (actorType === 'system' || !actorId) return 'system';
  return `${actorType}: ${actorId}`;
}

export function AuditTrail({ orgId }: { orgId: string }) {
  const [subjectFilter, setSubjectFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [debouncedSubject] = useDebounce(subjectFilter, 300);
  const [debouncedActor] = useDebounce(actorFilter, 300);

  const {
    data: pages,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['auditEvents', orgId, debouncedSubject, debouncedActor],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) =>
      auditClient.listAuditEvents({
        orgId,
        subject: debouncedSubject || undefined,
        actorId: debouncedActor || undefined,
        page: { cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
    enabled: Boolean(orgId),
  });

  const events = pages?.pages.flatMap((p) => p.events);
  const total = Number(pages?.pages[0]?.page?.totalCount ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-medium">Audit Trail</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Every recorded change in this organization, newest first. Written by the event consumer, not
          editable here.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <label className="sr-only" htmlFor="audit-subject">Filter by event</label>
          <input
            id="audit-subject"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            placeholder="Event, e.g. domain.agent.token_created"
            className="w-full border rounded-md px-3 py-1.5 text-sm bg-background outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
        </div>
        <div className="flex-1">
          <label className="sr-only" htmlFor="audit-actor">Filter by actor</label>
          <input
            id="audit-actor"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            placeholder="Actor id"
            className="w-full border rounded-md px-3 py-1.5 text-sm bg-background outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
        </div>
      </div>

      {isLoading || error || !events || events.length === 0 ? (
        <ListState
          isLoading={isLoading}
          error={error}
          isEmpty
          loadingMessage="Loading the audit trail…"
          emptyMessage={
            debouncedSubject || debouncedActor
              ? 'No events match these filters.'
              : 'Nothing has been recorded for this organization yet.'
          }
          emptyAction={
            <p className="text-xs">
              Events appear here once the event consumer has processed them.
            </p>
          }
          onRetry={() => refetch()}
        />
      ) : (
        <div className="border rounded-md divide-y">
          {/* Virtualized: an audit trail only grows, and an active org's is
              unbounded — the same reasoning as the Bin's own list. */}
          <VirtualList
            items={events}
            rowHeight={ROW_HEIGHT}
            className="max-h-[60vh] overflow-y-auto divide-y"
            renderRow={(event: any) => (
              <div key={event.id} className="p-3 text-sm">
                <div className="flex justify-between items-baseline gap-3">
                  <span className="font-medium">{formatSubject(event.subject)}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(event.occurredAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {describeActor(event.actorType, event.actorId)}
                  {event.requestId && <span className="ml-2 font-mono">req {event.requestId.slice(0, 8)}</span>}
                </div>
              </div>
            )}
          />
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full p-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {isFetchingNextPage ? 'Loading…' : `Load more (${events.length} of ${total})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
