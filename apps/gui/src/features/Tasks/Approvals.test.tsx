import { describe, it, expect } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { TaskApprovals, ApprovalsQueue } from './Approvals';

const approval = (over: Record<string, unknown> = {}) => ({
  id: 'apr-1', taskId: 't-1', taskDisplayId: 'T-1', taskTitle: 'Release', projectId: 'p1', fromStatus: 'review', toStatus: 'done',
  status: 'pending', requestedByAgentId: 'a1', requestedByName: 'Shipper', createdAt: '2026-10-02T10:00:00Z', ...over,
});

describe('TaskApprovals (M39)', () => {
  it('renders nothing when no move is held', async () => {
    mockRpc(TaskService, 'ListTransitionApprovals', { approvals: [], page: {} });
    const { container } = renderScoped(<TaskApprovals taskId="t-1" />);
    await waitFor(() => expect(screen.queryByText(/Loading approvals/)).toBeNull());
    expect(container.querySelector('[aria-label="Status changes awaiting approval"]')).toBeNull();
  });

  it('puts pending moves first, approves one, and shows past decisions', async () => {
    const requests: any[] = [];
    mockRpc(TaskService, 'ListTransitionApprovals', (body) => {
      requests.push(body);
      return { approvals: [
        approval({ id: 'apr-0', status: 'rejected', decidedByName: 'Ada', reason: 'needs QA' }),
        approval(),
        approval({ id: 'apr-2', status: 'stale' }),
      ], page: {} };
    });
    const decisions: any[] = [];
    mockRpc(TaskService, 'DecideTransitionApproval', (body) => { decisions.push(body); return { approval: approval({ status: 'approved' }) }; });
    renderScoped(<TaskApprovals taskId="t-1" />);
    const section = await screen.findByRole('region', { name: 'Status changes awaiting approval' });
    expect(within(section).getByRole('heading')).toHaveTextContent('Awaiting your approval · 1');
    expect(requests[0]).toMatchObject({ taskId: 't-1', status: 'all' });
    const items = within(section).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Shipperasks to move this task');
    expect(items[0]).toHaveTextContent('from review to done');
    expect(section).toHaveTextContent('Ada rejected: needs QA');
    expect(section).toHaveTextContent('closed as stale');
    fireEvent.click(within(items[0]!).getByRole('button', { name: 'Approve move' }));
    await waitFor(() => expect(decisions).toEqual([{ id: 'apr-1', approve: true }]));
  });

  it('titles a task with only past decisions plainly, and shows an unknown outcome as given', async () => {
    mockRpc(TaskService, 'ListTransitionApprovals', { approvals: [approval({ status: 'approved', decidedByName: 'Ada' }), approval({ id: 'apr-9', status: 'withdrawn' })], page: {} });
    renderScoped(<TaskApprovals taskId="t-1" />);
    const section = await screen.findByRole('region', { name: 'Status changes awaiting approval' });
    expect(within(section).getByRole('heading')).toHaveTextContent('Approvals');
    expect(section).toHaveTextContent('Ada approved');
    expect(section).toHaveTextContent('withdrawn');
  });

  it('rejects with a reason, and reports a refused decision', async () => {
    mockRpc(TaskService, 'ListTransitionApprovals', { approvals: [approval()], page: {} });
    const decisions: any[] = [];
    mockRpc(TaskService, 'DecideTransitionApproval', (body) => { decisions.push(body); return { approval: approval({ status: 'rejected' }) }; });
    renderScoped(<TaskApprovals taskId="t-1" />);
    fireEvent.change(await screen.findByLabelText('Reason (optional)'), { target: { value: '  not yet  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(decisions).toEqual([{ id: 'apr-1', reason: 'not yet' }]));

    mockRpcError(TaskService, 'DecideTransitionApproval', 'failed_precondition', 'the task has moved since this was asked');
    fireEvent.click(screen.getByRole('button', { name: 'Approve move' }));
    expect(await screen.findByText(/Could not decide: .*moved since/)).toBeInTheDocument();
  });

  it('shows a failed load with a way to retry', async () => {
    let calls = 0;
    mockRpc(TaskService, 'ListTransitionApprovals', () => { calls++; if (calls === 1) throw new Error('down'); return { approvals: [], page: {} }; });
    renderScoped(<TaskApprovals taskId="t-1" />);
    expect(await screen.findByText(/Could not load this task's approvals/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    await waitFor(() => expect(calls).toBe(2));
  });
});

describe('ApprovalsQueue (M39)', () => {
  it("lists the organization's pending approvals, each linked to its task", async () => {
    const requests: any[] = [];
    mockRpc(TaskService, 'ListTransitionApprovals', (body) => { requests.push(body); return { approvals: [approval()], page: {} }; });
    renderScoped(<ApprovalsQueue orgId="org-1" />);
    const list = await screen.findByRole('list', { name: 'Pending approvals' });
    expect(within(list).getByRole('link', { name: 'T-1 — Release' })).toHaveAttribute('href', expect.stringContaining('/tasks/t-1'));
    expect(requests[0]).toMatchObject({ orgId: 'org-1', status: 'pending' });
  });

  it('says when nothing is waiting, after a retried failure', async () => {
    let calls = 0;
    mockRpc(TaskService, 'ListTransitionApprovals', () => { calls++; if (calls === 1) throw new Error('down'); return { approvals: [], page: {} }; });
    renderScoped(<ApprovalsQueue orgId="org-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /retry|try again/i }));
    expect(await screen.findByText('No status change is waiting for approval.')).toBeInTheDocument();
  });
});
