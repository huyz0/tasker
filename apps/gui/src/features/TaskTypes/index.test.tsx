import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskTypesEditor } from './index';

const mockListTypes = vi.fn();
const mockGetType = vi.fn();
const mockCreateType = vi.fn();
const mockUpdateType = vi.fn();
const mockCreateStatus = vi.fn();
const mockReorder = vi.fn();
const mockCreateTransition = vi.fn();
const mockDeleteTransition = vi.fn();
const mockListTemplates = vi.fn();
const mockUpdateTemplate = vi.fn();

vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  TaskTypeService: 'TaskTypeService',
  ProjectTemplateService: 'ProjectTemplateService',
}));
vi.mock('@connectrpc/connect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@connectrpc/connect')>()),
  createClient: (service: unknown) =>
    service === 'ProjectTemplateService'
      ? { listTemplates: (...a: unknown[]) => mockListTemplates(...a), updateTemplate: (...a: unknown[]) => mockUpdateTemplate(...a) }
      : {
          listTaskTypes: (...a: unknown[]) => mockListTypes(...a),
          getTaskType: (...a: unknown[]) => mockGetType(...a),
          createTaskType: (...a: unknown[]) => mockCreateType(...a),
          updateTaskType: (...a: unknown[]) => mockUpdateType(...a),
          createTaskStatus: (...a: unknown[]) => mockCreateStatus(...a),
          reorderTaskStatuses: (...a: unknown[]) => mockReorder(...a),
          createTaskStatusTransition: (...a: unknown[]) => mockCreateTransition(...a),
          deleteTaskStatusTransition: (...a: unknown[]) => mockDeleteTransition(...a),
        },
}));
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({ activeOrgId: 'org-1', setActivePageTitle: vi.fn() })),
}));

const renderEditor = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TaskTypesEditor />
    </QueryClientProvider>,
  );
};

const statuses = [
  { id: 'st-1', taskTypeId: 'tt-1', name: 'todo', position: 0 },
  { id: 'st-2', taskTypeId: 'tt-1', name: 'in progress', position: 1 },
  { id: 'st-3', taskTypeId: 'tt-1', name: 'done', position: 2 },
];

const openBug = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Bug' }));
  return screen.findByText('Statuses');
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListTypes.mockResolvedValue({ taskTypes: [{ id: 'tt-1', name: 'Bug' }] });
  mockGetType.mockResolvedValue({ taskType: { id: 'tt-1', name: 'Bug' }, statuses, transitions: [] });
  mockListTemplates.mockResolvedValue({ templates: [{ id: 'tpl-1', name: 'Default Template', rootTaskTypeId: '' }] });
  mockCreateType.mockResolvedValue({ taskType: { id: 'tt-2', name: 'Story' } });
  mockUpdateType.mockResolvedValue({ taskType: { id: 'tt-1', name: 'Defect' } });
  mockCreateStatus.mockResolvedValue({ status: { id: 'st-9' } });
  mockReorder.mockResolvedValue({ statuses });
  mockCreateTransition.mockResolvedValue({ transition: { id: 'tr-1' } });
  mockDeleteTransition.mockResolvedValue({ success: true });
  mockUpdateTemplate.mockResolvedValue({ template: {} });
});

