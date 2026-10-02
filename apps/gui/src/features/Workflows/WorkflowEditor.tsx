import { useState } from 'react';
import type { WorkflowStep, WorkflowTemplate } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { PRIORITY_OPTIONS } from '../Tasks/priority';

export interface DraftStep {
  key: string;
  title: string;
  description: string;
  priority: number;
  dependsOn: string[];
  // Kept as they were: the GUI does not edit a step's type, but must not
  // drop one set from the CLI or API on save.
  taskTypeId?: string;
  status?: string;
}

export interface WorkflowDraft {
  name: string;
  description: string;
  steps: DraftStep[];
}

export function draftFrom(template?: WorkflowTemplate): WorkflowDraft {
  if (!template) return { name: '', description: '', steps: [{ key: 'step-1', title: '', description: '', priority: 0, dependsOn: [] }] };
  return {
    name: template.name,
    description: template.description,
    steps: template.steps.map((s: WorkflowStep) => ({
      key: s.key, title: s.title, description: s.description, priority: s.priority, dependsOn: [...s.dependsOn],
      ...(s.taskTypeId ? { taskTypeId: s.taskTypeId } : {}),
      ...(s.status ? { status: s.status } : {}),
    })),
  };
}

/** The next unused "step-N" key. */
function nextKey(steps: DraftStep[]): string {
  let n = steps.length + 1;
  while (steps.some((s) => s.key === `step-${n}`)) n++;
  return `step-${n}`;
}

interface WorkflowEditorProps {
  initial: WorkflowDraft;
  saving: boolean;
  error?: string;
  onSave: (draft: WorkflowDraft) => void;
  onCancel?: () => void;
}

/**
 * A template's name, description and steps, each step naming the steps it
 * waits for (M42, ADR-0035). The server validates the graph - unique keys,
 * no cycles - and its message is shown as-is.
 */
export function WorkflowEditor({ initial, saving, error, onSave, onCancel }: WorkflowEditorProps) {
  const [draft, setDraft] = useState<WorkflowDraft>(initial);
  const setStep = (i: number, patch: Partial<DraftStep>) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const removeStep = (i: number) =>
    setDraft((d) => {
      const gone = d.steps[i]!.key;
      return { ...d, steps: d.steps.filter((_, j) => j !== i).map((s) => ({ ...s, dependsOn: s.dependsOn.filter((k) => k !== gone) })) };
    });
  const renameKey = (i: number, key: string) =>
    setDraft((d) => {
      const old = d.steps[i]!.key;
      return {
        ...d,
        steps: d.steps.map((s, j) => (j === i ? { ...s, key } : { ...s, dependsOn: s.dependsOn.map((k) => (k === old ? key : k)) })),
      };
    });
  const toggleDep = (i: number, key: string) =>
    setStep(i, { dependsOn: draft.steps[i]!.dependsOn.includes(key) ? draft.steps[i]!.dependsOn.filter((k) => k !== key) : [...draft.steps[i]!.dependsOn, key] });

  const canSave = draft.name.trim() !== '' && draft.steps.length > 0 && draft.steps.every((s) => s.title.trim() && s.key.trim());

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => { e.preventDefault(); if (canSave) onSave(draft); }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="workflow-name">Name</label>
        <input
          id="workflow-name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="text-sm rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="workflow-description">Description (becomes the parent task's)</label>
        <textarea
          id="workflow-description"
          rows={2}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          className="text-sm rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <ol className="flex flex-col gap-3" aria-label="Steps">
        {draft.steps.map((s, i) => {
          const others = draft.steps.filter((_, j) => j !== i);
          return (
            <li key={i} className="rounded-md border p-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1 w-28">
                  <label className="text-xs text-muted-foreground" htmlFor={`step-key-${i}`}>Key</label>
                  <input
                    id={`step-key-${i}`}
                    value={s.key}
                    onChange={(e) => renameKey(i, e.target.value.toLowerCase())}
                    className="text-sm font-mono rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-40">
                  <label className="text-xs text-muted-foreground" htmlFor={`step-title-${i}`}>Step {i + 1} title</label>
                  <input
                    id={`step-title-${i}`}
                    value={s.title}
                    onChange={(e) => setStep(i, { title: e.target.value })}
                    className="text-sm rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground" htmlFor={`step-priority-${i}`}>Priority</label>
                  <select
                    id={`step-priority-${i}`}
                    value={s.priority}
                    onChange={(e) => setStep(i, { priority: Number(e.target.value) })}
                    className="text-sm rounded-md border bg-background px-2 py-1"
                  >
                    {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  disabled={draft.steps.length === 1}
                  aria-label={`Remove step ${i + 1}`}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-40 px-1"
                >
                  ✕
                </button>
              </div>
              {others.length > 0 && (
                <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <legend className="sr-only">Step {i + 1} waits for</legend>
                  <span aria-hidden="true" className="text-muted-foreground">Waits for:</span>
                  {others.map((o) => (
                    <label key={o.key} className="flex items-center gap-1">
                      <input type="checkbox" checked={s.dependsOn.includes(o.key)} onChange={() => toggleDep(i, o.key)} />
                      {o.title || o.key}
                    </label>
                  ))}
                </fieldset>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => setDraft((d) => ({ ...d, steps: [...d.steps, { key: nextKey(d.steps), title: '', description: '', priority: 0, dependsOn: [] }] }))}
        disabled={draft.steps.length >= 50}
        className="self-start text-sm px-3 py-1 rounded-md border hover:bg-muted disabled:opacity-50"
      >
        Add step
      </button>

      {error && <p className="text-sm text-destructive">Could not save: {error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSave || saving}
          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
        >
          {saving ? 'Saving…' : 'Save workflow'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm px-3 py-1.5 rounded-md border hover:bg-muted">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
