import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { ProjectService, ScheduleService, WorkflowService, type Schedule } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore } from '../../store/layout';
import { useScopedTo } from '../../hooks/useScope';
import { ListState } from '../../components/ui/ListState';
import { PageHeader } from '../../components/ui/PageHeader';
import { TONE_CLASSES } from '../../components/ui/statusStyles';
import { formatDateTime } from '../../lib/format';
import { ScheduleForm, cadenceText, draftFromSchedule, type ScheduleDraft } from './ScheduleForm';

const scheduleClient = createClient(ScheduleService, transport);
const projectClient = createClient(ProjectService, transport);
const workflowClient = createClient(WorkflowService, transport);

const OUTCOME_TONE: Record<string, string> = { created: TONE_CLASSES.success, skipped: TONE_CLASSES.warning, failed: TONE_CLASSES.destructive };

/** The fields every save sends - the cadence and target are replaced whole. */
function body(d: ScheduleDraft) {
  return {
    name: d.name.trim(), cadence: d.cadence, weekdays: d.cadence === 'weekly' ? d.weekdays : [],
    dayOfMonth: d.cadence === 'monthly' ? d.dayOfMonth : undefined, hourUtc: d.hourUtc,
    ...(d.target === 'workflow'
      ? { templateId: d.templateId }
      : { taskTitle: d.taskTitle.trim(), taskDescription: d.taskDescription, taskPriority: d.taskPriority }),
    skipIfOpen: d.skipIfOpen,
  };
}

interface RunsProps {
  scheduleId: string;
}

function Runs({ scheduleId }: RunsProps) {
  const scopedTo = useScopedTo();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['scheduleRuns', scheduleId],
    queryFn: async () => (await scheduleClient.listScheduleRuns({ scheduleId, page: { limit: 20 } })).runs,
  });
  return (
    <ListState isLoading={isLoading} error={error} isEmpty={(data ?? []).length === 0} loadingMessage="Loading runs…"
      errorLabel="Could not load runs" emptyMessage="It has not run yet." onRetry={() => refetch()}>
      <ul className="flex flex-col gap-1 text-sm" aria-label="Runs">
        {(data ?? []).map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className={`text-xs px-1.5 py-0.5 rounded ${OUTCOME_TONE[r.outcome] ?? ''}`}>{r.outcome}</span>
            <span className="text-muted-foreground">{formatDateTime(r.ranAt)}</span>
            <span className="text-xs text-muted-foreground">{r.trigger === 'manual' ? 'run by hand' : 'on schedule'}</span>
            {r.taskId && <Link to={scopedTo(`/tasks/${r.taskId}`)} className="underline text-xs">open task</Link>}
            {r.detail && <span className="text-xs">{r.detail}</span>}
          </li>
        ))}
      </ul>
    </ListState>
  );
}

/**
 * Recurring work (M43, ADR-0036): schedules that put a task or a workflow on
 * the queue on a cadence, in UTC - where claim-next and webhooks reach agents.
 */
