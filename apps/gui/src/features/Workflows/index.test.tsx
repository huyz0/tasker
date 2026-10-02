import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { WorkflowService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { WorkflowsScreen } from './index';

let mockActiveOrgId = 'org-1';
let mockActiveProjectId: string | null = 'proj-1';
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    get activeOrgId() { return mockActiveOrgId; },
    get activeProjectId() { return mockActiveProjectId; },
    setActivePageTitle: vi.fn(),
  })),
}));

const release = {
  id: 'w1', orgId: 'org-1', name: 'Release', description: 'Cut it', createdAt: '', updatedAt: '',
  steps: [
    { key: 'build', title: 'Build', priority: 2, description: '', dependsOn: [] },
    { key: 'ship', title: 'Ship', priority: 0, description: '', dependsOn: ['build'] },
  ],
};

const renderScreen = (initialEntry = '/workflows') =>
  renderScoped(<WorkflowsScreen />, { paths: ['/workflows', '/workflows/:templateId', '/tasks/:taskId'], initialEntry });

describe('WorkflowsScreen (M42)', () => {
  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    mockActiveProjectId = 'proj-1';
    mockRpc(WorkflowService, 'ListWorkflowTemplates', { templates: [release], page: {} });
    mockRpc(WorkflowService, 'GetWorkflowTemplate', { template: release });
  });

  it('asks for an organization first', () => {
    mockActiveOrgId = '';
    renderScreen();
    expect(screen.getByText('Select an organization to see its workflows.')).toBeInTheDocument();
  });

  it('lists templates and shows one with its steps in order', async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /Release/ }));
    const steps = await screen.findByRole('list', { name: 'Workflow steps' });
    expect(within(steps).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1.BuildHigh', '2.Shipafter Build']);
  });

  it('starts a workflow in the active project and links to it', async () => {
    const requests: any[] = [];
    mockRpc(WorkflowService, 'InstantiateWorkflow', (body) => {
      requests.push(body);
      return { parent: { id: 't0', displayId: 'P-1', title: 'Release 4.2' }, steps: [{ id: 't1' }, { id: 't2' }] };
    });
    renderScreen('/workflows/w1');
    fireEvent.change(await screen.findByLabelText('Title for this run'), { target: { value: 'Release 4.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));
    expect(await screen.findByRole('link', { name: 'P-1 — Release 4.2' })).toHaveAttribute('href', expect.stringContaining('/tasks/t0'));
    expect(screen.getByText(/with 2 steps/)).toBeInTheDocument();
    expect(requests).toEqual([{ templateId: 'w1', projectId: 'proj-1', title: 'Release 4.2' }]);
  });

  it('needs a project to start one, and reports a refused start', async () => {
    mockActiveProjectId = null;
    const { unmount } = renderScreen('/workflows/w1');
    expect(await screen.findByText('Select a project to start this workflow in it.')).toBeInTheDocument();
    unmount();
    mockActiveProjectId = 'proj-1';
    mockRpcError(WorkflowService, 'InstantiateWorkflow', 'failed_precondition', 'this workflow template belongs to another project');
    renderScreen('/workflows/w1');
    fireEvent.click(await screen.findByRole('button', { name: 'Start workflow' }));
    expect(await screen.findByText(/Could not start: .*another project/)).toBeInTheDocument();
  });

  it('creates a workflow and opens it', async () => {
    const requests: any[] = [];
    mockRpc(WorkflowService, 'CreateWorkflowTemplate', (body) => { requests.push(body); return { template: { ...release, id: 'w2', name: body.name } }; });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'New workflow' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Hotfix' } });
    fireEvent.change(screen.getByLabelText('Step 1 title'), { target: { value: 'Fix' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    // proto3 JSON leaves out empty and zero fields.
    expect(requests[0]).toEqual({ orgId: 'org-1', name: 'Hotfix', description: '', steps: [{ key: 'step-1', title: 'Fix' }] });
  });

  it('edits, deletes, and shows a refused save', async () => {
    const updates: any[] = [];
    mockRpc(WorkflowService, 'UpdateWorkflowTemplate', (body) => { updates.push(body); return { template: { ...release, name: body.name } }; });
    const deletes: any[] = [];
    mockRpc(WorkflowService, 'DeleteWorkflowTemplate', (body) => { deletes.push(body); return { success: true }; });
    renderScreen('/workflows/w1');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Release v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    await waitFor(() => expect(updates[0]).toMatchObject({ id: 'w1', name: 'Release v2', description: 'Cut it' }));
    expect(updates[0].steps[1]).toMatchObject({ key: 'ship', dependsOn: ['build'] });

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deletes).toEqual([{ id: 'w1' }]));
  });

  it('shows a refused save', async () => {
    mockRpcError(WorkflowService, 'UpdateWorkflowTemplate', 'invalid_argument', 'the steps "a", "b" depend on each other in a cycle');
    renderScreen('/workflows/w1');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    expect(await screen.findByText(/Could not save: .*cycle/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('list', { name: 'Workflow steps' })).toBeInTheDocument();
  });

  it('shows failed loads with a way to retry', async () => {
    mockRpcError(WorkflowService, 'ListWorkflowTemplates', 'unavailable', 'down');
    mockRpcError(WorkflowService, 'GetWorkflowTemplate', 'not_found', 'gone');
    renderScreen('/workflows/w1');
    expect((await screen.findAllByText(/down/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/gone/)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /retry|try again/i }).length).toBe(2);
  });

  it('says when there are none, cancels a new one, and retries a failed list', async () => {
    let calls = 0;
    mockRpc(WorkflowService, 'ListWorkflowTemplates', () => {
      calls++;
      if (calls === 1) throw new Error('down');
      return { templates: [], page: {} };
    });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /retry|try again/i }));
    expect(await screen.findByText('No workflows yet.')).toBeInTheDocument();
    expect(screen.getByText('Choose a workflow on the left, or create one.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New workflow' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Choose a workflow on the left, or create one.')).toBeInTheDocument();
  });

  it('retries a failed template, shows one with no description, and a one-step start', async () => {
    let calls = 0;
    mockRpc(WorkflowService, 'GetWorkflowTemplate', () => {
      calls++;
      if (calls === 1) throw new Error('flaky');
      return { template: { ...release, description: '', steps: [release.steps[1]!] } };
    });
    mockRpc(WorkflowService, 'InstantiateWorkflow', { parent: { id: 't0', displayId: 'P-1', title: 'Release' }, steps: [{ id: 't1' }] });
    renderScreen('/workflows/w1');
    fireEvent.click(await screen.findByRole('button', { name: /retry|try again/i }));
    expect(await screen.findByRole('list', { name: 'Workflow steps' })).toBeInTheDocument();
    expect(screen.queryByText('Cut it')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start workflow' }));
    expect(await screen.findByText(/with 1 step\./)).toBeInTheDocument();
  });

  it('reports a failed delete', async () => {
    mockRpcError(WorkflowService, 'DeleteWorkflowTemplate', 'permission_denied', 'viewers cannot delete');
    renderScreen('/workflows/w1');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/Could not delete: .*viewers cannot delete/)).toBeInTheDocument();
  });

  it('keeps a typed step\'s type on save, and shows starting', async () => {
    const typed = { ...release, steps: [{ ...release.steps[0]!, taskTypeId: 'tt1', status: 'queued' }] };
    mockRpc(WorkflowService, 'GetWorkflowTemplate', { template: typed });
    const updates: any[] = [];
    mockRpc(WorkflowService, 'UpdateWorkflowTemplate', (body) => { updates.push(body); return { template: typed }; });
    mockRpcPending(WorkflowService, 'InstantiateWorkflow');
    renderScreen('/workflows/w1');
    fireEvent.click(await screen.findByRole('button', { name: 'Start workflow' }));
    expect(await screen.findByRole('button', { name: 'Starting…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    await waitFor(() => expect(updates[0].steps[0]).toMatchObject({ taskTypeId: 'tt1', status: 'queued' }));
  });

  it('reports a refused create', async () => {
    mockRpcError(WorkflowService, 'CreateWorkflowTemplate', 'invalid_argument', 'step key "a" is used twice');
    renderScreen('/workflows/new');
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Step 1 title'), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));
    expect(await screen.findByText(/Could not save: .*used twice/)).toBeInTheDocument();
  });

  it('goes back to the list when the organization changes', async () => {
    const { rerender } = renderScreen('/workflows/w1');
    await screen.findByRole('list', { name: 'Workflow steps' });
    mockActiveOrgId = 'org-2';
    rerender(<WorkflowsScreen />);
    expect(await screen.findByText('Choose a workflow on the left, or create one.')).toBeInTheDocument();
  });
});
