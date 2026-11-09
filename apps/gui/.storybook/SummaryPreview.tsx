import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectError, Code } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import { TaskSummarySchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { TaskSummaryPanel } from '../src/features/Tasks/TaskSummary';
import { TaskContext } from '../src/features/Tasks/TaskContext';
import { SUMMARY_WRITES, summarySubmission, useSummaryDrafts, type SummaryWrite } from '../src/features/Tasks/summaryDrafts';

type State = 'written' | 'empty' | 'draft' | 'restored' | 'saving' | 'newer-saving' | 'error' | 'over-limit' | 'clearing' | 'clear-newer' | 'foreign-wait';
export function SummaryPreview({ state }: { state: State }) {
  const [ready, setReady] = useState(false);
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }));
  const taskId = 'summary-story-task';
  const summary = state === 'empty' || state === 'restored' ? undefined : create(TaskSummarySchema, {
    text: 'Verified the release and recorded the migration evidence.', authorName: 'Release reviewer', updatedAt: '2026-11-09T10:00:00Z',
  });
  useEffect(() => {
    const previous = useSummaryDrafts.getState().accountId;
    useSummaryDrafts.getState().endSession();
    useSummaryDrafts.getState().setAccount('summary-story-user');
    const store = useSummaryDrafts.getState();
    const scope = { accountId: store.accountId, generation: store.generation };
    let write: SummaryWrite | undefined;
    if (state === 'clearing' || state === 'clear-newer') write = summarySubmission(scope, taskId, '');
    if (!['written', 'empty', 'clearing'].includes(state)) {
      store.begin(scope, taskId, summary?.text ?? '');
      const entry = useSummaryDrafts.getState().entries[taskId];
      const text = state === 'over-limit' ? 'Verification notes. '.repeat(220).slice(0, 4001)
        : state === 'restored' ? 'Retained outcome after closing the task and navigating away.'
        : 'Record the final outcome, decisions and migration checks.';
      store.edit(scope, taskId, entry.id, text);
      if (!write) write = summarySubmission(scope, taskId, text);
      if (state === 'newer-saving' || state === 'clear-newer') store.edit(scope, taskId, entry.id, 'Newer writing stays in this draft while the earlier version finishes.');
    }
    if (write && ['saving', 'newer-saving', 'error', 'clearing', 'clear-newer', 'foreign-wait'].includes(state)) {
      if (state === 'foreign-wait') write = { ...write, accountId: 'previous-story-user', text: 'Private earlier submission' };
      client.getMutationCache().build(client, { mutationKey: SUMMARY_WRITES }, {
        context: undefined, data: undefined,
        error: state === 'error' ? new ConnectError('Summary temporarily offline. Try saving again.', Code.Unavailable) : null,
        failureCount: state === 'error' ? 1 : 0, failureReason: null, isPaused: false,
        status: state === 'error' ? 'error' : 'pending', variables: write, submittedAt: Date.now(),
      });
    }
    setReady(true);
    return () => { client.clear(); useSummaryDrafts.getState().endSession(); useSummaryDrafts.getState().setAccount(previous); };
  }, [client, state]);
  return ready ? <QueryClientProvider client={client}>
    <div className="min-h-dvh bg-surface-canvas p-panel text-foreground">
      <div className="mx-auto max-w-xl rounded-lg border bg-surface-panel p-panel">
        <h2 className="type-section-title">Review the release</h2>
        {state === 'restored' ? <TaskContext taskId={taskId} /> : <div className="mt-4"><TaskSummaryPanel taskId={taskId} summary={summary} /></div>}
      </div>
    </div>
  </QueryClientProvider> : null;
}
