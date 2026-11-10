import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { AttentionService, CommentService, TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { http, HttpResponse } from 'msw';
import { BACKEND_URL } from '../../lib/backendUrl';
import { mockRpc, server } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { TaskInputRequests } from '../Tasks/InputRequests';
import { TaskApprovals } from '../Tasks/Approvals';
import { ReviewerPicker } from '../Tasks/ReviewerPicker';
import { AssigneePicker } from '../Tasks/AssigneePicker';
import { Comment } from '../../components/ui/comments';
import { AttentionScreen } from './AttentionScreen';

vi.mock('../../components/ui/LazyRichMarkdownEditor', () => ({ LazyRichMarkdownEditor: ({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) => <textarea aria-label={placeholder} value={value} onChange={event => onChange(event.target.value)} /> }));
const taskAPI = createClient(TaskService, transport);
function CurrentAssignment() {
  const read = useQuery({ queryKey: ['task', 'task-1'], queryFn: async () => (await taskAPI.getTask({ taskId: 'task-1' })).task });
  return <AssigneePicker taskId="task-1" orgId="org-1" assignees={read.data?.assignees ?? []} />;
}

const question = { id: 'source-1', taskId: 'task-1', taskDisplayId: 'TASK-1', taskTitle: 'Current task', projectId: 'project-1', question: 'Current source', options: [], status: 'open', createdAt: '2026-11-09T12:00:00Z' };
const approval = { id: 'source-1', taskId: 'task-1', taskDisplayId: 'TASK-1', taskTitle: 'Current task', projectId: 'project-1', fromStatus: 'working', toStatus: 'shipped', status: 'pending', requestedByAgentId: 'agent-1', requestedByName: 'Worker', createdAt: '2026-11-09T12:00:00Z' };
const source = (kind: string) => ({ kind, sourceId: 'source-1', taskId: 'task-1', taskDisplayId: 'TASK-1', taskTitle: 'Current task', taskStatus: 'working', projectId: 'project-1', projectName: 'Project One', reason: 'Current source', since: '2026-11-09T12:00:00Z', sinceKind: kind === 'review' ? 'task_created_at' : kind === 'approval' ? 'requested_at' : kind === 'stalled_claim' ? 'silent_since' : 'asked_at' });
function view(action: ReactNode, kind: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['authSession'], { authenticated: true, userId: 'user-1' });
  return renderScoped(<><AttentionScreen /><div data-testid="existing-task-controls">{action}</div></>, { initialEntry: `/attention?org=org-1&project=project-1&kind=${kind}`, queryClient: client });
}
beforeEach(() => server.use(http.post(`${BACKEND_URL}/api/client-errors`, () => HttpResponse.json({}))));

describe('existing contextual actions reconcile current Attention', () => {
  it.each(['success', 'conflict', 'write_denied'])('reconciles an answer %s without inventing read denial or losing the existing notice', async outcome => {
    let present = true, reads = 0;
    mockRpc(AttentionService, 'ListAttention', request => { if (request.kind === 'question') reads++; return { items: request.kind === 'question' && present ? [source('question')] : [], page: { totalCount: request.kind === 'question' && present ? 1 : 0 } }; });
    mockRpc(TaskService, 'ListInputRequests', request => ({ inputRequests: request.status === 'closed' ? [] : present ? [question] : [], page: { totalCount: request.status === 'closed' ? 0 : present ? 1 : 0 } }));
    server.use(http.post(`${BACKEND_URL}/${TaskService.typeName}/AnswerInputRequest`, () => {
      present = outcome === 'write_denied';
      return outcome === 'success' ? HttpResponse.json({ inputRequest: { ...question, status: 'answered', answer: 'Ship it' } })
        : HttpResponse.json({ code: outcome === 'conflict' ? 'failed_precondition' : 'permission_denied', message: outcome === 'conflict' ? 'Question already answered' : 'Write removed; read retained' }, { status: 400 });
    }));
    view(<TaskInputRequests taskId="task-1" />, 'question'); const attention = screen.getByRole('region', { name: 'Questions' });
    await within(attention).findByText('1 loaded of 1'); const controls = within(screen.getByTestId('existing-task-controls'));
    fireEvent.change(await controls.findByLabelText('Your answer'), { target: { value: 'Ship it' } }); fireEvent.click(controls.getByRole('button', { name: 'Answer' }));
    await waitFor(() => expect(reads).toBeGreaterThanOrEqual(2));
    if (outcome === 'write_denied') {
      expect(within(attention).getByText('1 loaded of 1')).toBeVisible(); expect(within(attention).getByText('Current source')).toBeVisible();
      expect(await controls.findByText(/Write removed; read retained/)).toBeVisible();
      expect(within(attention).queryByText(/Current access must be verified/)).not.toBeInTheDocument();
    } else {
      expect(await within(attention).findByText('0 loaded of 0')).toBeVisible();
      if (outcome === 'conflict') expect(await controls.findByText(/Question already answered/)).toBeVisible();
    }
  });

  it.each(['approved', 'stale'])('reconciles a move that is %s even when stale closure returns FailedPrecondition', async outcome => {
    let present = true, reads = 0;
    mockRpc(AttentionService, 'ListAttention', request => { if (request.kind === 'approval') reads++; return { items: request.kind === 'approval' && present ? [source('approval')] : [], page: { totalCount: request.kind === 'approval' && present ? 1 : 0 } }; });
    mockRpc(TaskService, 'ListTransitionApprovals', request => ({ approvals: request.status === 'closed' ? [] : present ? [approval] : [], page: { totalCount: request.status === 'closed' ? 0 : present ? 1 : 0 } }));
    server.use(http.post(`${BACKEND_URL}/${TaskService.typeName}/DecideTransitionApproval`, () => {
      present = false; return outcome === 'approved' ? HttpResponse.json({ approval: { ...approval, status: 'approved' } })
        : HttpResponse.json({ code: 'failed_precondition', message: 'The task moved; request closed as stale' }, { status: 400 });
    }));
    view(<TaskApprovals taskId="task-1" />, 'approval'); const attention = screen.getByRole('region', { name: 'Approvals' }); await within(attention).findByText('1 loaded of 1');
    const controls = within(screen.getByTestId('existing-task-controls')); fireEvent.click(await controls.findByRole('button', { name: 'Approve move' }));
    expect(await within(attention).findByText('0 loaded of 0')).toBeVisible(); expect(reads).toBeGreaterThanOrEqual(2);
    if (outcome === 'stale') expect(await controls.findByText(/request closed as stale/)).toBeVisible();
  });

  it('reconciles removal of review responsibility through the existing picker', async () => {
    let present = true;
    mockRpc(AttentionService, 'ListAttention', request => ({ items: request.kind === 'review' && present ? [source('review')] : [], page: { totalCount: request.kind === 'review' && present ? 1 : 0 } }));
    mockRpc(TaskService, 'ListTaskReviewers', () => ({ reviewers: present ? [{ id: 'source-1', taskId: 'task-1', userId: 'user-1', name: 'Alex' }] : [] }));
    mockRpc(TaskService, 'RemoveTaskReviewer', () => { present = false; return { success: true }; });
    view(<ReviewerPicker taskId="task-1" orgId="org-1" />, 'review'); const attention = screen.getByRole('region', { name: 'Your reviews' }); await within(attention).findByText('1 loaded of 1');
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Alex as a reviewer' })); expect(await within(attention).findByText('0 loaded of 0')).toBeVisible();
  });

  it('sends both recorded IDs for a combined hold and reconciles its existing exact-pair removal', async () => {
    let present = true; const requests: object[] = [];
    mockRpc(AttentionService, 'ListAttention', request => ({ items: request.kind === 'stalled_claim' && present ? [source('stalled_claim')] : [], page: { totalCount: request.kind === 'stalled_claim' && present ? 1 : 0 } }));
    mockRpc(TaskService, 'UnassignTask', request => { requests.push(request); if (request.agentId === 'agent-1' && request.userId === 'user-1') present = false; return { success: true }; });
    mockRpc(TaskService, 'GetTask', () => ({ orgId: 'org-1', task: { id: 'task-1', projectId: 'project-1', title: 'Current task', status: 'working', assignees: present ? [{ agentId: 'agent-1', userId: 'user-1', name: 'Combined holder' }] : [] } }));
    view(<CurrentAssignment />, 'stalled_claim');
    const attention = screen.getByRole('region', { name: 'Stalled claims' }); await within(attention).findByText('1 loaded of 1');
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Combined holder from this task' }));
    await waitFor(() => expect(requests).toEqual([{ taskId: 'task-1', agentId: 'agent-1', userId: 'user-1' }]));
    expect(await within(attention).findByText('0 loaded of 0')).toBeVisible();
  });
});

describe('qualifying human task activity reconciliation', () => {
  it.each(['task', 'artifact'])('keeps task-silence semantics after a new %s comment', async entityType => {
    let present = true, reads = 0;
    mockRpc(AttentionService, 'ListAttention', request => { if (request.kind === 'stalled_claim') reads++; return { items: request.kind === 'stalled_claim' && present ? [source('stalled_claim')] : [], page: { totalCount: request.kind === 'stalled_claim' && present ? 1 : 0 } }; });
    mockRpc(CommentService, 'ListComments', { comments: [] });
    mockRpc(CommentService, 'CreateComment', request => { if (request.entityType === 'task') present = false; return { comment: { id: 'comment-1', ...request, authorName: 'Alex', createdAt: '2026-11-10T01:00:00Z' } }; });
    view(<Comment.Provider entityId={entityType === 'task' ? 'task-1' : 'artifact-1'} entityType={entityType}><Comment.Composer /></Comment.Provider>, 'stalled_claim');
    const attention = screen.getByRole('region', { name: 'Stalled claims' }); await within(attention).findByText('1 loaded of 1');
    const input = screen.getByRole('textbox', { name: 'Add your comment…' }); fireEvent.change(input, { target: { value: 'Human task signal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post comment' })); await waitFor(() => expect(input).toHaveValue(''));
    if (entityType === 'task') expect(await within(attention).findByText('0 loaded of 0')).toBeVisible();
    else { expect(within(attention).getByText('1 loaded of 1')).toBeVisible(); expect(reads).toBe(1); }
  });
});
