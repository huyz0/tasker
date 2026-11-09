import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { http, HttpResponse } from 'msw';
import { BACKEND_URL } from '../../lib/backendUrl';
import { mockRpc, mockRpcError, server } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { TaskInputRequests, QuestionsQueue } from './InputRequests';
import { TaskApprovals, ApprovalsQueue } from './Approvals';

afterEach(() => { if (vi.isFakeTimers()) { vi.clearAllTimers(); vi.useRealTimers(); } });

const cases = [
  { kind: 'questions', method: 'ListInputRequests', field: 'inputRequests', status: 'open', closed: 'answered', limit: 20,
    Panel: TaskInputRequests, Queue: QuestionsQueue, region: 'Questions from agents', input: 'Your answer', mutation: 'AnswerInputRequest', action: 'Answer' },
  { kind: 'approvals', method: 'ListTransitionApprovals', field: 'approvals', status: 'pending', closed: 'rejected', limit: 10,
    Panel: TaskApprovals, Queue: ApprovalsQueue, region: 'Status changes awaiting approval', input: 'Reason (optional)', mutation: 'DecideTransitionApproval', action: 'Reject' },
] as const;
for (const c of cases) describe(`${c.kind} bounded pending/history`, () => {
  const row = (id: string, status: string = c.status) => ({ id, taskId: 'task-a', projectId: 'project-a', taskDisplayId: 'TASK-1', taskTitle: id,
    status, question: `Question ${id}`, options: [], askedByName: id, requestedByName: id, fromStatus: 'review', toStatus: 'done', createdAt: '2026-11-09T10:00:00Z',
    ...(status === c.closed ? { answer: 'Yes', answeredByName: 'Ada', decidedByName: 'Ada' } : {}),
  });
  const response = (rows: ReturnType<typeof row>[], nextCursor = '', totalCount = rows.length) => ({ [c.field]: rows, page: { nextCursor, totalCount } });

  it('loads old pending work separately from closed history with independent limits', async () => {
    const requests: any[] = [];
    mockRpc(TaskService, c.method, body => {
      requests.push(body);
      return body.status === c.status ? response([row('old-pending')]) : response(Array.from({ length: c.limit }, (_, i) => row(`past-${i}`, c.closed)), 'history-next', c.limit + 1);
    });
    renderScoped(<c.Panel taskId="task-a" />);
    const region = await screen.findByRole('region', { name: c.region });
    expect(await within(region).findByLabelText(c.input)).toBeInTheDocument();
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: 'task-a', status: c.status, page: { limit: c.limit } }),
      expect.objectContaining({ taskId: 'task-a', status: 'closed', page: { limit: c.limit } }),
    ]));
    expect(within(region).getByText('Showing 1 of 1 pending')).toBeInTheDocument();
    const disclosure = within(region).getByText(`History · ${c.limit + 1}`);
    expect(disclosure.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(disclosure);
    expect(within(region).getByText(`Showing ${c.limit} of ${c.limit + 1} closed`)).toBeInTheDocument();
  });

  it('retains earlier rows and typing on next-page failure, retries its cursor, and deduplicates history', async () => {
    let failed = false;
    const requests: any[] = [];
    mockRpc(TaskService, c.method, body => {
      requests.push(body);
      if (body.status === 'closed') return body.page?.cursor ? response([row('past', c.closed), row('past2', c.closed)], '', 2) : response([row('past', c.closed)], 'history-next', 2);
      if (!body.page?.cursor) return response([row('first')], 'pending-next', 2);
      if (!failed) { failed = true; throw new Error('next page unavailable'); }
      return response([row('last')], '', 2);
    });
    renderScoped(<c.Panel taskId="task-a" />);
    const region = await screen.findByRole('region', { name: c.region });
    fireEvent.change(await within(region).findByLabelText(c.input), { target: { value: 'retained answer' } });
    fireEvent.click(within(region).getByRole('button', { name: 'Load more pending' }));
    expect(await within(region).findByRole('alert')).toHaveTextContent(/Could not load/);
    expect(within(region).getByLabelText(c.input)).toHaveValue('retained answer');
    fireEvent.click(within(region).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(within(region).getAllByLabelText(c.input)).toHaveLength(2));
    expect(within(region).getAllByLabelText(c.input)[0]).toHaveValue('retained answer');
    expect(requests.filter(r => r.page?.cursor === 'pending-next')).toHaveLength(2);
    fireEvent.click(within(region).getByText('History · 2'));
    fireEvent.click(within(region).getByRole('button', { name: 'Load more history' }));
    await within(region).findByText('Showing 2 of 2 closed');
    const history = within(region).getByRole('list', { name: `Closed ${c.kind}` });
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);
  });

  it('preserves forms during a failed background refresh and retries the first page', async () => {
    let down = false;
    mockRpc(TaskService, c.method, body => {
      if (down && body.status === c.status) throw new Error('refresh unavailable');
      return response(body.status === c.status ? [row('first')] : []);
    });
    const { queryClient } = renderScoped(<c.Panel taskId="task-a" />);
    fireEvent.change(await screen.findByLabelText(c.input), { target: { value: 'still here' } });
    down = true;
    await queryClient.invalidateQueries({ queryKey: [c.kind === 'questions' ? 'inputRequests' : 'approvals'] });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load/);
    expect(screen.getByLabelText(c.input)).toHaveValue('still here');
    down = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByLabelText(c.input)).toHaveValue('still here');
  });

  it('reconciles a concurrent resolution without losing its explanation or stranding the next pending row', async () => {
    let resolved = false;
    mockRpc(TaskService, c.method, body => body.status === 'closed'
      ? response(resolved ? [row('first', c.closed)] : [])
      : response([row(resolved ? 'next' : 'first')], resolved ? '' : 'pending-next', resolved ? 1 : 2));
    mockRpcError(TaskService, c.mutation, 'failed_precondition', 'another person already decided');
    renderScoped(<c.Panel taskId="task-a" />);
    fireEvent.change(await screen.findByLabelText(c.input), { target: { value: 'my answer' } });
    resolved = true;
    fireEvent.click(screen.getByRole('button', { name: c.action }));
    expect(await screen.findByRole('alert')).toHaveTextContent('another person already decided');
    expect(screen.getByRole('alert')).not.toHaveTextContent('[failed_precondition]');
    await screen.findByText('Showing 1 of 1 pending');
    expect(screen.getByLabelText(c.input)).toHaveValue('');
    fireEvent.click(screen.getByText('History · 1'));
    expect(within(screen.getByRole('list', { name: `Closed ${c.kind}` })).getAllByRole('listitem')).toHaveLength(1);
  });

  it('disables cached actions after denied access until a fresh authorized response, preserving typing', async () => {
    const success = (body: any) => response(body.status === c.status ? [row('first')] : []);
    mockRpc(TaskService, c.method, success);
    const view = renderScoped(<c.Panel taskId="task-a" />);
    const { queryClient } = view;
    fireEvent.change(await screen.findByLabelText(c.input), { target: { value: 'retained privately' } });
    mockRpcError(TaskService, c.method, 'permission_denied', 'access removed');
    await queryClient.invalidateQueries({ queryKey: [c.kind === 'questions' ? 'inputRequests' : 'approvals'] });
    await waitFor(() => expect(screen.getByLabelText(c.input)).toBeDisabled());
    expect(screen.getByLabelText(c.input)).toHaveValue('retained privately');
    mockRpcError(TaskService, c.method, 'unavailable', 'verification offline');
    const group = screen.getByRole('group', { name: c.kind === 'questions' ? 'Open questions' : 'Pending approvals' });
    fireEvent.click(within(group).getByRole('button', { name: 'Try again' }));
    await within(group).findByText(/verification offline/);
    expect(screen.getByLabelText(c.input)).toBeDisabled();
    view.unmount();
    renderScoped(<c.Panel taskId="task-a" />, { queryClient });
    await waitFor(() => expect(screen.getByLabelText(c.input)).toBeDisabled());
    const remountedGroup = screen.getByRole('group', { name: c.kind === 'questions' ? 'Open questions' : 'Pending approvals' });
    await within(remountedGroup).findByText(/verification offline/);
    mockRpc(TaskService, c.method, success);
    fireEvent.click(within(remountedGroup).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByLabelText(c.input)).toBeEnabled());
    // Remounting discards this form's local answer, while access acceptance
    // must still come from the fresh response rather than the cached rows.
    expect(screen.getByLabelText(c.input)).toHaveValue('');
  });

  it('requires fresh access again after visiting another task and returning to unavailable cached rows', async () => {
    let mode = 'success';
    server.use(http.post(`${BACKEND_URL}/${TaskService.typeName}/${c.method}`, async ({ request }) => {
      const body = await request.json() as any;
      if (body.taskId === 'task-a' && mode !== 'success') return HttpResponse.json({ code: mode, message: mode }, { status: 400 });
      return HttpResponse.json(response(body.status === c.status ? [row(body.taskId)] : []));
    }));
    function Switchable() { const [task, setTask] = useState('task-a'); return <><button onClick={() => setTask(current => current === 'task-a' ? 'task-b' : 'task-a')}>Switch task</button><c.Panel taskId={task} /></>; }
    const { queryClient } = renderScoped(<Switchable />);
    await screen.findByLabelText(c.input);
    mode = 'permission_denied';
    await queryClient.invalidateQueries({ queryKey: [c.kind === 'questions' ? 'inputRequests' : 'approvals'] });
    await waitFor(() => expect(screen.getByLabelText(c.input)).toBeDisabled());
    mode = 'unavailable';
    const retry = () => within(screen.getByRole('group', { name: c.kind === 'questions' ? 'Open questions' : 'Pending approvals' })).getByRole('button', { name: 'Try again' });
    fireEvent.click(retry());
    await screen.findByText(/Could not load this task.*unavailable/);
    fireEvent.click(screen.getByRole('button', { name: 'Switch task' }));
    await waitFor(() => expect(screen.getByLabelText(c.input)).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Switch task' }));
    await waitFor(() => expect(screen.getByLabelText(c.input)).toBeDisabled());
    mode = 'success';
    fireEvent.click(retry());
    await waitFor(() => expect(screen.getByLabelText(c.input)).toBeEnabled());
  });

  it('ignores an old task mutation failure after the current task has its own error', async () => {
    mockRpc(TaskService, c.method, body => response(body.status === c.status ? [row(body.taskId)] : []));
    let release!: () => void, started = false;
    const held = new Promise<void>(resolve => { release = resolve; });
    server.use(http.post(`${BACKEND_URL}/${TaskService.typeName}/${c.mutation}`, async ({ request }) => {
      const body = await request.json() as any;
      if (body.id === 'task-a') { started = true; await held; }
      return HttpResponse.json({ code: 'failed_precondition', message: body.id === 'task-a' ? 'A late error' : 'B current error' }, { status: 400 });
    }));
    function Switchable() { const [task, setTask] = useState('task-a'); return <><button onClick={() => setTask('task-b')}>Switch task</button><c.Panel taskId={task} /></>; }
    const { queryClient } = renderScoped(<Switchable />);
    fireEvent.change(await screen.findByLabelText(c.input), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: c.action }));
    await waitFor(() => expect(started).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Switch task' }));
    fireEvent.change(await screen.findByLabelText(c.input), { target: { value: 'B' } });
    fireEvent.click(screen.getByRole('button', { name: c.action }));
    expect(await screen.findByRole('alert')).toHaveTextContent('B current error');
    release();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(screen.getByRole('alert')).toHaveTextContent('B current error');
  });

  it('refreshes organization work outside the selected project without another live frame', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    let resolved = false, calls = 0;
    mockRpc(TaskService, c.method, () => { calls++; return response(resolved ? [] : [row('other-project')]); });
    renderScoped(<c.Queue orgId="org-a" />);
    await screen.findByLabelText(c.input);
    expect(calls).toBe(1);
    resolved = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    await waitFor(() => expect(calls).toBe(2));
    await waitFor(() => expect(screen.queryByLabelText(c.input)).toBeNull());
  });

  it('reaches organization rows after fifty and resets pages when organization changes', async () => {
    const requests: any[] = [];
    mockRpc(TaskService, c.method, body => {
      requests.push(body);
      if (body.orgId === 'org-b') return response([row('B only')]);
      return body.page?.cursor ? response([row('oldest')], '', 51) : response(Array.from({ length: 50 }, (_, i) => row(`pending-${i}`)), 'org-next', 51);
    });
    function Switchable() { const [org, setOrg] = useState('org-a'); return <><button onClick={() => setOrg('org-b')}>Switch organization</button><c.Queue orgId={org} /></>; }
    renderScoped(<Switchable />);
    await screen.findByText('Showing 50 of 51 pending');
    fireEvent.click(screen.getByRole('button', { name: 'Load more pending' }));
    await screen.findByText('Showing 51 of 51 pending');
    expect(requests.at(-1)).toMatchObject({ orgId: 'org-a', status: c.status, page: { limit: 50, cursor: 'org-next' } });
    fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }));
    await screen.findByText('Showing 1 of 1 pending');
    expect(screen.queryByText('oldest')).toBeNull();
    expect(requests.at(-1)).toMatchObject({ orgId: 'org-b', page: { limit: 50 } });
  });
});
