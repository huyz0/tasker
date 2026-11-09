import { Link } from 'react-router-dom';
import type { ScheduleRun } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { TONE_CLASSES, type StatusTone } from '../../components/ui/statusStyles';
import { formatDateTime } from '../../lib/format';

const PRESENTATION: Record<string, { label: string; tone: StatusTone }> = {
  queued: { label: 'Waiting to create work', tone: 'neutral' },
  running: { label: 'Creating work', tone: 'neutral' },
  interrupted: { label: 'Creation interrupted', tone: 'warning' },
  created: { label: 'Work created', tone: 'success' },
  skipped: { label: 'Skipped', tone: 'warning' },
  failed: { label: 'Creation failed', tone: 'destructive' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
export function creationResultLabel(outcome: string): string {
  return PRESENTATION[outcome]?.label ?? outcome;
}

interface RunHistoryProps {
  runs: readonly ScheduleRun[];
  orgId: string;
  projectId: string;
}

/** Creation receipts, never an assertion that an external worker started. */
export function RunHistory({ runs, orgId, projectId }: RunHistoryProps) {
  const scope = new URLSearchParams({ org: orgId, project: projectId }).toString();
  return (
    <ul className="flex flex-col divide-y divide-border type-body" aria-label="Runs">
      {runs.map((run) => {
        const presentation = PRESENTATION[run.outcome] ?? { label: run.outcome, tone: 'neutral' as const };
        return (
          <li key={run.id} className="flex min-w-0 flex-col gap-2 py-3 first:pt-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className={`rounded px-1.5 py-0.5 type-caption ${TONE_CLASSES[presentation.tone]}`}>{presentation.label}</span>
              {run.attempts !== undefined && run.attempts > 0 && <span className="type-caption text-muted-foreground">Attempt {run.attempts}</span>}
              <span className="type-caption text-muted-foreground">{run.trigger === 'manual' ? 'run by hand' : 'on schedule'}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 type-caption text-muted-foreground">
              <span>Accepted {formatDateTime(run.ranAt)}</span>
              {run.dueAt && <span>Scheduled for {formatDateTime(run.dueAt)}</span>}
              {run.outcome === 'interrupted' && run.nextAttemptAt && <span>Recovery eligible after {formatDateTime(run.nextAttemptAt)}</span>}
              {run.completedAt && <span>Completed {formatDateTime(run.completedAt)}</span>}
            </div>
            {run.taskId && <Link to={`/tasks/${encodeURIComponent(run.taskId)}?${scope}`} className="w-fit type-caption text-primary underline">Open created task</Link>}
            {run.detail && <p className="break-words type-caption">{run.detail}</p>}
          </li>
        );
      })}
    </ul>
  );
}
