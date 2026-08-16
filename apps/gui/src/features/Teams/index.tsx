import { memo, useMemo, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { useDebounce } from 'use-debounce';
import { transport } from '../../lib/connectTransport';
import { TeamService, RoleService, OrgService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { VirtualList } from '../../components/ui/VirtualList';
import { ListState } from '../../components/ui/ListState';
import { RowActionsMenu } from '../../components/ui/RowActionsMenu';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/button';

const teamClient = createClient(TeamService, transport);
const roleClient = createClient(RoleService, transport);
const orgClient = createClient(OrgService, transport);

// Fixed heights for the same reason `Roles`' `ROLE_ROW_HEIGHT` is fixed
// (M07-T14): every row here renders exactly one line, so measuring per row
// would only cost a layout read for no benefit.
const TEAM_ROW_HEIGHT = 44;
const MEMBER_ROW_HEIGHT = 40;
const GRANT_ROW_HEIGHT = 40;

/** How many candidates the add-member search shows at once - a search
 * result, not a catalogue, same reasoning as `AssigneePicker`'s `PAGE`. */
const SEARCH_PAGE = 10;

type Team = { id: string; orgId: string; name: string; createdAt: string; deletedAt?: string };
type TeamMember = { userId: string; email: string; name: string; joinedAt: string };
type Grant = { id: string; subjectType: string; subjectId: string; scopeType: string; scopeId: string; roleId: string; roleName: string; createdAt: string };

/**
 * One team's row in the list: its name (inline-editable via the row-actions
 * menu only - unlike `Roles`' `RoleRow`, the name itself selects the team,
 * so it can't double as the rename trigger without overloading one click
 * with two meanings), an archived badge, and Rename/Archive-or-Restore
 * actions. Memoised for the same reason every virtualised row in this
 * codebase is (`Organizations`' `MemberRow`, `Roles`' `RoleRow`): the
 * virtualizer re-renders this screen on nearly every scroll frame.
 */
const TeamRow = memo(function TeamRow({
  team, isSelected, isBusy, onSelect, onRename, onArchive, onRestore,
}: {
  team: Team;
  isSelected: boolean;
  isBusy: boolean;
  onSelect: (teamId: string) => void;
  onRename: (teamId: string, name: string) => void;
  onArchive: (teamId: string, name: string) => void;
  onRestore: (teamId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(team.name);
  const archived = !!team.deletedAt;

  const commitRename = () => {
    setEditing(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== team.name) onRename(team.id, trimmed);
    else setDraftName(team.name);
  };

  return (
    <div className={`flex items-center gap-2 border-b px-3 text-sm ${isSelected ? 'bg-primary-subtle' : ''}`}>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draftName}
            disabled={isBusy}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setDraftName(team.name); setEditing(false); }
            }}
            aria-label={`Rename team ${team.name}`}
            className="w-full rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
        ) : (
          <button
            onClick={() => onSelect(team.id)}
            aria-current={isSelected ? 'true' : undefined}
            className="flex w-full items-center gap-2 truncate text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
          >
            <span className="truncate">{team.name}</span>
            {archived && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Archived</span>
            )}
          </button>
        )}
      </div>
      <RowActionsMenu
        label={`Actions for ${team.name}`}
        actions={[
          { label: 'Rename', onClick: () => setEditing(true), managesFocusOnSelect: true },
          archived
            ? { label: 'Restore', onClick: () => onRestore(team.id) }
            : { label: 'Archive', destructive: true, onClick: () => onArchive(team.id, team.name) },
        ]}
      />
    </div>
  );
});

