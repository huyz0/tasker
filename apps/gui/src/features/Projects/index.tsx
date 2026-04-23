import { useEffect } from 'react';
import { useLayoutStore } from '../../store/layout';
import { RepositoryIntegrationConfig } from '../../components/ui/repositories/RepositoryIntegrationConfig';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { ProjectService, ProjectTemplateService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";

const transport = createConnectTransport({
  baseUrl: "http://localhost:8080",
});
const projectClient = createClient(ProjectService, transport);
const templateClient = createClient(ProjectTemplateService, transport);

// HARDCODED orgId and ownerId for MVP
const MOCK_ORG_ID = "org-1";
const MOCK_OWNER_ID = "usr-1";

export function ProjectsWizard() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const queryClient = useQueryClient();
  useEffect(() => setActivePageTitle('Projects'), [setActivePageTitle]);

  const { data: templatesData, isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['templates', MOCK_ORG_ID],
    queryFn: async () => {
      const resp = await templateClient.listTemplates({ orgId: MOCK_ORG_ID });
      return resp.templates;
    }
  });

  const { data: projectsData, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects', MOCK_ORG_ID],
    queryFn: async () => {
      const resp = await projectClient.listProjects({ orgId: MOCK_ORG_ID });
      return resp.projects;
    }
  });

  const createProjectMutation = useMutation({
    mutationFn: async (templateId: string) => {
      // Find template name to derive project name
      const template = templatesData?.find(t => t.id === templateId);
      const name = `${template?.name || 'New'} Project - ${Math.random().toString(36).substring(7)}`;
      const resp = await projectClient.createProject({
        orgId: MOCK_ORG_ID,
        templateId,
        name,
        ownerId: MOCK_OWNER_ID
      });
      return resp.project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', MOCK_ORG_ID] });
    }
  });

  return (
    <div className="flex flex-col gap-8 pb-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
        <p className="text-muted-foreground mt-1">Manage derived project templates and ownership.</p>
      </div>

      <section>
        <h2 className="text-xl font-medium mb-4">Start from a Template</h2>
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
                   disabled={createProjectMutation.isPending}
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
                </div>
                <RepositoryIntegrationConfig projectId={p.id} />
              </div>
            ))}
          </div>
        ) : (
           <p className="text-sm text-muted-foreground">No projects found. Create one from a template above.</p>
        )}
      </section>
    </div>
  );
}
