import { useState } from 'react';
import type { Schedule, WorkflowTemplate } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { PRIORITY_OPTIONS } from '../Tasks/priority';

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface ScheduleDraft {
  name: string;
  projectId: string;
  cadence: 'daily' | 'weekly' | 'monthly';
  weekdays: number[];
  dayOfMonth: number;
  hourUtc: number;
  target: 'task' | 'workflow';
  taskTitle: string;
  taskDescription: string;
  taskPriority: number;
  templateId: string;
  skipIfOpen: boolean;
}

export function draftFromSchedule(s: Schedule | undefined, projectId: string): ScheduleDraft {
  if (!s) {
    return {
      name: '', projectId, cadence: 'weekly', weekdays: [1], dayOfMonth: 1, hourUtc: 9, target: 'task',
      taskTitle: '', taskDescription: '', taskPriority: 0, templateId: '', skipIfOpen: true,
    };
  }
  return {
    name: s.name, projectId: s.projectId, cadence: s.cadence as ScheduleDraft['cadence'], weekdays: [...s.weekdays],
    dayOfMonth: s.dayOfMonth || 1, hourUtc: s.hourUtc, target: s.templateId ? 'workflow' : 'task',
    taskTitle: s.taskTitle ?? '', taskDescription: s.taskDescription ?? '', taskPriority: s.taskPriority,
    templateId: s.templateId ?? '', skipIfOpen: s.skipIfOpen,
  };
}

/** "Every Mon, Thu at 09:00 UTC" - the cadence in one line. */
export function cadenceText(s: { cadence: string; weekdays: number[]; dayOfMonth: number; hourUtc: number }): string {
  const at = `at ${String(s.hourUtc).padStart(2, '0')}:00 UTC`;
  if (s.cadence === 'weekly') return `Every ${[...s.weekdays].sort((a, b) => a - b).map((d) => WEEKDAYS[d]).join(', ')} ${at}`;
  if (s.cadence === 'monthly') return `Monthly on day ${s.dayOfMonth} ${at}`;
  return `Every day ${at}`;
}

interface ScheduleFormProps {
  initial: ScheduleDraft;
  projects: { id: string; name: string }[];
  templates: WorkflowTemplate[];
  /** A schedule's project is fixed once it exists. */
  projectLocked?: boolean;
  saving: boolean;
  error?: string;
  onSave: (draft: ScheduleDraft) => void;
  onCancel?: () => void;
}

/** What a schedule creates and when (M43, ADR-0036). Times are UTC. */
export function ScheduleForm({ initial, projects, templates, projectLocked, saving, error, onSave, onCancel }: ScheduleFormProps) {
  const [d, setD] = useState<ScheduleDraft>(initial);
  const set = (patch: Partial<ScheduleDraft>) => setD((cur) => ({ ...cur, ...patch }));
  const usable = templates.filter((t) => !t.projectId || t.projectId === d.projectId);
  const valid =
    d.name.trim() !== '' && d.projectId !== '' &&
    (d.cadence !== 'weekly' || d.weekdays.length > 0) &&
    (d.target === 'task' ? d.taskTitle.trim() !== '' : d.templateId !== '');
  const field = 'text-sm rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50';

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (valid) onSave(d); }}>
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1 flex-1 min-w-48">
          <label className="text-xs text-muted-foreground" htmlFor="schedule-name">Name</label>
          <input id="schedule-name" value={d.name} onChange={(e) => set({ name: e.target.value })} className={field} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="schedule-project">Project</label>
          <select id="schedule-project" value={d.projectId} disabled={projectLocked} onChange={(e) => set({ projectId: e.target.value, templateId: '' })} className={field}>
            <option value="">Choose…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <fieldset className="flex flex-wrap items-end gap-3">
        <legend className="text-xs text-muted-foreground mb-1">When (UTC)</legend>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="schedule-cadence">Repeats</label>
          <select id="schedule-cadence" value={d.cadence} onChange={(e) => set({ cadence: e.target.value as ScheduleDraft['cadence'] })} className={field}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        {d.cadence === 'weekly' && (
          <div role="group" aria-label="Weekdays" className="flex gap-1">
            {WEEKDAYS.map((name, i) => (
              <label key={name} className={`text-xs px-2 py-1 rounded-md border cursor-pointer ${d.weekdays.includes(i) ? 'bg-primary-subtle text-primary-subtle-foreground border-primary/40' : 'bg-background'}`}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={d.weekdays.includes(i)}
                  onChange={() => set({ weekdays: d.weekdays.includes(i) ? d.weekdays.filter((x) => x !== i) : [...d.weekdays, i].sort((a, b) => a - b) })}
                />
                {name}
              </label>
            ))}
          </div>
        )}
        {d.cadence === 'monthly' && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="schedule-day">Day of month</label>
            <select id="schedule-day" value={d.dayOfMonth} onChange={(e) => set({ dayOfMonth: Number(e.target.value) })} className={field}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="schedule-hour">Hour</label>
          <select id="schedule-hour" value={d.hourUtc} onChange={(e) => set({ hourUtc: Number(e.target.value) })} className={field}>
            {Array.from({ length: 24 }, (_, h) => h).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">{cadenceText(d)}</p>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs text-muted-foreground mb-1">Creates</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input type="radio" name="schedule-target" checked={d.target === 'task'} onChange={() => set({ target: 'task' })} /> One task
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="schedule-target" checked={d.target === 'workflow'} onChange={() => set({ target: 'workflow' })} /> A workflow
          </label>
        </div>
        {d.target === 'task' ? (
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1 flex-1 min-w-48">
              <label className="text-xs text-muted-foreground" htmlFor="schedule-task-title">Task title (the date is added)</label>
              <input id="schedule-task-title" value={d.taskTitle} onChange={(e) => set({ taskTitle: e.target.value })} className={field} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="schedule-task-priority">Priority</label>
              <select id="schedule-task-priority" value={d.taskPriority} onChange={(e) => set({ taskPriority: Number(e.target.value) })} className={field}>
                {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 w-full">
              <label className="text-xs text-muted-foreground" htmlFor="schedule-task-description">Description</label>
              <textarea id="schedule-task-description" rows={2} value={d.taskDescription} onChange={(e) => set({ taskDescription: e.target.value })} className={field} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="schedule-template">Workflow</label>
            <select id="schedule-template" value={d.templateId} onChange={(e) => set({ templateId: e.target.value })} className={field}>
              <option value="">Choose…</option>
              {usable.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {usable.length === 0 && <p className="text-xs text-muted-foreground">No workflow can start in this project yet - define one under Workflows.</p>}
          </div>
        )}
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={d.skipIfOpen} onChange={(e) => set({ skipIfOpen: e.target.checked })} />
        Skip a run while the previous one is unfinished
      </label>

      {error && <p className="text-sm text-destructive">Could not save: {error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={!valid || saving} className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground">
          {saving ? 'Saving…' : 'Save schedule'}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="text-sm px-3 py-1.5 rounded-md border hover:bg-muted">Cancel</button>}
      </div>
    </form>
  );
}
