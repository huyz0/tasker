import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { ScheduleSchema, WorkflowTemplateSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { ScheduleForm, cadenceText, draftFromSchedule } from './ScheduleForm';

const projects = [{ id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'Beta' }];
const templates = [
  create(WorkflowTemplateSchema, { id: 'w1', name: 'Org-wide report' }),
  create(WorkflowTemplateSchema, { id: 'w2', name: 'Beta only', projectId: 'p2' }),
];

describe('ScheduleForm (M43)', () => {
  it('describes cadences in one line', () => {
    expect(cadenceText({ cadence: 'daily', weekdays: [], dayOfMonth: 1, hourUtc: 9 })).toBe('Every day at 09:00 UTC');
    expect(cadenceText({ cadence: 'weekly', weekdays: [4, 1], dayOfMonth: 1, hourUtc: 14 })).toBe('Every Mon, Thu at 14:00 UTC');
    expect(cadenceText({ cadence: 'monthly', weekdays: [], dayOfMonth: 15, hourUtc: 0 })).toBe('Monthly on day 15 at 00:00 UTC');
  });

  it('defaults to a weekly Monday task in the given project and saves it', () => {
    const onSave = vi.fn();
    render(<ScheduleForm initial={draftFromSchedule(undefined, 'p1')} projects={projects} templates={templates} saving={false} onSave={onSave} />);
    expect(screen.getByLabelText('Project')).toHaveValue('p1');
    expect(screen.getByText('Every Mon at 09:00 UTC')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save schedule' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Triage' } });
    fireEvent.change(screen.getByLabelText(/Task title/), { target: { value: 'Triage the inbox' } });
    fireEvent.click(within(screen.getByRole('group', { name: 'Weekdays' })).getByLabelText('Thu'));
    fireEvent.change(screen.getByLabelText('Hour'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Every week' } });
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Triage', projectId: 'p1', cadence: 'weekly', weekdays: [1, 4], hourUtc: 7, target: 'task',
      taskTitle: 'Triage the inbox', taskPriority: 2, taskDescription: 'Every week', skipIfOpen: true,
    }));
  });

  it('needs a weekday for weekly, offers days for monthly, and only usable workflows', () => {
    const onSave = vi.fn();
    render(<ScheduleForm initial={{ ...draftFromSchedule(undefined, 'p1'), name: 'N', taskTitle: 'T' }} projects={projects} templates={templates} saving={false} onSave={onSave} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Weekdays' })).getByLabelText('Mon'));
    expect(screen.getByRole('button', { name: 'Save schedule' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Repeats'), { target: { value: 'monthly' } });
    fireEvent.change(screen.getByLabelText('Day of month'), { target: { value: '15' } });
    fireEvent.click(screen.getByLabelText('A workflow'));
    expect(within(screen.getByLabelText('Workflow')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose…', 'Org-wide report']);
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'p2' } });
    expect(within(screen.getByLabelText('Workflow')).getAllByRole('option')).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('Workflow'), { target: { value: 'w2' } });
    fireEvent.click(screen.getByLabelText(/Skip a run/));
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ cadence: 'monthly', dayOfMonth: 15, target: 'workflow', templateId: 'w2', projectId: 'p2', skipIfOpen: false }));
    fireEvent.change(screen.getByLabelText('Repeats'), { target: { value: 'daily' } });
    expect(screen.queryByRole('group', { name: 'Weekdays' })).toBeNull();
    expect(screen.queryByLabelText('Day of month')).toBeNull();
  });

  it('says when no workflow fits, edits an existing schedule with its project locked, and shows errors', () => {
    const s = create(ScheduleSchema, { id: 's1', projectId: 'p1', name: 'Report', cadence: 'monthly', dayOfMonth: 3, hourUtc: 6, templateId: 'w1', skipIfOpen: true, active: true });
    render(<ScheduleForm initial={draftFromSchedule(s, 'p1')} projects={projects} templates={[]} projectLocked saving error="the cadence is wrong" onSave={() => {}} onCancel={() => {}} />);
    expect(screen.getByLabelText('Project')).toBeDisabled();
    expect(screen.getByLabelText('Day of month')).toHaveValue('3');
    expect(screen.getByText(/No workflow can start in this project yet/)).toBeInTheDocument();
    expect(screen.getByText('Could not save: the cadence is wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
