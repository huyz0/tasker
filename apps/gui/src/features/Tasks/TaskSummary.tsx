import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { actionErrorMessage } from '../../lib/actionErrorMessage';
import { TaskService, type TaskSummary as Summary } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import { formatDateTime } from '../../lib/format';
import { SUMMARY_WRITES, summaryDirty, summarySubmission, summaryWritePending, usePendingSummaryWrites, useSummarySessionEnding, useSummaryWriteError, useSummaryDrafts, type SummaryWrite } from './summaryDrafts';

const taskClient = createClient(TaskService, transport);
const MAX = 4000;

interface TaskSummaryPanelProps {
  taskId: string;
  summary?: Summary;
}

/**
 * What the task came to (M41, ADR-0034) - usually written by the agent that
 * finished it; a person can write, rewrite or clear it here. Replacing the
 * summary never touches the task's history.
 */
export function TaskSummaryPanel({ taskId, summary }: TaskSummaryPanelProps) {
  const state = useSummaryDrafts();
  const ending = useSummarySessionEnding();
  const scope = { accountId: state.accountId, generation: state.generation };
  const entry = state.entries[taskId];
  const pendingWrites = usePendingSummaryWrites();
  const blocker = pendingWrites.find(write => write.taskId === taskId);
  const pending = !!blocker;
  const ownPending = blocker?.accountId === scope.accountId;
  const clearing = ownPending && blocker?.text === '';
  const pendingLabel = !ownPending ? 'Waiting…' : clearing ? 'Clearing…' : 'Saving…';
  const pendingMessage = !ownPending ? 'A previous summary write is finishing.' : clearing
    ? 'Clearing the saved summary. Your new draft stays here.'
    : 'Saving the submitted version. You can keep editing.';
  const dirty = entry ? summaryDirty(entry, scope, taskId, pendingWrites) : false;
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationKey: SUMMARY_WRITES,
    mutationFn: async (write: SummaryWrite) => taskClient.setTaskSummary({ taskId: write.taskId, text: write.text }),
    onSuccess: (response, write) => useSummaryDrafts.getState().accept(write, response.summary?.text ?? ''),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['task'] }),
  });
  const submit = (text: string) => {
    const write = summarySubmission(scope, taskId, text);
    // A live cache check also fences same-tick submissions and route remounts.
    if (!ending && write && !summaryWritePending(queryClient, taskId)) save.mutate(write);
  };
  const error = useSummaryWriteError(scope, taskId, entry?.id);

  if (entry) {
    const draft = entry.text;
    const tooLong = draft.length > MAX;
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => { e.preventDefault(); if (draft.trim() && !tooLong) submit(draft); }}
      >
        <label className="sr-only" htmlFor={`summary-${taskId}`}>Summary</label>
        <textarea
          id={`summary-${taskId}`}
          value={draft}
          onChange={(e) => state.edit(scope, taskId, entry.id, e.target.value)}
          rows={5}
          placeholder="Outcome, decisions, gotchas - what someone picking this up later needs."
          className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
        />
        {dirty && <p role="status" className="text-xs font-medium text-muted-foreground">Unsaved draft</p>}
        <p role={tooLong ? 'alert' : undefined} className={`text-xs ${tooLong ? 'rounded-md bg-destructive-subtle p-2 text-destructive-subtle-foreground' : 'text-muted-foreground'}`}>{draft.length} / {MAX}</p>
        {error && <p role="alert" className="rounded-md bg-destructive-subtle p-2 text-xs text-destructive-subtle-foreground">Failed to save the summary: {actionErrorMessage(error)}</p>}
        {pending && <p role="status" className="text-xs text-muted-foreground">{pendingMessage}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!draft.trim() || tooLong || pending || ending}
            className="px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-md text-xs font-medium"
          >
            {pending ? pendingLabel : 'Save summary'}
          </button>
          <button type="button" onClick={() => state.discard(scope, taskId, entry.id)} className="px-3 py-1 border bg-background hover:bg-muted rounded-md text-xs font-medium">
            Cancel
          </button>
        </div>
      </form>
    );
  }

  if (!summary) {
    return (
      <div className="flex flex-col gap-2 items-start">
        <p className="text-sm text-muted-foreground">No summary yet. The agent that finishes a task usually writes one.</p>
        {pending && <p role="status" className="text-xs text-muted-foreground">{pendingMessage}</p>}
        <button type="button" disabled={!scope.accountId || ending} onClick={() => state.begin(scope, taskId, '')} className="text-xs font-medium text-primary hover:underline">
          Write a summary
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <MarkdownRenderer content={summary.text} />
      </div>
      <p className="text-xs text-muted-foreground">
        By {summary.authorName} · {formatDateTime(summary.updatedAt)}
      </p>
      {error && <p role="alert" className="rounded-md bg-destructive-subtle p-2 text-xs text-destructive-subtle-foreground">Failed to clear the summary: {actionErrorMessage(error)}</p>}
      {pending && <p role="status" className="text-xs text-muted-foreground">{pendingMessage}</p>}
      <div className="flex gap-3">
        <button type="button" disabled={!scope.accountId || ending} onClick={() => state.begin(scope, taskId, summary.text)} className="text-xs font-medium text-primary hover:underline">
          Edit
        </button>
        <button
          type="button"
          disabled={!scope.accountId || pending || ending}
          onClick={() => submit('')}
          className="text-xs font-medium text-muted-foreground hover:text-destructive disabled:opacity-50"
        >
          {pending && clearing ? 'Clearing…' : 'Clear'}
        </button>
      </div>
    </div>
  );
}