function CreateTeamDialog({ open, onClose, orgId }: { open: boolean; onClose: () => void; orgId: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  const createMutation = useMutation({
    mutationFn: () => teamClient.createTeam({ orgId, name: name.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams', orgId] });
      setName('');
      onClose();
    },
  });

  return (
    <Dialog open={open} onClose={onClose} title="Create team">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMutation.mutate(); }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="new-team-name" className="text-sm font-medium">Name</label>
          <input
            id="new-team-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="e.g. Platform"
          />
        </div>
        {createMutation.isError && (
          <p className="text-sm text-destructive">Failed to create team: {(createMutation.error as Error).message}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create team'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Search-and-pick control for adding a member to a team.
 *
 * Mirrors `Tasks/AssigneePicker.tsx`'s own pattern almost exactly (M03's
 * lesson, stated there): a `<select>` full of every org member is the
 * unbounded list M03 spent a milestone removing, reintroduced on the
 * client, against the same 100,001-member organization this task's own
 * verify line asks for ("a team of 100 members is manageable"). The typed
 * text goes to `listOrgMembers`'s server-side `filter`, not a client-side
 * scan of a page already on screen.
 */
function AddMemberPicker({ teamId, orgId, memberIds }: { teamId: string; orgId: string; memberIds: Set<string> }) {
  const queryClient = useQueryClient();
  const [isPicking, setIsPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 250);

  const candidates = useQuery({
    queryKey: ['teamAddCandidates', orgId, debouncedSearch],
    enabled: isPicking && !!orgId,
    queryFn: () => orgClient.listOrgMembers({ orgId, page: { limit: SEARCH_PAGE, filter: debouncedSearch || undefined } }),
  });

  const addMutation = useMutation({
    mutationFn: (userId: string) => teamClient.addTeamMember({ teamId, userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamMembers', teamId] });
      setSearch('');
    },
  });

  const people = (candidates.data?.members ?? []).filter((m) => !memberIds.has(m.userId));
  const matched = Number(candidates.data?.page?.totalCount ?? candidates.data?.members.length ?? 0);

  if (!isPicking) {
    return (
      <button onClick={() => setIsPicking(true)} className="self-start text-sm text-primary hover:underline">
        + Add member
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border bg-card p-2">
      <label className="text-xs font-medium" htmlFor={`team-add-search-${teamId}`}>Search people</label>
      <input
        id={`team-add-search-${teamId}`}
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Name or email"
        className="rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/50"
      />

      {candidates.isLoading && <span className="text-xs text-muted-foreground">Searching…</span>}
      {candidates.error && (
        <ListState isLoading={false} error={candidates.error} isEmpty={false} emptyMessage="" onRetry={() => candidates.refetch()} />
      )}

      {people.map((m) => (
        <button
          key={m.userId}
          onClick={() => addMutation.mutate(m.userId)}
          disabled={addMutation.isPending}
          className="rounded px-1 py-0.5 text-left text-xs hover:bg-accent disabled:opacity-50"
        >
          {m.name || m.email}
        </button>
      ))}

      {candidates.isSuccess && people.length === 0 && (
        <span className="text-xs text-muted-foreground">
          {debouncedSearch ? 'Nobody matches that.' : 'Every org member is already on this team.'}
        </span>
      )}
      {candidates.isSuccess && matched > people.length && (
        <span role="status" className="text-xs text-muted-foreground">
          Showing {people.length} of {matched} — keep typing to narrow it down.
        </span>
      )}

      {addMutation.isError && (
        <p role="alert" className="text-xs text-destructive">Failed to add: {(addMutation.error as Error).message}</p>
      )}

      <button onClick={() => { setIsPicking(false); setSearch(''); }} className="mt-1 self-start text-xs text-muted-foreground">
        Done
      </button>
    </div>
  );
}

/**
 * A selected team's roster and its role grants.
 *
 * There is no `getTeam` RPC (`TeamService`'s own shape - see main.tsp), so
 * the team object itself is a prop from the already-loaded `teams` list
 * rather than a second fetch for data the parent already holds - the same
 * reasoning `gui:rpc-coverage`'s `ProjectTemplateService.getTemplate`
 * exception records elsewhere in this codebase.
 */
function TeamDetail({ team, orgId }: { team: Team; orgId: string }) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();

  const {
    data: memberPages, isLoading: membersLoading, error: membersError, refetch: refetchMembers,
    fetchNextPage: fetchNextMembers, hasNextPage: hasNextMembers, isFetchingNextPage: isFetchingNextMembers,
  } = useInfiniteQuery({
    queryKey: ['teamMembers', team.id],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => teamClient.listTeamMembers({ teamId: team.id, page: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
  });
  const members = useMemo(() => memberPages?.pages.flatMap((p) => p.members) ?? [], [memberPages]);
  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);
  const memberNameById = useMemo(() => new Map(members.map((m) => [m.userId, m.name || m.email])), [members]);

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => teamClient.removeTeamMember({ teamId: team.id, userId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teamMembers', team.id] }),
  });
  const handleRemoveMember = async (member: TeamMember) => {
    if (await confirm({
      title: `Remove ${member.name || member.email} from "${team.name}"?`,
      consequence: 'They lose any access this team\'s role grants carry.',
      undo: 'You can add them back at any time.',
      confirmLabel: 'Remove member',
    })) removeMemberMutation.mutate(member.userId);
  };

  const { data: roles } = useQuery({
    queryKey: ['permissionsRoles', orgId],
    queryFn: async () => (await roleClient.listRoles({ orgId })).roles,
  });

  const {
    data: grantPages, isLoading: grantsLoading, error: grantsError, refetch: refetchGrants,
    fetchNextPage: fetchNextGrants, hasNextPage: hasNextGrants, isFetchingNextPage: isFetchingNextGrants,
  } = useInfiniteQuery({
    queryKey: ['teamGrants', team.id],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      roleClient.listGrants({ scopeType: 'team', scopeId: team.id, page: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
  });
  const grants = useMemo(() => grantPages?.pages.flatMap((p) => p.grants) ?? [], [grantPages]);

  const [grantSubjectId, setGrantSubjectId] = useState('');
  const [grantRoleId, setGrantRoleId] = useState('');
  const grantMutation = useMutation({
    mutationFn: () => roleClient.grantRole({
      subjectType: 'user', subjectId: grantSubjectId, scopeType: 'team', scopeId: team.id, roleId: grantRoleId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamGrants', team.id] });
      setGrantSubjectId('');
      setGrantRoleId('');
    },
  });
  const revokeMutation = useMutation({
    mutationFn: (grantId: string) => roleClient.revokeGrant({ grantId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teamGrants', team.id] }),
  });

  const subjectLabel = (g: Grant) =>
    g.subjectType === 'team'
      ? (g.subjectId === team.id ? team.name : `Team: ${g.subjectId}`)
      : (memberNameById.get(g.subjectId) ?? g.subjectId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {team.name}
          {team.deletedAt && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Archived</span>
          )}
        </h2>
        <p className="text-xs text-muted-foreground">ID: {team.id}</p>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Members</h3>
        <ListState
          isLoading={membersLoading}
          error={membersError}
          isEmpty={!membersLoading && !membersError && members.length === 0}
          loadingMessage="Loading members…"
          emptyMessage="No members yet."
          onRetry={() => refetchMembers()}
        >
          <div className="rounded-md border">
            <VirtualList
              items={members}
              rowHeight={MEMBER_ROW_HEIGHT}
              className="max-h-64 overflow-y-auto"
              renderRow={(member) => (
                <div key={member.userId} className="flex items-center gap-2 border-b px-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{member.name || member.email}</span>
                  <button
                    aria-label={`Remove ${member.name || member.email} from this team`}
                    onClick={() => handleRemoveMember(member)}
                    disabled={removeMemberMutation.isPending}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              )}
            />
            {hasNextMembers && (
              <div className="border-t p-2 text-center">
                <button
                  onClick={() => fetchNextMembers()}
                  disabled={isFetchingNextMembers}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {isFetchingNextMembers ? 'Loading…' : 'Load more members'}
                </button>
              </div>
            )}
          </div>
        </ListState>
        {removeMemberMutation.isError && (
          <p role="alert" className="text-sm text-destructive">Failed to remove member: {(removeMemberMutation.error as Error).message}</p>
        )}
        <AddMemberPicker teamId={team.id} orgId={orgId} memberIds={memberIds} />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Role grants</h3>
        <p className="text-xs text-muted-foreground">Roles a member holds specifically within this team, not the organization at large.</p>
        <ListState
          isLoading={grantsLoading}
          error={grantsError}
          isEmpty={!grantsLoading && !grantsError && grants.length === 0}
          loadingMessage="Loading grants…"
          emptyMessage="No roles granted at this team's scope yet."
          onRetry={() => refetchGrants()}
        >
          <div className="rounded-md border">
            <VirtualList
              items={grants}
              rowHeight={GRANT_ROW_HEIGHT}
              className="max-h-64 overflow-y-auto"
              renderRow={(grant) => (
                <div key={grant.id} className="flex items-center gap-2 border-b px-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{subjectLabel(grant)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{grant.roleName}</span>
                  <button
                    aria-label={`Revoke ${grant.roleName} from ${subjectLabel(grant)}`}
                    onClick={() => revokeMutation.mutate(grant.id)}
                    disabled={revokeMutation.isPending}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              )}
            />
            {hasNextGrants && (
              <div className="border-t p-2 text-center">
                <button
                  onClick={() => fetchNextGrants()}
                  disabled={isFetchingNextGrants}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {isFetchingNextGrants ? 'Loading…' : 'Load more grants'}
                </button>
              </div>
            )}
          </div>
        </ListState>
        {revokeMutation.isError && (
          <p role="alert" className="text-sm text-destructive">Failed to revoke grant: {(revokeMutation.error as Error).message}</p>
        )}

        {/* The subject is a member already on this roster, not a second
            search control - the org member search above is for "who is on
            this team", and once someone is, picking them from the roster
            they're already in is simpler than searching for them again. */}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); if (grantSubjectId && grantRoleId) grantMutation.mutate(); }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={`grant-member-${team.id}`} className="text-xs font-medium">Member</label>
            <select
              id={`grant-member-${team.id}`}
              value={grantSubjectId}
              onChange={(e) => setGrantSubjectId(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Choose a member…</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`grant-role-${team.id}`} className="text-xs font-medium">Role</label>
            <select
              id={`grant-role-${team.id}`}
              value={grantRoleId}
              onChange={(e) => setGrantRoleId(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Choose a role…</option>
              {(roles ?? []).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={!grantSubjectId || !grantRoleId || grantMutation.isPending}>
            {grantMutation.isPending ? 'Granting…' : 'Grant role'}
          </Button>
        </form>
        {grantMutation.isError && (
          <p role="alert" className="text-sm text-destructive">Failed to grant role: {(grantMutation.error as Error).message}</p>
        )}
      </section>

      {confirmDialog}
    </div>
  );
}

export function TeamsManager() {
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [createOpen, setCreateOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const {
    data: teamPages, isLoading, error, refetch,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['teams', activeOrgId, showArchived],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      teamClient.listTeams({ orgId: activeOrgId, onlyDeleted: showArchived, page: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
    enabled: !!activeOrgId,
  });
  const teams = useMemo(() => teamPages?.pages.flatMap((p) => p.teams) ?? [], [teamPages]);
  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null;

  const renameMutation = useMutation({
    mutationFn: (vars: { teamId: string; name: string }) => teamClient.updateTeam(vars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams', activeOrgId] }),
  });
  const archiveMutation = useMutation({
    mutationFn: (teamId: string) => teamClient.archiveTeam({ teamId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams', activeOrgId] }),
  });
  const restoreMutation = useMutation({
    mutationFn: (teamId: string) => teamClient.restoreTeam({ teamId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams', activeOrgId] }),
  });

  const handleRename = (teamId: string, name: string) => renameMutation.mutate({ teamId, name });
  const handleArchive = async (teamId: string, name: string) => {
    if (await confirm({
      title: `Archive "${name}"?`,
      consequence: 'The team stops appearing in lists, and its role grants no longer apply.',
      undo: 'You can restore it from here at any time.',
      confirmLabel: 'Archive team',
    })) {
      if (selectedTeamId === teamId) setSelectedTeamId(null);
      archiveMutation.mutate(teamId);
    }
  };
  const handleRestore = (teamId: string) => restoreMutation.mutate(teamId);

  if (!activeOrgId) {
    return <p className="p-4 text-sm text-muted-foreground">Select an organization to manage its teams.</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:flex-row">
      <div className="flex w-full flex-col gap-3 md:w-80 md:shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Teams</h1>
          <Button onClick={() => setCreateOpen(true)}>Create team</Button>
        </div>
        <button
          onClick={() => { setShowArchived((v) => !v); setSelectedTeamId(null); }}
          className="self-start text-xs text-muted-foreground hover:text-foreground"
        >
          {showArchived ? 'Show active teams' : 'Show archived teams'}
        </button>

        {renameMutation.isError && (
          <p role="alert" className="text-sm text-destructive">Failed to rename: {(renameMutation.error as Error).message}</p>
        )}
        {archiveMutation.isError && (
          <p role="alert" className="text-sm text-destructive">Failed to archive: {(archiveMutation.error as Error).message}</p>
        )}
        {restoreMutation.isError && (
          <p role="alert" className="text-sm text-destructive">Failed to restore: {(restoreMutation.error as Error).message}</p>
        )}

        <ListState
          isLoading={isLoading}
          error={error}
          isEmpty={!isLoading && !error && teams.length === 0}
          loadingMessage="Loading teams…"
          emptyMessage={showArchived ? 'No archived teams.' : 'No teams yet.'}
          onRetry={() => refetch()}
        >
          <div className="rounded-md border">
            <VirtualList
              items={teams}
              rowHeight={TEAM_ROW_HEIGHT}
              className="max-h-[60vh] overflow-y-auto"
              renderRow={(team) => (
                <TeamRow
                  key={team.id}
                  team={team}
                  isSelected={team.id === selectedTeamId}
                  isBusy={renameMutation.isPending || archiveMutation.isPending || restoreMutation.isPending}
                  onSelect={setSelectedTeamId}
                  onRename={handleRename}
                  onArchive={handleArchive}
                  onRestore={handleRestore}
                />
              )}
            />
            {hasNextPage && (
              <div className="border-t p-2 text-center">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {isFetchingNextPage ? 'Loading…' : 'Load more teams'}
                </button>
              </div>
            )}
          </div>
        </ListState>
      </div>

      <div className="min-w-0 flex-1">
        {selectedTeam ? (
          <TeamDetail team={selectedTeam} orgId={activeOrgId} />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Select a team to see its roster and role grants.</p>
        )}
      </div>

      <CreateTeamDialog open={createOpen} onClose={() => setCreateOpen(false)} orgId={activeOrgId} />
      {confirmDialog}
    </div>
  );
}
