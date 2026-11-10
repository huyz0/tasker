import { useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { useDebounce } from 'use-debounce';
import { ArtifactService, SearchService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { transport } from '../../lib/connectTransport';
import { actionErrorMessage } from '../../lib/actionErrorMessage';
import { formatDateTime } from '../../lib/format';
import { useAuthSession } from '../../hooks/useAuthSession';
import { Button } from '../../components/ui/button';
import { ListState } from '../../components/ui/ListState';
import { RELATIONSHIP_WRITES, relationshipAccessLost, relationshipKey, useArtifactRelationships, type EvidenceRow, type RelationshipOwner, type RelationshipWrite } from './useArtifactRelationships';
import { reportFilterArguments, useTaskReportScope } from './TaskReportScope';

const artifacts = createClient(ArtifactService, transport);
const searchClient = createClient(SearchService, transport);
interface TaskArtifactLinksProps { taskId?: string; artifactId?: string; orgId: string; children?: ReactNode; }

/** Both ends share one relationship control. A new owner remounts local intent. */
export function TaskArtifactLinks(props: TaskArtifactLinksProps) {
  const session = useAuthSession();
  const scope = useTaskReportScope();
  if (!session.authenticated || !session.userId) return <p className="type-caption text-muted-foreground" role="status">
    {session.isLoading ? 'Checking account…' : 'Sign in to view linked evidence.'}
  </p>;
  if (!(props.taskId || props.artifactId) || !props.orgId) return <p className="type-caption text-muted-foreground">Choose a resource to view its links.</p>;
  const owner = { accountId: session.userId, orgId: props.orgId, taskId: props.taskId, artifactId: props.artifactId,
    ...(scope && scope.taskId === props.taskId && scope.orgId === props.orgId && scope.accountId === session.userId
      ? reportFilterArguments(scope.filter) : {}) };
  return <RelationshipPanel key={JSON.stringify(relationshipKey(owner))} owner={owner}>{props.children}</RelationshipPanel>;
}

interface RelationshipPanelProps { owner: RelationshipOwner; children?: ReactNode; }
function RelationshipPanel({ owner, children }: RelationshipPanelProps) {
  const taskSide = !!owner.taskId;
  const reportScope = useTaskReportScope();
  const queryClient = useQueryClient();
  const { query, rows, blocked, denied, canLink, canUnlink, totalCount, refresh: refreshRead, canRetry } = useArtifactRelationships(owner);
  const [outsideLink, setOutsideLink] = useState<'ungrouped' | 'other' | 'unknown' | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [writeAccessLost, setWriteAccessLost] = useState(false);
  const [search, setSearch] = useState('');
  const raw = search.trim();
  const requested = useRef(raw); requested.current = raw;
  const [debounced] = useDebounce(raw, 250);
  const settled = raw === debounced;
  const inputId = useId(), headingId = useId();
  const pending = useIsMutating({ mutationKey: RELATIONSHIP_WRITES, predicate: mutation => {
    const write = mutation.state.variables as RelationshipWrite | undefined;
    return write?.orgId === owner.orgId && (owner.taskId ? write.taskId === owner.taskId : write.artifactId === owner.artifactId);
  } }) > 0;

  const invalidate = (write: RelationshipWrite) => {
    queryClient.invalidateQueries({ queryKey: ['taskArtifactLinks', write.accountId, write.orgId] });
    queryClient.invalidateQueries({ queryKey: ['taskDigest', write.taskId] });
    queryClient.invalidateQueries({ queryKey: ['task', write.taskId] });
  };
  const link = useMutation({
    mutationKey: RELATIONSHIP_WRITES,
    mutationFn: (write: RelationshipWrite) => artifacts.linkTaskArtifact({ taskId: write.taskId, artifactId: write.artifactId }),
    onSuccess: (response, write) => {
      setIsPicking(false); setSearch(''); invalidate(write);
      if (owner.attemptId !== undefined || owner.uncorrelatedOnly) {
        const outside = !response.link || (owner.attemptId !== undefined ? response.link.attemptId !== owner.attemptId : response.link.attemptId !== undefined);
        setOutsideLink(outside ? !response.link ? 'unknown' : response.link.attemptId === undefined ? 'ungrouped' : 'other' : null);
      }
    },
    onError: error => { if (relationshipAccessLost(error)) setWriteAccessLost(true); },
  });
  const unlink = useMutation({
    mutationKey: RELATIONSHIP_WRITES,
    mutationFn: (write: RelationshipWrite) => artifacts.unlinkTaskArtifact({ taskId: write.taskId, artifactId: write.artifactId }),
    onSuccess: (_response, write) => invalidate(write),
    onError: error => { if (relationshipAccessLost(error)) setWriteAccessLost(true); },
  });
  const mutationError = link.error || unlink.error;
  const writeDenied = writeAccessLost || relationshipAccessLost(mutationError);
  const writable = !blocked && !writeDenied && !pending;
  const candidates = useQuery({
    queryKey: ['linkCandidates', ...relationshipKey(owner), raw],
    enabled: isPicking && canLink === true && writable && !!raw && settled,
    queryFn: async ({ signal }) => (await searchClient.universalSearch({ orgId: owner.orgId, query: raw,
      page: { limit: 10 } }, { signal })).results,
    retry: false,
  });
  const linkedIds = new Set(rows.map(row => taskSide ? row.link.artifactId : row.link.taskId));
  const offered = settled && raw && candidates.isSuccess && !candidates.isFetching && writable
    ? candidates.data.filter(candidate => candidate.type === (taskSide ? 'artifact' : 'task') && !linkedIds.has(candidate.id)) : [];
  const refresh = async () => {
    const before = queryClient.getQueryState(relationshipKey(owner))?.dataUpdateCount ?? 0;
    const result = await refreshRead();
    const after = queryClient.getQueryState(relationshipKey(owner))?.dataUpdateCount ?? 0;
    // Cancellation can return the previous successful result without a response.
    if (result?.isSuccess && after > before) { setWriteAccessLost(false); link.reset(); unlink.reset(); }
  };
  const noun = taskSide ? 'evidence' : 'task links';
  if (!canRetry) return <p role="status" className="type-caption text-muted-foreground">Verify task access in Claim history to view evidence.</p>;
  const content = <>
    <div className="flex items-start justify-between gap-3">
      {taskSide ? <h3 id={headingId} className="type-section-title">Evidence</h3> : <span className="type-caption text-muted-foreground">Linked tasks</span>}
      <Button type="button" variant="ghost" size="sm" aria-label={`Refresh ${noun}`} disabled={query.isFetching} onClick={refresh}>
        {query.isRefetching && !query.isFetchingNextPage ? 'Refreshing…' : 'Refresh'}
      </Button>
    </div>
    {taskSide && <p className="type-caption text-muted-foreground">Linked artifacts are reported outputs. Links show current content, not a frozen completion version.</p>}
    {!blocked && <p className="type-caption text-muted-foreground">{rows.length} loaded{totalCount !== undefined ? ` of ${totalCount}` : ''}</p>}
    {query.isLoading || blocked ? <ListState isLoading={query.isLoading || (blocked && !query.error)} error={query.error} isEmpty={false}
      loadingMessage={taskSide ? 'Loading evidence…' : 'Loading links…'} emptyMessage="" onRetry={refresh} /> : <>
      {query.error && <div role="alert" className="rounded-md border bg-destructive-subtle p-3 type-caption text-destructive-subtle-foreground">
        <p>{query.isFetchNextPageError ? 'Could not load more evidence.' : 'Evidence may be out of date.'} {actionErrorMessage(query.error)}</p>
        <Button variant="outline" size="sm" type="button" disabled={query.isFetching}
          onClick={() => query.isFetchNextPageError ? query.fetchNextPage() : refresh()}>
          {query.isFetchNextPageError ? 'Retry loading more evidence' : 'Retry evidence'}
        </Button>
      </div>}
      {rows.length ? <ul className="divide-y">
        {rows.map(row => <EvidenceItem key={row.id} row={row} taskSide={taskSide} orgId={owner.orgId}
          canUnlink={canUnlink === true} disabled={!writable}
          onUnlink={() => unlink.mutate({ ...owner, taskId: row.link.taskId, artifactId: row.link.artifactId })} />)}
      </ul> : <p className="type-caption text-muted-foreground">{taskSide ? 'No evidence linked' : 'Not linked to any task'}</p>}
      {query.hasNextPage && !query.isFetchNextPageError && <Button variant="outline" size="sm" type="button" className="self-start"
        disabled={query.isFetching} onClick={() => query.fetchNextPage()}>
        {query.isFetchingNextPage ? 'Loading more…' : taskSide ? 'Load more evidence' : 'Load more task links'}
      </Button>}
      {canLink === false && canUnlink === false && <p className="type-caption text-muted-foreground">Read only</p>}
      {(canLink === undefined || canUnlink === undefined) && <p className="type-caption text-muted-foreground">Linking controls unavailable. Refresh to verify current access.</p>}
      {pending && <p role="status" className="type-caption text-muted-foreground">Saving relationship changes…</p>}
      {canLink === true && (isPicking ? <div className="flex flex-col gap-2 rounded-md border bg-card p-3">
        <label className="type-caption font-medium" htmlFor={inputId}>{taskSide ? 'Search artifacts' : 'Search tasks'}</label>
        <input id={inputId} value={search} disabled={!writable} placeholder={taskSide ? 'Artifact name' : 'Task title or description'}
          onChange={event => { requested.current = event.target.value.trim(); setSearch(event.target.value); link.reset(); }}
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:text-muted-foreground" />
        {!raw && <p className="type-caption text-muted-foreground">Type to search.</p>}
        {raw && (!settled || candidates.isFetching) && <p role="status" className="type-caption text-muted-foreground">Searching…</p>}
        {settled && candidates.error && <ListState isLoading={false} error={candidates.error} isEmpty={false} emptyMessage="" onRetry={() => candidates.refetch()} />}
        {offered.map(candidate => <button key={candidate.id} type="button" disabled={!writable}
          className="rounded-md px-2 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:text-muted-foreground"
          onClick={() => { if (requested.current === raw && settled && writable) link.mutate({ ...owner,
            taskId: owner.taskId || candidate.id, artifactId: owner.artifactId || candidate.id }); }}>
          {candidate.title}
        </button>)}
        {raw && settled && candidates.isSuccess && !candidates.isFetching && offered.length === 0 && <p className="type-caption text-muted-foreground">
          {candidates.data.some(candidate => linkedIds.has(candidate.id)) ? `The matching ${taskSide ? 'artifacts' : 'tasks'} shown here are already linked. Refine the name to find another.` : `No ${taskSide ? 'artifact' : 'task'} matches that.`}
        </p>}
        <Button variant="ghost" size="sm" type="button" className="self-start" disabled={pending}
          onClick={() => { setIsPicking(false); setSearch(''); link.reset(); }}>Cancel</Button>
      </div> : <Button variant="outline" size="sm" type="button" className="self-start" disabled={!writable}
        onClick={() => { setIsPicking(true); link.reset(); }}>{taskSide ? 'Link an artifact…' : 'Link a task…'}</Button>)}
    </>}
    {denied && <p className="type-caption text-muted-foreground">Current access must be verified before showing linked data.</p>}
    {outsideLink && <div role="status" className="rounded-md border bg-surface-panel p-3 type-caption space-y-2">
      <p>{outsideLink === 'ungrouped' ? 'Artifact linked without a claim receipt.'
        : outsideLink === 'other' ? 'Artifact is linked with a different claim receipt.' : 'Artifact linked. Its claim association was not returned.'}</p>
      {reportScope && <Button type="button" variant="outline" size="sm" onClick={() => reportScope.choose({ kind: 'all' }, true)}>Show all reports</Button>}
    </div>}
    {mutationError && <p role="alert" className="type-caption text-destructive-subtle-foreground">
      {link.error ? 'Failed to link: ' : 'Failed to unlink: '}{actionErrorMessage(mutationError)}
      {writeDenied && ' Refresh to verify current controls.'}
    </p>}
    {children}
  </>;
  return taskSide ? <section aria-labelledby={headingId} className="mt-6 flex flex-col gap-3">{content}</section>
    : <div className="flex flex-col gap-3">{content}</div>;
}

interface EvidenceItemProps { row: EvidenceRow; taskSide: boolean; orgId: string; canUnlink: boolean; disabled: boolean; onUnlink: () => void; }
function EvidenceItem({ row, taskSide, orgId, canUnlink, disabled, onUnlink }: EvidenceItemProps) {
  const unavailable = taskSide && row.availability === 'unavailable';
  const name = unavailable ? 'Artifact unavailable' : (taskSide ? row.link.artifactName : row.link.taskTitle);
  const actor = row.link.linkedBy;
  const linkedAt = formatDateTime(row.link.linkedAt), createdAt = formatDateTime(row.artifactCreatedAt);
  return <li className="min-w-0 py-3">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0 flex-1 break-words text-sm font-medium">
        {taskSide && !unavailable ? <Link className="rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          to={`/artifacts/${encodeURIComponent(row.link.artifactId)}?${new URLSearchParams({ org: orgId })}`}>{name}</Link> : <span>{name}</span>}
      </div>
      {canUnlink && <Button variant="ghost" size="sm" type="button" aria-label={`Unlink ${name}`} disabled={disabled} onClick={onUnlink}>Unlink</Button>}
    </div>
    {taskSide && <div className="mt-1 flex min-w-0 flex-wrap gap-x-4 gap-y-1 break-words type-caption text-muted-foreground">
      {row.availability === 'archived' && <span>Archived</span>}
      {!unavailable && <>
        <span>{row.contentType || 'Type not recorded'}</span>
        <span>{row.storedBytes !== undefined ? `Stored bytes: ${row.storedBytes.toLocaleString()}` : 'Stored bytes not recorded'}</span>
        <span>{createdAt ? `Created ${createdAt}` : 'Creation time not recorded'}</span>
      </>}
      <span>{actor ? `Linked by ${actor.kind === 'agent' ? 'Agent' : actor.kind === 'user' ? 'User' : 'Linker'} ${actor.name || actor.id}` : 'Link author not recorded'}</span>
      <span>{linkedAt ? `Linked at ${linkedAt}` : 'Link time not recorded'}</span>
    </div>}
  </li>;
}
