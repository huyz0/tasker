import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ListState } from '../../components/ui/ListState';
import { reportClient } from './useReportsQueries';
import { TrendCards } from './TrendCards';

/**
 * The thin query wrapper for the T09 trend cards: one `getReportTrends` call,
 * its error/loading surface, and the CFD's task-type choice — everything
 * visual lives in the presentational `TrendCards`.
 *
 * A separate query from the exception cards on purpose: the two RPCs fail
 * independently, so a slow or broken trends read must not blank the stalled
 * queue (and vice versa).
 */
export function TrendsSection({ projectId, windowDays }: {
  projectId: string;
  /** The screen's shared 7/30/90 window selector drives both queries. */
  windowDays: number;
}) {
  // Local to this section: the task type scopes only the CFD. Undefined means
  // "let the server pick the project's most-used type"; the literal "untyped"
  // selects the fixed vocabulary of untyped tasks (see the contract).
  const [taskTypeId, setTaskTypeId] = useState<string | undefined>(undefined);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', 'trends', projectId, windowDays, taskTypeId],
    enabled: !!projectId,
    queryFn: async () => reportClient.getReportTrends({ projectId, windowDays, taskTypeId }),
  });

  return (
    <ListState
      isLoading={isLoading}
      error={error}
      isEmpty={false}
      loadingMessage="Loading trends…"
      emptyMessage=""
      onRetry={() => refetch()}
    >
      {data && <TrendCards trends={data} taskTypeId={taskTypeId} onTaskTypeChange={setTaskTypeId} />}
    </ListState>
  );
}
