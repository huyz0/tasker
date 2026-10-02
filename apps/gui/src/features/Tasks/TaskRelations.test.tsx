import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { TaskRelations } from './TaskRelations';

vi.mock('use-debounce', () => ({ useDebounce: (v: string) => [v] }));

const ref = (id: string, title: string, extra: object = {}) => ({ id, displayId: id.toUpperCase(), title, status: 'todo', projectId: 'p1', terminal: false, ...extra });
const none = { blockedBy: [], blocks: [], discovered: [], children: [] };

function render() {
  return renderScoped(<TaskRelations taskId="t-1" projectId="p1" />);
}

/** Records every write the panel makes. */
function recordWrites() {
  const writes: { method: string; body: any }[] = [];
  for (const method of ['AddTaskLink', 'RemoveTaskLink', 'UpdateTask']) {
    mockRpc(TaskService, method, (body) => { writes.push({ method, body }); return method === 'UpdateTask' ? { task: {} } : { success: true }; });
  }
  return writes;
}

describe('TaskRelations (M35)', () => {
  it('says so when the task is not linked to anything', async () => {
    mockRpc(TaskService, 'ListTaskLinks', none);
    render();
    expect(await screen.findByText('Not linked to other tasks.')).toBeInTheDocument();
  });

  it('lists every relation, links each to its task, and marks finished ones', async () => {
    mockRpc(TaskService, 'ListTaskLinks', {
      parent: ref('t-p', 'Epic'),
      blockedBy: [ref('t-b', 'Schema', { terminal: true })],
      blocks: [ref('t-d', 'Client')],
      children: [ref('t-c', 'Sub')],
      discoveredFrom: ref('t-o', 'Origin'),
      discovered: [ref('t-n', 'Found later')],
    });
    render();
    for (const [heading, title] of [['Parent', 'Epic'], ['Blocked by', 'Schema'], ['Blocks', 'Client'], ['Subtasks', 'Sub'], ['Discovered from', 'Origin'], ['Discovered here', 'Found later']]) {
      expect(await screen.findByText(heading)).toBeInTheDocument();
      expect(screen.getByText(title).closest('a')).toHaveAttribute('href', expect.stringContaining('/tasks/'));
    }
    expect(screen.getByText('Schema').closest('a')).toHaveClass('line-through');
    // A task with a parent is not offered a second one.
    expect(screen.queryByRole('button', { name: 'Set parent…' })).toBeNull();
  });

  it('adds a blocker found by searching the project, never offering itself or a current blocker', async () => {
    mockRpc(TaskService, 'ListTaskLinks', { ...none, blockedBy: [ref('t-b', 'Already blocking')] });
    const searches: any[] = [];
    mockRpc(TaskService, 'ListTasks', (body) => {
      searches.push(body);
      return { tasks: [ref('t-1', 'Myself'), ref('t-b', 'Already blocking'), ref('t-x', 'Candidate')], page: {} };
    });
    const writes = recordWrites();
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Add blocker…' }));
    fireEvent.change(screen.getByLabelText('Blocked by which task?'), { target: { value: 'Cand' } });
    const candidate = await screen.findByRole('button', { name: /Candidate/ });
    expect(screen.queryByRole('button', { name: /Myself/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /T-B Already blocking/ })).toBeNull();
    expect(searches[0]).toMatchObject({ projectId: 'p1', page: { filter: 'Cand', limit: 10 } });
    fireEvent.click(candidate);
    await waitFor(() => expect(writes).toContainEqual({ method: 'AddTaskLink', body: { taskId: 't-1', linkedTaskId: 't-x', kind: 'blocked_by' } }));
  });

  it('removes a blocker and sets and clears the parent', async () => {
    mockRpc(TaskService, 'ListTaskLinks', { ...none, blockedBy: [ref('t-b', 'Schema')] });
    mockRpc(TaskService, 'ListTasks', { tasks: [ref('t-e', 'Epic')], page: {} });
    const writes = recordWrites();
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove blocker T-B' }));
    await waitFor(() => expect(writes).toContainEqual({ method: 'RemoveTaskLink', body: { taskId: 't-1', linkedTaskId: 't-b', kind: 'blocked_by' } }));

    fireEvent.click(screen.getByRole('button', { name: 'Set parent…' }));
    fireEvent.change(screen.getByLabelText('Parent task'), { target: { value: 'Ep' } });
    fireEvent.click(await screen.findByRole('button', { name: /Epic/ }));
    await waitFor(() => expect(writes).toContainEqual({ method: 'UpdateTask', body: { taskId: 't-1', parentTaskId: 't-e' } }));
  });

  it('clears the parent', async () => {
    mockRpc(TaskService, 'ListTaskLinks', { ...none, parent: ref('t-p', 'Epic') });
    const writes = recordWrites();
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove parent' }));
    await waitFor(() => expect(writes).toContainEqual({ method: 'UpdateTask', body: { taskId: 't-1', parentTaskId: '' } }));
  });

  it('reports a refused link, and cancelling the picker closes it', async () => {
    mockRpc(TaskService, 'ListTaskLinks', none);
    mockRpc(TaskService, 'ListTasks', { tasks: [ref('t-x', 'Loop')], page: {} });
    mockRpcError(TaskService, 'AddTaskLink', 'invalid_argument', 'that link would make the tasks block each other');
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Add blocker…' }));
    expect(screen.getByText('Type to search.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Blocked by which task?'), { target: { value: 'Lo' } });
    fireEvent.click(await screen.findByRole('button', { name: /Loop/ }));
    expect(await screen.findByText(/block each other/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Blocked by which task?')).toBeNull();
  });

  it('says when nothing matches', async () => {
    mockRpc(TaskService, 'ListTaskLinks', none);
    mockRpc(TaskService, 'ListTasks', { tasks: [ref('t-1', 'Myself')], page: {} });
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Add blocker…' }));
    fireEvent.change(screen.getByLabelText('Blocked by which task?'), { target: { value: 'My' } });
    expect(await screen.findByText('No other task matches that.')).toBeInTheDocument();
  });

  it('shows a failed load with a way to retry', async () => {
    mockRpcError(TaskService, 'ListTaskLinks', 'unavailable', 'down');
    render();
    expect(await screen.findByText(/Could not load relations/)).toBeInTheDocument();
    mockRpc(TaskService, 'ListTaskLinks', none);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Not linked to other tasks.')).toBeInTheDocument();
  });
});
