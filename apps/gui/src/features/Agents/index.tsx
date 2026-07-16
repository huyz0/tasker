import { useEffect, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { AgentService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { Bot, Zap } from 'lucide-react';
import { fetchAllPages } from '../../lib/fetchAllPages';

const agentClient = createClient(AgentService, transport);

export function AgentsDashboard() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  useEffect(() => setActivePageTitle('Agents Dashboard'), [setActivePageTitle]);
  const queryClient = useQueryClient();

  const [isDeploying, setIsDeploying] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentRoleId, setNewAgentRoleId] = useState('');
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editAgentName, setEditAgentName] = useState('');
  const [editAgentRoleId, setEditAgentRoleId] = useState('');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleSystemPrompt, setEditRoleSystemPrompt] = useState('');
  const [editRoleCapabilities, setEditRoleCapabilities] = useState('');

  const { data: agentsData, isLoading } = useQuery({
    queryKey: ['agents', activeOrgId],
    // The dashboard needs every agent to render deploy/archive actions
    // correctly, not just the first page - loop until no pages remain.
    queryFn: async () => fetchAllPages(async (cursor) => {
      const resp = await agentClient.listAgents({ orgId: activeOrgId, page: cursor ? { cursor } : undefined });
      return { items: resp.agents, nextCursor: resp.page?.nextCursor || undefined };
    }),
    enabled: !!activeOrgId,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ['agents', 'bin', activeOrgId] });
    },
  });

  const updateAgentMutation = useMutation({
    mutationFn: async (variables: { agentId: string; name: string; agentRoleId: string }) => {
      await agentClient.updateAgent(variables);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', activeOrgId] });
      setEditingAgentId(null);
    },
  });

  const updateAgentRoleMutation = useMutation({
    mutationFn: async (variables: { id: string; name: string; systemPrompt: string; capabilities: string }) => {
      await agentClient.updateAgentRole(variables);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agentRoles'] });
      setEditingRoleId(null);
    },
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
           <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Bot className="w-5 h-5" /></div>
         </div>
         <div className="p-4 border rounded-lg bg-card shadow-sm flex items-center justify-between">
           <div>
             <div className="text-muted-foreground text-sm font-medium mb-1">Active Workflows</div>
             <div className="text-3xl font-bold">0</div>
           </div>
           <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Zap className="w-5 h-5" /></div>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border rounded-lg bg-card p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
             <h2 className="text-xl font-medium">AI Agent Instances</h2>
             <button
               onClick={() => setIsDeploying((v) => !v)}
               className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors"
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
                className="self-end px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium disabled:opacity-50"
              >
                {createAgentMutation.isPending ? 'Deploying...' : 'Deploy'}
              </button>
            </form>
          )}
          {archiveAgentMutation.isError && (
            <p className="text-sm text-destructive mb-2">Failed to delete agent: {(archiveAgentMutation.error as Error).message}</p>
          )}
          {updateAgentMutation.isError && (
            <p className="text-sm text-destructive mb-2">Failed to update agent: {(updateAgentMutation.error as Error).message}</p>
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
                editingAgentId === a.id ? (
                  <form
                    key={a.id}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editAgentName.trim() && editAgentRoleId) {
                        updateAgentMutation.mutate({ agentId: a.id, name: editAgentName.trim(), agentRoleId: editAgentRoleId });
                      }
                    }}
                    className="p-3 text-sm flex items-center gap-2"
                  >
                    <input
                      autoFocus
                      value={editAgentName}
                      onChange={(e) => setEditAgentName(e.target.value)}
                      className="flex-1 bg-transparent border rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <select
                      value={editAgentRoleId}
                      onChange={(e) => setEditAgentRoleId(e.target.value)}
                      className="w-32 bg-transparent border rounded-md px-2 py-1"
                    >
                      {(rolesData ?? []).map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    <button type="submit" disabled={!editAgentName.trim() || updateAgentMutation.isPending} className="text-xs text-primary disabled:opacity-50">Save</button>
                    <button type="button" onClick={() => setEditingAgentId(null)} className="text-xs text-muted-foreground">Cancel</button>
                  </form>
                ) : (
                <div key={a.id} className="p-3 text-sm flex justify-between items-center">
                  <span className="flex-1 font-medium text-primary flex justify-start items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    {a.name}
                  </span>
                  <span className="w-24 text-muted-foreground">{roleNameById.get(a.agentRoleId) ?? a.agentRoleId}</span>
                  <span className="w-24"><span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider bg-green-500/10 text-green-500 border border-green-500/20">WORKING</span></span>
                  <button
                    onClick={() => {
                      setEditingAgentId(a.id);
                      setEditAgentName(a.name);
                      setEditAgentRoleId(a.agentRoleId);
                    }}
                    className="text-muted-foreground hover:text-foreground text-xs ml-3"
                  >
                    Edit
                  </button>
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
                )
              ))
            ) : (
               <div className="p-4 text-center text-sm text-muted-foreground">No agent instances deployed yet - deploy one above.</div>
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

      <div className="border rounded-lg bg-card p-6 shadow-sm">
        <h2 className="text-xl font-medium mb-4">Agent Roles</h2>
        <div className="border rounded-md divide-y">
          {(rolesData ?? []).length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No agent roles yet.</div>
          ) : (
            (rolesData ?? []).map((role) => (
              editingRoleId === role.id ? (
                <form
                  key={role.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editRoleName.trim() && editRoleSystemPrompt.trim() && editRoleCapabilities.trim()) {
                      updateAgentRoleMutation.mutate({
                        id: role.id,
                        name: editRoleName.trim(),
                        systemPrompt: editRoleSystemPrompt.trim(),
                        capabilities: editRoleCapabilities.trim(),
                      });
                    }
                  }}
                  className="p-3 flex flex-col gap-2"
                >
                  <input
                    autoFocus
                    value={editRoleName}
                    onChange={(e) => setEditRoleName(e.target.value)}
                    placeholder="Role name"
                    className="text-sm bg-transparent border rounded-md px-2 py-1"
                  />
                  <textarea
                    value={editRoleSystemPrompt}
                    onChange={(e) => setEditRoleSystemPrompt(e.target.value)}
                    placeholder="System prompt"
                    rows={3}
                    className="text-sm bg-transparent border rounded-md px-2 py-1"
                  />
                  <input
                    value={editRoleCapabilities}
                    onChange={(e) => setEditRoleCapabilities(e.target.value)}
                    placeholder="Capabilities (JSON)"
                    className="text-sm bg-transparent border rounded-md px-2 py-1"
                  />
                  {updateAgentRoleMutation.isError && (
                    <p className="text-xs text-destructive">Failed to update role: {(updateAgentRoleMutation.error as Error).message}</p>
                  )}
                  <div className="flex gap-2 self-end">
                    <button
                      type="submit"
                      disabled={!editRoleName.trim() || !editRoleSystemPrompt.trim() || !editRoleCapabilities.trim() || updateAgentRoleMutation.isPending}
                      className="px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-md text-xs font-medium"
                    >
                      {updateAgentRoleMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingRoleId(null)}
                      className="px-3 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-xs font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div key={role.id} className="p-3 text-sm flex justify-between items-center">
                  <span className="font-medium">{role.name}</span>
                  <button
                    onClick={() => {
                      setEditingRoleId(role.id);
                      setEditRoleName(role.name);
                      setEditRoleSystemPrompt(role.systemPrompt);
                      setEditRoleCapabilities(role.capabilities);
                    }}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    Edit
                  </button>
                </div>
              )
            ))
          )}
        </div>
      </div>
    </div>
  );
}
