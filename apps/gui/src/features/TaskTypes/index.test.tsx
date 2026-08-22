import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskTypeService, ProjectTemplateService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';
import { TaskTypesEditor } from './index';

let mockActiveOrgId = 'org-1';
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    get activeOrgId() { return mockActiveOrgId; },
    setActivePageTitle: vi.fn(),
  })),
}));

const statuses = [
  { id: 'st-1', taskTypeId: 'tt-1', name: 'todo', position: 0 },
  { id: 'st-2', taskTypeId: 'tt-1', name: 'in progress', position: 1 },
  { id: 'st-3', taskTypeId: 'tt-1', name: 'done', position: 2 },
];

const renderEditor = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TaskTypesEditor />
    </QueryClientProvider>,
  );
};

const openBug = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Bug' }));
  return screen.findByText('Statuses');
};

/** Registers ListTaskTypes and records every request it receives. */
function withListTypes(response: object = { taskTypes: [{ id: 'tt-1', name: 'Bug' }] }) {
  const requests: any[] = [];
  mockRpc(TaskTypeService, 'ListTaskTypes', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers GetTaskType and records every request it receives. */
function withGetType(response: object | ((body: any) => object) = { taskType: { id: 'tt-1', name: 'Bug' }, statuses, transitions: [] }) {
  const requests: any[] = [];
  mockRpc(TaskTypeService, 'GetTaskType', (body) => {
    requests.push(body);
    return typeof response === 'function' ? response(body) : response;
  });
  return requests;
}

/** Registers CreateTaskType and records every request it receives. */
function withCreateType(response: object = { taskType: { id: 'tt-2', name: 'Story' } }) {
  const requests: any[] = [];
  mockRpc(TaskTypeService, 'CreateTaskType', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers UpdateTaskType and records every request it receives. */
function withUpdateType(response: object = { taskType: { id: 'tt-1', name: 'Defect' } }) {
  const requests: any[] = [];
  mockRpc(TaskTypeService, 'UpdateTaskType', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers CreateTaskStatus and records every request it receives. */
function withCreateStatus(response: object = { status: { id: 'st-9' } }) {
  const requests: any[] = [];
  mockRpc(TaskTypeService, 'CreateTaskStatus', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers ReorderTaskStatuses and records every request it receives. */
function withReorder(response: object = { statuses }) {
  const requests: any[] = [];
  mockRpc(TaskTypeService, 'ReorderTaskStatuses', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers CreateTaskStatusTransition and records every request it receives. */
function withCreateTransition(response: object = { transition: { id: 'tr-1' } }) {
  const requests: any[] = [];
  mockRpc(TaskTypeService, 'CreateTaskStatusTransition', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers DeleteTaskStatusTransition and records every request it receives. */
function withDeleteTransition(response: object = { success: true }) {
  const requests: any[] = [];
  mockRpc(TaskTypeService, 'DeleteTaskStatusTransition', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers UpdateTemplate and records every request it receives. */
function withUpdateTemplate(response: object = { template: {} }) {
  const requests: any[] = [];
  mockRpc(ProjectTemplateService, 'UpdateTemplate', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

describe('TaskTypesEditor', () => {
  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    withListTypes();
    withGetType();
    mockRpc(ProjectTemplateService, 'ListTemplates', { templates: [{ id: 'tpl-1', name: 'Default Template', rootTaskTypeId: '' }] });
    withCreateType();
    withUpdateType();
    withCreateStatus();
    withReorder();
    withCreateTransition();
    withDeleteTransition();
    withUpdateTemplate();
  });

  it('lists the statuses in their configured order', async () => {
    renderEditor();
    await openBug();
    // Wait for the detail query, not just the heading — the heading renders
    // first and the list is empty until the statuses arrive.
    await screen.findByLabelText('Move done up');
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toContain('todo');
    expect(items[2]).toContain('done');
  });

  it('explains the fallback when a type has no statuses', async () => {
    withGetType({ taskType: { id: 'tt-1', name: 'Bug' }, statuses: [], transitions: [] });
    renderEditor();
    await openBug();
    // The fallback is real, invisible and surprising; an empty list hides it.
    expect(await screen.findByText(/fall back to todo \/ in progress \/ done/)).toBeInTheDocument();
  });

  it('says that no transitions means everything is allowed', async () => {
    renderEditor();
    await openBug();
    // A reader who assumes "no edges = nothing allowed" has it backwards.
    expect(await screen.findByText(/Every status change is allowed until the first transition/)).toBeInTheDocument();
  });

  // M14-T09: rename moved here from the Projects screen, which used to offer
  // it with no view of the statuses/transitions being renamed alongside it.
  it('renames the selected task type', async () => {
    const requests = withUpdateType();
    renderEditor();
    await openBug();

    fireEvent.click(screen.getByText('Rename'));
    const nameInput = screen.getByLabelText('Task type name');
    fireEvent.change(nameInput, { target: { value: 'Defect' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(requests).toContainEqual({ id: 'tt-1', name: 'Defect' }));
  });

  it('cancels a rename without saving', async () => {
    const requests = withUpdateType();
    renderEditor();
    await openBug();

    fireEvent.click(screen.getByText('Rename'));
    fireEvent.change(screen.getByLabelText('Task type name'), { target: { value: 'Something Else' } });
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.getByRole('heading', { name: 'Bug' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Task type name')).toBeNull();
    expect(requests).toHaveLength(0);
  });

  it('shows an error message when renaming fails', async () => {
    mockRpcError(TaskTypeService, 'UpdateTaskType', 'unknown', 'name already exists');
    renderEditor();
    await openBug();

    fireEvent.click(screen.getByText('Rename'));
    fireEvent.change(screen.getByLabelText('Task type name'), { target: { value: 'Defect' } });
    fireEvent.click(screen.getByText('Save'));

    expect(await screen.findByText(/Failed to rename/)).toBeInTheDocument();
  });

  it('closing and reopening a different type does not leave the rename form open', async () => {
    withListTypes({ taskTypes: [{ id: 'tt-1', name: 'Bug' }, { id: 'tt-2', name: 'Story' }] });
    withGetType((body: { id: string }) =>
      body.id === 'tt-1'
        ? { taskType: { id: 'tt-1', name: 'Bug' }, statuses, transitions: [] }
        : { taskType: { id: 'tt-2', name: 'Story' }, statuses: [], transitions: [] });
    renderEditor();
    await openBug();
    fireEvent.click(screen.getByText('Rename'));
    expect(screen.getByLabelText('Task type name')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Story' }));
    await screen.findByText('Story');
    expect(screen.queryByLabelText('Task type name')).toBeNull();
  });

  it('sends the whole new order when a status moves up', async () => {
    const requests = withReorder();
    renderEditor();
    await openBug();
    fireEvent.click(await screen.findByLabelText('Move done up'));
    await waitFor(() => expect(requests).toContainEqual({
      taskTypeId: 'tt-1',
      statusIds: ['st-1', 'st-3', 'st-2'],
    }));
  });

  it('sends the whole new order when a status moves down', async () => {
    const requests = withReorder();
    renderEditor();
    await openBug();
    fireEvent.click(await screen.findByLabelText('Move todo down'));
    // Down is not up with a sign flipped in the test: the swap is written once
    // and gets the pair wrong in exactly one direction if it is wrong at all.
    await waitFor(() => expect(requests).toContainEqual({
      taskTypeId: 'tt-1',
      statusIds: ['st-2', 'st-1', 'st-3'],
    }));
  });

  it('falls back to the id for a transition naming a status it cannot see', async () => {
    withGetType({
      taskType: { id: 'tt-1', name: 'Bug' },
      statuses,
      transitions: [{ id: 'tr-9', taskTypeId: 'tt-1', fromStatusId: 'st-1', toStatusId: 'st-gone' }],
    });
    renderEditor();
    await openBug();
    // Rendering nothing would make the edge look like it went nowhere.
    expect(await screen.findByText('todo → st-gone')).toBeInTheDocument();
  });

  it('does not offer to move the first status up or the last one down', async () => {
    renderEditor();
    await openBug();
    expect(await screen.findByLabelText('Move todo up')).toBeDisabled();
    expect(screen.getByLabelText('Move done down')).toBeDisabled();
    expect(screen.getByLabelText('Move todo down')).not.toBeDisabled();
  });

  it('adds a status', async () => {
    const requests = withCreateStatus();
    renderEditor();
    await openBug();
    fireEvent.change(screen.getByLabelText('New status name'), { target: { value: 'blocked' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add status' }));
    await waitFor(() => expect(requests).toContainEqual({ taskTypeId: 'tt-1', name: 'blocked' }));
  });

  it('will not add a blank status', async () => {
    const requests = withCreateStatus();
    renderEditor();
    await openBug();
    fireEvent.change(screen.getByLabelText('New status name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add status' }));
    expect(requests).toHaveLength(0);
  });

  it('defines a transition between two statuses', async () => {
    const requests = withCreateTransition();
    renderEditor();
    await openBug();
    fireEvent.change(await screen.findByLabelText('From status'), { target: { value: 'st-1' } });
    fireEvent.change(screen.getByLabelText('To status'), { target: { value: 'st-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await waitFor(() => expect(requests).toContainEqual({
      taskTypeId: 'tt-1', fromStatusId: 'st-1', toStatusId: 'st-2',
    }));
  });

  it('will not offer a transition form with only one status', async () => {
    withGetType({ taskType: { id: 'tt-1', name: 'Bug' }, statuses: [statuses[0]], transitions: [] });
    renderEditor();
    await openBug();
    expect(await screen.findByText('A transition needs two statuses.')).toBeInTheDocument();
    expect(screen.queryByLabelText('From status')).toBeNull();
  });

  it('names the transition by status, not by id, and removes it with its type', async () => {
    withGetType({
      taskType: { id: 'tt-1', name: 'Bug' },
      statuses,
      transitions: [{ id: 'tr-1', taskTypeId: 'tt-1', fromStatusId: 'st-1', toStatusId: 'st-2' }],
    });
    const requests = withDeleteTransition();
    renderEditor();
    await openBug();
    expect(await screen.findByText('todo → in progress')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Remove the transition from todo to in progress'));
    // The type travels with the id so the server can authorize the request even
    // when the edge is already gone.
    await waitFor(() => expect(requests).toContainEqual({ transitionId: 'tr-1', taskTypeId: 'tt-1' }));
  });

  it('creates a task type and selects it', async () => {
    const createRequests = withCreateType();
    const getRequests = withGetType();
    renderEditor();
    await screen.findByRole('button', { name: 'Bug' });
    fireEvent.change(screen.getByLabelText('New task type name'), { target: { value: 'Story' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add type' }));
    // An empty `projectId` is proto3's default for a string field, so the
    // real JSON codec omits it from the wire rather than sending ''.
    await waitFor(() => expect(createRequests).toContainEqual({ orgId: 'org-1', name: 'Story' }));
    // Landing on the new type is the point of creating one.
    await waitFor(() => expect(getRequests).toContainEqual({ id: 'tt-2' }));
  });

  it('will not create a type with a blank name', async () => {
    const requests = withCreateType();
    renderEditor();
    await screen.findByRole('button', { name: 'Bug' });
    fireEvent.change(screen.getByLabelText('New task type name'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add type' }));
    expect(requests).toHaveLength(0);
  });

  it('ignores the placeholder option in the root-type select', async () => {
    const requests = withUpdateTemplate();
    renderEditor();
    await openBug();
    const select = await screen.findByLabelText('Template to set this as the root type of');
    fireEvent.change(select, { target: { value: '' } });
    // Choosing "Set as root type of…" is not a choice.
    expect(requests).toHaveLength(0);
  });

  it('sets the type as a template root', async () => {
    const requests = withUpdateTemplate();
    renderEditor();
    await openBug();
    fireEvent.change(await screen.findByLabelText('Template to set this as the root type of'), { target: { value: 'tpl-1' } });
    await waitFor(() => expect(requests).toContainEqual({ id: 'tpl-1', rootTaskTypeId: 'tt-1' }));
  });

  it('says which templates already use it as their root', async () => {
    mockRpc(ProjectTemplateService, 'ListTemplates', { templates: [{ id: 'tpl-1', name: 'Default Template', rootTaskTypeId: 'tt-1' }] });
    renderEditor();
    await openBug();
    expect(await screen.findByText('Root type of: Default Template')).toBeInTheDocument();
  });

  it('reports a failed reorder', async () => {
    mockRpcError(TaskTypeService, 'ReorderTaskStatuses', 'permission_denied', 'permission denied');
    renderEditor();
    await openBug();
    fireEvent.click(await screen.findByLabelText('Move done up'));
    expect(await screen.findByText(/Failed to reorder:.*permission denied/)).toBeInTheDocument();
  });

  it('reports a failed status add', async () => {
    mockRpcError(TaskTypeService, 'CreateTaskStatus', 'unknown', 'a status with this name already exists');
    renderEditor();
    await openBug();
    fireEvent.change(screen.getByLabelText('New status name'), { target: { value: 'todo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add status' }));
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
  });

  it('reports a failed transition add', async () => {
    mockRpcError(TaskTypeService, 'CreateTaskStatusTransition', 'unknown', 'that edge already exists');
    renderEditor();
    await openBug();
    fireEvent.change(screen.getByLabelText('From status'), { target: { value: 'st-1' } });
    fireEvent.change(screen.getByLabelText('To status'), { target: { value: 'st-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(await screen.findByText(/Failed to add transition/)).toBeInTheDocument();
  });

  it('reports a failed transition removal', async () => {
    withGetType({
      taskType: { id: 'tt-1', name: 'Bug' },
      statuses,
      transitions: [{ id: 'tr-1', taskTypeId: 'tt-1', fromStatusId: 'st-1', toStatusId: 'st-2' }],
    });
    mockRpcError(TaskTypeService, 'DeleteTaskStatusTransition', 'unknown', 'not found');
    renderEditor();
    await openBug();
    fireEvent.click(screen.getByLabelText(/Remove the transition from/));
    expect(await screen.findByText(/Failed to remove transition/)).toBeInTheDocument();
  });

  it('reports a failed root-type change', async () => {
    mockRpcError(ProjectTemplateService, 'UpdateTemplate', 'unknown', 'template not found');
    renderEditor();
    await openBug();
    fireEvent.change(screen.getByLabelText('Template to set this as the root type of'), { target: { value: 'tpl-1' } });
    expect(await screen.findByText(/Failed to set root type/)).toBeInTheDocument();
  });

  it('asks for a type before showing an editor', async () => {
    renderEditor();
    expect(await screen.findByText(/Choose a task type on the left to configure/)).toBeInTheDocument();
  });

  it('says so when the organization has no task types', async () => {
    withListTypes({ taskTypes: [] });
    renderEditor();
    expect(await screen.findByText('No task types yet.')).toBeInTheDocument();
  });

  it('retries fetching the task type list after a failure', async () => {
    mockRpcError(TaskTypeService, 'ListTaskTypes', 'unavailable', 'boom');
    renderEditor();

    const tryAgain = await screen.findByText('Try again');
    withListTypes();
    fireEvent.click(tryAgain);

    await screen.findByRole('button', { name: 'Bug' });
  });

  it('retries fetching the selected type\'s detail after a failure', async () => {
    mockRpcError(TaskTypeService, 'GetTaskType', 'unavailable', 'boom');
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'Bug' }));

    const tryAgain = await screen.findByText('Try again');
    withGetType();
    fireEvent.click(tryAgain);

    await screen.findByText('Statuses');
  });

  // M19-T05: switching the active org left `selectedId` pointing at the
  // previous org's task type - `detail` (keyed only on selectedId) kept
  // querying it under the new org's identity even after the type *list*
  // itself had already repainted for the switch.
  it('deselects the open task type when the active org changes', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}><TaskTypesEditor /></QueryClientProvider>,
    );
    await openBug();

    mockActiveOrgId = 'org-2';
    withListTypes({ taskTypes: [{ id: 'tt-9', name: 'Feature' }] });
    rerender(<QueryClientProvider client={client}><TaskTypesEditor /></QueryClientProvider>);

    await screen.findByRole('button', { name: 'Feature' });
    expect(screen.queryByText('Statuses')).toBeNull();
    expect(screen.getByText('Choose a task type on the left to configure its statuses and transitions.')).toBeInTheDocument();
  });
});
