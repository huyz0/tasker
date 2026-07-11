import { useEffect, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { AgentService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";

const agentClient = createClient(AgentService, transport);

export function AgentsDashboard() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  useEffect(() => setActivePageTitle('Agents Dashboard'), [setActivePageTitle]);
  const queryClient = useQueryClient();

  const [isDeploying, setIsDeploying] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentRoleId, setNewAgentRoleId] = useState('');

  const { data: agentsData, isLoading } = useQuery({
    queryKey: ['agents', activeOrgId],
    queryFn: async () => {
      const resp = await agentClient.listAgents({ orgId: activeOrgId });
      return resp.agents;
    }
  });

  const { data: rolesData } = useQuery({
    queryKey: ['agentRoles'],
    queryFn: async () => {
      const resp = await agentClient.listAgentRoles({});
      return resp.roles;
    }
  });

  const roleNameById = new Map((rolesData ?? []).map((r) => [r.id, r.name]));

  const archiveAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      await agentClient.archiveAgent({ agentId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents', activeOrgId] }),
  });

  const createAgentMutation = useMutation({
    mutationFn: async () => {
      await agentClient.createAgent({ orgId: activeOrgId, agentRoleId: newAgentRoleId, name: newAgentName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', activeOrgId] });
      setIsDeploying(false);
      setNewAgentName('');
      setNewAgentRoleId('');
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">AI Agents</h1>
        <p className="text-muted-foreground mt-1">Manage agent roles, memory partitions, and running instances.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
         <div className="p-4 border rounded-lg bg-card shadow-sm flex items-center justify-between">
           <div>
             <div className="text-muted-foreground text-sm font-medium mb-1">Total Agents</div>
             <div className="text-3xl font-bold">{agentsData?.length || 0}</div>
           </div>
           <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">🤖</div>
         </div>
         <div className="p-4 border rounded-lg bg-card shadow-sm flex items-center justify-between">
           <div>
             <div className="text-muted-foreground text-sm font-medium mb-1">Active Workflows</div>
             <div className="text-3xl font-bold">0</div>
           </div>
           <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center">⚡</div>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border rounded-lg bg-card p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
             <h2 className="text-xl font-medium">AI Agent Instances</h2>
             <button
               onClick={() => setIsDeploying((v) => !v)}
               className="px-3 py-1 bg-secondary text-secondary-foreground text-xs rounded font-medium"
             >
               {isDeploying ? 'Cancel' : 'Deploy Agent'}
             </button>
          </div>
          {isDeploying && (
            <form
              onSubmit={(e) => { e.preventDefault(); createAgentMutation.mutate(); }}
              className="mb-4 p-3 border rounded-md flex flex-col gap-2 bg-muted/20"
            >
              <input
                type="text"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="Agent name"
                required
                className="text-sm bg-transparent border rounded-md px-2 py-1"
              />
              <select
                value={newAgentRoleId}
                onChange={(e) => setNewAgentRoleId(e.target.value)}
                required
                className="text-sm bg-transparent border rounded-md px-2 py-1"
              >
                <option value="">Select a role...</option>
                {(rolesData ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {createAgentMutation.isError && (
                <p className="text-xs text-destructive">Failed to deploy agent: {(createAgentMutation.error as Error).message}</p>
              )}
              <button
                type="submit"
                disabled={createAgentMutation.isPending || !newAgentName.trim() || !newAgentRoleId}
                className="self-end px-3 py-1 bg-primary text-primary-foreground text-xs rounded font-medium disabled:opacity-50"
              >
                {createAgentMutation.isPending ? 'Deploying...' : 'Deploy'}
              </button>
            </form>
          )}
          {archiveAgentMutation.isError && (
            <p className="text-sm text-destructive mb-2">Failed to delete agent: {(archiveAgentMutation.error as Error).message}</p>
          )}
          <div className="border rounded-md divide-y">
            <div className="p-3 text-xs font-medium text-muted-foreground flex justify-between bg-muted/30">
              <span className="flex-1">Name</span>
              <span className="w-24">Role</span>
              <span className="w-24">Status</span>
            </div>
            {isLoading ? (
               <div className="p-4 text-center text-sm text-muted-foreground">Loading agents...</div>
            ) : agentsData && agentsData.length > 0 ? (
              agentsData.map(a => (
                <div key={a.id} className="p-3 text-sm flex justify-between items-center">
                  <span className="flex-1 font-medium text-primary flex justify-start items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    {a.name}
                  </span>
                  <span className="w-24 text-muted-foreground">{roleNameById.get(a.agentRoleId) ?? a.agentRoleId}</span>
                  <span className="w-24"><span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider bg-green-500/10 text-green-500 border border-green-500/20">WORKING</span></span>
                  <button
                    onClick={() => {
                      if (window.confirm(`Move "${a.name}" to the bin? You can restore it later.`)) {
                        archiveAgentMutation.mutate(a.id);
                      }
                    }}
                    disabled={archiveAgentMutation.isPending}
                    className="text-muted-foreground hover:text-destructive text-xs ml-3 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              ))
            ) : (
               <div className="p-4 text-center text-sm text-muted-foreground">No agent instances deployed yet.</div>
            )}
          </div>
        </div>

        <div className="border rounded-lg bg-card p-6 shadow-sm flex flex-col h-[400px]">
          <h2 className="text-xl font-medium mb-4">Agent State Machine / Visualizer</h2>
          <div className="flex-1 border rounded bg-muted/20 flex items-center justify-center flex-col text-muted-foreground text-sm border-dashed">
             <div className="mb-2 text-xl">React Flow Component</div>
             <p>Visual workflow rendering goes here.</p>
             <p className="text-xs pt-4 opacity-50">(To be implemented fully with reactflow)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