export function SchedulesScreen() {
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const scopedTo = useScopedTo();
  const { scheduleId } = useParams<{ scheduleId?: string }>();
  const [editing, setEditing] = useState(false);
  const isNew = scheduleId === 'new';

  useEffect(() => { setActivePageTitle('Schedules'); }, [setActivePageTitle]);
  useEffect(() => { setEditing(false); }, [scheduleId]);
  const previousOrgId = useRef('');
  useEffect(() => {
    const previous = previousOrgId.current;
    previousOrgId.current = activeOrgId;
    if (previous && previous !== activeOrgId && scheduleId) navigate(scopedTo('/schedules'), { replace: true });
  }, [activeOrgId, scheduleId, navigate, scopedTo]);

  const list = useQuery({
    queryKey: ['schedules', activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => (await scheduleClient.listSchedules({ orgId: activeOrgId, page: { limit: 100 } })).schedules,
  });
  const detail = useQuery({
    queryKey: ['schedule', scheduleId],
    enabled: !!scheduleId && !isNew,
    queryFn: async () => (await scheduleClient.getSchedule({ id: scheduleId! })).schedule,
  });
  const projects = useQuery({
    queryKey: ['projects', 'schedules', activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => (await projectClient.listProjects({ orgId: activeOrgId, page: { limit: 100 } })).projects,
  });
  const templates = useQuery({
    queryKey: ['workflows', activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => (await workflowClient.listWorkflowTemplates({ orgId: activeOrgId, page: { limit: 100 } })).templates,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['schedules'] });
    queryClient.invalidateQueries({ queryKey: ['schedule'] });
    queryClient.invalidateQueries({ queryKey: ['scheduleRuns'] });
  };
  const save = useMutation({
    mutationFn: async (d: ScheduleDraft) => isNew
      ? (await scheduleClient.createSchedule({ projectId: d.projectId, ...body(d) })).schedule
      : (await scheduleClient.updateSchedule({ id: scheduleId!, ...body(d) })).schedule,
    onSuccess: (s) => {
      refresh();
      setEditing(false);
      if (isNew && s) navigate(scopedTo(`/schedules/${s.id}`));
    },
  });
  const toggle = useMutation({
    mutationFn: async (s: Schedule) => scheduleClient.updateSchedule({ id: s.id, ...body(draftFromSchedule(s, s.projectId)), active: !s.active }),
    onSuccess: refresh,
  });
  const runNow = useMutation({
    mutationFn: async () => (await scheduleClient.runSchedule({ id: scheduleId! })).run,
    onSuccess: () => { refresh(); queryClient.invalidateQueries({ queryKey: ['tasks'] }); },
  });
  const remove = useMutation({
    mutationFn: async () => scheduleClient.deleteSchedule({ id: scheduleId! }),
    onSuccess: () => { refresh(); navigate(scopedTo('/schedules')); },
  });

  if (!activeOrgId) return <p className="p-4 text-sm text-muted-foreground">Select an organization to see its schedules.</p>;
  const schedules = list.data ?? [];
  const projectName = (id: string) => (projects.data ?? []).find((p) => p.id === id)?.name ?? id;
  const templateName = (id: string) => (templates.data ?? []).find((t) => t.id === id)?.name ?? id;
  const form = (initial: ScheduleDraft, onCancel: () => void, locked: boolean) => (
    <ScheduleForm
      initial={initial}
      projects={projects.data ?? []}
      templates={templates.data ?? []}
      projectLocked={locked}
      saving={save.isPending}
      error={save.isError ? (save.error as Error).message : undefined}
      onSave={(d) => save.mutate(d)}
      onCancel={onCancel}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Schedules"
        description="Routine work that puts itself on the queue - a task or a whole workflow, daily, weekly or monthly."
      />
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <aside className="w-full md:w-64 shrink-0 flex flex-col gap-1">
          <ListState isLoading={list.isLoading} error={list.error} isEmpty={schedules.length === 0} loadingMessage="Loading schedules…"
            emptyMessage="No schedules yet." onRetry={() => list.refetch()}>
            {schedules.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(scopedTo(`/schedules/${s.id}`))}
                aria-current={scheduleId === s.id ? 'true' : undefined}
                className={`text-sm text-left px-3 py-2 rounded-md border ${scheduleId === s.id ? 'bg-primary-subtle text-primary-subtle-foreground border-primary/40' : 'border-transparent hover:bg-muted'}`}
              >
                <span className="block">{s.name}</span>
                <span className="block text-xs text-muted-foreground">{s.active ? cadenceText(s) : 'Paused'}</span>
              </button>
            ))}
          </ListState>
          <button onClick={() => navigate(scopedTo('/schedules/new'))} className="mt-2 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground">
            New schedule
          </button>
        </aside>

        <div className={`${scheduleId ? 'block' : 'hidden md:block'} flex-1 min-w-0`}>
          {!scheduleId ? (
            <p className="text-sm text-muted-foreground">Choose a schedule on the left, or create one.</p>
          ) : isNew ? (
            form(draftFromSchedule(undefined, activeProjectId ?? ''), () => navigate(scopedTo('/schedules')), false)
          ) : detail.isLoading || detail.error || !detail.data ? (
            <ListState isLoading={detail.isLoading} error={detail.error} isEmpty={false} loadingMessage="Loading this schedule…" emptyMessage="" onRetry={() => detail.refetch()} />
          ) : editing ? (
            form(draftFromSchedule(detail.data, detail.data.projectId), () => setEditing(false), true)
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold tracking-tight">{detail.data.name}</h2>
                  <p className="text-sm">{cadenceText(detail.data)} in {projectName(detail.data.projectId)}</p>
                  <p className="text-sm text-muted-foreground">
                    Creates {detail.data.templateId ? `the workflow "${templateName(detail.data.templateId)}"` : `a task "${detail.data.taskTitle}"`}
                    {detail.data.skipIfOpen ? ', skipping while the last one is unfinished' : ''}.
                  </p>
                  <p className="text-sm">
                    {detail.data.active ? <>Next run {formatDateTime(detail.data.nextRunAt)}</> : <span className="font-medium">Paused</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 shrink-0">
                  <button onClick={() => runNow.mutate()} disabled={runNow.isPending} className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground">
                    {runNow.isPending ? 'Running…' : 'Run now'}
                  </button>
                  <button onClick={() => toggle.mutate(detail.data!)} disabled={toggle.isPending} className="text-sm font-medium text-primary hover:underline disabled:opacity-50">
                    {detail.data.active ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => setEditing(true)} className="text-sm font-medium text-primary hover:underline">Edit</button>
                  <button onClick={() => remove.mutate()} disabled={remove.isPending} className="text-sm font-medium text-muted-foreground hover:text-destructive disabled:opacity-50">
                    Delete
                  </button>
                </div>
              </div>
              {runNow.data && (
                <p className="text-sm" role="status">
                  Ran now: {runNow.data.outcome}{runNow.data.detail ? ` - ${runNow.data.detail}` : ''}.
                </p>
              )}
              {[runNow, toggle, remove].map((m, i) => m.isError && (
                <p key={i} className="text-sm text-destructive">Could not {['run', 'change', 'delete'][i]} it: {(m.error as Error).message}</p>
              ))}
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold tracking-tight">Recent runs</h3>
                <Runs scheduleId={detail.data.id} />
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
