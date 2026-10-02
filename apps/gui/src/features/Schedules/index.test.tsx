import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ProjectService, ScheduleService, WorkflowService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { SchedulesScreen } from './index';

let mockActiveOrgId = 'org-1';
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    get activeOrgId() { return mockActiveOrgId; },
    activeProjectId: 'p1',
    setActivePageTitle: vi.fn(),
  })),
}));

const triage = {
  id: 's1', orgId: 'org-1', projectId: 'p1', name: 'Triage', cadence: 'weekly', weekdays: [1, 4], dayOfMonth: 1, hourUtc: 9,
  taskTitle: 'Triage the inbox', taskPriority: 2, skipIfOpen: true, active: true, nextRunAt: '2026-10-05T09:00:00Z', createdAt: '',
};

const renderScreen = (initialEntry = '/schedules') =>
  renderScoped(<SchedulesScreen />, { paths: ['/schedules', '/schedules/:scheduleId', '/tasks/:taskId'], initialEntry });

describe('SchedulesScreen (M43)', () => {
  beforeEach(() => {
    mockActiveOrgId = 'org-1';
    mockRpc(ScheduleService, 'ListSchedules', { schedules: [triage, { ...triage, id: 's2', name: 'Paused one', active: false }], page: {} });
    mockRpc(ScheduleService, 'GetSchedule', { schedule: triage });
    mockRpc(ScheduleService, 'ListScheduleRuns', { runs: [
      { id: 'r1', scheduleId: 's1', ranAt: '2026-10-01T09:00:00Z', outcome: 'created', trigger: 'schedule', taskId: 't1' },
      { id: 'r2', scheduleId: 's1', ranAt: '2026-10-02T09:00:00Z', outcome: 'skipped', trigger: 'manual', detail: 'the previous run\'s task P-1 is still open' },
    ], page: {} });
    mockRpc(ProjectService, 'ListProjects', { projects: [{ id: 'p1', name: 'Alpha' }], page: {} });
    mockRpc(WorkflowService, 'ListWorkflowTemplates', { templates: [{ id: 'w1', orgId: 'org-1', name: 'Report', steps: [] }], page: {} });
  });

  it('asks for an organization first', () => {
    mockActiveOrgId = '';
    renderScreen();
    expect(screen.getByText('Select an organization to see its schedules.')).toBeInTheDocument();
  });

  it('lists schedules with their cadence or paused, and shows one with its runs', async () => {
    renderScreen();
    expect(await screen.findByRole('button', { name: /^Triage\s*Every Mon, Thu at 09:00 UTC$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Paused one\s*Paused$/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Triage\s*Every/ }));
    expect(await screen.findByText('Every Mon, Thu at 09:00 UTC in Alpha')).toBeInTheDocument();
    expect(screen.getByText(/Creates a task "Triage the inbox", skipping while the last one is unfinished/)).toBeInTheDocument();
    const runs = await screen.findByRole('list', { name: 'Runs' });
    expect(within(runs).getAllByRole('listitem')[0]).toHaveTextContent(/^created.*on schedule/);
    expect(within(runs).getByRole('link', { name: 'open task' })).toHaveAttribute('href', expect.stringContaining('/tasks/t1'));
    expect(runs).toHaveTextContent('run by hand');
    expect(runs).toHaveTextContent("the previous run's task P-1 is still open");
  });

  it('runs now, pauses, and deletes', async () => {
    const runs: any[] = [];
    mockRpc(ScheduleService, 'RunSchedule', (body) => { runs.push(body); return { run: { id: 'r3', outcome: 'skipped', detail: 'still open', trigger: 'manual', ranAt: '' } }; });
    const updates: any[] = [];
    mockRpc(ScheduleService, 'UpdateSchedule', (body) => { updates.push(body); return { schedule: { ...triage, active: false } }; });
    const deletes: any[] = [];
    mockRpc(ScheduleService, 'DeleteSchedule', (body) => { deletes.push(body); return { success: true }; });
    renderScreen('/schedules/s1');
    fireEvent.click(await screen.findByRole('button', { name: 'Run now' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Ran now: skipped - still open.');
    expect(runs).toEqual([{ id: 's1' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(updates[0]).toMatchObject({ id: 's1', active: false, cadence: 'weekly', weekdays: [1, 4], taskTitle: 'Triage the inbox', taskPriority: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deletes).toEqual([{ id: 's1' }]));
  });

  it('creates a schedule and edits one', async () => {
    const created: any[] = [];
    mockRpc(ScheduleService, 'CreateSchedule', (body) => { created.push(body); return { schedule: { ...triage, id: 's9' } }; });
    const updates: any[] = [];
    mockRpc(ScheduleService, 'UpdateSchedule', (body) => { updates.push(body); return { schedule: triage }; });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'New schedule' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Report' } });
    fireEvent.click(screen.getByLabelText('A workflow'));
    fireEvent.change(await screen.findByLabelText('Workflow'), { target: { value: 'w1' } });
    fireEvent.change(screen.getByLabelText('Repeats'), { target: { value: 'monthly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(created[0]).toMatchObject({ projectId: 'p1', name: 'Report', cadence: 'monthly', dayOfMonth: 1, templateId: 'w1', skipIfOpen: true }));

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Project')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Triage v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(updates[0]).toMatchObject({ id: 's9', name: 'Triage v2', taskTitle: 'Triage the inbox' }));
  });

  it('shows refused actions and failed loads', async () => {
    mockRpcError(ScheduleService, 'RunSchedule', 'permission_denied', 'no');
    mockRpcError(ScheduleService, 'UpdateSchedule', 'invalid_argument', 'bad cadence');
    mockRpcError(ScheduleService, 'DeleteSchedule', 'permission_denied', 'nope');
    mockRpc(ScheduleService, 'GetSchedule', { schedule: { ...triage, active: false, templateId: 'w1', taskTitle: undefined, skipIfOpen: false } });
    renderScreen('/schedules/s1');
    expect(await screen.findByText('Paused', { selector: 'span.font-medium' })).toBeInTheDocument();
    expect(screen.getByText(/Creates the workflow "Report"\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    expect(await screen.findByText(/Could not run it: .*no/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(await screen.findByText(/Could not change it: .*bad cadence/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/Could not delete it: .*nope/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    expect(await screen.findByText(/Could not save: .*bad cadence/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'Run now' })).toBeInTheDocument();
  });

  it('retries failed reads, says when empty, and returns to the list on an org switch', async () => {
    let calls = 0;
    mockRpc(ScheduleService, 'ListSchedules', () => { calls++; if (calls === 1) throw new Error('down'); return { schedules: [], page: {} }; });
    let getCalls = 0;
    mockRpc(ScheduleService, 'GetSchedule', () => { getCalls++; if (getCalls === 1) throw new Error('flaky'); return { schedule: triage }; });
    let runCalls = 0;
    mockRpc(ScheduleService, 'ListScheduleRuns', () => { runCalls++; if (runCalls === 1) throw new Error('flaky'); return { runs: [], page: {} }; });
    const { rerender } = renderScreen('/schedules/s1');
    for (const b of await screen.findAllByRole('button', { name: /retry|try again/i })) fireEvent.click(b);
    expect(await screen.findByText('No schedules yet.')).toBeInTheDocument();
    for (const b of await screen.findAllByRole('button', { name: /retry|try again/i })) fireEvent.click(b);
    expect(await screen.findByText('It has not run yet.')).toBeInTheDocument();
    mockActiveOrgId = 'org-2';
    rerender();
    expect(await screen.findByText('Choose a schedule on the left, or create one.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New schedule' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Choose a schedule on the left, or create one.')).toBeInTheDocument();
  });
});
