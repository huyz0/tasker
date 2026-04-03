import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { HealthService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { Route, Routes } from 'react-router-dom';
import { useLayoutStore, type LayoutState } from './store/layout';
import { AppShell } from './components/layout/AppShell';

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
    </div>
  );
}

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPlaceholder />} />
        <Route path="/organizations" element={<GenericPlaceholder title="Organizations" description="Manage hierarchical organizational structure and teams." />} />
        <Route path="/projects" element={<GenericPlaceholder title="Projects" description="Manage derived project templates and ownership." />} />
        <Route path="/tasks" element={<GenericPlaceholder title="Tasks" description="Detailed task workbench for humans and autonomous agents." />} />
        <Route path="/agents" element={<GenericPlaceholder title="AI Agents" description="Manage agent roles, memory partitions, and running instances." />} />
        <Route path="/artifacts" element={<GenericPlaceholder title="Artifacts" description="Project evidence, text files, logs, and generated assets." />} />
        <Route path="/settings" element={<GenericPlaceholder title="Settings" description="Global application preferences." />} />
      </Routes>
    </AppShell>
  );
}

export default App;
