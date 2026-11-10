import { createClient } from '@connectrpc/connect';
import { TaskNoteService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { transport } from '../../lib/connectTransport';
import { actionErrorMessage } from '../../lib/actionErrorMessage';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import { Button } from '../../components/ui/button';
import { reportFilterArguments, reportFilterKey, useTaskReportScope } from './TaskReportScope';
import { useTaskReportPages } from './useTaskReportPages';

const client = createClient(TaskNoteService, transport);
export function TaskNotesPanel({ taskId }: { taskId: string }) {
  const scope = useTaskReportScope();
  if (!scope || scope.taskId !== taskId) return <p role="status" className="type-caption text-muted-foreground">Choose a task to view agent notes.</p>;
  return <NotesPage key={JSON.stringify([scope.accountId, scope.orgId, taskId, reportFilterKey(scope.filter)])} scope={scope} />;
}
function NotesPage({ scope }: { scope: NonNullable<ReturnType<typeof useTaskReportScope>> }) {
  const key = ['taskNotes', scope.taskId, scope.accountId, scope.orgId, 'reports', reportFilterKey(scope.filter)];
  const { query, response, blocked, error, refresh, canRetry, position } = useTaskReportPages(scope, 'notes', key,
    (cursor, signal) => client.listTaskNotes({ taskId: scope.taskId, ...reportFilterArguments(scope.filter),
      page: { limit: 20, ...(cursor ? { cursor } : {}) } }, { signal }));
  const retry = !blocked && query.isFetchNextPageError ? () => query.fetchNextPage()
    : !blocked && query.isFetchPreviousPageError ? () => query.fetchPreviousPage() : refresh;
  if (!canRetry) return <p role="status" className="type-caption text-muted-foreground">Verify task access in Claim history to view agent notes.</p>;
  return <section aria-label="Agent notes" className="space-y-3 min-w-0">
    {error && <div role="alert" className="rounded-md border bg-destructive-subtle p-3 type-caption text-destructive-subtle-foreground">
      <p>Could not load notes: {actionErrorMessage(error)}</p>
      <Button type="button" variant="outline" size="sm" disabled={query.isFetching} onClick={() => { void retry(); }}>
        {!blocked && query.isFetchNextPageError ? 'Retry older notes' : !blocked && query.isFetchPreviousPageError ? 'Retry newer notes' : 'Retry notes'}
      </Button>
    </div>}
    {blocked && !error && <p role="status" className="type-caption text-muted-foreground">Loading notes…</p>}
    {response && <>
      <p className="type-caption text-muted-foreground">Page {position + 1} · {response.taskNotes.length} shown{response.page ? ` · ${response.page.totalCount} recorded` : ''}</p>
      {!response.taskNotes.length && <p className="type-caption text-muted-foreground">{scope.filter.kind === 'all' ? 'No agent notes yet.' : 'No matching recorded notes.'}</p>}
      {response.taskNotes.length > 0 && <p className="type-caption text-muted-foreground">Only the authoring agent can edit or delete these notes.</p>}
      {response.taskNotes.map(note => <div key={note.id} className="p-3 rounded-lg bg-muted/50 border flex flex-col gap-2 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 type-caption">
          <span className="min-w-0 max-w-full text-muted-foreground break-words">{note.agentName || `Agent ${note.agentId}`}</span>
        </div>
        <MarkdownRenderer content={note.content} />
      </div>)}
    </>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="ghost" size="sm" disabled={query.isFetching} onClick={() => { void refresh(); }}>Refresh notes</Button>
      <Button type="button" variant="outline" size="sm" disabled={blocked || query.isFetching || !query.hasPreviousPage} onClick={() => { void query.fetchPreviousPage(); }}>Newer notes</Button>
      <Button type="button" variant="outline" size="sm" disabled={blocked || query.isFetching || !query.hasNextPage} onClick={() => { void query.fetchNextPage(); }}>Older notes</Button>
    </div>
    {query.isFetchingNextPage || query.isFetchingPreviousPage ? <p role="status" className="type-caption text-muted-foreground">Loading note page…</p> : null}
  </section>;
}
