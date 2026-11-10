import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { TaskService, type TaskAttempt } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { transport } from '../../lib/connectTransport';
import { actionErrorMessage } from '../../lib/actionErrorMessage';
import { formatDateTime } from '../../lib/format';
import { Button } from '../../components/ui/button';
import { useTaskReportScope } from './TaskReportScope';
import { useTaskReportPages } from './useTaskReportPages';
import type { TaskReportOwner } from './taskReportAccess';

const client = createClient(TaskService, transport);
function useDocumentVisible() {
  const [visible, setVisible] = useState(document.visibilityState !== 'hidden');
  useEffect(() => {
    const changed = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  return visible;
}
export function TaskClaimHistory() {
  const scope = useTaskReportScope(), [open, setOpen] = useState(false), visible = useDocumentVisible();
  if (!scope) return null;
  return <details open={open} className="mt-6" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary onClick={event => { event.preventDefault(); setOpen(value => !value); }}
      className="cursor-pointer rounded-sm py-2 focus-visible:ring-2 focus-visible:ring-primary/50"><h3 className="inline type-section-title">Claim history</h3></summary>
    <p className="type-caption text-muted-foreground mt-2">Ownership records, not external process status.</p>
    {open && visible && <HistoryPage owner={scope} choose={receipt => scope.choose({ kind: 'receipt', receipt }, true)} />}
  </details>;
}
function HistoryPage({ owner, choose }: { owner: TaskReportOwner; choose(receipt: TaskAttempt): void }) {
  const cache = useQueryClient();
  const key = ['taskAttempts', owner.taskId, owner.accountId, owner.orgId];
  const { query, response, error, blocked, refresh, position } = useTaskReportPages(owner, 'history',
    key,
    (cursor, signal) => client.listTaskAttempts({ taskId: owner.taskId, page: { limit: 20, ...(cursor ? { cursor } : {}) } }, { signal }), 30_000);
  const readVersion = cache.getQueryState(key)?.dataUpdateCount ?? 0;
  const readSucceeded = !!response && query.isSuccess && !query.isFetching;
  useEffect(() => {
    // An unchanged older page can hide a newer unassignment or same-agent reclaim.
    // Read current ownership rather than inferring it from a historical receipt.
    if (readSucceeded) void cache.invalidateQueries({ queryKey: ['task', owner.taskId], exact: true });
  }, [cache, owner.taskId, readSucceeded, readVersion]);
  const attempts = response?.attempts ?? [];
  const retry = !blocked && query.isFetchNextPageError ? () => query.fetchNextPage()
    : !blocked && query.isFetchPreviousPageError ? () => query.fetchPreviousPage() : refresh;
  return <div className="mt-3 space-y-3">
    {error && <div role="alert" className="rounded-md border bg-destructive-subtle p-3 type-body text-destructive-subtle-foreground">
      <p>{actionErrorMessage(error)}</p>
      <Button type="button" variant="outline" size="sm" disabled={query.isFetching} onClick={() => { void retry(); }}>
        {!blocked && query.isFetchNextPageError ? 'Retry older claims' : !blocked && query.isFetchPreviousPageError ? 'Retry newer claims' : 'Retry claim history'}
      </Button>
    </div>}
    {!error && blocked && <p role="status" className="type-body text-muted-foreground">Loading claim history…</p>}
    {response && <>
      <p className="type-caption text-muted-foreground">Page {position + 1} · {attempts.length} shown{response.page ? ` · ${response.page.totalCount} recorded` : ''}</p>
      {attempts.length === 0 ? <div className="rounded-md border p-panel type-body text-muted-foreground">
        <p>No recorded claims.</p><p className="mt-1 type-caption">Earlier claims may not have receipts. This does not mean the task was never claimed.</p>
      </div> : <ul className="space-y-3" aria-label="Recorded claims">
        {attempts.map(receipt => <li key={receipt.id} className="rounded-lg border bg-surface-panel p-panel space-y-2 min-w-0">
          <p className="type-body font-semibold break-words">{receipt.owner?.name || receipt.owner?.id || 'Owner not recorded'}</p>
          <p className="type-caption text-muted-foreground break-all">{receipt.owner?.kind === 'user' ? 'User' : receipt.owner?.kind === 'agent' ? 'Agent' : 'Owner'} · <code>{receipt.id}</code></p>
          <p className="type-caption">Claimed <time dateTime={receipt.claimedAt}>{formatDateTime(receipt.claimedAt)}</time></p>
          {receipt.releasedAt ? <>
            <p className="type-caption">{receipt.releaseReason === 'owner_purged' ? 'Ownership ended when the owner was purged'
              : receipt.releaseReason === 'unassigned' ? 'Ownership ended by unassignment' : receipt.releaseReason === 'released' ? 'Ownership released' : 'Ownership ended'}</p>
            <p className="type-caption text-muted-foreground"><time dateTime={receipt.releasedAt}>{formatDateTime(receipt.releasedAt)}</time></p>
          </> : <p className="type-caption text-muted-foreground">Ownership not recorded as ended</p>}
          {receipt.externalRunId !== undefined && <div className="type-caption min-w-0"><p className="text-muted-foreground">External correlation</p><code className="break-all whitespace-pre-wrap">{receipt.externalRunId}</code></div>}
          <Button type="button" variant="outline" size="sm" onClick={() => choose(receipt)}>Show associated reports</Button>
        </li>)}
      </ul>}
    </>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="ghost" size="sm" disabled={query.isFetching} onClick={() => { void refresh(); }}>Refresh claim history</Button>
      <Button type="button" variant="outline" size="sm" disabled={blocked || query.isFetching || !query.hasPreviousPage}
        onClick={() => { void query.fetchPreviousPage(); }}>Newer claims</Button>
      <Button type="button" variant="outline" size="sm" disabled={blocked || query.isFetching || !query.hasNextPage}
        onClick={() => { void query.fetchNextPage(); }}>Older claims</Button>
    </div>
    {query.isFetchingNextPage || query.isFetchingPreviousPage ? <p role="status" className="type-caption text-muted-foreground">Loading claim page…</p> : null}
  </div>;
}
