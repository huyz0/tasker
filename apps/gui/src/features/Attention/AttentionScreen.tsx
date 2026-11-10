import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AttentionItem } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useScope } from '../../hooks/useScope';
import { useLayoutStore } from '../../store/layout';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/button';
import { ListState } from '../../components/ui/ListState';
import { formatDateTime, formatStatus } from '../../lib/format';
import { attentionRowId, useAttentionReturn } from './attentionReturn';
import { ATTENTION_KINDS, useAttention, type AttentionKind, type AttentionScope } from './useAttention';

const sources: Record<AttentionKind, { label: string; noun: string; description: string; empty: string }> = {
  question: { label: 'Questions', noun: 'questions', description: 'Open questions waiting for an answer. Open a task to read the full question and respond.', empty: 'No open questions in this scope.' },
  approval: { label: 'Approvals', noun: 'approvals', description: 'Pending requests to move a task. Open the task to inspect the current state and decide.', empty: 'No pending move approvals in this scope.' },
  review: { label: 'Your reviews', noun: 'reviews', description: 'Open tasks where you are a reviewer. This responsibility is separate from approving a move.', empty: 'No open tasks assigned to you for review in this scope.' },
  stalled_claim: { label: 'Stalled claims', noun: 'stalled claims', description: 'Agent-held tasks with no task activity for more than 24 hours. Inspect the current task and assignment before acting.', empty: 'No agent-held tasks meet the silence threshold in this scope.' },
};

export function AttentionScreen() {
  const session = useAuthSession(), scope = useScope();
  const setTitle = useLayoutStore(state => state.setActivePageTitle);
  useEffect(() => setTitle('Attention'), [setTitle]);
  if (!scope.orgId) return <div className="flex flex-col gap-6"><PageHeader title="Attention" />
    <p className="type-body text-muted-foreground">Choose an organization in the sidebar to find current work that needs attention.</p></div>;
  if (!session.authenticated || !session.userId) return <div className="flex flex-col gap-6"><PageHeader title="Attention" />
    <p role="status" className="type-body text-muted-foreground">{session.isLoading ? 'Checking account…' : 'Sign in to view attention.'}</p></div>;
  return <AttentionView key={JSON.stringify([session.userId, scope.orgId, scope.projectId])}
    scope={{ accountId: session.userId, ...scope }} />;
}

