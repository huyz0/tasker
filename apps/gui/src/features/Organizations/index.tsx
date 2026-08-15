import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { OrgService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { PaginationControls } from '../../components/PaginationControls';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDebounce } from 'use-debounce';
import { useConfirm } from '../../components/ui/ConfirmDialog';

const orgClient = createClient(OrgService, transport);

// Member rows are a fixed height, which is what lets the virtualizer skip
// per-row measurement. Kept beside the row's own style so the two cannot drift.
const MEMBER_ROW_HEIGHT = 57;

// An admin can promote/demote among these three; only an existing owner can
// grant or revoke the "owner" role itself (see updateOrgMemberRole on the
// backend) - the GUI mirrors that by never offering "Owner" as a pick here.
const ASSIGNABLE_ROLES = ['admin', 'member', 'viewer'];

// Rendered per member, memoised because the virtualizer re-renders this screen
// on almost every scroll frame: at ~100px/frame over 57px rows the visible range
// shifts continuously, and without memo all ~17 rows - each rebuilding a <select>
// and its options - re-render for the sake of the one or two that actually
// entered. Every prop here is a value or a stable callback so the comparison
// holds; passing an inline arrow would silently turn this back into a no-op.
const MemberRow = memo(function MemberRow({ member, index, top, roleBusy, removeBusy, onRoleChange, onRemove }: {
  member: any;
  index: number;
  top: number;
  roleBusy: boolean;
  removeBusy: boolean;
  onRoleChange: (userId: string, role: string) => void;
  onRemove: (userId: string, label: string) => void;
}) {
  const label = member.name || member.email || member.userId;
  return (
    <div
      data-index={index}
      // No measureElement: every row is the same height, so dynamic measurement
      // forces a layout read per row per frame to re-learn a constant. Measured
      // at 100k members it cost 14.6% dropped frames against a 0% empty-page
      // control (M03-T16). The explicit height keeps rows and the virtualizer's
      // estimate in step - if one changes, change both.
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: MEMBER_ROW_HEIGHT, transform: `translateY(${top}px)` }}
      className="grid grid-cols-[1fr_160px_80px] gap-2 p-3 text-sm items-center border-b">
      <div className="min-w-0">
        <div className="truncate font-medium">{label}</div>
        {member.email && member.name && <div className="truncate text-xs text-muted-foreground">{member.email}</div>}
      </div>
      <div>
        {member.role === 'owner' ? (
          <span className="text-xs text-muted-foreground px-2 py-1">Owner</span>
        ) : (
          <select
            aria-label={`Role for ${label}`}
            value={member.role}
            disabled={roleBusy}
            onChange={(e) => onRoleChange(member.userId, e.target.value)}
            className="w-full text-xs rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
          >
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
            ))}
          </select>
        )}
      </div>
      <div className="text-right">
        <button
          onClick={() => onRemove(member.userId, label)}
          disabled={removeBusy}
          className="text-muted-foreground hover:text-destructive text-xs disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    </div>
  );
});

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `org-${Date.now()}`;
}

type Section = 'organizations' | 'members';

