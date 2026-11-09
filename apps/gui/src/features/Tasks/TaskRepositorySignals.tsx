import type { RemotePullRequest } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { Button } from '../../components/ui/button';
import { formatDateTime } from '../../lib/format';

interface TaskRepositorySignalsProps {
  taskId: string;
  records: readonly RemotePullRequest[];
  state: 'loading' | 'ready' | 'error' | 'denied';
  onRetry: () => void;
}

/** Project sync records already loaded by the workbench; no extra provider read. */
export function TaskRepositorySignals({ taskId, records, state, onRetry }: TaskRepositorySignalsProps) {
  const matching = state === 'ready' ? records.filter(record => record.taskId === taskId) : [];
  return <div className="flex min-w-0 flex-col gap-2 border-t pt-3">
    <h4 className="type-body font-medium">Synced pull requests</h4>
    <p className="type-caption text-muted-foreground">Provider records may be incomplete or out of date. A merged pull request does not verify task completion.</p>
    {state === 'loading' && <p role="status" className="type-caption text-muted-foreground">Loading recorded pull requests…</p>}
    {(state === 'error' || state === 'denied') && <div role="alert" className="type-caption text-muted-foreground">
      <p>{state === 'denied' ? 'Access to recorded pull requests must be verified.' : 'Could not load recorded pull requests.'}</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>Retry pull requests</Button>
    </div>}
    {state === 'ready' && (matching.length ? <ul className="divide-y">{matching.map(record => <li key={record.id} className="min-w-0 py-2">
      <div className="break-words text-sm font-medium">{/^https?:\/\//i.test(record.url)
        ? <a href={record.url} target="_blank" rel="noopener noreferrer" className="rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">{record.title}</a>
        : <span>{record.title}</span>}</div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 type-caption text-muted-foreground"><span>{record.status || 'Status not recorded'}</span>
        <span>{formatDateTime(record.updatedAt) ? `Last recorded ${formatDateTime(record.updatedAt)}` : 'Record time not available'}</span></div>
    </li>)}</ul> : <p className="type-caption text-muted-foreground">No linked pull requests recorded</p>)}
  </div>;
}
