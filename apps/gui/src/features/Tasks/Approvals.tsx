import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { actionErrorMessage } from '../../lib/actionErrorMessage';
import { TaskService, type TransitionApproval } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { WorkPages, WorkHistory, WorkNotice, useWorkPages, useWorkNotice } from './WorkPages';
import { TONE_CLASSES } from '../../components/ui/statusStyles';
import { formatDateTime } from '../../lib/format';
import { useScopedTo } from '../../hooks/useScope';

const taskClient = createClient(TaskService, transport);

const OUTCOME: Record<string, string> = {
  approved: 'approved',
  rejected: 'rejected',
  stale: 'closed as stale - the task moved before anyone decided',
};

interface DecideProps {
  approval: TransitionApproval;
  onNotice: (message: string) => void;
}

/** Approve or reject one held move. Rejecting takes an optional reason the agent is told. */
function Decide({ approval, onNotice }: DecideProps) {
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();
  const decide = useMutation({
    mutationFn: async (approve: boolean) => taskClient.decideTransitionApproval({ id: approval.id, approve, reason: reason.trim() || undefined }),
    onMutate: () => onNotice(''),
    onError: (error) => onNotice(`Could not decide: ${actionErrorMessage(error)}`),
    onSettled: () => {
      // Approving moves the task; a stale refusal means the list is out of date. Either way, refetch.
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['task'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const fieldId = `reason-${approval.id}`;
  return (
    <div className="flex flex-col gap-2">
      <label className="sr-only" htmlFor={fieldId}>Reason (optional)</label>
      <input
        id={fieldId}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={decide.isPending}
          onClick={() => decide.mutate(true)}
          className="px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-md text-xs font-medium"
        >
          Approve move
        </button>
        <button
          type="button"
          disabled={decide.isPending}
          onClick={() => decide.mutate(false)}
          className="px-3 py-1 border bg-background hover:bg-muted disabled:text-muted-foreground rounded-md text-xs font-medium"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

interface ApprovalItemProps {
  approval: TransitionApproval;
  /** Show which task it is on - for the org-wide queue, not a task's own panel. */
  showTask?: boolean;
  onNotice: (message: string) => void;
}

function ApprovalItem({ approval, showTask, onNotice }: ApprovalItemProps) {
  const scopedTo = useScopedTo();
  const pending = approval.status === 'pending';
  return (
    <li className={`min-w-0 rounded-md p-3 flex flex-col gap-2 text-sm [overflow-wrap:anywhere] ${pending ? TONE_CLASSES.warning : 'border'}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
        <span className="font-medium">{approval.requestedByName}</span>
        <span>asks to move{showTask ? '' : ' this task'}</span>
        {showTask && (
          <Link to={scopedTo(`/tasks/${approval.taskId}`)} className="underline">
            {approval.taskDisplayId} — {approval.taskTitle}
          </Link>
        )}
        <span className="opacity-80">{formatDateTime(approval.createdAt)}</span>
      </div>
      <p>
        from <span className="font-medium">{approval.fromStatus}</span> to <span className="font-medium">{approval.toStatus}</span>
      </p>
      {pending ? (
        <Decide approval={approval} onNotice={onNotice} />
      ) : (
        <p className="text-xs">
          {approval.decidedByName ? <span className="font-medium">{approval.decidedByName} </span> : null}
          {OUTCOME[approval.status] ?? approval.status}
          {approval.reason ? `: ${approval.reason}` : ''}
        </p>
      )}
    </li>
  );
}

interface TaskApprovalsProps {
  taskId: string;
}

/** A pending move is never hidden behind a newer page of decisions. */
export function TaskApprovals({ taskId }: TaskApprovalsProps) {
  const [notice, onNotice] = useWorkNotice(taskId);
  const pending = useWorkPages(['approvals', 'task', taskId, 'pending'], async cursor => {
    const response = await taskClient.listTransitionApprovals({ taskId, status: 'pending', page: { limit: 10, cursor } });
    return { items: response.approvals, page: response.page };
  });
  const history = useWorkPages(['approvals', 'task', taskId, 'closed'], async cursor => {
    const response = await taskClient.listTransitionApprovals({ taskId, status: 'closed', page: { limit: 10, cursor } });
    return { items: response.approvals, page: response.page };
  });
  if (pending.isSuccess && history.isSuccess && !pending.items.length && !history.items.length && !notice) return null;
  return (
    <section aria-label="Status changes awaiting approval" className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold tracking-tight">{pending.totalCount > 0 ? `Awaiting your approval · ${pending.totalCount}` : 'Approvals'}</h3>
      <WorkNotice message={notice} />
      <WorkPages query={pending} kind="pending" listLabel="Pending approvals" loadingMessage="Loading approvals…"
        errorLabel="Could not load this task's approvals" emptyMessage="No status change is waiting for approval.">
        {pending.items.map(approval => <ApprovalItem key={approval.id} approval={approval} onNotice={onNotice} />)}
      </WorkPages>
      <WorkHistory key={taskId} query={history}>
        <WorkPages query={history} kind="closed" listLabel="Closed approvals" loadingMessage="Loading approval history…"
          errorLabel="Could not load approval history" emptyMessage="No closed approvals yet.">
          {history.items.map(approval => <ApprovalItem key={approval.id} approval={approval} onNotice={onNotice} />)}
        </WorkPages>
      </WorkHistory>
    </section>
  );
}

interface ApprovalsQueueProps { orgId: string; }

/** The organization's pending approvals across every project, fifty per page. */
export function ApprovalsQueue({ orgId }: ApprovalsQueueProps) {
  const [notice, onNotice] = useWorkNotice(orgId);
  const pending = useWorkPages(['approvals', 'org', orgId, 'pending'], async cursor => {
    const response = await taskClient.listTransitionApprovals({ orgId, status: 'pending', page: { limit: 50, cursor } });
    return { items: response.approvals, page: response.page };
  }, !!orgId, 15_000);
  return <div className="flex flex-col gap-2">
    <WorkNotice message={notice} />
    <WorkPages query={pending} kind="pending" listLabel="Pending approvals" loadingMessage="Loading approvals…"
      errorLabel="Could not load approvals" emptyMessage="No status change is waiting for approval.">
      {pending.items.map(approval => <ApprovalItem key={approval.id} approval={approval} onNotice={onNotice} showTask />)}
    </WorkPages>
  </div>;
}
