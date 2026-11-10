import { useEffect, useRef, useState } from 'react';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useScopedTo } from '../../hooks/useScope';
import { Link } from 'react-router-dom';
import { useLayoutStore } from '../../store/layout';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { AgentService, DashboardService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { PageHeader } from '../../components/ui/PageHeader';
import { fetchAllPages } from '../../lib/fetchAllPages';
import { sinceLabel } from '../../lib/sinceLabel';
import { AgentTokens } from './AgentTokens';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { VirtualList } from '../../components/ui/VirtualList';
import { ListState } from '../../components/ui/ListState';

// Only the pre-measurement estimate; `measureRows` reads the real height,
// because a row grows when its edit form opens.
const AGENT_ROW_HEIGHT = 76;

/**
 * Name, role, actions - shared by the header and every row so the "Role"
 * heading sits over the role column and not the buttons. Name and role
 * truncate (`minmax(0, …)`) rather than wrap one word per line. On a phone
 * three columns leave the name a single letter wide, so the role drops under
 * the name and the actions take the right-hand column.
 */
const AGENT_ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,9rem)_auto]';
const AGENT_ROLE_CELL = 'col-start-1 row-start-2 sm:col-start-2 sm:row-start-1';
const AGENT_ACTIONS_CELL = 'col-start-2 row-span-2 row-start-1 sm:col-start-3 sm:row-span-1';

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
const dashboardClient = createClient(DashboardService, transport);

function focusInView(target: HTMLElement | null) {
  if (target) { target.focus({ preventScroll: true }); target.scrollIntoView?.({ block: 'nearest' }); }
}

interface WorkspaceProps { accountId: string; orgId: string; }
interface Connection { id: string; name: string; }
interface RegistrationVariables { orgId: string; name: string; agentRoleId: string; generation: number; connection: number; }
interface RoleVariables { orgId: string; name: string; systemPrompt: string; capabilities: string; registration: number; selection: number; form: number; }

export function AgentsDashboard() {
  const session = useAuthSession();
  const activeOrgId = useLayoutStore(state => state.activeOrgId);
  const setTitle = useLayoutStore(state => state.setActivePageTitle);
  useEffect(() => setTitle('AI Agents'), [setTitle]);
  if (!session.authenticated || !session.userId) return <div className="flex flex-col gap-6"><PageHeader title="AI Agents" /><p role="status">{session.isLoading ? 'Checking account…' : 'Sign in to register agents.'}</p></div>;
  if (!activeOrgId) return <div className="flex flex-col gap-6"><PageHeader title="AI Agents" /><p>Choose an organization to register agents and manage their roles.</p></div>;
  return <AgentsWorkspace key={JSON.stringify([session.userId, activeOrgId])} accountId={session.userId} orgId={activeOrgId} />;
}

