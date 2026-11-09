import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { TaskService, type InputRequest } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { WorkPages, WorkHistory, WorkNotice, useWorkPages, useWorkNotice } from './WorkPages';
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
  onNotice: (message: string) => void;
}

/** Answers one open question. The suggested options fill the answer; any text will do. */
function AnswerForm({ request, onNotice }: AnswerFormProps) {
  const [answer, setAnswer] = useState('');
  const invalidate = useInvalidateQuestions();
  const submit = useMutation({
    mutationFn: async (text: string) => taskClient.answerInputRequest({ id: request.id, answer: text }),
    onMutate: () => onNotice(''),
    onSuccess: () => setAnswer(''),
    onError: (error) => onNotice(`Failed to answer: ${error.message}`),
    onSettled: invalidate,
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
  onNotice: (message: string) => void;
}

function Question({ request, showTask, onNotice }: QuestionProps) {
  const scopedTo = useScopedTo();
  const open = request.status === 'open';
  return (
    <li className={`min-w-0 rounded-md p-3 flex flex-col gap-2 text-sm [overflow-wrap:anywhere] ${open ? TONE_CLASSES.warning : 'border'}`}>
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
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{request.question}</p>
      {open ? (
        <AnswerForm request={request} onNotice={onNotice} />
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

/** Pending work and closed history have independent bounded source pages. */
export function TaskInputRequests({ taskId }: TaskInputRequestsProps) {
  const [notice, onNotice] = useWorkNotice(taskId);
  const pending = useWorkPages(['inputRequests', 'task', taskId, 'open'], async cursor => {
    const response = await taskClient.listInputRequests({ taskId, status: 'open', page: { limit: 20, cursor } });
    return { items: response.inputRequests, page: response.page };
  });
  const history = useWorkPages(['inputRequests', 'task', taskId, 'closed'], async cursor => {
    const response = await taskClient.listInputRequests({ taskId, status: 'closed', page: { limit: 20, cursor } });
    return { items: response.inputRequests, page: response.page };
  });
  if (pending.isSuccess && history.isSuccess && !pending.items.length && !history.items.length && !notice) return null;
  return (
    <section aria-label="Questions from agents" className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold tracking-tight">{pending.totalCount > 0 ? `Waiting on you · ${pending.totalCount}` : 'Questions'}</h3>
      <WorkNotice message={notice} />
      <WorkPages query={pending} kind="pending" listLabel="Open questions" loadingMessage="Loading questions…"
        errorLabel="Could not load this task's questions" emptyMessage="No agent is waiting on a person.">
        {pending.items.map(request => <Question key={request.id} request={request} onNotice={onNotice} />)}
      </WorkPages>
      <WorkHistory key={taskId} query={history}>
        <WorkPages query={history} kind="closed" listLabel="Closed questions" loadingMessage="Loading question history…"
          errorLabel="Could not load question history" emptyMessage="No closed questions yet.">
          {history.items.map(request => <Question key={request.id} request={request} onNotice={onNotice} />)}
        </WorkPages>
      </WorkHistory>
    </section>
  );
}

interface QuestionsQueueProps { orgId: string; }

/** The organization's open questions across every project, fifty per page. */
export function QuestionsQueue({ orgId }: QuestionsQueueProps) {
  const [notice, onNotice] = useWorkNotice(orgId);
  const pending = useWorkPages(['inputRequests', 'org', orgId, 'open'], async cursor => {
    const response = await taskClient.listInputRequests({ orgId, status: 'open', page: { limit: 50, cursor } });
    return { items: response.inputRequests, page: response.page };
  }, !!orgId, 15_000);
  return <div className="flex flex-col gap-2">
    <WorkNotice message={notice} />
    <WorkPages query={pending} kind="pending" listLabel="Open questions" loadingMessage="Loading questions…"
      errorLabel="Could not load questions" emptyMessage="No agent is waiting on a person.">
      {pending.items.map(request => <Question key={request.id} request={request} onNotice={onNotice} showTask />)}
    </WorkPages>
  </div>;
}
