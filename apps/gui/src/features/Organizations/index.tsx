import { useEffect, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { OrgService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { PaginationControls } from '../../components/PaginationControls';

const orgClient = createClient(OrgService, transport);

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `org-${Date.now()}`;
}

export function OrganizationsDashboard() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const setActiveOrgId = useLayoutStore((s) => s.setActiveOrgId);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgParentId, setNewOrgParentId] = useState('');
  const [showNewOrgForm, setShowNewOrgForm] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => setActivePageTitle('Organizations & Settings'), [setActivePageTitle]);

  const {
    data: orgsPages,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['orgs', 'paginated'],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      return orgClient.listOrgs({ page: { cursor: pageParam } });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
  });

  const orgsData = orgsPages?.pages.flatMap((page) => page.organizations);
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Organizations & Settings</h1>
        <p className="text-muted-foreground mt-1">Manage hierarchical organizational structure and teams.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="col-span-1 border rounded-lg bg-card p-4 shadow-sm">
          <ul className="space-y-2">
            <li className="font-medium bg-muted p-2 rounded">Organizations</li>
            <li className="p-2 text-muted-foreground hover:bg-muted/50 rounded cursor-pointer">Roles & Permissions</li>
            <li className="p-2 text-muted-foreground hover:bg-muted/50 rounded cursor-pointer">Security</li>
          </ul>
        </div>
        <div className="col-span-1 md:col-span-3 border rounded-lg bg-card p-6 shadow-sm">
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
          <div className="border rounded-md divide-y">
             <div className="p-3 text-sm flex justify-between items-center bg-muted/30">
               <span className="font-medium min-w-[200px]">Name</span>
               <span className="font-medium">Slug</span>
             </div>
             {isLoading ? (
               <div className="p-3 text-sm text-center text-muted-foreground">Loading organizations...</div>
             ) : orgsData && orgsData.length > 0 ? (
               rootOrgs.map(org => (
                 <div key={org.id}>
                   <div onClick={() => setActiveOrgId(org.id)} className={`p-3 text-sm flex justify-between items-center cursor-pointer hover:bg-muted/50 ${activeOrgId === org.id ? 'bg-primary/5' : ''}`}>
                     <span className="min-w-[200px] flex items-center gap-2">
                       <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center font-bold">{org.name.charAt(0).toUpperCase()}</span>
                       {org.name} {activeOrgId === org.id && <span className="text-xs bg-primary/20 text-primary px-2 rounded-full">Active</span>}
                     </span>
                     <span className="flex items-center gap-3">
                       <span className="px-2 py-0.5 rounded-full bg-secondary/50 text-xs text-secondary-foreground">{org.slug}</span>
                       <button
                         onClick={(e) => {
                           e.stopPropagation();
                           if (window.confirm(`Move "${org.name}" to the bin? You can restore it later.`)) {
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
                   {(childOrgsByParent.get(org.id) ?? []).map((child) => (
                     <div key={child.id} onClick={() => setActiveOrgId(child.id)} className={`p-3 pl-10 text-sm flex justify-between items-center cursor-pointer hover:bg-muted/50 border-t ${activeOrgId === child.id ? 'bg-primary/5' : ''}`}>
                       <span className="min-w-[200px] flex items-center gap-2">
                         <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center font-bold">{child.name.charAt(0).toUpperCase()}</span>
                         {child.name} {activeOrgId === child.id && <span className="text-xs bg-primary/20 text-primary px-2 rounded-full">Active</span>}
                       </span>
                       <span className="flex items-center gap-3">
                         <span className="px-2 py-0.5 rounded-full bg-secondary/50 text-xs text-secondary-foreground">{child.slug}</span>
                         <button
                           onClick={(e) => {
                             e.stopPropagation();
                             if (window.confirm(`Move "${child.name}" to the bin? You can restore it later.`)) {
                               archiveOrgMutation.mutate(child.id);
                             }
                           }}
                           disabled={archiveOrgMutation.isPending}
                           className="text-muted-foreground hover:text-destructive text-xs disabled:opacity-50"
                         >
                           Delete
                         </button>
                       </span>
                     </div>
                   ))}
                 </div>
               ))
             ) : (
               <div className="p-3 text-sm text-center text-muted-foreground">No organizations found.</div>
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
              {setRetentionMutation.isError && (
                <p className="text-sm text-destructive mt-2">Failed to update retention: {(setRetentionMutation.error as Error).message}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