function AgentsWorkspace({ accountId, orgId: activeOrgId }: WorkspaceProps) {
  const scopedTo = useScopedTo();
  const activeProjectId = useLayoutStore(state => state.activeProjectId);
  const { confirm, confirmDialog } = useConfirm();
  const queryClient = useQueryClient();

  const [isRegistering, setIsRegistering] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentRoleId, setNewAgentRoleId] = useState('');
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
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

  const intent = useRef({ registration: 0, open: false, selection: 0, connection: 0 });
  const connectionRef = useRef<Connection | null>(null);
  const connectionHeading = useRef<HTMLHeadingElement>(null), listHeading = useRef<HTMLHeadingElement>(null);
  const registrationForm = useRef<HTMLFormElement>(null), roleForm = useRef<HTMLFormElement>(null);
  const registrationRole = useRef<HTMLSelectElement>(null), roleNameInput = useRef<HTMLInputElement>(null);
  const origin = useRef<HTMLElement | null>(null), focus = useRef<'connection' | 'return' | null>(null);
  const focusRole = useRef(false), roleGeneration = useRef(0);
  useEffect(() => () => { intent.current.open = false; intent.current.registration++; roleGeneration.current++; focus.current = null; }, []);
  useEffect(() => {
    const target = focus.current === 'connection' ? connectionHeading.current : focus.current === 'return' ? origin.current?.isConnected ? origin.current : listHeading.current : null;
    focus.current = null;
    focusInView(target);
  }, [connection]);
  useEffect(() => { if (isAddingRole && focusRole.current) { focusRole.current = false; roleNameInput.current?.focus(); } }, [isAddingRole]);
  function openConnection(agent: Connection, trigger: HTMLElement | null, focusHeading = true) {
    intent.current.connection++; origin.current = trigger; connectionRef.current = agent;
    focus.current = focusHeading ? 'connection' : null; setConnection(agent);
  }
  function closeConnection() {
    intent.current.connection++; connectionRef.current = null; focus.current = 'return'; setConnection(null);
  }
  function toggleRegistration() {
    intent.current.registration++; intent.current.open = !isRegistering;
    createAgentMutation.reset(); setIsRegistering(!isRegistering);
  }
  function toggleRoleForm() {
    roleGeneration.current++; focusRole.current = !isAddingRole;
    createAgentRoleMutation.reset(); setIsAddingRole(!isAddingRole);
  }
  function openRoleForm() {
    if (isAddingRole) { roleNameInput.current?.focus(); return; }
    roleGeneration.current++; focusRole.current = true; createAgentRoleMutation.reset(); setIsAddingRole(true);
  }

  const {
    data: agentPages,
    isLoading,
    error: agentsError,
    refetch: refetchAgents,
    fetchNextPage: fetchMoreAgents,
    hasNextPage: hasMoreAgents,
    isFetchingNextPage: isFetchingMoreAgents,
  } = useInfiniteQuery({
    queryKey: ['agents', activeOrgId, accountId],
    // One page on mount. The old comment said the dashboard "needs every agent
    // to render deploy/archive actions correctly" — it does not: those actions
    // belong to the row they are on, and a row that is not rendered has no
    // action to render (M07-T04).
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) =>
      agentClient.listAgents({ orgId: activeOrgId, page: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
  });
  const agentsData = agentPages?.pages.flatMap((p) => p.agents);
  const connectionName = connection ? agentsData?.find(agent => agent.id === connection.id)?.name || connection.name : '';
  const loadedAgents = agentsData?.length ?? 0;
  const agentTotal = Number(agentPages?.pages[0]?.page?.totalCount ?? 0);

  // M17-T05: reuses the Dashboard's already-computed per-agent activity
  // (last token use, open task count) rather than adding a second endpoint
  // that joins the same tables. Same cap and "quietest first" ordering as
  // the Dashboard's fleet panel (PANEL_LIMIT=8, dashboard.handler.ts) - this
  // is an at-a-glance panel, not the place to page through every agent.
  const {
    data: dashboardData,
    isLoading: isLoadingActivity,
    error: activityError,
    refetch: refetchActivity,
  } = useQuery({
    queryKey: ['dashboard', activeOrgId, undefined, accountId],
    queryFn: async () => dashboardClient.getDashboard({ orgId: activeOrgId }),
  });
  const agentActivity = dashboardData?.agents ?? [];

  // Roles are scoped to an organization (ADR-0007), so the active org is part
  // of the key as well as the request - without it, switching orgs would serve
  // the previous org's roles from cache.
  // **A deliberate remaining use of `fetchAllPages`** (M07 exit criterion 1
  // requires each one to be justified here).
  //
  // Roles are a configuration vocabulary an administrator writes — the same
  // kind of set as task types — not user-generated volume, and this backs two
  // things that need the whole set rather than a page: the `<select>` an
  // operator picks from when registering an agent, and `roleNameById`, which
  // resolves the role name for every agent row. Paging it means a role past
  // the boundary cannot be chosen, and an agent holding one renders with a
  // blank role.
  //
  // The proper fix is to resolve the name server-side on `Agent` (the M05
  // lesson about `Assignee.name`) and let the picker search; that is a contract
  // change and belongs with the next one to touch this service.
  const { data: rolesData, isLoading: isLoadingRoles, error: rolesError, refetch: refetchRoles } = useQuery({
    queryKey: ['agentRoles', activeOrgId, accountId],
    queryFn: async () => fetchAllPages(async (cursor) => {
      const resp = await agentClient.listAgentRoles({ orgId: activeOrgId, page: cursor ? { cursor } : undefined });
      return { items: resp.roles, nextCursor: resp.page?.nextCursor || undefined };
    }),
  });

  const roleNameById = new Map((rolesData ?? []).map((r) => [r.id, r.name]));

  const archiveAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      await agentClient.archiveAgent({ agentId });
    },
    onSuccess: (_response, agentId) => {
      queryClient.invalidateQueries({ queryKey: ['agents', activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ['agents', 'bin', activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', activeOrgId] });
      if (connectionRef.current?.id === agentId) { origin.current = null; closeConnection(); }
    },
  });

  const updateAgentMutation = useMutation({
    mutationFn: async (variables: { agentId: string; name: string; agentRoleId: string }) => {
      await agentClient.updateAgent(variables);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', activeOrgId] });
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
  // from nothing had no way to register its first agent, because registration
  // requires choosing a role (M05-T12).
  const createAgentRoleMutation = useMutation({
    mutationFn: async (variables: RoleVariables) => agentClient.createAgentRole({ orgId: variables.orgId, name: variables.name, systemPrompt: variables.systemPrompt, capabilities: variables.capabilities }),
    onSettled: (_response, _error, variables) => { void queryClient.invalidateQueries({ queryKey: ['agentRoles', variables.orgId] }); },
    onSuccess: (response, variables) => {
      if (roleGeneration.current !== variables.form) return;
      const resumeRole = document.activeElement === document.body || !!roleForm.current?.contains(document.activeElement);
      setIsAddingRole(false); setNewRoleName(''); setNewRoleSystemPrompt(''); setNewRoleCapabilities('');
      if (intent.current.open && intent.current.registration === variables.registration && intent.current.selection === variables.selection && response.role?.id) { setNewAgentRoleId(response.role.id); if (resumeRole) focusInView(registrationRole.current); }
    },
  });

  const createAgentMutation = useMutation({
    mutationFn: async (variables: RegistrationVariables) => agentClient.createAgent({ orgId: variables.orgId, agentRoleId: variables.agentRoleId, name: variables.name }),
    onSettled: (_response, _error, variables) => { void queryClient.invalidateQueries({ queryKey: ['agents', variables.orgId] }); void queryClient.invalidateQueries({ queryKey: ['dashboard', variables.orgId] }); },
    onSuccess: (response, variables) => {
      if (!intent.current.open || intent.current.registration !== variables.generation) return;
      const focusHeading = document.activeElement === document.body || !!registrationForm.current?.contains(document.activeElement);
      intent.current.open = false; setIsRegistering(false); setNewAgentName(''); setNewAgentRoleId('');
      if (response.agent?.id && intent.current.connection === variables.connection) openConnection({ id: response.agent.id, name: response.agent.name || variables.name }, null, focusHeading);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {/* The count used to be a lone "Total Agents" card that left a wide
          empty strip beside it; one number reads fine as a sentence. */}
      <PageHeader
        title="AI Agents"
        description={
          <>
            {!isLoading && !agentsError && (
              <span className="tabular-nums">{agentTotal} {agentTotal === 1 ? 'agent' : 'agents'} in this organization. </span>
            )}
            Register identities and manage roles and access tokens. Run the worker in your own environment.
          </>
        }
      />

      {connection && <section aria-labelledby="agent-connection-heading" className="rounded-lg border bg-surface-panel p-panel">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1"><h2 id="agent-connection-heading" ref={connectionHeading} tabIndex={-1} className="type-section-title scroll-mt-20 break-words">Connect {connectionName}</h2>
            <p className="type-body text-muted-foreground">Issue a scoped token and configure your external worker.</p></div>
          <button type="button" aria-label="Close connection setup" onClick={closeConnection} className="rounded-md border bg-background px-3 py-2 type-caption hover:bg-accent">Close</button>
        </div>
        <AgentTokens key={connection.id} agentId={connection.id} agentName={connectionName} accountId={accountId} orgId={activeOrgId} projectId={activeProjectId || undefined} />
      </section>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border rounded-lg bg-surface-panel p-panel">
          <div className="flex justify-between items-center mb-4">
             <h2 ref={listHeading} tabIndex={-1} className="type-section-title scroll-mt-20">Registered agents</h2>
             <button
               onClick={toggleRegistration}
               aria-label={isRegistering ? 'Cancel registration' : 'Register agent'}
               className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors"
             >
               {isRegistering ? 'Cancel' : 'Register agent'}
             </button>
          </div>
          {isRegistering && (
            <form
              ref={registrationForm}
              aria-label="Register agent"
              onSubmit={(e) => { e.preventDefault(); createAgentMutation.mutate({ orgId: activeOrgId, name: newAgentName.trim(), agentRoleId: newAgentRoleId, generation: intent.current.registration, connection: intent.current.connection }); }}
              className="mb-4 p-3 border rounded-md flex flex-col gap-2 bg-muted/20"
            >
              <label className="type-caption font-medium" htmlFor="register-agent-name">Agent name</label>
              <input
                id="register-agent-name"
                disabled={createAgentMutation.isPending}
                type="text"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="Agent name"
                required
                className="text-sm bg-transparent border rounded-md px-2 py-1"
              />
              <label className="type-caption font-medium" htmlFor="register-agent-role">Role</label>
              <select
                id="register-agent-role"
                ref={registrationRole}
                disabled={createAgentMutation.isPending}
                value={newAgentRoleId}
                onChange={(e) => { intent.current.selection++; setNewAgentRoleId(e.target.value); }}
                required
                className="text-sm bg-transparent border rounded-md px-2 py-1"
              >
                <option value="">Select a role…</option>
                {(rolesData ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <p className="type-caption text-muted-foreground">A role describes worker instructions and capabilities. Token scopes control API access.</p>
              {!isLoadingRoles && !rolesError && rolesData?.length === 0 && <div className="flex flex-wrap items-center gap-2 type-caption">
                <p>Create a role before registering an agent.</p><button type="button" onClick={openRoleForm} className="text-primary hover:underline">Create a role</button>
              </div>}
              {createAgentMutation.isError && (
                <p className="text-xs text-destructive-subtle-foreground">Could not register agent: {(createAgentMutation.error as Error).message}</p>
              )}
              <button
                type="submit"
                disabled={createAgentMutation.isPending || !newAgentName.trim() || !newAgentRoleId}
                className="self-end px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium disabled:bg-muted disabled:text-muted-foreground"
              >
                {createAgentMutation.isPending ? 'Registering…' : 'Register'}
              </button>
            </form>
          )}
          {archiveAgentMutation.isError && (
            <p className="text-sm text-destructive-subtle-foreground mb-2">Failed to delete agent: {(archiveAgentMutation.error as Error).message}</p>
          )}
          {updateAgentMutation.isError && (
            <p className="text-sm text-destructive-subtle-foreground mb-2">Failed to update agent: {(updateAgentMutation.error as Error).message}</p>
          )}
          <div className="border rounded-md divide-y">
            <div className={`${AGENT_ROW_GRID} min-h-row p-3 text-xs font-medium text-muted-foreground bg-muted/30`}>
              <span>Name</span>
              <span className={`hidden sm:block ${AGENT_ROLE_CELL}`}>Role</span>
              <span className={`sr-only ${AGENT_ACTIONS_CELL}`}>Actions</span>
            </div>
            <ListState
              isLoading={isLoading}
              error={agentsError}
              isEmpty={!agentsData || agentsData.length === 0}
              loadingMessage="Loading agents…"
              emptyMessage="No agents registered yet."
              emptyAction={<p className="text-xs">Register an identity with the form above.</p>}
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
                <div className={`${AGENT_ROW_GRID} min-h-row p-3 text-sm`}>
                  <span className="min-w-0 truncate font-medium text-foreground" title={a.name}>
                    {a.name}
                  </span>
                  <span className={`min-w-0 truncate text-muted-foreground ${AGENT_ROLE_CELL}`} title={roleNameById.get(a.agentRoleId) ?? a.agentRoleId}>
                    {roleNameById.get(a.agentRoleId) ?? a.agentRoleId}
                  </span>
                  <div className={`flex items-center gap-3 ${AGENT_ACTIONS_CELL}`}>
                    <button
                      aria-label={`Tokens for ${a.name}`}
                      onClick={event => { if (connectionRef.current?.id === a.id) closeConnection(); else openConnection({ id: a.id, name: a.name }, event.currentTarget); }}
                      className="text-muted-foreground hover:text-foreground text-xs"
                    >
                      Tokens
                    </button>
                    <button
                      onClick={() => {
                        setEditingAgentId(a.id);
                        setEditAgentName(a.name);
                        setEditAgentRoleId(a.agentRoleId);
                      }}
                      className="text-muted-foreground hover:text-foreground text-xs"
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
                      className="text-muted-foreground hover:text-destructive-subtle-foreground text-xs disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                </div>
                )
                )}
              />
              {hasMoreAgents && (
                <button
                  onClick={() => fetchMoreAgents()}
                  disabled={isFetchingMoreAgents}
                  className="w-full p-3 text-xs tabular-nums text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {isFetchingMoreAgents ? 'Loading…' : `Load more (${loadedAgents} of ${agentTotal})`}
                </button>
              )}
            </ListState>
          </div>
        </div>

        <div className="border rounded-lg bg-surface-panel p-panel">
          <div className="flex justify-between items-center mb-4">
            <h2 className="type-section-title">Agent Activity</h2>
            <span className="text-xs text-muted-foreground">Quietest first</span>
          </div>
          <ListState
            isLoading={isLoadingActivity}
            error={activityError}
            isEmpty={agentActivity.length === 0}
            loadingMessage="Loading agent activity…"
            emptyMessage="No agents in this organization."
            emptyAction={<p className="text-xs">Register an identity to connect an external worker.</p>}
            onRetry={() => refetchActivity()}
          >
            <div className="flex flex-col gap-1">
              {agentActivity.map((a) => {
                const since = sinceLabel(a.lastUsedAt);
                return (
                  <div key={a.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                    <span className="flex-1 min-w-0 truncate text-sm">{a.name}</span>
                    {Number(a.openTaskCount) > 0 && (
                      <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                        {Number(a.openTaskCount)} open
                      </span>
                    )}
                    <span
                      className={`text-xs shrink-0 rounded px-1.5 py-0.5 ${
                        since.silent
                          ? 'bg-warning-subtle text-warning-subtle-foreground'
                          : 'bg-success-subtle text-success-subtle-foreground'
                      }`}
                    >
                      {since.text}
                    </span>
                  </div>
                );
              })}
            </div>
          </ListState>
          {agentTotal > agentActivity.length && (
            <p className="text-xs tabular-nums text-muted-foreground mt-3">
              Showing the {agentActivity.length} quietest of {agentTotal}. See the{' '}
              <Link to={scopedTo('/')} className="text-primary underline underline-offset-2">Dashboard</Link> for the full picture alongside review and PR status.
            </p>
          )}
        </div>
      </div>

      <div className="border rounded-lg bg-surface-panel p-panel">
        <div className="flex justify-between items-center mb-4">
          <h2 className="type-section-title">Agent Roles</h2>
          <button
            onClick={toggleRoleForm}
            className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors"
          >
            {isAddingRole ? 'Cancel' : 'New role'}
          </button>
        </div>
        {isAddingRole && (
          <form
            ref={roleForm}
            onSubmit={(e) => { e.preventDefault(); createAgentRoleMutation.mutate({ orgId: activeOrgId, name: newRoleName.trim(), systemPrompt: newRoleSystemPrompt.trim(), capabilities: newRoleCapabilities.trim(), registration: intent.current.registration, selection: intent.current.selection, form: roleGeneration.current }); }}
            className="mb-4 p-3 border rounded-md flex flex-col gap-2 bg-muted/20"
          >
            <label className="type-caption font-medium" htmlFor="new-role-name">Role name</label>
            <input
              id="new-role-name"
              disabled={createAgentRoleMutation.isPending}
              ref={roleNameInput}
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Role name"
              required
              className="text-sm bg-transparent border rounded-md px-2 py-1"
            />
            <label className="type-caption font-medium" htmlFor="new-role-prompt">System prompt</label>
            <textarea
              id="new-role-prompt"
              disabled={createAgentRoleMutation.isPending}
              value={newRoleSystemPrompt}
              onChange={(e) => setNewRoleSystemPrompt(e.target.value)}
              placeholder="System prompt"
              rows={3}
              required
              className="text-sm bg-transparent border rounded-md px-2 py-1"
            />
            <label className="type-caption font-medium" htmlFor="new-role-capabilities">Capabilities</label>
            <input
              id="new-role-capabilities"
              disabled={createAgentRoleMutation.isPending}
              value={newRoleCapabilities}
              onChange={(e) => setNewRoleCapabilities(e.target.value)}
              placeholder='Capabilities, e.g. ["code","review"]'
              required
              aria-invalid={!isValidCapabilitiesJson(newRoleCapabilities)}
              className="text-sm bg-transparent border rounded-md px-2 py-1"
            />
            {!isValidCapabilitiesJson(newRoleCapabilities) && (
              <p className="text-xs text-destructive-subtle-foreground">Capabilities must be valid JSON.</p>
            )}
            {createAgentRoleMutation.isError && (
              <p className="text-xs text-destructive-subtle-foreground">Failed to create role: {(createAgentRoleMutation.error as Error).message}</p>
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
              {createAgentRoleMutation.isPending ? 'Creating…' : 'Create role'}
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
            emptyAction={<p className="text-xs">A role describes instructions and capabilities. Token scopes control API access.</p>}
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
                    <p className="text-xs text-destructive-subtle-foreground">Capabilities must be valid JSON.</p>
                  )}
                  {updateAgentRoleMutation.isError && (
                    <p className="text-xs text-destructive-subtle-foreground">Failed to update role: {(updateAgentRoleMutation.error as Error).message}</p>
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
                      {updateAgentRoleMutation.isPending ? 'Saving…' : 'Save'}
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
