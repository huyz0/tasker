import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { TaskService, type TransitionApproval } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { ListState } from '../../components/ui/ListState';
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
}

/** Approve or reject one held move. Rejecting takes an optional reason the agent is told. */
function Decide({ approval }: DecideProps) {
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();
  const decide = useMutation({
    mutationFn: async (approve: boolean) => taskClient.decideTransitionApproval({ id: approval.id, approve, reason: reason.trim() || undefined }),
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
      {decide.isError && <p className="text-xs text-destructive">Could not decide: {(decide.error as Error).message}</p>}
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
}

function ApprovalItem({ approval, showTask }: ApprovalItemProps) {
  const scopedTo = useScopedTo();
  const pending = approval.status === 'pending';
  return (
    <li className={`rounded-md p-3 flex flex-col gap-2 text-sm ${pending ? TONE_CLASSES.warning : 'border'}`}>
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
        <Decide approval={approval} />
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

/**
 * A task's held moves (M39, ADR-0032): pending first, each with approve and
 * reject, then the recent decisions. Renders nothing for a task no agent
 * asked to move across a gate.
 */
export function TaskApprovals({ taskId }: TaskApprovalsProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['approvals', 'task', taskId],
    queryFn: async () => (await taskClient.listTransitionApprovals({ taskId, status: 'all', page: { limit: 10 } })).approvals,
  });
  if (isLoading || error) {
    return (
      <ListState isLoading={isLoading} error={error} isEmpty={false} emptyMessage="" loadingMessage="Loading approvals…"
        errorLabel="Could not load this task's approvals" onRetry={() => refetch()} />
    );
  }
  const approvals = [...(data ?? [])].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
  if (approvals.length === 0) return null;
  const pendingCount = approvals.filter((a) => a.status === 'pending').length;
  return (
    <section aria-label="Status changes awaiting approval" className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold tracking-tight">
        {pendingCount > 0 ? `Awaiting your approval · ${pendingCount}` : 'Approvals'}
      </h3>
      <ul className="flex flex-col gap-2">
        {approvals.map((a) => <ApprovalItem key={a.id} approval={a} />)}
      </ul>
    </section>
  );
}

interface ApprovalsQueueProps {
  orgId: string;
}

/** The organization's pending approvals - moves agents are waiting on a person to allow. */
export function ApprovalsQueue({ orgId }: ApprovalsQueueProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['approvals', 'org', orgId],
    enabled: !!orgId,
    queryFn: async () => (await taskClient.listTransitionApprovals({ orgId, status: 'pending', page: { limit: 50 } })).approvals,
  });
  return (
    <ListState
      isLoading={isLoading}
      error={error}
      isEmpty={(data ?? []).length === 0}
      loadingMessage="Loading approvals…"
      errorLabel="Could not load approvals"
      emptyMessage="No status change is waiting for approval."
      onRetry={() => refetch()}
    >
      <ul className="flex flex-col gap-2" aria-label="Pending approvals">
        {(data ?? []).map((a) => <ApprovalItem key={a.id} approval={a} showTask />)}
      </ul>
    </ListState>
  );
}
