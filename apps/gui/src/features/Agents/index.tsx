import { useEffect } from 'react';
import { useLayoutStore } from '../../store/layout';
import { useQuery } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { AgentService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";

const transport = createConnectTransport({
  baseUrl: "http://localhost:8080",
});
const agentClient = createClient(AgentService, transport);

export function AgentsDashboard() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  useEffect(() => setActivePageTitle('Agents Dashboard'), [setActivePageTitle]);

  const { data: agentsData, isLoading } = useQuery({
    queryKey: ['agents', activeOrgId],
    queryFn: async () => {
      const resp = await agentClient.listAgents({ orgId: activeOrgId });
      return resp.agents;
    }
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
             <button className="px-3 py-1 bg-secondary text-secondary-foreground text-xs rounded font-medium">Deploy Agent</button>
          </div>
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
                  <span className="w-24 text-muted-foreground">{a.agentRoleId}</span>
                  <span className="w-24"><span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider bg-green-500/10 text-green-500 border border-green-500/20">WORKING</span></span>
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
