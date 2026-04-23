import { useEffect, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { PullRequestBadge } from '../../components/ui/repositories/PullRequestBadge';
import { useQuery } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { TaskService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';

const transport = createConnectTransport({
  baseUrl: "http://localhost:8080",
});
const taskClient = createClient(TaskService, transport);

export function TasksWorkbench() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  useEffect(() => setActivePageTitle('Tasks Workbench'), [setActivePageTitle]);

  const [expandedTask, setExpandedTask] = useState<any | null>(null);

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['tasks', activeProjectId],
    queryFn: async () => {
      const resp = await taskClient.listTasks({ projectId: activeProjectId });
      return resp.tasks;
    }
  });

  const columns = [
    { id: 'todo', display: 'Todo' },
    { id: 'in-progress', display: 'In Progress' },
    { id: 'done', display: 'Done' }
  ].map(col => {
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
                   <div key={task.id} onClick={() => setExpandedTask(task)} className="bg-card border rounded-md p-3 shadow-sm hover:border-primary cursor-pointer transition-colors">
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
             <button onClick={() => setExpandedTask(null)} className="text-muted-foreground hover:text-foreground">✕</button>
           </div>
           <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
             <div className="text-sm text-primary font-medium mb-1">ID: {expandedTask.id}</div>
             <h3 className="text-xl font-bold mb-4">{expandedTask.title}</h3>
             <div className="space-y-3 text-sm text-muted-foreground mb-6">
                <div className="flex justify-between"><span className="w-24">Status:</span> <span className="text-foreground">{expandedTask.status || 'todo'}</span></div>
                <div className="flex justify-between"><span className="w-24">Assignee:</span> <span className="text-foreground">Unassigned</span></div>
             </div>
             <div className="prose prose-sm dark:prose-invert max-w-none">
                {expandedTask.description ? (
                  <MarkdownRenderer content={expandedTask.description} />
                ) : (
                  <p className="text-muted-foreground italic">No description provided.</p>
                )}
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
