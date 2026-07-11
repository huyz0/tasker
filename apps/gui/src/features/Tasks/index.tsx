import { useEffect, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { PullRequestBadge } from '../../components/ui/repositories/PullRequestBadge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { TaskService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import { Comment } from '../../components/ui/comments';

const taskClient = createClient(TaskService, transport);

const STATUS_OPTIONS = [
  { id: 'todo', display: 'Todo' },
  { id: 'in-progress', display: 'In Progress' },
  { id: 'done', display: 'Done' },
];

export function TasksWorkbench() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  useEffect(() => setActivePageTitle('Tasks Workbench'), [setActivePageTitle]);

  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['tasks', activeProjectId],
    queryFn: async () => {
      const resp = await taskClient.listTasks({ projectId: activeProjectId });
      return resp.tasks;
    }
  });

  const expandedTask = tasksData?.find(t => t.id === expandedTaskId) ?? null;

  const updateStatusMutation = useMutation({
    mutationFn: async (variables: { taskId: string; status: string }) => {
      const resp = await taskClient.updateTaskStatus(variables);
      return resp.task;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId] }),
  });

  const columns = STATUS_OPTIONS.map(col => {
    const items = tasksData?.filter(t => (t.status || 'todo') === col.id) || [];
    return { ...col, items, count: items.length };
  });

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
                 <button className="text-muted-foreground hover:text-foreground">+</button>
               </div>
               <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                 {col.items.map(task => (
                   <div key={task.id} onClick={() => setExpandedTaskId(task.id)} className="bg-card border rounded-md p-3 shadow-sm hover:border-primary cursor-pointer transition-colors">
                      <div className="text-xs text-muted-foreground mb-1">Project {activeProjectId}</div>
                      <h4 className="font-medium text-sm leading-tight mb-2">{task.title}</h4>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{task.description || 'No description provided.'}</p>
                      
                      {/* Pull Requests list inline (mocked for now until integrated) */}
                      <div className="flex gap-2 mb-3">
                         <PullRequestBadge pr={{ remotePrId: `#101`, title: `Fix issue in feature`, status: 'open', url: '#' }} />
                      </div>

                      <div className="flex items-center justify-between mt-auto">
                        <div className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">U</div>
                        <span className="text-[10px] text-muted-foreground border px-1.5 py-0.5 rounded">High Priority</span>
                      </div>
                   </div>
                 ))}
                 <button className="w-full mt-2 py-2 text-muted-foreground bg-background rounded-md border border-dashed hover:border-solid text-sm shadow-sm">+</button>
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
             <button onClick={() => setExpandedTaskId(null)} className="text-muted-foreground hover:text-foreground">✕</button>
           </div>
           <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
             <div className="text-sm text-primary font-medium mb-1">ID: {expandedTask.id}</div>
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
                    {STATUS_OPTIONS.map(opt => (
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
