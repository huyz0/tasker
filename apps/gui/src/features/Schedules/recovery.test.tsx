import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { ProjectService, ScheduleService, WorkflowService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { http, HttpResponse } from 'msw';
import { BACKEND_URL } from '../../lib/backendUrl';
import { mockRpc, server } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { SchedulesScreen } from './index';

let project = 'p1';
vi.mock('../../store/layout', () => ({ useLayoutStore: vi.fn((selector) => selector({
  activeOrgId: 'org-1', get activeProjectId() { return project; }, setActivePageTitle: vi.fn(),
})) }));
const schedule = { id: 's1', orgId: 'org-1', projectId: 'p1', name: 'Routine', cadence: 'daily',
  weekdays: [], dayOfMonth: 1, hourUtc: 9, taskTitle: 'Work', taskPriority: 0, skipIfOpen: true,
  active: true, nextRunAt: '2026-11-10T09:00:00Z', createdAt: '' };
const entry = '/schedules/s1?org=org-1&project=p1';
const renderScreen = () => renderScoped(<SchedulesScreen />, { paths: ['/schedules', '/schedules/:scheduleId'], initialEntry: entry });
const run = (outcome: string, extra: object = {}) => ({ id: `r-${outcome}`, scheduleId: 's1', outcome,
  trigger: 'schedule', ranAt: '2026-11-09T10:00:00Z', ...extra });

beforeEach(() => {
  project = 'p1';
  mockRpc(ScheduleService, 'ListSchedules', { schedules: [schedule, { ...schedule, id: 's2', name: 'Another' }], page: {} });
  mockRpc(ScheduleService, 'GetSchedule', { schedule });
  mockRpc(ScheduleService, 'ListScheduleRuns', { runs: [], page: {} });
  mockRpc(ProjectService, 'ListProjects', { projects: [{ id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'Beta' }], page: {} });
  mockRpc(WorkflowService, 'ListWorkflowTemplates', { templates: [], page: {} });
});
afterEach(() => { if (vi.isFakeTimers()) { vi.clearAllTimers(); vi.useRealTimers(); } });
const fakeIntervals = () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-11-09T10:00:00Z'));
};
const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(15_000); }); };

