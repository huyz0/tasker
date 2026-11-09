import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Code, ConnectError, createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { ProjectService, ScheduleService, WorkflowService, type Schedule } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore } from '../../store/layout';
import { useScopedTo } from '../../hooks/useScope';
import { ListState } from '../../components/ui/ListState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatDateTime } from '../../lib/format';
import { RunHistory, creationResultLabel } from './RunHistory';
import { ScheduleForm, cadenceText, draftFromSchedule, type ScheduleDraft } from './ScheduleForm';

const scheduleClient = createClient(ScheduleService, transport);
const projectClient = createClient(ProjectService, transport);
const workflowClient = createClient(WorkflowService, transport);

const REFRESH_MS = 15_000;
const RECOVERABLE = new Set(['queued', 'running', 'interrupted']);
const unavailable = (error: unknown) => error instanceof ConnectError
  && [Code.Unauthenticated, Code.PermissionDenied, Code.NotFound].includes(error.code);
const coveredByFeed = (schedule: Schedule, orgId: string, projectId: string) =>
  schedule.orgId === orgId && (!projectId || schedule.projectId === projectId);

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
  schedule: Schedule;
  feedCoversSchedule: boolean;
}

function Runs({ schedule, feedCoversSchedule }: RunsProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['scheduleRuns', schedule.id],
    queryFn: async () => (await scheduleClient.listScheduleRuns({ scheduleId: schedule.id, page: { limit: 20 } })).runs,
    refetchInterval: (query) => unavailable(query.state.error) ? false
      : !feedCoversSchedule || query.state.data?.some(run => RECOVERABLE.has(run.outcome)) ? REFRESH_MS : false,
  });
  return (
    <ListState isLoading={isLoading} error={error} isEmpty={(data ?? []).length === 0} loadingMessage="Loading runs…"
      errorLabel="Could not load runs" emptyMessage="It has not run yet." onRetry={() => refetch()}>
      <RunHistory runs={data ?? []} orgId={schedule.orgId} projectId={schedule.projectId} />
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
    refetchInterval: query => activeProjectId && !unavailable(query.state.error) ? REFRESH_MS : false,
  });
  const detail = useQuery({
    queryKey: ['schedule', scheduleId],
    enabled: !!scheduleId && !isNew,
    queryFn: async () => (await scheduleClient.getSchedule({ id: scheduleId! })).schedule,
    refetchInterval: query => !unavailable(query.state.error) && query.state.data
      && !coveredByFeed(query.state.data, activeOrgId, activeProjectId) ? REFRESH_MS : false,
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

  const resetRunFeedback = runNow.reset;
  useEffect(() => { resetRunFeedback(); }, [scheduleId, resetRunFeedback]);

  if (!activeOrgId) return <p className="p-4 text-sm text-muted-foreground">Select an organization to see its schedules.</p>;
  const schedules = list.data ?? [];
  const showCollectionState = !scheduleId && (list.isLoading || !!list.error || schedules.length === 0);
  const createAction = (
    <button onClick={() => navigate(scopedTo('/schedules/new'))} className="inline-flex min-h-control items-center justify-center rounded-md bg-primary px-3 type-label text-primary-foreground hover:bg-primary/90">
      New schedule
    </button>
  );
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
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className={`${scheduleId ? 'hidden lg:flex' : 'flex'} ${showCollectionState ? 'w-full max-w-xl' : 'w-full lg:w-64'} shrink-0 flex-col gap-1`}>
          <ListState isLoading={list.isLoading} error={list.error} isEmpty={schedules.length === 0} loadingMessage="Loading schedules…"
            emptyTitle={showCollectionState ? 'No schedules yet.' : undefined}
            emptyMessage={showCollectionState ? 'Put routine work on a daily, weekly or monthly cadence. For example, schedule a weekly triage task.' : 'No schedules yet.'}
            emptyAction={showCollectionState ? createAction : undefined} onRetry={() => list.refetch()}>
            {schedules.map((s) => (
              <Link
                key={s.id}
                to={scopedTo(`/schedules/${s.id}`)}
                aria-current={scheduleId === s.id ? 'page' : undefined}
                className={`text-sm text-left px-3 py-2 rounded-md border ${scheduleId === s.id ? 'bg-primary-subtle text-primary-subtle-foreground border-primary/40' : 'border-transparent hover:bg-muted'}`}
              >
                <span className="block">{s.name}</span>
                <span className="block text-xs text-muted-foreground">{s.active ? cadenceText(s) : 'Paused'}</span>
              </Link>
            ))}
          </ListState>
          {!showCollectionState && createAction}
        </aside>

        <div className={`${scheduleId ? 'block' : 'hidden lg:block'} flex-1 min-w-0`}>
          {scheduleId && !isNew && !editing && <Link to={scopedTo('/schedules')} className="mb-4 inline-flex lg:hidden type-label text-primary hover:underline">All schedules</Link>}
          {!scheduleId ? (
            !showCollectionState && <p className="type-body text-muted-foreground">Choose a schedule on the left, or create one.</p>
          ) : isNew ? (
            form(draftFromSchedule(undefined, activeProjectId ?? ''), () => navigate(scopedTo('/schedules')), false)
          ) : detail.isLoading || !detail.data || (!editing && detail.error) ? (
            <ListState isLoading={detail.isLoading} error={detail.error} isEmpty={false} loadingMessage="Loading this schedule…" emptyMessage="" onRetry={() => detail.refetch()} />
          ) : editing ? (
            <div className="flex flex-col gap-3">
              {detail.error && <p className="type-body text-destructive" role="alert">
                Could not refresh this schedule. Your draft is kept.{' '}
                <button type="button" onClick={() => detail.refetch()} className="type-label text-primary underline">Try again</button>
              </p>}
              {form(draftFromSchedule(detail.data, detail.data.projectId), () => setEditing(false), true)}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
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
                  <button onClick={() => runNow.mutate()} disabled={runNow.isPending} className="inline-flex min-h-11 items-center rounded-md bg-primary px-3 type-label sm:min-h-control text-primary-foreground disabled:bg-muted disabled:text-muted-foreground">
                    {runNow.isPending ? 'Running…' : 'Run now'}
                  </button>
                  <button onClick={() => toggle.mutate(detail.data!)} disabled={toggle.isPending} className="inline-flex min-h-11 items-center type-label text-primary hover:underline disabled:opacity-50 sm:min-h-control">
                    {detail.data.active ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center type-label text-primary hover:underline sm:min-h-control">Edit</button>
                  <button onClick={() => remove.mutate()} disabled={remove.isPending} className="inline-flex min-h-11 items-center type-label text-muted-foreground hover:text-destructive disabled:opacity-50 sm:min-h-control">
                    Delete
                  </button>
                </div>
              </div>
              <div className="space-y-1 type-caption text-muted-foreground">
                <p>Pause stops future scheduled runs; accepted creation and retries continue. Run now remains available.</p>
                <p>Delete stops new runs and cancels waiting creation. Work already created remains.</p>
                <p>Each Run now click is a separate request. Recovery retries automatically.</p>
              </div>
              {runNow.data && (
                <p className="type-body" role="status">
                  {RECOVERABLE.has(runNow.data.outcome)
                    ? 'Creation request accepted. Follow its current status in Recent runs below.'
                    : `${creationResultLabel(runNow.data.outcome)}${runNow.data.detail ? ` — ${runNow.data.detail}` : ''}.`}
                </p>
              )}
              {[runNow, toggle, remove].map((m, i) => m.isError && (
                <p key={i} className="text-sm text-destructive">Could not {['run', 'change', 'delete'][i]} it: {(m.error as Error).message}</p>
              ))}
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold tracking-tight">Recent runs</h3>
                <Runs schedule={detail.data} feedCoversSchedule={coveredByFeed(detail.data, activeOrgId, activeProjectId)} />
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
