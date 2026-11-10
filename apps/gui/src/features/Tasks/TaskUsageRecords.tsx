import { useState } from 'react';
import { createClient } from '@connectrpc/connect';
import { TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { transport } from '../../lib/connectTransport';
import { actionErrorMessage } from '../../lib/actionErrorMessage';
import { formatCount, formatDateTime, formatMicros } from '../../lib/format';
import { Button } from '../../components/ui/button';
import { reportFilterArguments, reportFilterKey, useTaskReportScope } from './TaskReportScope';
import { useTaskReportPages } from './useTaskReportPages';

const client = createClient(TaskService, transport);
export function TaskUsageRecords() {
  const scope = useTaskReportScope(), [open, setOpen] = useState(false);
  if (!scope) return null;
  return <details open={open} className="mt-4" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary onClick={event => { event.preventDefault(); setOpen(value => !value); }}
      className="cursor-pointer rounded-sm py-2 type-body focus-visible:ring-2 focus-visible:ring-primary/50">Usage records</summary>
    {open && <UsagePage key={JSON.stringify([scope.accountId, scope.orgId, scope.taskId, reportFilterKey(scope.filter)])} scope={scope} />}
  </details>;
}
function UsagePage({ scope }: { scope: NonNullable<ReturnType<typeof useTaskReportScope>> }) {
  const { query, response, blocked, error, refresh, canRetry, position } = useTaskReportPages(scope, 'usage',
    ['usageRecords', scope.taskId, scope.accountId, scope.orgId, reportFilterKey(scope.filter)],
    (cursor, signal) => client.listUsageRecords({ taskId: scope.taskId, ...reportFilterArguments(scope.filter),
      page: { limit: 20, ...(cursor ? { cursor } : {}) } }, { signal }));
  const retry = !blocked && query.isFetchNextPageError ? () => query.fetchNextPage()
    : !blocked && query.isFetchPreviousPageError ? () => query.fetchPreviousPage() : refresh;
  if (!canRetry) return <p role="status" className="type-caption text-muted-foreground">Verify task access in Claim history to view usage records.</p>;
  return <div className="space-y-3 min-w-0">
    {error && <div role="alert" className="rounded-md border bg-destructive-subtle p-3 type-caption text-destructive-subtle-foreground">
      <p>Could not load usage records: {actionErrorMessage(error)}</p>
      <Button type="button" variant="outline" size="sm" disabled={query.isFetching} onClick={() => { void retry(); }}>
        {!blocked && query.isFetchNextPageError ? 'Retry older usage records' : !blocked && query.isFetchPreviousPageError ? 'Retry newer usage records' : 'Retry usage records'}
      </Button>
    </div>}
    {blocked && !error && <p role="status" className="type-caption text-muted-foreground">Loading usage records…</p>}
    {response && <>
      <p className="type-caption text-muted-foreground">Page {position + 1} · {response.records.length} shown{response.page ? ` · ${response.page.totalCount} recorded` : ''}</p>
      {!response.records.length && <p className="type-caption text-muted-foreground">No matching recorded usage reports.</p>}
      <ul className="space-y-3" aria-label="Recorded usage reports">
        {response.records.map(record => <li key={record.id} className="rounded-md border p-panel space-y-1 type-caption min-w-0">
          <p className="font-medium break-words">{record.reportedByName || record.agentId || record.userId || 'Reporter not recorded'}</p>
          <p className="text-muted-foreground">{formatDateTime(record.createdAt)}{record.modelName ? ` · ${record.modelName}` : ''}</p>
          <p>{formatCount(record.inputTokens)} input · {formatCount(record.outputTokens)} output · {formatMicros(record.costMicros)}</p>
        </li>)}
      </ul>
    </>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="ghost" size="sm" disabled={query.isFetching} onClick={() => { void refresh(); }}>Refresh usage records</Button>
      <Button type="button" variant="outline" size="sm" disabled={blocked || query.isFetching || !query.hasPreviousPage} onClick={() => { void query.fetchPreviousPage(); }}>Newer usage records</Button>
      <Button type="button" variant="outline" size="sm" disabled={blocked || query.isFetching || !query.hasNextPage} onClick={() => { void query.fetchNextPage(); }}>Older usage records</Button>
    </div>
  </div>;
}