describe('TaskTypesEditor', () => {
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
    mockGetType.mockResolvedValue({ taskType: { id: 'tt-1', name: 'Bug' }, statuses: [], transitions: [] });
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
    renderEditor();
    await openBug();

    fireEvent.click(screen.getByText('Rename'));
    const nameInput = screen.getByLabelText('Task type name');
    fireEvent.change(nameInput, { target: { value: 'Defect' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(mockUpdateType).toHaveBeenCalledWith({ id: 'tt-1', name: 'Defect' }));
  });

  it('cancels a rename without saving', async () => {
    renderEditor();
    await openBug();

    fireEvent.click(screen.getByText('Rename'));
    fireEvent.change(screen.getByLabelText('Task type name'), { target: { value: 'Something Else' } });
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.getByRole('heading', { name: 'Bug' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Task type name')).toBeNull();
    expect(mockUpdateType).not.toHaveBeenCalled();
  });

  it('shows an error message when renaming fails', async () => {
    mockUpdateType.mockRejectedValue(new Error('name already exists'));
    renderEditor();
    await openBug();

    fireEvent.click(screen.getByText('Rename'));
    fireEvent.change(screen.getByLabelText('Task type name'), { target: { value: 'Defect' } });
    fireEvent.click(screen.getByText('Save'));

    expect(await screen.findByText(/Failed to rename/)).toBeInTheDocument();
  });

  it('closing and reopening a different type does not leave the rename form open', async () => {
    mockListTypes.mockResolvedValue({ taskTypes: [{ id: 'tt-1', name: 'Bug' }, { id: 'tt-2', name: 'Story' }] });
    mockGetType.mockImplementation(async ({ id }: { id: string }) =>
      id === 'tt-1'
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
    renderEditor();
    await openBug();
    fireEvent.click(await screen.findByLabelText('Move done up'));
    await waitFor(() => expect(mockReorder).toHaveBeenCalledWith({
      taskTypeId: 'tt-1',
      statusIds: ['st-1', 'st-3', 'st-2'],
    }));
  });

  it('sends the whole new order when a status moves down', async () => {
    renderEditor();
    await openBug();
    fireEvent.click(await screen.findByLabelText('Move todo down'));
    // Down is not up with a sign flipped in the test: the swap is written once
    // and gets the pair wrong in exactly one direction if it is wrong at all.
    await waitFor(() => expect(mockReorder).toHaveBeenCalledWith({
      taskTypeId: 'tt-1',
      statusIds: ['st-2', 'st-1', 'st-3'],
    }));
  });

  it('falls back to the id for a transition naming a status it cannot see', async () => {
    mockGetType.mockResolvedValue({
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
    renderEditor();
    await openBug();
    fireEvent.change(screen.getByLabelText('New status name'), { target: { value: 'blocked' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add status' }));
    await waitFor(() => expect(mockCreateStatus).toHaveBeenCalledWith({ taskTypeId: 'tt-1', name: 'blocked' }));
  });

  it('will not add a blank status', async () => {
    renderEditor();
    await openBug();
    fireEvent.change(screen.getByLabelText('New status name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add status' }));
    expect(mockCreateStatus).not.toHaveBeenCalled();
  });

  it('defines a transition between two statuses', async () => {
    renderEditor();
    await openBug();
    fireEvent.change(await screen.findByLabelText('From status'), { target: { value: 'st-1' } });
    fireEvent.change(screen.getByLabelText('To status'), { target: { value: 'st-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await waitFor(() => expect(mockCreateTransition).toHaveBeenCalledWith({
      taskTypeId: 'tt-1', fromStatusId: 'st-1', toStatusId: 'st-2',
    }));
  });

  it('will not offer a transition form with only one status', async () => {
    mockGetType.mockResolvedValue({ taskType: { id: 'tt-1', name: 'Bug' }, statuses: [statuses[0]], transitions: [] });
    renderEditor();
    await openBug();
    expect(await screen.findByText('A transition needs two statuses.')).toBeInTheDocument();
    expect(screen.queryByLabelText('From status')).toBeNull();
  });

  it('names the transition by status, not by id, and removes it with its type', async () => {
    mockGetType.mockResolvedValue({
      taskType: { id: 'tt-1', name: 'Bug' },
      statuses,
      transitions: [{ id: 'tr-1', taskTypeId: 'tt-1', fromStatusId: 'st-1', toStatusId: 'st-2' }],
    });
    renderEditor();
    await openBug();
    expect(await screen.findByText('todo → in progress')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Remove the transition from todo to in progress'));
    // The type travels with the id so the server can authorize the request even
    // when the edge is already gone.
    await waitFor(() => expect(mockDeleteTransition).toHaveBeenCalledWith({ transitionId: 'tr-1', taskTypeId: 'tt-1' }));
  });

  it('creates a task type and selects it', async () => {
    renderEditor();
    await screen.findByRole('button', { name: 'Bug' });
    fireEvent.change(screen.getByLabelText('New task type name'), { target: { value: 'Story' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add type' }));
    await waitFor(() => expect(mockCreateType).toHaveBeenCalledWith({ orgId: 'org-1', projectId: '', name: 'Story' }));
    // Landing on the new type is the point of creating one.
    await waitFor(() => expect(mockGetType).toHaveBeenCalledWith({ id: 'tt-2' }));
  });

  it('will not create a type with a blank name', async () => {
    renderEditor();
    await screen.findByRole('button', { name: 'Bug' });
    fireEvent.change(screen.getByLabelText('New task type name'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add type' }));
    expect(mockCreateType).not.toHaveBeenCalled();
  });

  it('ignores the placeholder option in the root-type select', async () => {
    renderEditor();
    await openBug();
    const select = await screen.findByLabelText('Template to set this as the root type of');
    fireEvent.change(select, { target: { value: '' } });
    // Choosing "Set as root type of…" is not a choice.
    expect(mockUpdateTemplate).not.toHaveBeenCalled();
  });

  it('sets the type as a template root', async () => {
    renderEditor();
    await openBug();
    fireEvent.change(await screen.findByLabelText('Template to set this as the root type of'), { target: { value: 'tpl-1' } });
    await waitFor(() => expect(mockUpdateTemplate).toHaveBeenCalledWith({ id: 'tpl-1', rootTaskTypeId: 'tt-1' }));
  });

  it('says which templates already use it as their root', async () => {
    mockListTemplates.mockResolvedValue({ templates: [{ id: 'tpl-1', name: 'Default Template', rootTaskTypeId: 'tt-1' }] });
    renderEditor();
    await openBug();
    expect(await screen.findByText('Root type of: Default Template')).toBeInTheDocument();
  });

  it('reports a failed reorder', async () => {
    mockReorder.mockRejectedValue(new Error('permission denied'));
    renderEditor();
    await openBug();
    fireEvent.click(await screen.findByLabelText('Move done up'));
    expect(await screen.findByText(/Failed to reorder: permission denied/)).toBeInTheDocument();
  });

  it('reports a failed status add', async () => {
    mockCreateStatus.mockRejectedValue(new Error('a status with this name already exists'));
    renderEditor();
    await openBug();
    fireEvent.change(screen.getByLabelText('New status name'), { target: { value: 'todo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add status' }));
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
  });

  it('reports a failed transition add', async () => {
    mockCreateTransition.mockRejectedValue(new Error('that edge already exists'));
    renderEditor();
    await openBug();
    fireEvent.change(screen.getByLabelText('From status'), { target: { value: 'st-1' } });
    fireEvent.change(screen.getByLabelText('To status'), { target: { value: 'st-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(await screen.findByText(/Failed to add transition/)).toBeInTheDocument();
  });

  it('reports a failed transition removal', async () => {
    mockGetType.mockResolvedValue({
      taskType: { id: 'tt-1', name: 'Bug' },
      statuses,
      transitions: [{ id: 'tr-1', taskTypeId: 'tt-1', fromStatusId: 'st-1', toStatusId: 'st-2' }],
    });
    mockDeleteTransition.mockRejectedValue(new Error('not found'));
    renderEditor();
    await openBug();
    fireEvent.click(screen.getByLabelText(/Remove the transition from/));
    expect(await screen.findByText(/Failed to remove transition/)).toBeInTheDocument();
  });

  it('reports a failed root-type change', async () => {
    mockUpdateTemplate.mockRejectedValue(new Error('template not found'));
    renderEditor();
    await openBug();
    fireEvent.change(screen.getByLabelText('Template to set this as the root type of'), { target: { value: 'tpl-1' } });
    expect(await screen.findByText(/Failed to set root type/)).toBeInTheDocument();
  });

  it('asks for a type before showing an editor', async () => {
    renderEditor();
    expect(await screen.findByText(/Choose a task type to configure/)).toBeInTheDocument();
  });

  it('says so when the organization has no task types', async () => {
    mockListTypes.mockResolvedValue({ taskTypes: [] });
    renderEditor();
    expect(await screen.findByText('No task types yet.')).toBeInTheDocument();
  });

  it('retries fetching the task type list after a failure', async () => {
    mockListTypes.mockRejectedValue(new Error('boom'));
    renderEditor();

    const tryAgain = await screen.findByText('Try again');
    mockListTypes.mockClear();
    fireEvent.click(tryAgain);

    await waitFor(() => expect(mockListTypes).toHaveBeenCalled());
  });

  it('retries fetching the selected type\'s detail after a failure', async () => {
    mockGetType.mockRejectedValue(new Error('boom'));
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'Bug' }));

    const tryAgain = await screen.findByText('Try again');
    mockGetType.mockClear();
    fireEvent.click(tryAgain);

    await waitFor(() => expect(mockGetType).toHaveBeenCalled());
  });
});
