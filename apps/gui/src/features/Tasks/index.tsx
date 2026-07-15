import { useEffect, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { PullRequestBadge } from '../../components/ui/repositories/PullRequestBadge';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { TaskService, RepositoryService, TaskTypeService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import { Comment } from '../../components/ui/comments';
import { Label } from '../../components/ui/labels';
import { fetchAllPages } from '../../lib/fetchAllPages';

const taskClient = createClient(TaskService, transport);
const repositoryClient = createClient(RepositoryService, transport);
const taskTypeClient = createClient(TaskTypeService, transport);

// Fallback status set for tasks with no taskTypeId, or whose task type has
// no custom statuses configured - matches the backend's KNOWN_STATUSES.
const DEFAULT_STATUS_OPTIONS = [
  { id: 'todo', display: 'Todo' },
  { id: 'in-progress', display: 'In Progress' },
  { id: 'done', display: 'Done' },
];

export function TasksWorkbench() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  useEffect(() => setActivePageTitle('Tasks Workbench'), [setActivePageTitle]);

  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['tasks', activeProjectId],
    // The Kanban board needs every task to render accurate columns/counts,
    // not just the first page - loop until the server reports no more pages.
    queryFn: async () => fetchAllPages(async (cursor) => {
      const resp = await taskClient.listTasks({ projectId: activeProjectId, page: cursor ? { cursor } : undefined });
      return { items: resp.tasks, nextCursor: resp.page?.nextCursor || undefined };
    })
  });

  const expandedTask = tasksData?.find(t => t.id === expandedTaskId) ?? null;

  // Task types can define their own custom status sets/state machines
  // (see tasks.handler.ts's validateStatusForTaskType) - fetch each distinct
  // task type actually in use so the board can render columns for them
  // instead of hiding tasks whose status doesn't match the 3 defaults.
  const distinctTaskTypeIds = Array.from(new Set((tasksData ?? []).map(t => t.taskTypeId).filter((id): id is string => !!id)));
  const taskTypeQueries = useQueries({
    queries: distinctTaskTypeIds.map(taskTypeId => ({
      queryKey: ['taskType', taskTypeId],
      queryFn: async () => taskTypeClient.getTaskType({ id: taskTypeId }),
    })),
  });
  const statusesByTaskType = new Map<string, string[]>();
  distinctTaskTypeIds.forEach((taskTypeId, i) => {
    const statuses = taskTypeQueries[i]?.data?.statuses;
    if (statuses && statuses.length > 0) {
      statusesByTaskType.set(taskTypeId, statuses.map(s => s.name));
    }
  });

  const columnDefs = [...DEFAULT_STATUS_OPTIONS];
  const seenStatusIds = new Set(columnDefs.map(c => c.id));
  for (const statuses of statusesByTaskType.values()) {
    for (const name of statuses) {
      if (!seenStatusIds.has(name)) {
        seenStatusIds.add(name);
        columnDefs.push({ id: name, display: name });
      }
    }
  }
  // Defensive: a task's status might not match any known column yet (e.g.
  // its task type's statuses are still loading) - still give it a column
  // rather than silently dropping it from the board.
  for (const t of tasksData ?? []) {
    const status = t.status || 'todo';
    if (!seenStatusIds.has(status)) {
      seenStatusIds.add(status);
      columnDefs.push({ id: status, display: status });
    }
  }

  const { data: pullRequestsData } = useQuery({
    queryKey: ['pullRequests', activeProjectId],
    queryFn: async () => {
      const resp = await repositoryClient.listPullRequests({ projectId: activeProjectId });
      return resp.pullRequests;
    },
    enabled: !!activeProjectId,
  });
  const pullRequestsByTaskId = new Map<string, NonNullable<typeof pullRequestsData>>();
  for (const pr of pullRequestsData ?? []) {
    if (!pr.taskId) continue;
    const existing = pullRequestsByTaskId.get(pr.taskId) ?? [];
    existing.push(pr);
    pullRequestsByTaskId.set(pr.taskId, existing);
  }

  const updateStatusMutation = useMutation({
    mutationFn: async (variables: { taskId: string; status: string }) => {
      const resp = await taskClient.updateTaskStatus(variables);
      return resp.task;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId] }),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await taskClient.deleteTask({ taskId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId] });
      setExpandedTaskId(null);
    },
  });

  const columns = columnDefs.map(col => {
    const items = tasksData?.filter(t => (t.status || 'todo') === col.id) || [];
    return { ...col, items, count: items.length };
  }).filter(col => col.items.length > 0 || DEFAULT_STATUS_OPTIONS.some(d => d.id === col.id));

  const expandedTaskStatusOptions = expandedTask?.taskTypeId && statusesByTaskType.has(expandedTask.taskTypeId)
    ? statusesByTaskType.get(expandedTask.taskTypeId)!.map(name => ({ id: name, display: name }))
    : DEFAULT_STATUS_OPTIONS;

  return (
    <div className="flex h-full gap-6">
      <div className="flex-1 flex flex-col gap-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Tasks Workbench</h1>
            <p className="text-muted-foreground mt-1">Detailed task workbench for humans and autonomous agents.</p>
          </div>
          <button className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-sm font-medium">Filter Tasks</button>
        </div>
        
        <div className="flex gap-4 overflow-x-auto pb-4 h-full">
          {isLoading ? (
            <p className="text-sm text-muted-foreground w-full text-center py-10">Loading tasks...</p>
          ) : columns.map(col => (
             <div key={col.id} className="w-80 flex-shrink-0 flex flex-col bg-muted/30 rounded-lg p-3">
               <div className="flex items-center justify-between mb-3 font-medium text-sm">
                 <span className="flex items-center gap-2">{col.display} <span className="text-xs bg-muted text-muted-foreground px-2 rounded-full">{col.count}</span></span>
                 <button aria-label={`Add task to ${col.display}`} className="text-muted-foreground hover:text-foreground">+</button>
               </div>
               <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                 {col.items.map(task => (
                   <div
                     key={task.id}
                     role="button"
                     tabIndex={0}
                     onClick={() => setExpandedTaskId(task.id)}
                     onKeyDown={(e) => {
                       if (e.key === 'Enter' || e.key === ' ') {
                         e.preventDefault();
                         setExpandedTaskId(task.id);
                       }
                     }}
                     className="bg-card border rounded-md p-3 shadow-sm hover:border-primary cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                   >
                      <div className="text-xs text-muted-foreground mb-1 font-mono">{task.displayId}</div>
                      <h4 className="font-medium text-sm leading-tight mb-2">{task.title}</h4>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{task.description || 'No description provided.'}</p>

                      {(pullRequestsByTaskId.get(task.id)?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {pullRequestsByTaskId.get(task.id)!.map(pr => (
                            <PullRequestBadge key={pr.id} pr={{ remotePrId: `#${pr.remotePrId}`, title: pr.title, status: pr.status, url: pr.url }} />
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-auto">
                        <div className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">U</div>
                        <span className="text-[10px] text-muted-foreground border px-1.5 py-0.5 rounded">High Priority</span>
                      </div>
                   </div>
                 ))}
                 <button aria-label={`Add task to ${col.display}`} className="w-full mt-2 py-2 text-muted-foreground bg-background rounded-md border border-dashed hover:border-solid text-sm shadow-sm">+</button>
               </div>
             </div>
          ))}
        </div>
      </div>

      {/* Slide out detail panel */}
      {expandedTask && (
        <div className="w-80 flex-shrink-0 border-l bg-card flex flex-col pt-0 shadow-xl overflow-hidden animate-in slide-in-from-right-4">
           <div className="p-4 border-b flex justify-between items-center">
             <h2 className="font-semibold">Task Details</h2>
             <div className="flex items-center gap-3">
               <button
                 onClick={() => {
                   if (window.confirm(`Move "${expandedTask.title}" to the bin? You can restore it later.`)) {
                     deleteTaskMutation.mutate(expandedTask.id);
                   }
                 }}
                 disabled={deleteTaskMutation.isPending}
                 className="text-destructive hover:text-destructive/80 text-sm font-medium disabled:opacity-50"
               >
                 {deleteTaskMutation.isPending ? 'Moving to bin...' : 'Delete'}
               </button>
               <button onClick={() => setExpandedTaskId(null)} aria-label="Close task details" className="text-muted-foreground hover:text-foreground">✕</button>
             </div>
           </div>
           {deleteTaskMutation.isError && (
             <p className="text-sm text-destructive px-4 pt-2">Failed to delete task: {(deleteTaskMutation.error as Error).message}</p>
           )}
           <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
             <div className="text-sm text-primary font-medium mb-1">{expandedTask.displayId}</div>
             <h3 className="text-xl font-bold mb-4">{expandedTask.title}</h3>
             <div className="space-y-3 text-sm text-muted-foreground mb-6">
                <div className="flex justify-between items-center">
                  <span className="w-24">Status:</span>
                  <select
                    value={expandedTask.status || 'todo'}
                    disabled={updateStatusMutation.isPending}
                    onChange={(e) => updateStatusMutation.mutate({ taskId: expandedTask.id, status: e.target.value })}
                    className="text-foreground bg-transparent border rounded-md px-2 py-1 text-sm"
                  >
                    {expandedTaskStatusOptions.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.display}</option>
                    ))}
                  </select>
                </div>
                {updateStatusMutation.isError && (
                  <p className="text-destructive text-xs">Failed to update status: {(updateStatusMutation.error as Error).message}</p>
                )}
                <div className="flex justify-between"><span className="w-24">Assignee:</span> <span className="text-foreground">Unassigned</span></div>
             </div>
             <div className="prose prose-sm dark:prose-invert max-w-none">
                {expandedTask.description ? (
                  <MarkdownRenderer content={expandedTask.description} />
                ) : (
                  <p className="text-muted-foreground italic">No description provided.</p>
                )}
             </div>
             <div className="mt-6">
               <h3 className="text-lg font-semibold tracking-tight mb-3">Labels</h3>
               <Label.Provider entityId={expandedTask.id} entityType="task" orgId={activeOrgId}>
                 <Label.Chips />
                 <div className="mt-3">
                   <Label.Picker />
                 </div>
               </Label.Provider>
             </div>
             <div className="mt-8">
               <h3 className="text-lg font-semibold tracking-tight mb-4">Comments</h3>
               <Comment.Provider entityId={expandedTask.id} entityType="task">
                 <Comment.List />
                 <Comment.Composer />
               </Comment.Provider>
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
