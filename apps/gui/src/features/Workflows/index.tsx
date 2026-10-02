import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { WorkflowService, type WorkflowTemplate } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore } from '../../store/layout';
import { useScopedTo } from '../../hooks/useScope';
import { ListState } from '../../components/ui/ListState';
import { PageHeader } from '../../components/ui/PageHeader';
import { WorkflowEditor, draftFrom, type WorkflowDraft } from './WorkflowEditor';
import { priorityLabel } from '../Tasks/priority';

const workflowClient = createClient(WorkflowService, transport);

function toRequestSteps(draft: WorkflowDraft) {
  return draft.steps.map((s) => ({
    key: s.key.trim(), title: s.title.trim(), description: s.description, priority: s.priority, dependsOn: s.dependsOn,
    ...(s.taskTypeId ? { taskTypeId: s.taskTypeId } : {}),
    ...(s.status ? { status: s.status } : {}),
  }));
}

interface StartPanelProps {
  template: WorkflowTemplate;
  projectId: string | null;
}

/** Start the workflow in the active project: a parent task plus its wired steps. */
function StartPanel({ template, projectId }: StartPanelProps) {
  const [title, setTitle] = useState('');
  const scopedTo = useScopedTo();
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: async () => workflowClient.instantiateWorkflow({ templateId: template.id, projectId: projectId!, title: title.trim() || undefined }),
    onSuccess: () => { setTitle(''); queryClient.invalidateQueries({ queryKey: ['tasks'] }); },
  });
  if (!projectId) return <p className="text-sm text-muted-foreground">Select a project to start this workflow in it.</p>;
  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); start.mutate(); }}
      >
        <div className="flex flex-col gap-1 flex-1 min-w-48">
          <label className="text-xs text-muted-foreground" htmlFor="workflow-run-title">Title for this run</label>
          <input
            id="workflow-run-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={template.name}
            className="text-sm rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <button type="submit" disabled={start.isPending} className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground">
          {start.isPending ? 'Starting…' : 'Start workflow'}
        </button>
      </form>
      {start.isError && <p className="text-sm text-destructive">Could not start: {(start.error as Error).message}</p>}
      {start.data?.parent && (
        <p className="text-sm">
          Started{' '}
          <Link to={scopedTo(`/tasks/${start.data.parent.id}`)} className="underline">
            {start.data.parent.displayId} — {start.data.parent.title}
          </Link>{' '}
          with {start.data.steps.length} step{start.data.steps.length === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  );
}

/**
 * Workflow templates (M42, ADR-0035): define a repeatable piece of work once -
 * its steps and which waits on which - and start it as ordinary tasks that
 * claim-next hands out in order.
 */
export function WorkflowsScreen() {
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const scopedTo = useScopedTo();
  const { templateId } = useParams<{ templateId?: string }>();
  const [editing, setEditing] = useState(false);

  useEffect(() => { setActivePageTitle('Workflows'); }, [setActivePageTitle]);
  useEffect(() => { setEditing(false); }, [templateId]);

  // Same org-switch rule as Task Types: a real switch leaves a template of the
  // previous org open, so go back to the list; '' -> org is hydration.
  const previousOrgId = useRef('');
  useEffect(() => {
    const previous = previousOrgId.current;
    previousOrgId.current = activeOrgId;
    if (previous && previous !== activeOrgId && templateId) navigate(scopedTo('/workflows'), { replace: true });
  }, [activeOrgId, templateId, navigate, scopedTo]);

  const list = useQuery({
    queryKey: ['workflows', activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => (await workflowClient.listWorkflowTemplates({ orgId: activeOrgId, page: { limit: 100 } })).templates,
  });
  const isNew = templateId === 'new';
  const detail = useQuery({
    queryKey: ['workflow', templateId],
    enabled: !!templateId && !isNew,
    queryFn: async () => (await workflowClient.getWorkflowTemplate({ id: templateId! })).template,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['workflows'] });
    queryClient.invalidateQueries({ queryKey: ['workflow'] });
  };
  const save = useMutation({
    mutationFn: async (draft: WorkflowDraft) => {
      const body = { name: draft.name.trim(), description: draft.description, steps: toRequestSteps(draft) };
      return isNew
        ? (await workflowClient.createWorkflowTemplate({ orgId: activeOrgId, ...body })).template
        : (await workflowClient.updateWorkflowTemplate({ id: templateId!, ...body })).template;
    },
    onSuccess: (t) => {
      refresh();
      setEditing(false);
      if (isNew && t) navigate(scopedTo(`/workflows/${t.id}`));
    },
  });
  const remove = useMutation({
    mutationFn: async () => workflowClient.deleteWorkflowTemplate({ id: templateId! }),
    onSuccess: () => { refresh(); navigate(scopedTo('/workflows')); },
  });

  if (!activeOrgId) return <p className="p-4 text-sm text-muted-foreground">Select an organization to see its workflows.</p>;
  const templates = list.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Workflows"
        description="Repeatable work with steps that wait on each other. Start one and its steps become tasks, handed out in order."
      />
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <aside className="w-full md:w-56 shrink-0 flex flex-col gap-1">
          <ListState
            isLoading={list.isLoading}
            error={list.error}
            isEmpty={templates.length === 0}
            loadingMessage="Loading workflows…"
            emptyMessage="No workflows yet."
            onRetry={() => list.refetch()}
          >
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate(scopedTo(`/workflows/${t.id}`))}
                aria-current={templateId === t.id ? 'true' : undefined}
                className={`text-sm text-left px-3 py-2 rounded-md border ${templateId === t.id ? 'bg-primary-subtle text-primary-subtle-foreground border-primary/40' : 'border-transparent hover:bg-muted'}`}
              >
                {t.name} <span className="text-xs text-muted-foreground">· {t.steps.length}</span>
              </button>
            ))}
          </ListState>
          <button
            onClick={() => navigate(scopedTo('/workflows/new'))}
            className="mt-2 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground"
          >
            New workflow
          </button>
        </aside>

        <div className={`${templateId ? 'block' : 'hidden md:block'} flex-1 min-w-0`}>
          {!templateId ? (
            <p className="text-sm text-muted-foreground">Choose a workflow on the left, or create one.</p>
          ) : isNew ? (
            <WorkflowEditor
              key="new"
              initial={draftFrom()}
              saving={save.isPending}
              error={save.isError ? (save.error as Error).message : undefined}
              onSave={(d) => save.mutate(d)}
              onCancel={() => navigate(scopedTo('/workflows'))}
            />
          ) : detail.isLoading || detail.error || !detail.data ? (
            <ListState isLoading={detail.isLoading} error={detail.error} isEmpty={false} loadingMessage="Loading this workflow…" emptyMessage="" onRetry={() => detail.refetch()} />
          ) : editing ? (
            <WorkflowEditor
              key={detail.data.id}
              initial={draftFrom(detail.data)}
              saving={save.isPending}
              error={save.isError ? (save.error as Error).message : undefined}
              onSave={(d) => save.mutate(d)}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{detail.data.name}</h2>
                  {detail.data.description && <p className="text-sm text-muted-foreground mt-1">{detail.data.description}</p>}
                </div>
                <div className="flex gap-3 shrink-0">
                  <button onClick={() => setEditing(true)} className="text-sm font-medium text-primary hover:underline">Edit</button>
                  <button
                    onClick={() => remove.mutate()}
                    disabled={remove.isPending}
                    className="text-sm font-medium text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {remove.isError && <p className="text-sm text-destructive">Could not delete: {(remove.error as Error).message}</p>}
              <ol className="flex flex-col gap-2" aria-label="Workflow steps">
                {detail.data.steps.map((s, i) => {
                  const after = s.dependsOn.map((k) => detail.data!.steps.find((o) => o.key === k)?.title ?? k);
                  return (
                    <li key={s.key} className="text-sm flex flex-wrap gap-x-2">
                      <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                      <span className="font-medium">{s.title}</span>
                      {s.priority > 0 && <span className="text-xs text-muted-foreground">{priorityLabel(s.priority)}</span>}
                      {after.length > 0 && <span className="text-xs text-muted-foreground">after {after.join(', ')}</span>}
                    </li>
                  );
                })}
              </ol>
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold tracking-tight">Start</h3>
                <StartPanel template={detail.data} projectId={activeProjectId} />
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
