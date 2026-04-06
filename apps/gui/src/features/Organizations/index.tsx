import { useEffect } from 'react';
import { useLayoutStore } from '../../store/layout';

export function OrganizationsDashboard() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  useEffect(() => setActivePageTitle('Organizations & Settings'), [setActivePageTitle]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Organizations & Settings</h1>
        <p className="text-muted-foreground mt-1">Manage hierarchical organizational structure and teams.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="col-span-1 border rounded-lg bg-card p-4 shadow-sm">
          <ul className="space-y-2">
            <li className="font-medium bg-muted p-2 rounded">Members</li>
            <li className="p-2 text-muted-foreground hover:bg-muted/50 rounded cursor-pointer">Roles & Permissions</li>
            <li className="p-2 text-muted-foreground hover:bg-muted/50 rounded cursor-pointer">Security</li>
          </ul>
        </div>
        <div className="col-span-1 md:col-span-3 border rounded-lg bg-card p-6 shadow-sm">
          <div className="flex justify-between mb-4">
            <h2 className="text-xl font-medium">Team Members</h2>
            <button className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors">Invite Member</button>
          </div>
          <div className="border rounded-md divide-y">
             <div className="p-3 text-sm flex justify-between items-center bg-muted/30">
               <span className="font-medium min-w-[200px]">Name</span>
               <span className="font-medium">Role</span>
               <span className="font-medium">Status</span>
             </div>
             <div className="p-3 text-sm flex justify-between items-center">
               <span className="min-w-[200px] flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center font-bold">A</span> Admin User</span>
               <span className="px-2 py-0.5 rounded-full bg-secondary/50 text-xs text-secondary-foreground">Admin</span>
               <span className="text-green-500">● Active</span>
             </div>
             <div className="p-3 text-sm flex justify-between items-center">
               <span className="min-w-[200px] flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-500 flex items-center justify-center font-bold">M</span> Member One</span>
               <span className="px-2 py-0.5 rounded-full bg-secondary/50 text-xs text-secondary-foreground">Member</span>
               <span className="text-muted-foreground">○ Offline</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
