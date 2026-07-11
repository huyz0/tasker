import { useEffect, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { OrgService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";

const orgClient = createClient(OrgService, transport);

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `org-${Date.now()}`;
}

export function OrganizationsDashboard() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const setActiveOrgId = useLayoutStore((s) => s.setActiveOrgId);
  const [newOrgName, setNewOrgName] = useState('');
  const [showNewOrgForm, setShowNewOrgForm] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => setActivePageTitle('Organizations & Settings'), [setActivePageTitle]);

  const { data: orgsData, isLoading } = useQuery({
    queryKey: ['orgs'],
    queryFn: async () => {
      const resp = await orgClient.listOrgs({});
      return resp.organizations;
    }
  });

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
    mutationFn: async (name: string) => {
      const resp = await orgClient.seedOrg({ name, slug: slugify(name) });
      return resp.organization;
    },
    onSuccess: (org) => {
      queryClient.invalidateQueries({ queryKey: ['orgs'] });
      if (org) setActiveOrgId(org.id);
      setNewOrgName('');
      setShowNewOrgForm(false);
    },
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
                if (newOrgName.trim()) createOrgMutation.mutate(newOrgName.trim());
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
          <div className="border rounded-md divide-y">
             <div className="p-3 text-sm flex justify-between items-center bg-muted/30">
               <span className="font-medium min-w-[200px]">Name</span>
               <span className="font-medium">Slug</span>
             </div>
             {isLoading ? (
               <div className="p-3 text-sm text-center text-muted-foreground">Loading organizations...</div>
             ) : orgsData && orgsData.length > 0 ? (
               orgsData.map(org => (
                 <div key={org.id} onClick={() => setActiveOrgId(org.id)} className={`p-3 text-sm flex justify-between items-center cursor-pointer hover:bg-muted/50 ${activeOrgId === org.id ? 'bg-primary/5' : ''}`}>
                   <span className="min-w-[200px] flex items-center gap-2">
                     <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center font-bold">{org.name.charAt(0).toUpperCase()}</span>
                     {org.name} {activeOrgId === org.id && <span className="text-xs bg-primary/20 text-primary px-2 rounded-full">Active</span>}
                   </span>
                   <span className="px-2 py-0.5 rounded-full bg-secondary/50 text-xs text-secondary-foreground">{org.slug}</span>
                 </div>
               ))
             ) : (
               <div className="p-3 text-sm text-center text-muted-foreground">No organizations found.</div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