export function OrganizationsDashboard() {
  const { confirm, confirmDialog } = useConfirm();
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const setActiveOrgId = useLayoutStore((s) => s.setActiveOrgId);
  const [section, setSection] = useState<Section>('organizations');
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgParentId, setNewOrgParentId] = useState('');
  const [showNewOrgForm, setShowNewOrgForm] = useState(false);
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  // Orgs with children are expanded by default - collapsing is opt-in per org.
  const [collapsedOrgIds, setCollapsedOrgIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  useEffect(() => setActivePageTitle('Organizations & Settings'), [setActivePageTitle]);

  const {
    data: orgsPages,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ['orgs', 'paginated'],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      return orgClient.listOrgs({ page: { cursor: pageParam } });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
  });

  // The parent-org dropdown needs every root org to pick from, not just
  // whatever page happens to be loaded - otherwise a root org past the first
  // page is simply impossible to select as a parent. Load the rest as soon
  // as the "New Organization" form (which is what needs the full list) opens.
  useEffect(() => {
    if (showNewOrgForm && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [showNewOrgForm, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Ancestors are parents of loaded children that did not fit on the same page
  // (M03-T09). Without them the tree drops those children entirely: they are in
  // the response, have a parentOrgId nothing matches, and so are never drawn.
  // Deduped by id, because a parent can arrive as an ancestor on one page and
  // as an ordinary row on the next.
  const orgsData = orgsPages
    ? [
        ...new Map(
          orgsPages.pages
            .flatMap((page) => [...page.organizations, ...(page.ancestors ?? [])])
            .map((o) => [o.id, o]),
        ).values(),
      ]
    : undefined;
  const nextCursor = orgsPages?.pages.at(-1)?.page?.nextCursor;

  // The active org is only ever a real default before the user's actual orgs
  // have loaded. Once we know what they really have, make sure the selection
  // points at something that exists instead of a placeholder ID.
  useEffect(() => {
    if (!orgsData || orgsData.length === 0) return;
    if (!orgsData.some((o) => o.id === activeOrgId)) {
      setActiveOrgId(orgsData[0].id);
    }
  }, [orgsData, activeOrgId, setActiveOrgId]);

  const createOrgMutation = useMutation({
    mutationFn: async (variables: { name: string; parentOrgId?: string }) => {
      const resp = await orgClient.seedOrg({ name: variables.name, slug: slugify(variables.name), parentOrgId: variables.parentOrgId });
      return resp.organization;
    },
    onSuccess: (org) => {
      queryClient.invalidateQueries({ queryKey: ['orgs'] });
      if (org) setActiveOrgId(org.id);
      setNewOrgName('');
      setNewOrgParentId('');
      setShowNewOrgForm(false);
    },
  });

  const rootOrgs = orgsData?.filter((o) => !o.parentOrgId) ?? [];
  const childOrgsByParent = new Map<string, typeof rootOrgs>();
  for (const org of orgsData ?? []) {
    if (!org.parentOrgId) continue;
    childOrgsByParent.set(org.parentOrgId, [...(childOrgsByParent.get(org.parentOrgId) ?? []), org]);
  }

  const archiveOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      await orgClient.archiveOrg({ orgId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orgs'] }),
  });

  const updateOrgMutation = useMutation({
    mutationFn: async (variables: { orgId: string; name: string; slug: string }) => {
      await orgClient.updateOrg({ orgId: variables.orgId, name: variables.name, slug: variables.slug });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgs'] });
      setEditingOrgId(null);
    },
  });

  const startEditing = (org: { id: string; name: string; slug: string }) => {
    setEditingOrgId(org.id);
    setEditName(org.name);
    setEditSlug(org.slug);
  };

  const activeOrg = orgsData?.find((o) => o.id === activeOrgId);
  const [retentionDaysInput, setRetentionDaysInput] = useState('');
  useEffect(() => {
    setRetentionDaysInput(String(activeOrg?.binRetentionDays || 30));
  }, [activeOrg?.binRetentionDays]);

  const setRetentionMutation = useMutation({
    mutationFn: async (days: number) => {
      await orgClient.setOrgRetentionDays({ orgId: activeOrgId, binRetentionDays: days });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orgs'] }),
  });

  // Search and the role facet are both server-side, and both are part of the
  // query key: a cursor minted against the unfiltered set means nothing against
  // a filtered one, so changing either must start a new list rather than append
  // to the old one.
  const [memberSearch, setMemberSearch] = useState('');
  const [debouncedMemberSearch] = useDebounce(memberSearch, 300);
  const [roleFacet, setRoleFacet] = useState('');

  const {
    data: membersPages,
    isLoading: isLoadingMembers,
    isFetchingNextPage: isFetchingMoreMembers,
    hasNextPage: hasMoreMembers,
    fetchNextPage: fetchMoreMembers,
  } = useInfiniteQuery({
    queryKey: ['orgMembers', activeOrgId, debouncedMemberSearch, roleFacet],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      orgClient.listOrgMembers({
        orgId: activeOrgId,
        role: roleFacet || undefined,
        page: {
          limit: 100,
          filter: debouncedMemberSearch || undefined,
          cursor: pageParam,
        },
      }),
    getNextPageParam: (last) => last.page?.nextCursor || undefined,
    enabled: !!activeOrgId,
  });

  const membersData = membersPages?.pages.flatMap((p) => p.members);
  // totalCount follows the filter, so this is "12 of 12" after a search that
  // narrows - which is how a user tells a working search from a broken one.
  const memberTotal = membersPages?.pages[0]?.page?.totalCount ?? 0;

  const memberScrollRef = useRef<HTMLDivElement>(null);
  const memberVirtualizer = useVirtualizer({
    count: membersData?.length ?? 0,
    getScrollElement: () => memberScrollRef.current,
    estimateSize: () => MEMBER_ROW_HEIGHT,
    overscan: 8,
  });

  // Fetch the next page while the user is still some rows from the end, so the
  // list does not stall at the boundary.
  const virtualMemberRows = memberVirtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualMemberRows[virtualMemberRows.length - 1];
    if (!last || !membersData) return;
    if (last.index >= membersData.length - 10 && hasMoreMembers && !isFetchingMoreMembers) {
      fetchMoreMembers();
    }
  }, [virtualMemberRows, membersData, hasMoreMembers, isFetchingMoreMembers, fetchMoreMembers]);

  // Whether the caller may manage invitations is the server's call, not a role
  // table copied into the client. listInvitations is admin-gated, so a failure
  // here means "not an admin" and the whole section hides rather than rendering
  // as a permanent permission error. retry:false so a denial settles once.
  const invitationsQuery = useQuery({
    queryKey: ['orgInvitations', activeOrgId],
    queryFn: async () => (await orgClient.listInvitations({ orgId: activeOrgId })).invitations,
    enabled: !!activeOrgId,
    retry: false,
  });
  // isSuccess, not !isError: with the latter the section renders during loading
  // and then vanishes when the denial arrives, which is a worse experience than
  // never showing it. The server's answer is what decides, so wait for one.
  const canManageInvites = invitationsQuery.isSuccess;

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');

  const inviteMutation = useMutation({
    mutationFn: async () => {
      await orgClient.inviteUser({ orgId: activeOrgId, email: inviteEmail.trim(), role: inviteRole });
    },
    onSuccess: () => {
      // Clear only on success: a failed send that wipes the field makes the
      // user retype an address they already typed.
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: ['orgInvitations', activeOrgId] });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      await orgClient.revokeInvitation({ invitationId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orgInvitations', activeOrgId] }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      await orgClient.removeOrgMember({ orgId: activeOrgId, userId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orgMembers', activeOrgId] }),
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: async (variables: { userId: string; role: string }) => {
      await orgClient.updateOrgMemberRole({ orgId: activeOrgId, userId: variables.userId, role: variables.role });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orgMembers', activeOrgId] }),
  });

  // Stable identities, or MemberRow's memo compares unequal every render and
  // buys nothing. mutate is referentially stable in react-query; activeOrgName
  // only changes when the user picks another organization, which re-renders the
  // rows anyway.
  const updateMemberRole = updateMemberRoleMutation.mutate;
  const removeMember = removeMemberMutation.mutate;
  const activeOrgName = activeOrg?.name;

  const handleMemberRoleChange = useCallback(
    (userId: string, role: string) => updateMemberRole({ userId, role }),
    [updateMemberRole],
  );
  const handleMemberRemove = useCallback(
    async (userId: string, label: string) => {
      if (await confirm({
        title: `Remove ${label} from "${activeOrgName}"?`,
        consequence: 'They lose access to everything in this organization.',
        undo: 'You can invite them back, but their role is not remembered.',
        confirmLabel: 'Remove member',
      })) removeMember(userId);
    },
    [removeMember, activeOrgName, confirm],
  );

  const toggleCollapsed = (orgId: string) => {
    setCollapsedOrgIds((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId); else next.add(orgId);
      return next;
    });
  };

  // Depth-first tree render: each org's children render immediately under it
  // (indented further per level), not as a flat list with a visual indent -
  // a real tree, collapsible per-node, rather than a two-tier flat list.
  const renderOrgNode = (org: { id: string; name: string; slug: string }, depth: number) => {
    const children = childOrgsByParent.get(org.id) ?? [];
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedOrgIds.has(org.id);
    const indent = 12 + depth * 24;

    if (editingOrgId === org.id) {
      return (
        <form
          key={org.id}
          onSubmit={(e) => {
            e.preventDefault();
            if (editName.trim() && editSlug.trim()) {
              updateOrgMutation.mutate({ orgId: org.id, name: editName.trim(), slug: editSlug.trim() });
            }
          }}
          className="p-3 text-sm flex items-center gap-2 border-t"
          style={{ paddingLeft: indent }}
        >
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Name"
            className="flex-1 rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          <input
            value={editSlug}
            onChange={(e) => setEditSlug(e.target.value)}
            placeholder="Slug"
            className="flex-1 rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            type="submit"
            disabled={!editName.trim() || !editSlug.trim() || updateOrgMutation.isPending}
            className="px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-md text-xs font-medium"
          >
            {updateOrgMutation.isPending ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setEditingOrgId(null)}
            className="px-3 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-xs font-medium"
          >
            Cancel
          </button>
        </form>
      );
    }

    return (
      <div key={org.id}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveOrgId(org.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveOrgId(org.id); } }}
          className={`p-3 text-sm flex justify-between items-center cursor-pointer hover:bg-muted/50 border-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${activeOrgId === org.id ? 'bg-primary/5' : ''}`}
          style={{ paddingLeft: indent }}
        >
          <span className="min-w-[200px] flex items-center gap-2">
            {hasChildren ? (
              <button
                aria-label={isCollapsed ? `Expand ${org.name}` : `Collapse ${org.name}`}
                onClick={(e) => { e.stopPropagation(); toggleCollapsed(org.id); }}
                className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
              >
                {isCollapsed ? '▶' : '▼'}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">{org.name.charAt(0).toUpperCase()}</span>
            <span className="truncate">{org.name}</span>
            {activeOrgId === org.id && <span className="text-xs bg-primary/20 text-primary px-2 rounded-full shrink-0">Active</span>}
          </span>
          <span className="flex items-center gap-3 shrink-0">
            <span className="px-2 py-0.5 rounded-full bg-secondary/50 text-xs text-secondary-foreground">{org.slug}</span>
            <button
              onClick={(e) => { e.stopPropagation(); startEditing(org); }}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Edit
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (await confirm({
                  title: `Move "${org.name}" to the bin?`,
                  consequence: 'The organization and everything inside it stop appearing in lists.',
                  undo: 'You can restore it from the Bin.',
                  confirmLabel: 'Move to bin',
                })) {
                  archiveOrgMutation.mutate(org.id);
                }
              }}
              disabled={archiveOrgMutation.isPending}
              className="text-muted-foreground hover:text-destructive text-xs disabled:opacity-50"
            >
              Delete
            </button>
          </span>
        </div>
        {hasChildren && !isCollapsed && children.map((child) => renderOrgNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Organizations & Settings</h1>
        <p className="text-muted-foreground mt-1">Manage hierarchical organizational structure and teams.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="col-span-1 border rounded-lg bg-card p-4 shadow-sm h-fit">
          <ul className="space-y-2">
            <li>
              <button
                onClick={() => setSection('organizations')}
                className={`w-full text-left p-2 rounded text-sm ${section === 'organizations' ? 'font-medium bg-muted' : 'hover:bg-muted/50'}`}
              >
                Organizations
              </button>
            </li>
            <li>
              <button
                onClick={() => setSection('members')}
                className={`w-full text-left p-2 rounded text-sm ${section === 'members' ? 'font-medium bg-muted' : 'hover:bg-muted/50'}`}
              >
                Roles & Permissions
              </button>
            </li>
          </ul>
        </div>
        <div className="col-span-1 md:col-span-3 border rounded-lg bg-card p-6 shadow-sm">
          {section === 'organizations' ? (
            <>
              <div className="flex justify-between mb-4">
                <h2 className="text-xl font-medium">Your Organizations</h2>
                <button
                  onClick={() => setShowNewOrgForm((v) => !v)}
                  className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors"
                >
                  New Organization
                </button>
              </div>
              {showNewOrgForm && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newOrgName.trim()) createOrgMutation.mutate({ name: newOrgName.trim(), parentOrgId: newOrgParentId || undefined });
                  }}
                  className="flex gap-2 mb-4"
                >
                  <input
                    autoFocus
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="Organization name"
                    className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <select
                    aria-label="Parent organization"
                    value={newOrgParentId}
                    onChange={(e) => setNewOrgParentId(e.target.value)}
                    className="rounded-md border bg-background px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">No parent (root org)</option>
                    {rootOrgs.map((org) => (
                      <option key={org.id} value={org.id}>Under {org.name}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={!newOrgName.trim() || createOrgMutation.isPending}
                    className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-md text-sm font-medium transition-colors"
                  >
                    {createOrgMutation.isPending ? 'Creating...' : 'Create'}
                  </button>
                </form>
              )}
              {createOrgMutation.isError && (
                <p className="text-sm text-destructive mb-4">Failed to create organization: {(createOrgMutation.error as Error).message}</p>
              )}
              {archiveOrgMutation.isError && (
                <p className="text-sm text-destructive mb-4">Failed to delete organization: {(archiveOrgMutation.error as Error).message}</p>
              )}
              {updateOrgMutation.isError && (
                <p className="text-sm text-destructive mb-4">Failed to update organization: {(updateOrgMutation.error as Error).message}</p>
              )}
              <div className="border rounded-md divide-y">
                 <div className="p-3 text-sm flex justify-between items-center bg-muted/30">
                   <span className="font-medium min-w-[200px]">Name</span>
                   <span className="font-medium">Slug</span>
                 </div>
                 {isLoading ? (
                   <div className="p-3 text-sm text-center text-muted-foreground">Loading organizations...</div>
                 ) : orgsData && orgsData.length > 0 ? (
                   rootOrgs.map(org => renderOrgNode(org, 0))
                 ) : (
                   <div className="p-3 text-sm text-center text-muted-foreground">No organizations found - create one above.</div>
                 )}
              </div>
              {orgsData && orgsData.length > 0 && (
                <PaginationControls
                  nextCursor={nextCursor}
                  isLoading={isFetchingNextPage}
                  onNextPage={() => fetchNextPage()}
                />
              )}

              {activeOrg && (
                <div className="mt-6 pt-6 border-t">
                  <h3 className="font-medium mb-2">Bin Retention</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Archived items in "{activeOrg.name}" are permanently deleted this many days after being moved to the bin, unless restored first.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const days = parseInt(retentionDaysInput, 10);
                      if (days > 0) setRetentionMutation.mutate(days);
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="number"
                      min={1}
                      value={retentionDaysInput}
                      onChange={(e) => setRetentionDaysInput(e.target.value)}
                      className="w-24 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <span className="text-sm text-muted-foreground">days</span>
                    <button
                      type="submit"
                      disabled={setRetentionMutation.isPending}
                      className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-sm font-medium disabled:opacity-50"
                    >
                      {setRetentionMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </form>
                  {!(parseInt(retentionDaysInput, 10) > 0) && (
                    <p className="text-sm text-destructive mt-2">Enter a number of days greater than 0.</p>
                  )}
                  {setRetentionMutation.isError && (
                    <p className="text-sm text-destructive mt-2">Failed to update retention: {(setRetentionMutation.error as Error).message}</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="mb-4">
                <h2 className="text-xl font-medium">Roles & Permissions</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {activeOrg ? <>Members of <span className="font-medium text-foreground">{activeOrg.name}</span> and the role each one holds.</> : 'Select an organization to manage its members.'}
                </p>
              </div>
              <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-end">
                <div className="flex-1 min-w-0">
                  <label htmlFor="member-search" className="block text-xs font-medium text-muted-foreground mb-1">
                    Search members
                  </label>
                  <input
                    id="member-search"
                    type="search"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Name or email"
                    className="w-full text-sm rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label htmlFor="member-role-facet" className="block text-xs font-medium text-muted-foreground mb-1">
                    Filter by role
                  </label>
                  <select
                    id="member-role-facet"
                    value={roleFacet}
                    onChange={(e) => setRoleFacet(e.target.value)}
                    className="w-full md:w-40 text-sm rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">All roles</option>
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              </div>

              {!isLoadingMembers && (
                <p className="text-xs text-muted-foreground mb-2" data-testid="member-count">
                  Showing {membersData?.length ?? 0} of {memberTotal}
                </p>
              )}

              <div className="border rounded-md overflow-hidden mb-4">
                <div className="grid grid-cols-[1fr_160px_80px] gap-2 p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground bg-muted/30">
                  <span>User</span>
                  <span>Role</span>
                  <span className="text-right">Actions</span>
                </div>
                {isLoadingMembers ? (
                  <div className="p-3 text-sm text-center text-muted-foreground">Loading members...</div>
                ) : membersData && membersData.length > 0 ? (
                  <div
                    ref={memberScrollRef}
                    // Only the visible rows exist in the DOM, so the real size
                    // is not discoverable by tabbing - aria-rowcount carries it.
                    role="rowgroup"
                    aria-rowcount={memberTotal}
                    className="max-h-[32rem] overflow-y-auto"
                  >
                    <div style={{ height: memberVirtualizer.getTotalSize(), position: 'relative' }}>
                      {virtualMemberRows.map((virtualRow) => {
                        const m = membersData[virtualRow.index]!;
                        return (
                          <MemberRow
                            key={m.userId}
                            member={m}
                            index={virtualRow.index}
                            top={virtualRow.start}
                            roleBusy={updateMemberRoleMutation.isPending}
                            removeBusy={removeMemberMutation.isPending}
                            onRoleChange={handleMemberRoleChange}
                            onRemove={handleMemberRemove}
                          />
                        );
                      })}
                    </div>
                    {isFetchingMoreMembers && (
                      <div className="p-3 text-sm text-center text-muted-foreground">Loading more...</div>
                    )}
                  </div>
                ) : debouncedMemberSearch || roleFacet ? (
                  // Naming the query matters: it tells the user the search ran
                  // and matched nothing, rather than that the table broke.
                  <div className="p-6 text-sm text-center text-muted-foreground">
                    <p>
                      No members match
                      {debouncedMemberSearch ? <> &ldquo;<span className="text-foreground">{debouncedMemberSearch}</span>&rdquo;</> : null}
                      {roleFacet ? <> with the <span className="text-foreground">{roleFacet}</span> role</> : null}.
                    </p>
                    <button
                      onClick={() => { setMemberSearch(''); setRoleFacet(''); }}
                      className="mt-2 text-primary hover:underline outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div className="p-3 text-sm text-center text-muted-foreground">No members found.</div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Owner</strong> has full control (always at least one required). <strong className="text-foreground">Admin</strong> manages members and org settings. <strong className="text-foreground">Member</strong> is a normal contributor. <strong className="text-foreground">Viewer</strong> is read-only.
              </p>
              {removeMemberMutation.isError && (
                <p className="text-sm text-destructive mt-2">Failed to remove member: {(removeMemberMutation.error as Error).message}</p>
              )}
              {updateMemberRoleMutation.isError && (
                <p className="text-sm text-destructive mt-2">Failed to update role: {(updateMemberRoleMutation.error as Error).message}</p>
              )}

              {canManageInvites && (
                <div className="mt-8">
                  <h3 className="text-base font-medium">Invite someone</h3>
                  <p className="text-sm text-muted-foreground mt-1 mb-3">
                    They join {activeOrg?.name ?? 'this organization'} the first time they sign in. Invitations expire after 14 days.
                  </p>
                  <form
                    className="flex flex-col gap-2 sm:flex-row sm:items-end"
                    onSubmit={(e) => { e.preventDefault(); if (inviteEmail.trim()) inviteMutation.mutate(); }}
                  >
                    <div className="flex-1 min-w-0">
                      <label htmlFor="invite-email" className="block text-xs font-medium text-muted-foreground mb-1">Email address</label>
                      <input
                        id="invite-email"
                        type="email"
                        required
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="person@example.com"
                        className="w-full text-sm rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label htmlFor="invite-role" className="block text-xs font-medium text-muted-foreground mb-1">Role</label>
                      <select
                        id="invite-role"
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="w-full sm:w-40 text-sm rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        {ASSIGNABLE_ROLES.map((role) => (
                          <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={inviteMutation.isPending || !inviteEmail.trim()}
                      className="text-sm rounded-md bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      {inviteMutation.isPending ? 'Sending...' : 'Send invite'}
                    </button>
                  </form>
                  {inviteMutation.isError && (
                    <p className="text-sm text-destructive mt-2">Failed to send invite: {(inviteMutation.error as Error).message}</p>
                  )}

                  {(invitationsQuery.data?.length ?? 0) > 0 ? (
                    <div className="mt-6">
                      <h4 className="text-sm font-medium mb-2">
                        Pending invitations ({invitationsQuery.data!.length})
                      </h4>
                      <div className="border rounded-md divide-y">
                        {invitationsQuery.data!.map((inv) => (
                          <div key={inv.id} className="grid grid-cols-[1fr_100px_140px_60px] gap-2 p-3 text-sm items-center">
                            <span className="truncate">{inv.email}</span>
                            <span className="text-xs text-muted-foreground capitalize">{inv.role}</span>
                            <span>
                              {inv.expired ? (
                                <span className="text-xs rounded px-2 py-0.5 bg-warning-subtle text-warning-subtle-foreground">Expired</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Pending</span>
                              )}
                            </span>
                            <span className="text-right">
                              <button
                                aria-label={`Revoke invitation for ${inv.email}`}
                                disabled={revokeInviteMutation.isPending}
                                onClick={async () => {
                                  if (await confirm({
                                    title: `Revoke the invitation for ${inv.email}?`,
                                    consequence: 'Their invitation link stops working.',
                                    undo: 'You can invite the same address again.',
                                    confirmLabel: 'Revoke invitation',
                                  })) {
                                    revokeInviteMutation.mutate(inv.id);
                                  }
                                }}
                                className="text-muted-foreground hover:text-destructive text-xs disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
                              >
                                Revoke
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                      {revokeInviteMutation.isError && (
                        <p className="text-sm text-destructive mt-2">Failed to revoke: {(revokeInviteMutation.error as Error).message}</p>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