describe('schedule creation history and recovery (M47)', () => {
  it('uses creation/recovery labels, metadata and schedule-owned task links', async () => {
    mockRpc(ScheduleService, 'GetSchedule', { schedule: { ...schedule, projectId: 'p2' } });
    mockRpc(ScheduleService, 'ListScheduleRuns', { runs: [
      run('queued', { attempts: 0, dueAt: '2026-11-09T09:00:00Z' }),
      run('running', { attempts: 1, startedAt: '2026-11-09T10:00:00Z' }),
      run('interrupted', { attempts: 2, nextAttemptAt: '2026-11-09T10:00:05Z' }),
      run('created', { taskId: 'task-b', attempts: 1 }), run('skipped'), run('failed'), run('cancelled'),
    ], page: {} });
    renderScreen();
    expect(await screen.findByText('Waiting to create work')).toBeInTheDocument();
    expect(screen.getByText('Creating work')).toBeInTheDocument();
    expect(screen.getByText('Creation interrupted')).toBeInTheDocument();
    expect(screen.getByText(/Recovery eligible after/)).toBeInTheDocument();
    expect(screen.getByText(/Attempt 2/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open created task' })).toHaveAttribute('href', '/tasks/task-b?org=org-1&project=p2');
    expect(screen.getByText(/Pause stops future scheduled runs/)).toBeInTheDocument();
    expect(screen.getByText(/Delete stops new runs/)).toBeInTheDocument();
  });

  it('refreshes aligned running history after silent expiry without another event', async () => {
    fakeIntervals();
    let calls = 0;
    mockRpc(ScheduleService, 'ListScheduleRuns', () => {
      calls++;
      return { runs: [Date.now() < Date.parse('2026-11-09T10:00:01Z') ? run('running', { attempts: 1 })
        : run('interrupted', { attempts: 1, nextAttemptAt: '2026-11-09T10:00:01Z' })], page: {} };
    });
    renderScreen();
    await screen.findByRole('list', { name: 'Runs' });
    expect(calls).toBe(1);
    await tick();
    expect(await screen.findByText('Creation interrupted')).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  for (const initial of ['empty', 'terminal']) {
    it(`refreshes off-feed ${initial} history and detail, then stops when scope covers it`, async () => {
      fakeIntervals();
      let ready = false, historyReads = 0, detailReads = 0;
      mockRpc(ScheduleService, 'GetSchedule', () => { detailReads++; return { schedule: { ...schedule, projectId: 'p2',
        ...(ready ? { lastOutcome: 'created', lastTaskId: 'new-task', nextRunAt: '2026-11-11T09:00:00Z' } : {}) } }; });
      mockRpc(ScheduleService, 'ListScheduleRuns', () => { historyReads++; return { runs: ready
        ? [run('created', { taskId: 'new-task' })] : initial === 'empty' ? [] : [run('created')], page: {} }; });
      const view = renderScreen();
      await screen.findByText('Every day at 09:00 UTC in Beta');
      await waitFor(() => expect(historyReads).toBe(1));
      ready = true;
      await tick();
      expect(await screen.findByRole('link', { name: 'Open created task' })).toHaveAttribute('href', '/tasks/new-task?org=org-1&project=p2');
      expect(detailReads).toBe(2);
      expect(screen.getByText(/Next run Nov 11, 2026/)).toBeInTheDocument();
      expect(historyReads).toBe(2);
      project = 'p2'; view.rerender();
      await tick();
      expect(historyReads).toBe(2);
      expect(detailReads).toBe(2);
      view.unmount();
      await tick();
      expect(historyReads).toBe(2);
    });
  }

  it('stops off-feed reads on permission denial while keeping the error visible', async () => {
    fakeIntervals();
    let calls = 0, denied = false;
    mockRpc(ScheduleService, 'GetSchedule', { schedule: { ...schedule, projectId: 'p2' } });
    server.use(http.post(`${BACKEND_URL}/${ScheduleService.typeName}/ListScheduleRuns`, () => {
      calls++;
      return denied ? HttpResponse.json({ code: 'permission_denied', message: 'No access to this history' }, { status: 403 })
        : HttpResponse.json({ runs: [], page: {} });
    }));
    renderScreen();
    await screen.findByText('It has not run yet.');
    denied = true;
    await tick();
    expect(await screen.findByRole('alert')).toHaveTextContent('No access to this history');
    await tick();
    expect(calls).toBe(2);
    expect(screen.getByRole('alert')).toHaveTextContent('No access to this history');
  });

  it('acknowledges accepted work and clears feedback on schedule change', async () => {
    mockRpc(ScheduleService, 'RunSchedule', { run: run('queued', { trigger: 'manual' }) });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Run now' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Creation request accepted');
    fireEvent.click(screen.getByRole('link', { name: /^Another/ }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
  it('refreshes the organization collection only while its feed is project-narrowed', async () => {
    fakeIntervals();
    let reads = 0;
    mockRpc(ScheduleService, 'ListSchedules', () => { reads++; return { schedules: [schedule], page: {} }; });
    const view = renderScoped(<SchedulesScreen />, { paths: ['/schedules'], initialEntry: '/schedules?org=org-1&project=p1' });
    await screen.findByRole('link', { name: /^Routine/ });
    expect(reads).toBe(1);
    await tick(); await waitFor(() => expect(reads).toBe(2));
    project = ''; view.rerender();
    await tick();
    expect(reads).toBe(2);
  });

  it('keeps unfamiliar server outcomes readable in history and manual feedback', async () => {
    mockRpc(ScheduleService, 'ListScheduleRuns', { runs: [run('future-result')], page: {} });
    mockRpc(ScheduleService, 'RunSchedule', { run: run('future-result', { trigger: 'manual' }) });
    renderScreen();
    expect(await screen.findByText('future-result')).toHaveClass('bg-neutral-subtle');
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    expect(await screen.findByRole('status')).toHaveTextContent('future-result.');
  });

  it('retains an off-feed schedule draft through a failed background read and recovery', async () => {
    fakeIntervals();
    let failing = false;
    server.use(http.post(`${BACKEND_URL}/${ScheduleService.typeName}/GetSchedule`, () => failing
      ? HttpResponse.json({ code: 'unavailable', message: 'Temporary read failure' }, { status: 503 })
      : HttpResponse.json({ schedule: { ...schedule, projectId: 'p2' } })));
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'My unsaved schedule' } });
    failing = true;
    await tick();
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Name')).toHaveValue('My unsaved schedule');
    expect(screen.getByRole('alert')).toHaveTextContent('Your draft is kept');
    failing = false;
    await tick();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Name')).toHaveValue('My unsaved schedule');
  });

});
