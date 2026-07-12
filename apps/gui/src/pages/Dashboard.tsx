import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../lib/connectTransport";
import { HealthService, OrgService, ProjectService, TaskService, AgentService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { useLayoutStore, type LayoutState } from '../store/layout';

const healthClient = createClient(HealthService, transport);
const orgClient = createClient(OrgService, transport);
const projectClient = createClient(ProjectService, transport);
const taskClient = createClient(TaskService, transport);
const agentClient = createClient(AgentService, transport);

const STATUS_LABELS: Record<string, string> = {
  todo: 'Todo',
  'in-progress': 'In Progress',
  done: 'Done',
};

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: string }) {
  return (
    <div className="p-4 border rounded-lg bg-card shadow-sm flex items-center justify-between">
      <div>
        <div className="text-muted-foreground text-sm font-medium mb-1">{label}</div>
        <div className="text-3xl font-bold">{value}</div>
      </div>
      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg">{icon}</div>
    </div>
  );
}

export function Dashboard() {
  const setActivePageTitle = useLayoutStore((s: LayoutState) => s.setActivePageTitle);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  useEffect(() => setActivePageTitle('Dashboard'), [setActivePageTitle]);

  const [timestamp, setTimestamp] = useState(() => Date.now());
  const { data: health, error: healthError, isLoading: isHealthLoading } = useQuery({
    queryKey: ['healthPing', timestamp],
    queryFn: async () => {
      const res = await healthClient.ping({});
      return res as { message: string, dbStatus: string };
    }
  });

  const { data: orgs } = useQuery({
    queryKey: ['orgs'],
    queryFn: async () => (await orgClient.listOrgs({})).organizations,
  });

  const { data: projects } = useQuery({
    queryKey: ['projects', activeOrgId],
    queryFn: async () => (await projectClient.listProjects({ orgId: activeOrgId })).projects,
    enabled: !!activeOrgId,
  });

  const { data: agents } = useQuery({
    queryKey: ['agents', activeOrgId],
    queryFn: async () => (await agentClient.listAgents({ orgId: activeOrgId })).agents,
    enabled: !!activeOrgId,
  });

  const { data: tasks } = useQuery({
    queryKey: ['tasks', activeProjectId],
    queryFn: async () => (await taskClient.listTasks({ projectId: activeProjectId })).tasks,
    enabled: !!activeProjectId,
  });

  const tasksByStatus = (tasks ?? []).reduce<Record<string, number>>((acc, t) => {
    const status = t.status || 'todo';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-1">Manage your tasks and monitor system health.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Organizations" value={orgs?.length ?? '—'} icon="🏢" />
        <StatCard label="Projects" value={activeOrgId ? (projects?.length ?? '—') : '—'} icon="📁" />
        <StatCard label="Agents" value={activeOrgId ? (agents?.length ?? '—') : '—'} icon="🤖" />
        <StatCard label="Tasks" value={activeProjectId ? (tasks?.length ?? '—') : '—'} icon="✅" />
      </div>

      {activeProjectId && tasks && tasks.length > 0 && (
        <div className="p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
          <h2 className="text-xl font-medium mb-4">Tasks by Status</h2>
          <div className="flex gap-6">
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <div key={key} className="flex flex-col items-center">
                <div className="text-2xl font-bold">{tasksByStatus[key] ?? 0}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

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

        {isHealthLoading && <p className="text-muted-foreground text-sm">Loading telemetry...</p>}
        {healthError && <p className="text-destructive text-sm font-medium">Error: {healthError.message}</p>}
        {health && (
          <div className="bg-muted p-4 rounded-md text-sm font-mono flex flex-col gap-2">
            <p><span className="text-muted-foreground">Message:</span> {health.message}</p>
            <p><span className="text-muted-foreground">DB Status:</span> {health.dbStatus}</p>
          </div>
        )}
      </div>
    </div>
  );
}
