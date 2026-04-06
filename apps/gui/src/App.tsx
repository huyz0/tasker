import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { HealthService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { Route, Routes } from 'react-router-dom';
import { useLayoutStore, type LayoutState } from './store/layout';
import { AppShell } from './components/layout/AppShell';
import { CommentSection } from './components/ui/CommentSection';
import { MarkdownRenderer } from './components/ui/MarkdownRenderer';
import { OrganizationsDashboard } from './features/Organizations';
import { ProjectsWizard } from './features/Projects';
import { TasksWorkbench } from './features/Tasks';
import { AgentsDashboard } from './features/Agents';
import { ArtifactsBrowser } from './features/Artifacts';

const transport = createConnectTransport({
  baseUrl: "http://localhost:8080",
});

const client = createClient(HealthService, transport);

function GenericPlaceholder({ title, description }: { title: string, description: string }) {
  const setActivePageTitle = useLayoutStore((s: LayoutState) => s.setActivePageTitle);
  useEffect(() => setActivePageTitle(title), [title, setActivePageTitle]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="p-12 border rounded-lg bg-card text-muted-foreground flex items-center justify-center border-dashed">
        <p>{title} module placeholder area.</p>
      </div>
    </div>
  );
}

function DashboardPlaceholder() {
  const setActivePageTitle = useLayoutStore((s: LayoutState) => s.setActivePageTitle);
  useEffect(() => setActivePageTitle('Dashboard'), [setActivePageTitle]);
  
  const [timestamp, setTimestamp] = useState(() => Date.now());
  const { data, error, isLoading } = useQuery({
    queryKey: ['healthPing', timestamp],
    queryFn: async () => {
      const res = await client.ping({});
      return res as { message: string, dbStatus: string };
    }
  });

  const [comments, setComments] = useState<{id: string, author: string, content: string, createdAt: string, isAgent: boolean}[]>([]);

  const handleAddComment = async (content: string) => {
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 200));
    setComments(prev => [
      ...prev,
      {
        id: `cmt-${Date.now()}`,
        author: 'Human User',
        content,
        createdAt: new Date().toISOString(),
        isAgent: false
      }
    ]);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-1">Manage your tasks and monitor system health.</p>
      </div>

      <div className="p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium">System Health</h2>
          <button 
            onClick={() => setTimestamp(Date.now())}
            className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors"
          >
            Ping Backend
          </button>
        </div>
        
        {isLoading && <p className="text-muted-foreground text-sm">Loading telemetry...</p>}
        {error && <p className="text-destructive text-sm font-medium">Error: {error.message}</p>}
        {data && (
          <div className="bg-muted p-4 rounded-md text-sm font-mono flex flex-col gap-2">
            <p><span className="text-muted-foreground">Message:</span> {data.message}</p>
            <p><span className="text-muted-foreground">DB Status:</span> {data.dbStatus}</p>
          </div>
        )}
      </div>

      <div className="border rounded-lg bg-card text-card-foreground shadow-sm p-6 max-h-[600px] overflow-y-auto">
        <h2 className="text-xl font-medium mb-4">Task Discussion (Epic Verification)</h2>
        <div className="mb-4 p-4 rounded bg-muted/50">
          <h3 className="font-semibold text-sm mb-2">Original Task Description</h3>
          <MarkdownRenderer content={"This is the **root** task describing the feature. It demonstrates inline `code` and parsing."} />
        </div>
        <CommentSection
          comments={comments}
          onAddComment={handleAddComment}
          isLoading={false}
        />
        {/* Helper button to inject an AI comment for E2E testing */}
        <button 
          data-testid="inject-ai-note"
          className="mt-4 px-3 py-1 text-xs bg-primary/20 text-primary rounded"
          onClick={() => setComments(prev => [...prev, {
            id: `cmt-ai-${Date.now()}`,
            author: 'Agent Alpha',
            content: 'Agent reasoning injected.',
            isAgent: true,
            createdAt: new Date().toISOString()
          }])}
        >
          Simulate Agent Note
        </button>
      </div>
    </div>
  );
}

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPlaceholder />} />
        <Route path="/organizations" element={<OrganizationsDashboard />} />
        <Route path="/projects" element={<ProjectsWizard />} />
        <Route path="/tasks" element={<TasksWorkbench />} />
        <Route path="/agents" element={<AgentsDashboard />} />
        <Route path="/artifacts" element={<ArtifactsBrowser />} />
        <Route path="/settings" element={<GenericPlaceholder title="Settings" description="Global application preferences." />} />
      </Routes>
    </AppShell>
  );
}

export default App;
