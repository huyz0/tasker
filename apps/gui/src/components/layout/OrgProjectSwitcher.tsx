import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { OrgService, ProjectService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore } from '../../store/layout';

const orgClient = createClient(OrgService, transport);
const projectClient = createClient(ProjectService, transport);

export function OrgProjectSwitcher() {
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  const setActiveOrgId = useLayoutStore((s) => s.setActiveOrgId);
  const setActiveProjectId = useLayoutStore((s) => s.setActiveProjectId);

  // Every org/project must be selectable here - it's the app's primary
  // navigation switcher, so anything past the first page would otherwise be
  // completely unreachable, not just hidden in a secondary view.
  const { data: orgsData, isLoading: orgsLoading } = useQuery({
    queryKey: ['orgs'],
    queryFn: async () => {
      const allOrgs: Awaited<ReturnType<typeof orgClient.listOrgs>>['organizations'] = [];
      let cursor: string | undefined;
      do {
        const resp = await orgClient.listOrgs({ page: cursor ? { cursor } : undefined });
        allOrgs.push(...resp.organizations);
        cursor = resp.page?.nextCursor || undefined;
      } while (cursor);
      return allOrgs;
    },
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects', activeOrgId],
    queryFn: async () => {
      const allProjects: Awaited<ReturnType<typeof projectClient.listProjects>>['projects'] = [];
      let cursor: string | undefined;
      do {
        const resp = await projectClient.listProjects({ orgId: activeOrgId, page: cursor ? { cursor } : undefined });
        allProjects.push(...resp.projects);
        cursor = resp.page?.nextCursor || undefined;
      } while (cursor);
      return allProjects;
    },
    enabled: Boolean(activeOrgId),
  });

  const orgs = Array.isArray(orgsData) ? orgsData : [];
  const projects = Array.isArray(projectsData) ? projectsData : [];

  useEffect(() => {
    if (orgs.length === 0) return;
    if (!orgs.some((o) => o.id === activeOrgId)) {
      setActiveOrgId(orgs[0].id);
    }
  }, [orgs, activeOrgId, setActiveOrgId]);

  useEffect(() => {
    if (projects.length === 0) return;
    if (!projects.some((p) => p.id === activeProjectId)) {
      setActiveProjectId(projects[0].id);
    }
  }, [projects, activeProjectId, setActiveProjectId]);

  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-b">
      <select
        aria-label="Active organization"
        value={activeOrgId}
        onChange={(e) => setActiveOrgId(e.target.value)}
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
      >
        {!orgs.some((o) => o.id === activeOrgId) && (
          <option value={activeOrgId}>{orgsLoading ? 'Loading organizations...' : 'No organizations'}</option>
        )}
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>{org.name}</option>
        ))}
      </select>
      <select
        aria-label="Active project"
        value={activeProjectId}
        onChange={(e) => setActiveProjectId(e.target.value)}
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
      >
        {projects.length === 0 ? (
          <option value={activeProjectId}>No projects</option>
        ) : (
          projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))
        )}
      </select>
    </div>
  );
}
