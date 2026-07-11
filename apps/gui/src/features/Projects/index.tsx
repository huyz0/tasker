import { useEffect, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { RepositoryIntegrationConfig } from '../../components/ui/repositories/RepositoryIntegrationConfig';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { ProjectService, ProjectTemplateService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { PaginationControls } from '../../components/PaginationControls';

const projectClient = createClient(ProjectService, transport);
const templateClient = createClient(ProjectTemplateService, transport);

export function ProjectsWizard() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const { userId: activeOwnerId } = useAuthSession();
  const [projectName, setProjectName] = useState('');

  const queryClient = useQueryClient();
  useEffect(() => setActivePageTitle('Projects'), [setActivePageTitle]);

  const { data: templatesData, isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['templates', activeOrgId],
    queryFn: async () => {
      const resp = await templateClient.listTemplates({ orgId: activeOrgId });
      return resp.templates;
    }
  });

  const {
    data: projectsPages,
    isLoading: isLoadingProjects,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['projects', activeOrgId],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      return projectClient.listProjects({ orgId: activeOrgId, page: { cursor: pageParam } });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
  });

  const projectsData = projectsPages?.pages.flatMap((page) => page.projects);
  const nextCursor = projectsPages?.pages.at(-1)?.page?.nextCursor;

  const createProjectMutation = useMutation({
    mutationFn: async (templateId: string) => {
      if (!activeOwnerId) throw new Error('No authenticated user - cannot determine project owner.');
      const resp = await projectClient.createProject({
        orgId: activeOrgId,
        templateId,
        name: projectName.trim(),
        ownerId: activeOwnerId
      });
      return resp.project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', activeOrgId] });
      setProjectName('');
    }
  });

  const archiveProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await projectClient.archiveProject({ projectId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', activeOrgId] }),
  });

  return (
    <div className="flex flex-col gap-8 pb-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
        <p className="text-muted-foreground mt-1">Manage derived project templates and ownership.</p>
      </div>

      <section>
        <h2 className="text-xl font-medium mb-4">Start from a Template</h2>
        <div className="mb-4">
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="New project name"
            className="w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        {createProjectMutation.isError && (
          <p className="text-sm text-destructive mb-4">Failed to create project: {(createProjectMutation.error as Error).message}</p>
        )}
        {isLoadingTemplates ? (
           <p className="text-sm text-muted-foreground">Loading templates...</p>
        ) : templatesData && templatesData.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {templatesData.map(t => (
              <div key={t.id} className="border rounded-lg bg-card p-6 shadow-sm hover:border-primary cursor-pointer transition-all flex flex-col h-full">
                 <div className="w-10 h-10 mb-4 rounded bg-primary/10 flex items-center justify-center text-primary text-xl">
                   📦
                 </div>
                 <h3 className="font-semibold text-lg">{t.name}</h3>
                 <p className="text-sm text-muted-foreground mt-1 mb-6 flex-grow">{t.description}</p>
                 <button
                   onClick={() => createProjectMutation.mutate(t.id)}
                   disabled={createProjectMutation.isPending || !projectName.trim()}
                   className="w-full px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                 >
                   {createProjectMutation.isPending ? 'Creating...' : 'Use Template'}
                 </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No templates available. Seed them from the backend first.</p>
        )}
      </section>

      <section>
        <h2 className="text-xl font-medium mb-4 border-t pt-8">Your Projects</h2>
        {isLoadingProjects ? (
           <p className="text-sm text-muted-foreground">Loading projects...</p>
        ) : projectsData && projectsData.length > 0 ? (
          <div className="flex flex-col gap-6">
            {projectsData.map(p => (
              <div key={p.id} className="border rounded-lg bg-card p-6 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">{p.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">ID: {p.id}</p>
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm(`Move "${p.name}" to the bin? You can restore it later.`)) {
                        archiveProjectMutation.mutate(p.id);
                      }
                    }}
                    disabled={archiveProjectMutation.isPending}
                    className="text-muted-foreground hover:text-destructive text-sm disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
                <RepositoryIntegrationConfig projectId={p.id} />
              </div>
            ))}
            {archiveProjectMutation.isError && (
              <p className="text-sm text-destructive">Failed to delete project: {(archiveProjectMutation.error as Error).message}</p>
            )}
            <PaginationControls
              nextCursor={nextCursor}
              isLoading={isFetchingNextPage}
              onNextPage={() => fetchNextPage()}
            />
          </div>
        ) : (
           <p className="text-sm text-muted-foreground">No projects found. Create one from a template above.</p>
        )}
      </section>
    </div>
  );
}
