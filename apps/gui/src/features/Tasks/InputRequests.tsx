import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { TaskService, type InputRequest } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { ListState } from '../../components/ui/ListState';
import { TONE_CLASSES } from '../../components/ui/statusStyles';
import { formatDateTime } from '../../lib/format';
import { useScopedTo } from '../../hooks/useScope';

const taskClient = createClient(TaskService, transport);

/** Every query an answer changes: the question lists, the task's waiting count, the board. */
function useInvalidateQuestions() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['inputRequests'] });
    queryClient.invalidateQueries({ queryKey: ['task'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };
}

interface AnswerFormProps {
  request: InputRequest;
}

/** Answers one open question. The suggested options fill the answer; any text will do. */
function AnswerForm({ request }: AnswerFormProps) {
  const [answer, setAnswer] = useState('');
  const invalidate = useInvalidateQuestions();
  const submit = useMutation({
    mutationFn: async (text: string) => taskClient.answerInputRequest({ id: request.id, answer: text }),
    onSuccess: () => { setAnswer(''); invalidate(); },
  });
  const fieldId = `answer-${request.id}`;
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (answer.trim()) submit.mutate(answer.trim()); }}
      className="flex flex-col gap-2"
    >
      {request.options.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested answers">
          {request.options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setAnswer(o)}
              aria-pressed={answer === o}
              className={`px-3 py-1 rounded-full border text-xs font-medium ${answer === o ? 'bg-secondary text-secondary-foreground' : 'bg-background hover:bg-muted'}`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
      <label className="sr-only" htmlFor={fieldId}>Your answer</label>
      <textarea
        id={fieldId}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={2}
        placeholder="Your answer"
        className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
      />
      {submit.isError && <p className="text-xs text-destructive">Failed to answer: {(submit.error as Error).message}</p>}
      <button
        type="submit"
        disabled={!answer.trim() || submit.isPending}
        className="self-start px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-md text-xs font-medium"
      >
        {submit.isPending ? 'Sending…' : 'Answer'}
      </button>
    </form>
  );
}

interface QuestionProps {
  request: InputRequest;
  /** Show which task it is on - for the org-wide queue, not a task's own panel. */
  showTask?: boolean;
}

function Question({ request, showTask }: QuestionProps) {
  const scopedTo = useScopedTo();
  const open = request.status === 'open';
  return (
    <li className={`rounded-md p-3 flex flex-col gap-2 text-sm ${open ? TONE_CLASSES.warning : 'border'}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
        <span className="font-medium">{request.askedByName}</span>
        <span>asks{showTask ? ' on ' : ''}</span>
        {showTask && (
          <Link to={scopedTo(`/tasks/${request.taskId}`)} className="underline">
            {request.taskDisplayId} — {request.taskTitle}
          </Link>
        )}
        <span className="opacity-80">{formatDateTime(request.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap">{request.question}</p>
      {open ? (
        <AnswerForm request={request} />
      ) : request.status === 'answered' ? (
        <p className="text-xs"><span className="font-medium">{request.answeredByName}</span> answered: {request.answer}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Withdrawn.</p>
      )}
    </li>
  );
}

interface TaskInputRequestsProps {
  taskId: string;
}

/**
 * A task's questions (M38, ADR-0031): open ones first, each with an answer
 * form, then what was already answered. Renders nothing for a task nobody
 * has asked about - the common case says nothing.
 */
export function TaskInputRequests({ taskId }: TaskInputRequestsProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['inputRequests', 'task', taskId],
    queryFn: async () => (await taskClient.listInputRequests({ taskId, status: 'all', page: { limit: 20 } })).inputRequests,
  });
  if (isLoading || error) {
    return (
      <ListState isLoading={isLoading} error={error} isEmpty={false} emptyMessage="" loadingMessage="Loading questions…"
        errorLabel="Could not load this task's questions" onRetry={() => refetch()} />
    );
  }
  const requests = [...(data ?? [])].sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open'));
  if (requests.length === 0) return null;
  const openCount = requests.filter((r) => r.status === 'open').length;
  return (
    <section aria-label="Questions from agents" className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold tracking-tight">
        {openCount > 0 ? `Waiting on you · ${openCount}` : 'Questions'}
      </h3>
      <ul className="flex flex-col gap-2">
        {requests.map((r) => <Question key={r.id} request={r} />)}
      </ul>
    </section>
  );
}

interface QuestionsQueueProps {
  orgId: string;
}

/** The organization's open questions - the queue of agents waiting on people. */
export function QuestionsQueue({ orgId }: QuestionsQueueProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['inputRequests', 'org', orgId],
    enabled: !!orgId,
    queryFn: async () => (await taskClient.listInputRequests({ orgId, status: 'open', page: { limit: 50 } })).inputRequests,
  });
  return (
    <ListState
      isLoading={isLoading}
      error={error}
      isEmpty={(data ?? []).length === 0}
      loadingMessage="Loading questions…"
      errorLabel="Could not load questions"
      emptyMessage="No agent is waiting on a person."
      onRetry={() => refetch()}
    >
      <ul className="flex flex-col gap-2" aria-label="Open questions">
        {(data ?? []).map((r) => <Question key={r.id} request={r} showTask />)}
      </ul>
    </ListState>
  );
}
