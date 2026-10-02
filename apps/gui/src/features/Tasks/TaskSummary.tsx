import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { TaskService, type TaskSummary as Summary } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import { formatDateTime } from '../../lib/format';

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
  const [draft, setDraft] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async (text: string) => taskClient.setTaskSummary({ taskId, text }),
    onSuccess: () => {
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ['task'] });
    },
  });

  if (draft !== null) {
    const tooLong = draft.length > MAX;
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => { e.preventDefault(); if (draft.trim() && !tooLong) save.mutate(draft); }}
      >
        <label className="sr-only" htmlFor={`summary-${taskId}`}>Summary</label>
        <textarea
          id={`summary-${taskId}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          placeholder="Outcome, decisions, gotchas - what someone picking this up later needs."
          className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
        />
        <p className={`text-xs ${tooLong ? 'text-destructive' : 'text-muted-foreground'}`}>{draft.length} / {MAX}</p>
        {save.isError && <p className="text-xs text-destructive">Failed to save the summary: {(save.error as Error).message}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!draft.trim() || tooLong || save.isPending}
            className="px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-md text-xs font-medium"
          >
            {save.isPending ? 'Saving…' : 'Save summary'}
          </button>
          <button type="button" onClick={() => setDraft(null)} className="px-3 py-1 border bg-background hover:bg-muted rounded-md text-xs font-medium">
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
        <button type="button" onClick={() => setDraft('')} className="text-xs font-medium text-primary hover:underline">
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
      {save.isError && <p className="text-xs text-destructive">Failed to clear the summary: {(save.error as Error).message}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={() => setDraft(summary.text)} className="text-xs font-medium text-primary hover:underline">
          Edit
        </button>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate('')}
          className="text-xs font-medium text-muted-foreground hover:text-destructive disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
