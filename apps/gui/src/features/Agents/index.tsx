import { useEffect, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { AgentService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { Bot } from 'lucide-react';
import { fetchAllPages } from '../../lib/fetchAllPages';
import { AgentTokens } from './AgentTokens';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { VirtualList } from '../../components/ui/VirtualList';
import { ListState } from '../../components/ui/ListState';

// Only the pre-measurement estimate; `measureRows` reads the real height,
// because a row grows when its edit form opens.
const AGENT_ROW_HEIGHT = 76;

// The backend stores capabilities as an opaque JSON string (main.tsp:
// `capabilities: string // JSON string`) and never validates it - a typo here
// used to reach the database and only surface later, wherever something
// finally tried to JSON.parse it. Empty is left valid: the field is required
// separately (`required`/non-empty checks on each submit button), so this
// only judges shape once there is something to judge.
function isValidCapabilitiesJson(value: string): boolean {
  if (value.trim() === '') return true;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

const agentClient = createClient(AgentService, transport);

export function AgentsDashboard() {
  const { confirm, confirmDialog } = useConfirm();
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  useEffect(() => setActivePageTitle('Agents Dashboard'), [setActivePageTitle]);
  const queryClient = useQueryClient();

  const [isDeploying, setIsDeploying] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentRoleId, setNewAgentRoleId] = useState('');
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [tokensAgentId, setTokensAgentId] = useState<string | null>(null);
  const [editAgentName, setEditAgentName] = useState('');
  const [editAgentRoleId, setEditAgentRoleId] = useState('');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleSystemPrompt, setNewRoleSystemPrompt] = useState('');
  const [newRoleCapabilities, setNewRoleCapabilities] = useState('');
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleSystemPrompt, setEditRoleSystemPrompt] = useState('');
  const [editRoleCapabilities, setEditRoleCapabilities] = useState('');

  const {
    data: agentPages,
    isLoading,
    error: agentsError,
    refetch: refetchAgents,
    fetchNextPage: fetchMoreAgents,
    hasNextPage: hasMoreAgents,
    isFetchingNextPage: isFetchingMoreAgents,
  } = useInfiniteQuery({
    queryKey: ['agents', activeOrgId],
    // One page on mount. The old comment said the dashboard "needs every agent
    // to render deploy/archive actions correctly" — it does not: those actions
    // belong to the row they are on, and a row that is not rendered has no
    // action to render (M07-T04).
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) =>
      agentClient.listAgents({ orgId: activeOrgId, page: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
    enabled: !!activeOrgId,
  });
  const agentsData = agentPages?.pages.flatMap((p) => p.agents);
  const loadedAgents = agentsData?.length ?? 0;
  const agentTotal = Number(agentPages?.pages[0]?.page?.totalCount ?? 0);

  // Roles are scoped to an organization (ADR-0007), so the active org is part
  // of the key as well as the request - without it, switching orgs would serve
  // the previous org's roles from cache.
  // **A deliberate remaining use of `fetchAllPages`** (M07 exit criterion 1
  // requires each one to be justified here).
  //
  // Roles are a configuration vocabulary an administrator writes — the same
  // kind of set as task types — not user-generated volume, and this backs two
  // things that need the whole set rather than a page: the `<select>` an
  // operator picks from when deploying an agent, and `roleNameById`, which
  // resolves the role name for every agent row. Paging it means a role past
  // the boundary cannot be chosen, and an agent holding one renders with a
  // blank role.
  //
  // The proper fix is to resolve the name server-side on `Agent` (the M05
  // lesson about `Assignee.name`) and let the picker search; that is a contract
  // change and belongs with the next one to touch this service.
  const { data: rolesData, isLoading: isLoadingRoles, error: rolesError, refetch: refetchRoles } = useQuery({
    queryKey: ['agentRoles', activeOrgId],
    queryFn: async () => fetchAllPages(async (cursor) => {
      const resp = await agentClient.listAgentRoles({ orgId: activeOrgId, page: cursor ? { cursor } : undefined });
      return { items: resp.roles, nextCursor: resp.page?.nextCursor || undefined };
    }),
    enabled: !!activeOrgId,
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

  // Roles could be edited but never created here — an organization starting
  // from nothing had no way to deploy its first agent, because deploying one
  // requires choosing a role (M05-T12).
  const createAgentRoleMutation = useMutation({
    mutationFn: async () => {
      await agentClient.createAgentRole({
        orgId: activeOrgId,
        name: newRoleName.trim(),
        systemPrompt: newRoleSystemPrompt.trim(),
        capabilities: newRoleCapabilities.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agentRoles'] });
      setIsAddingRole(false);
      setNewRoleName('');
      setNewRoleSystemPrompt('');
      setNewRoleCapabilities('');
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
             <div className="text-3xl font-bold">{agentTotal}</div>
           </div>
           <div className="w-10 h-10 rounded-full bg-primary-subtle text-primary-subtle-foreground flex items-center justify-center"><Bot className="w-5 h-5" /></div>
         </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
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
                className="self-end px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium disabled:bg-muted disabled:text-muted-foreground"
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
            </div>
            <ListState
              isLoading={isLoading}
              error={agentsError}
              isEmpty={!agentsData || agentsData.length === 0}
              loadingMessage="Loading agents…"
              emptyMessage="No agent instances deployed yet."
              emptyAction={<p className="text-xs">Deploy one with the form above.</p>}
              onRetry={() => refetchAgents()}
            >
              {/* Measured: an agent row becomes an edit form when opened, so
                  a fixed height would misplace every row below it (M07-T14). */}
              <VirtualList
                items={agentsData ?? []}
                rowHeight={AGENT_ROW_HEIGHT}
                measureRows
                className="max-h-[70vh] overflow-y-auto"
                renderRow={(a: any) => (
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
                <div key={a.id}>
                <div className="p-3 text-sm flex justify-between items-center">
                  <span className="flex-1 font-medium text-primary flex justify-start items-center gap-2">
                    {a.name}
                  </span>
                  <span className="w-24 text-muted-foreground">{roleNameById.get(a.agentRoleId) ?? a.agentRoleId}</span>
                  <button
                    aria-label={`Tokens for ${a.name}`}
                    onClick={() => setTokensAgentId((cur) => (cur === a.id ? null : a.id))}
                    className="text-muted-foreground hover:text-foreground text-xs ml-3"
                  >
                    Tokens
                  </button>
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
                    onClick={async () => {
                      if (await confirm({
                        title: `Move "${a.name}" to the bin?`,
                        consequence: 'The agent stops appearing in lists and cannot be assigned work.',
                        undo: 'You can restore it from the Bin.',
                        confirmLabel: 'Move to bin',
                      })) {
                        archiveAgentMutation.mutate(a.id);
                      }
                    }}
                    disabled={archiveAgentMutation.isPending}
                    className="text-muted-foreground hover:text-destructive text-xs ml-3 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
                {tokensAgentId === a.id && <AgentTokens agentId={a.id} agentName={a.name} />}
                </div>
                )
                )}
              />
              {hasMoreAgents && (
                <button
                  onClick={() => fetchMoreAgents()}
                  disabled={isFetchingMoreAgents}
                  className="w-full p-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {isFetchingMoreAgents ? 'Loading…' : `Load more (${loadedAgents} of ${agentTotal})`}
                </button>
              )}
            </ListState>
          </div>
        </div>
      </div>

      <div className="border rounded-lg bg-card p-6 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-medium">Agent Roles</h2>
          <button
            onClick={() => setIsAddingRole((v) => !v)}
            className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors"
          >
            {isAddingRole ? 'Cancel' : 'New Role'}
          </button>
        </div>
        {isAddingRole && (
          <form
            onSubmit={(e) => { e.preventDefault(); createAgentRoleMutation.mutate(); }}
            className="mb-4 p-3 border rounded-md flex flex-col gap-2 bg-muted/20"
          >
            <label className="sr-only" htmlFor="new-role-name">Role name</label>
            <input
              id="new-role-name"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Role name"
              required
              className="text-sm bg-transparent border rounded-md px-2 py-1"
            />
            <label className="sr-only" htmlFor="new-role-prompt">System prompt</label>
            <textarea
              id="new-role-prompt"
              value={newRoleSystemPrompt}
              onChange={(e) => setNewRoleSystemPrompt(e.target.value)}
              placeholder="System prompt"
              rows={3}
              required
              className="text-sm bg-transparent border rounded-md px-2 py-1"
            />
            <label className="sr-only" htmlFor="new-role-capabilities">Capabilities</label>
            <input
              id="new-role-capabilities"
              value={newRoleCapabilities}
              onChange={(e) => setNewRoleCapabilities(e.target.value)}
              placeholder='Capabilities, e.g. ["code","review"]'
              required
              aria-invalid={!isValidCapabilitiesJson(newRoleCapabilities)}
              className="text-sm bg-transparent border rounded-md px-2 py-1"
            />
            {!isValidCapabilitiesJson(newRoleCapabilities) && (
              <p className="text-xs text-destructive">Capabilities must be valid JSON.</p>
            )}
            {createAgentRoleMutation.isError && (
              <p className="text-xs text-destructive">Failed to create role: {(createAgentRoleMutation.error as Error).message}</p>
            )}
            <button
              type="submit"
              disabled={
                createAgentRoleMutation.isPending ||
                !newRoleName.trim() ||
                !newRoleSystemPrompt.trim() ||
                !newRoleCapabilities.trim() ||
                !isValidCapabilitiesJson(newRoleCapabilities)
              }
              className="self-end px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium disabled:bg-muted disabled:text-muted-foreground"
            >
              {createAgentRoleMutation.isPending ? 'Creating...' : 'Create role'}
            </button>
          </form>
        )}
        <div className="border rounded-md divide-y">
          <ListState
            isLoading={isLoadingRoles}
            error={rolesError}
            isEmpty={(rolesData ?? []).length === 0}
            loadingMessage="Loading agent roles…"
            emptyMessage="No agent roles yet."
            emptyAction={<p className="text-xs">A role defines what an agent may do — create one above.</p>}
            onRetry={() => refetchRoles()}
          >
            {(rolesData ?? []).map((role) => (
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
                    aria-invalid={!isValidCapabilitiesJson(editRoleCapabilities)}
                    className="text-sm bg-transparent border rounded-md px-2 py-1"
                  />
                  {!isValidCapabilitiesJson(editRoleCapabilities) && (
                    <p className="text-xs text-destructive">Capabilities must be valid JSON.</p>
                  )}
                  {updateAgentRoleMutation.isError && (
                    <p className="text-xs text-destructive">Failed to update role: {(updateAgentRoleMutation.error as Error).message}</p>
                  )}
                  <div className="flex gap-2 self-end">
                    <button
                      type="submit"
                      disabled={
                        !editRoleName.trim() ||
                        !editRoleSystemPrompt.trim() ||
                        !editRoleCapabilities.trim() ||
                        !isValidCapabilitiesJson(editRoleCapabilities) ||
                        updateAgentRoleMutation.isPending
                      }
                      className="px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-md text-xs font-medium"
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
            ))}
          </ListState>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