interface AttentionViewProps { scope: AttentionScope; }
function AttentionView({ scope }: AttentionViewProps) {
  const [params] = useSearchParams();
  const value = params.get('kind');
  const kind = ATTENTION_KINDS.find(candidate => candidate === value) ?? 'question';
  const question = useAttention(scope, 'question', kind === 'question');
  const approval = useAttention(scope, 'approval', kind === 'approval');
  const review = useAttention(scope, 'review', kind === 'review');
  const stalled = useAttention(scope, 'stalled_claim', kind === 'stalled_claim');
  const groups = { question, approval, review, stalled_claim: stalled };
  const current = groups[kind], source = sources[kind], heading = useRef<HTMLHeadingElement>(null);
  const remember = useAttentionReturn(scope, kind, !current.blocked && current.query.isSuccess && current.query.isFetchedAfterMount && !current.query.isFetching, heading);
  const groupLink = (next: AttentionKind) => { const query = new URLSearchParams(params); query.set('kind', next); return `/attention?${query}`; };
  return <div className="flex min-w-0 flex-col gap-6">
    <PageHeader title="Attention" description="Current work from task sources. Open a task to inspect it and use its existing actions." />
    <p className="type-caption text-muted-foreground">{scope.projectId ? 'Selected project in this organization' : 'All projects in this organization'}</p>
    <nav aria-label="Attention sources" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {ATTENTION_KINDS.map(candidate => { const group = groups[candidate]; return <Link key={candidate} to={groupLink(candidate)}
        aria-current={candidate === kind ? 'page' : undefined}
        className={`flex min-w-0 flex-col gap-1 rounded-lg border p-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${candidate === kind ? 'bg-primary-subtle text-primary-subtle-foreground border-primary' : 'bg-surface-panel hover:bg-accent'}`}>
        <span className="type-body font-medium">{sources[candidate].label}</span>
        <span className="type-caption">{group.blocked ? 'Unavailable' : group.totalCount !== undefined ? `${group.totalCount} current${group.query.error ? ' · Out of date' : ''}` : group.query.error ? 'Unavailable' : 'Loading…'}</span>
      </Link>; })}
    </nav>
    <p className="type-caption text-muted-foreground">Counts reflect each source’s last authorized read.</p>
    <section aria-labelledby="attention-source-heading" className="flex min-w-0 flex-col gap-3 rounded-lg border bg-surface-panel p-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1"><h2 id="attention-source-heading" ref={heading} tabIndex={-1} className="type-section-title">{source.label}</h2>
          <p className="mt-1 max-w-prose type-caption text-muted-foreground">{source.description}</p></div>
        <Button type="button" variant="outline" size="sm" aria-label={`Refresh ${source.noun}`} disabled={current.query.isFetching && !current.blocked} onClick={() => current.refresh()}>
          {current.query.isRefetching && !current.query.isFetchingNextPage ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      {!current.blocked && current.totalCount !== undefined && <p role="status" className="type-caption text-muted-foreground">{current.rows.length} loaded of {current.totalCount}</p>}
      {current.blocked && <p className="type-caption text-muted-foreground">Current access must be verified before showing source data.</p>}
      {current.query.isPending ? <p className="type-body text-muted-foreground">Loading {source.noun}…</p> : <>
        {current.query.error && <div role="alert" className="flex flex-col items-start gap-2 rounded-md bg-destructive-subtle p-3 type-caption text-destructive-subtle-foreground">
          <p>{current.query.isFetchNextPageError ? `Could not load more ${source.noun}.` : current.rows.length ? 'This list may be out of date.' : `Could not load ${source.noun}.`} {current.query.error.message}</p>
          <Button variant="outline" size="sm" disabled={current.query.isFetching && !current.blocked} onClick={() => current.query.isFetchNextPageError && !current.blocked ? current.query.fetchNextPage() : current.refresh()}>
            {current.query.isFetchNextPageError && !current.blocked ? `Retry loading more ${source.noun}` : 'Try again'}
          </Button>
        </div>}
        {!current.blocked && (current.rows.length ? <ul className="min-w-0 divide-y">{current.rows.map(item => <AttentionRow key={`${item.kind}:${item.sourceId}`} item={item} orgId={scope.orgId} onOpen={() => remember(item.sourceId)} />)}</ul>
          : !current.query.error && <ListState isLoading={false} error={null} isEmpty emptyMessage={source.empty} />)}
        {!current.blocked && current.query.hasNextPage && !current.query.isFetchNextPageError && <Button className="self-start" variant="outline" disabled={current.query.isFetching && !current.blocked} onClick={() => current.query.fetchNextPage()}>
          {current.query.isFetchingNextPage ? 'Loading more…' : `Load more ${source.noun}`}
        </Button>}
      </>}
    </section>
  </div>;
}
interface AttentionRowProps { item: AttentionItem; orgId: string; onOpen: () => void; }
function AttentionRow({ item, orgId, onOpen }: AttentionRowProps) {
  const label = item.sinceKind === 'asked_at' ? 'Asked at' : item.sinceKind === 'requested_at' ? 'Requested at' : item.sinceKind === 'task_created_at' ? 'Task created' : 'No task activity since';
  const date = formatDateTime(item.since);
  const actorLabel = item.kind === 'question' ? 'Asked by' : item.kind === 'approval' ? 'Requested by' : 'Held by';
  const missing = item.kind === 'question' ? 'Requester not recorded' : item.kind === 'approval' ? 'Requester not recorded' : 'Holder not recorded';
  return <li className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0 flex-1 break-words">
      <p className="type-caption text-muted-foreground">{item.taskDisplayId} · {item.projectName}</p>
      <h3 className="mt-1 type-body font-medium">{item.taskTitle}</h3>
      <p className="mt-1 whitespace-pre-wrap type-body">{item.reason}</p>
      {item.kind === 'question' && item.reasonTruncated && <p className="type-caption text-muted-foreground">Excerpt · Open task for the full question.</p>}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 type-caption text-muted-foreground">
        <span>Task status: {formatStatus(item.taskStatus)}</span><span>{label}{date ? ` ${date}` : ' not recorded'}</span>
        <span>{item.kind === 'review' ? 'Owner: You' : item.actorName ? `${actorLabel} ${item.actorKind === 'agent' ? 'Agent ' : ''}${item.actorName}` : missing}</span>
        {item.kind === 'review' && <span>Review assignment date not recorded</span>}
      </div>
    </div>
    <Link id={attentionRowId(item.kind, item.sourceId)} onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) onOpen(); }} to={`/tasks/${encodeURIComponent(item.taskId)}?${new URLSearchParams({ org: orgId, project: item.projectId })}`}
      aria-label={`Open task ${item.taskDisplayId || item.taskTitle}`}
      className="inline-flex min-h-9 shrink-0 items-center self-start rounded-md border bg-background px-3 py-2 type-caption font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">Open task</Link>
  </li>;
}
