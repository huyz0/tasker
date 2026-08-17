import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { TaskTypeService, ProjectTemplateService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore } from '../../store/layout';
import { ListState } from '../../components/ui/ListState';

const typeClient = createClient(TaskTypeService, transport);
const templateClient = createClient(ProjectTemplateService, transport);

/**
 * A task type's state machine: its statuses, their order, and which moves
 * between them are allowed.
 *
 * The enforcement has existed since M01 — `validateStatusForTaskType` checks
 * membership and edges on every status change — but nothing could configure it,
 * so the check only ever ran against the built-in `todo / in progress / done`
 * fallback. This is the missing half.
 */
export function TaskTypesEditor() {
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [newType, setNewType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => { setActivePageTitle('Task Types'); }, [setActivePageTitle]);

  const typesQuery = useQuery({
    queryKey: ['taskTypes', activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => (await typeClient.listTaskTypes({ orgId: activeOrgId })).taskTypes,
  });

  const detail = useQuery({
    queryKey: ['taskType', selectedId],
    enabled: !!selectedId,
    queryFn: async () => await typeClient.getTaskType({ id: selectedId! }),
  });

  const templates = useQuery({
    queryKey: ['templates', activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => (await templateClient.listTemplates({ orgId: activeOrgId })).templates,
  });

  const refreshDetail = () => queryClient.invalidateQueries({ queryKey: ['taskType', selectedId] });

  const createType = useMutation({
    mutationFn: async (name: string) => await typeClient.createTaskType({ orgId: activeOrgId, projectId: '', name }),
    onSuccess: (res: any) => {
      setNewType('');
      queryClient.invalidateQueries({ queryKey: ['taskTypes', activeOrgId] });
      setSelectedId(res.taskType.id);
    },
  });

  // M14-T09: rename lives here now, next to the statuses/transitions it
  // renames alongside — the Projects screen used to offer a second,
  // partial copy of this same edit with no visibility into either.
  const updateType = useMutation({
    mutationFn: async (name: string) => await typeClient.updateTaskType({ id: selectedId!, name }),
    onSuccess: () => {
      setIsRenaming(false);
      queryClient.invalidateQueries({ queryKey: ['taskTypes', activeOrgId] });
    },
  });

  const addStatus = useMutation({
    mutationFn: async (name: string) => await typeClient.createTaskStatus({ taskTypeId: selectedId!, name }),
    onSuccess: () => { setNewStatus(''); refreshDetail(); },
  });

  const reorder = useMutation({
    mutationFn: async (statusIds: string[]) => await typeClient.reorderTaskStatuses({ taskTypeId: selectedId!, statusIds }),
    onSuccess: refreshDetail,
  });

  const addTransition = useMutation({
    mutationFn: async ({ fromStatusId, toStatusId }: { fromStatusId: string; toStatusId: string }) =>
      await typeClient.createTaskStatusTransition({ taskTypeId: selectedId!, fromStatusId, toStatusId }),
    onSuccess: () => { setFrom(''); setTo(''); refreshDetail(); },
  });

  const removeTransition = useMutation({
    mutationFn: async (transitionId: string) =>
      await typeClient.deleteTaskStatusTransition({ transitionId, taskTypeId: selectedId! }),
    onSuccess: refreshDetail,
  });

  const setRoot = useMutation({
    mutationFn: async (templateId: string) =>
      await templateClient.updateTemplate({ id: templateId, rootTaskTypeId: selectedId! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates', activeOrgId] }),
  });

  const taskTypes = typesQuery.data ?? [];
  const selectedType = taskTypes.find((t: any) => t.id === selectedId);
  const statuses = detail.data?.statuses ?? [];
  const transitions = detail.data?.transitions ?? [];
  const nameOf = (id: string) => statuses.find((s: any) => s.id === id)?.name ?? id;

  const selectType = (id: string) => {
    setSelectedId(id);
    setIsRenaming(false);
  };

  const move = (index: number, delta: number) => {
    const ids = statuses.map((s: any) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    // The whole order goes over the wire, so a drag implementation later sends
    // the same request this does.
    reorder.mutate(ids);
  };

  const rootedTemplates = (templates.data ?? []).filter((t: any) => t.rootTaskTypeId === selectedId);

  // Two-pane: a type list rail plus a detail pane, the same list-then-detail
  // split every settings screen in Linear uses. The single stacked column
  // this replaced put narrow, short lists (statuses, transitions, root type)
  // full-width with no natural reason to be, and re-rendered the whole page
  // below the pill row on every type switch instead of leaving "which type
  // am I editing" fixed in view.
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex gap-6 items-start">
        <aside className="w-56 shrink-0 flex flex-col gap-1">
          <ListState
            isLoading={typesQuery.isLoading}
            error={typesQuery.error}
            isEmpty={taskTypes.length === 0}
            loadingMessage="Loading task types…"
            emptyMessage="No task types yet."
            emptyAction={<p className="text-xs">Add one below to configure its statuses.</p>}
            onRetry={() => typesQuery.refetch()}
          >
            {taskTypes.map((t: any) => (
              <button
                key={t.id}
                onClick={() => selectType(t.id)}
                aria-current={selectedId === t.id ? 'true' : undefined}
                className={`text-sm text-left px-3 py-2 rounded-md border ${selectedId === t.id ? 'bg-primary-subtle text-primary-subtle-foreground border-primary/40' : 'border-transparent hover:bg-muted'}`}
              >
                {t.name}
              </button>
            ))}
          </ListState>
          <form
            className="flex flex-col gap-1 mt-2"
            onSubmit={(e) => { e.preventDefault(); if (newType.trim()) createType.mutate(newType.trim()); }}
          >
            <label className="sr-only" htmlFor="new-task-type">New task type name</label>
            <input
              id="new-task-type"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              placeholder="New type"
              className="text-sm rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button type="submit" disabled={createType.isPending} className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground">
              Add type
            </button>
          </form>
          {createType.isError && (
            <p className="text-sm text-destructive">Failed to create type: {(createType.error as Error).message}</p>
          )}
        </aside>

        <div className="flex-1 min-w-0">
          {!selectedId ? (
            <p className="text-sm text-muted-foreground">Choose a task type on the left to configure its statuses and transitions.</p>
          ) : detail.isLoading || detail.error ? (
            // Without this branch a failed `getTaskType` renders the two empty-state
            // explanations below — "this type has no statuses" and "every status
            // change is allowed" — which describe a configuration the user does not
            // have and cannot see (M06-T11).
            <ListState
              isLoading={detail.isLoading}
              error={detail.error}
              isEmpty={false}
              loadingMessage="Loading this task type…"
              emptyMessage=""
              onRetry={() => detail.refetch()}
            />
          ) : (
            <div className="flex flex-col gap-8">
              <section>
                {isRenaming ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => { e.preventDefault(); if (renameValue.trim()) updateType.mutate(renameValue.trim()); }}
                  >
                    <label className="sr-only" htmlFor="rename-task-type">Task type name</label>
                    <input
                      id="rename-task-type"
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="text-lg font-semibold tracking-tight bg-transparent border-b outline-none focus:border-primary"
                    />
                    <button type="submit" disabled={!renameValue.trim() || updateType.isPending} className="text-sm text-primary disabled:opacity-50">
                      {updateType.isPending ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setIsRenaming(false)} className="text-sm text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight">{selectedType?.name}</h2>
                    <button
                      onClick={() => { setIsRenaming(true); setRenameValue(selectedType?.name ?? ''); }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Rename
                    </button>
                  </div>
                )}
                {updateType.isError && (
                  <p className="text-sm text-destructive mt-1">Failed to rename: {(updateType.error as Error).message}</p>
                )}
              </section>

              {/* Statuses and transitions side by side on anything wide enough -
                  they're two related but distinct lists, and stacking them full-width
                  was most of what made this screen feel empty. */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section>
                  <h2 className="text-sm font-semibold tracking-tight mb-3">Statuses</h2>
                  {statuses.length === 0 ? (
                    // This is the real behaviour of validateStatusForTaskType, and an
                    // empty list hides it.
                    <p className="text-sm text-muted-foreground">
                      This type has no statuses, so its tasks fall back to todo / in progress / done.
                    </p>
                  ) : (
                    <ol className="flex flex-col gap-1">
                      {statuses.map((s: any, i: number) => (
                        <li key={s.id} className="flex items-center gap-2 text-sm">
                          <span className="w-6 text-muted-foreground">{i + 1}.</span>
                          <span>{s.name}</span>
                          <button
                            aria-label={`Move ${s.name} up`}
                            disabled={i === 0 || reorder.isPending}
                            onClick={() => move(i, -1)}
                            className="ml-auto px-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            aria-label={`Move ${s.name} down`}
                            disabled={i === statuses.length - 1 || reorder.isPending}
                            onClick={() => move(i, 1)}
                            className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            ↓
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                  <form
                    className="flex items-center gap-1 mt-3"
                    onSubmit={(e) => { e.preventDefault(); if (newStatus.trim()) addStatus.mutate(newStatus.trim()); }}
                  >
                    <label className="sr-only" htmlFor="new-status">New status name</label>
                    <input
                      id="new-status"
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      placeholder="Status name"
                      className="text-sm rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <button type="submit" disabled={addStatus.isPending} className="text-sm px-3 py-1 rounded-md border hover:bg-muted disabled:opacity-50">
                      Add status
                    </button>
                  </form>
                  {addStatus.isError && <p className="text-sm text-destructive mt-1">Failed to add status: {(addStatus.error as Error).message}</p>}
                  {reorder.isError && <p className="text-sm text-destructive mt-1">Failed to reorder: {(reorder.error as Error).message}</p>}
                </section>

                <section>
                  <h2 className="text-sm font-semibold tracking-tight mb-3">Transitions</h2>
                  {transitions.length === 0 ? (
                    // A reader who assumes "no edges means nothing is allowed" has it
                    // exactly backwards, and the validator will not tell them.
                    <p className="text-sm text-muted-foreground">
                      Every status change is allowed until the first transition is defined.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {transitions.map((tr: any) => (
                        <li key={tr.id} className="flex items-center gap-2 text-sm">
                          <span>{nameOf(tr.fromStatusId)} → {nameOf(tr.toStatusId)}</span>
                          <button
                            aria-label={`Remove the transition from ${nameOf(tr.fromStatusId)} to ${nameOf(tr.toStatusId)}`}
                            onClick={() => removeTransition.mutate(tr.id)}
                            disabled={removeTransition.isPending}
                            className="ml-auto text-muted-foreground hover:text-destructive disabled:opacity-50"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {statuses.length < 2 ? (
                    <p className="text-sm text-muted-foreground mt-3">A transition needs two statuses.</p>
                  ) : (
                    <form
                      className="flex flex-wrap items-end gap-2 mt-3"
                      onSubmit={(e) => { e.preventDefault(); if (from && to) addTransition.mutate({ fromStatusId: from, toStatusId: to }); }}
                    >
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground" htmlFor="transition-from">From status</label>
                        <select id="transition-from" value={from} onChange={(e) => setFrom(e.target.value)} className="text-sm rounded-md border bg-background px-2 py-1">
                          <option value="">Choose…</option>
                          {statuses.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground" htmlFor="transition-to">To status</label>
                        <select id="transition-to" value={to} onChange={(e) => setTo(e.target.value)} className="text-sm rounded-md border bg-background px-2 py-1">
                          <option value="">Choose…</option>
                          {statuses.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <button type="submit" disabled={!from || !to || addTransition.isPending} className="text-sm px-3 py-1 rounded-md border hover:bg-muted disabled:opacity-50">
                        Allow
                      </button>
                    </form>
                  )}
                  {addTransition.isError && <p className="text-sm text-destructive mt-1">Failed to add transition: {(addTransition.error as Error).message}</p>}
                  {removeTransition.isError && <p className="text-sm text-destructive mt-1">Failed to remove transition: {(removeTransition.error as Error).message}</p>}
                </section>
              </div>

              <section>
                <h2 className="text-sm font-semibold tracking-tight mb-3">Root type</h2>
                <p className="text-sm text-muted-foreground mb-2">
                  {rootedTemplates.length > 0
                    ? `Root type of: ${rootedTemplates.map((t: any) => t.name).join(', ')}`
                    : 'Not the root type of any template.'}
                </p>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor="root-template">Template to set this as the root type of</label>
                  <select
                    id="root-template"
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) setRoot.mutate(e.target.value); }}
                    disabled={setRoot.isPending}
                    className="text-sm rounded-md border bg-background px-2 py-1"
                  >
                    <option value="">Set as root type of…</option>
                    {(templates.data ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                {setRoot.isError && <p className="text-sm text-destructive mt-1">Failed to set root type: {(setRoot.error as Error).message}</p>}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
