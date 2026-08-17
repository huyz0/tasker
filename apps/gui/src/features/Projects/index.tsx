import { useEffect, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { RepositoryIntegrationConfig } from '../../components/ui/repositories/RepositoryIntegrationConfig';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { ProjectService, ProjectTemplateService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { PaginationControls } from '../../components/PaginationControls';
import { Package } from 'lucide-react';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { VirtualList } from '../../components/ui/VirtualList';
import { ListState } from '../../components/ui/ListState';

// Only the estimate used before a card has been measured — `measureRows` reads
// the real height, because a card grows when its edit form opens.
const PROJECT_ROW_HEIGHT = 220;

const projectClient = createClient(ProjectService, transport);
const templateClient = createClient(ProjectTemplateService, transport);

export function ProjectsWizard() {
  const { confirm, confirmDialog } = useConfirm();
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const { userId: activeOwnerId } = useAuthSession();
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editTemplateName, setEditTemplateName] = useState('');
  const [editTemplateDescription, setEditTemplateDescription] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');

  const queryClient = useQueryClient();
  useEffect(() => setActivePageTitle('Projects'), [setActivePageTitle]);

  const { data: templatesData, isLoading: isLoadingTemplates, error: templatesError, refetch: refetchTemplates } = useQuery({
    queryKey: ['templates', activeOrgId],
    queryFn: async () => {
      const resp = await templateClient.listTemplates({ orgId: activeOrgId });
      return resp.templates;
    },
    enabled: !!activeOrgId,
  });

  const {
    data: projectsPages,
    isLoading: isLoadingProjects,
    error: projectsError,
    refetch: refetchProjects,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['projects', 'paginated', activeOrgId],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      return projectClient.listProjects({ orgId: activeOrgId, page: { cursor: pageParam } });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
    enabled: !!activeOrgId,
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
        ownerId: activeOwnerId,
        description: projectDescription.trim(),
      });
      return resp.project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', 'paginated', activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ['projects', activeOrgId] });
      setProjectName('');
      setProjectDescription('');
    }
  });

  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      await templateClient.createTemplate({
        orgId: activeOrgId,
        name: newTemplateName.trim(),
        description: newTemplateDescription.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', activeOrgId] });
      setNewTemplateName('');
      setNewTemplateDescription('');
      setIsAddingTemplate(false);
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async (variables: { id: string; name: string; description: string }) => {
      await templateClient.updateTemplate({ id: variables.id, name: variables.name, description: variables.description });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', activeOrgId] });
      setEditingTemplateId(null);
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async (variables: { projectId: string; name: string; description: string }) => {
      await projectClient.updateProject(variables);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', 'paginated', activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ['projects', activeOrgId] });
      setEditingProjectId(null);
    },
  });

  const archiveProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await projectClient.archiveProject({ projectId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', 'paginated', activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ['projects', 'bin', activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ['projects', activeOrgId] });
    },
  });

  return (
    <div className="flex flex-col gap-8 pb-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
        <p className="text-muted-foreground mt-1">Manage derived project templates and ownership.</p>
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium">Start from a Template</h2>
          <button
            onClick={() => setIsAddingTemplate((v) => !v)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {isAddingTemplate ? 'Cancel' : '+ New Template'}
          </button>
        </div>

        {isAddingTemplate && (
          <form
            className="mb-6 border rounded-lg bg-card p-4 flex flex-col gap-3 max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              if (newTemplateName.trim()) createTemplateMutation.mutate();
            }}
          >
            <input
              autoFocus
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="Template name"
              className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
            <textarea
              value={newTemplateDescription}
              onChange={(e) => setNewTemplateDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
            {createTemplateMutation.isError && (
              <p className="text-sm text-destructive">Failed to create template: {(createTemplateMutation.error as Error).message}</p>
            )}
            <button
              type="submit"
              disabled={createTemplateMutation.isPending || !newTemplateName.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:bg-muted disabled:text-muted-foreground"
            >
              {createTemplateMutation.isPending ? 'Creating...' : 'Create Template'}
            </button>
          </form>
        )}

        <div className="mb-4 flex flex-col gap-2 max-w-sm">
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="New project name"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          <label className="sr-only" htmlFor="new-project-description">Project description</label>
          <textarea
            id="new-project-description"
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            placeholder="What is this project for? (optional)"
            rows={2}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-xs text-muted-foreground">Enter a project name, then pick a template below to create it.</p>
        </div>
        {createProjectMutation.isError && (
          <p className="text-sm text-destructive mb-4">Failed to create project: {(createProjectMutation.error as Error).message}</p>
        )}
        <ListState
          isLoading={isLoadingTemplates}
          error={templatesError}
          isEmpty={!templatesData || templatesData.length === 0}
          loadingMessage="Loading templates…"
          emptyMessage="No templates yet."
          emptyAction={<p className="text-xs">Create one above to start a project from it.</p>}
          onRetry={() => refetchTemplates()}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {(templatesData ?? []).map(t => (
              <div key={t.id} className="border rounded-lg bg-card p-6 shadow-sm hover:border-primary transition-colors flex flex-col h-full">
                 <div className="w-10 h-10 mb-4 rounded bg-primary-subtle flex items-center justify-center text-primary-subtle-foreground">
                   <Package className="w-5 h-5" />
                 </div>
                 {editingTemplateId === t.id ? (
                   <form
                     onSubmit={(e) => {
                       e.preventDefault();
                       if (editTemplateName.trim()) {
                         updateTemplateMutation.mutate({ id: t.id, name: editTemplateName.trim(), description: editTemplateDescription.trim() });
                       }
                     }}
                     className="flex flex-col gap-2 mb-4"
                   >
                     <input
                       autoFocus
                       value={editTemplateName}
                       onChange={(e) => setEditTemplateName(e.target.value)}
                       className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                     />
                     <textarea
                       value={editTemplateDescription}
                       onChange={(e) => setEditTemplateDescription(e.target.value)}
                       rows={2}
                       className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                     />
                     {updateTemplateMutation.isError && (
                       <p className="text-sm text-destructive">Failed to update template: {(updateTemplateMutation.error as Error).message}</p>
                     )}
                     <div className="flex gap-2">
                       <button
                         type="submit"
                         disabled={!editTemplateName.trim() || updateTemplateMutation.isPending}
                         className="flex-1 px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-md text-xs font-medium"
                       >
                         {updateTemplateMutation.isPending ? 'Saving...' : 'Save'}
                       </button>
                       <button
                         type="button"
                         onClick={() => setEditingTemplateId(null)}
                         className="flex-1 px-3 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-xs font-medium"
                       >
                         Cancel
                       </button>
                     </div>
                   </form>
                 ) : (
                   <>
                     <div className="flex items-start justify-between gap-2">
                       <h3 className="font-semibold text-lg">{t.name}</h3>
                       <button
                         onClick={() => {
                           setEditingTemplateId(t.id);
                           setEditTemplateName(t.name);
                           setEditTemplateDescription(t.description);
                         }}
                         className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                       >
                         Edit
                       </button>
                     </div>
                     <p className="text-sm text-muted-foreground mt-1 mb-6 flex-grow">{t.description}</p>
                     <button
                       onClick={() => createProjectMutation.mutate(t.id)}
                       disabled={createProjectMutation.isPending || !projectName.trim()}
                       className="w-full px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                     >
                       {createProjectMutation.isPending ? 'Creating...' : 'Use Template'}
                     </button>
                   </>
                 )}
              </div>
            ))}
          </div>
        </ListState>
      </section>

      <section>
        <h2 className="text-xl font-medium mb-4 border-t pt-8">Your Projects</h2>
        <ListState
          isLoading={isLoadingProjects}
          error={projectsError}
          isEmpty={!projectsData || projectsData.length === 0}
          loadingMessage="Loading projects…"
          emptyMessage="No projects yet."
          emptyAction={<p className="text-xs">Create one from a template above.</p>}
          onRetry={() => refetchProjects()}
        >
          <div className="flex flex-col gap-6">
            {/* Measured rather than fixed-height: a project card grows an
                inline edit form when opened, and a fixed height would misplace
                every card below the one being edited (M07-T14). */}
            <VirtualList
              items={projectsData ?? []}
              rowHeight={PROJECT_ROW_HEIGHT}
              measureRows
              className="max-h-[70vh] overflow-y-auto"
              renderRow={(p: any) => (
              <div key={p.id} className="border rounded-lg bg-card p-6 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  {editingProjectId === p.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (editProjectName.trim()) {
                          updateProjectMutation.mutate({ projectId: p.id, name: editProjectName.trim(), description: editProjectDescription });
                        }
                      }}
                      className="flex flex-col gap-2 flex-1"
                    >
                      <input
                        autoFocus
                        value={editProjectName}
                        onChange={(e) => setEditProjectName(e.target.value)}
                        className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <label className="sr-only" htmlFor={`edit-project-description-${p.id}`}>Project description</label>
                      <textarea
                        id={`edit-project-description-${p.id}`}
                        value={editProjectDescription}
                        onChange={(e) => setEditProjectDescription(e.target.value)}
                        placeholder="What is this project for? (optional)"
                        rows={2}
                        className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={!editProjectName.trim() || updateProjectMutation.isPending}
                          className="px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-md text-xs font-medium"
                        >
                          {updateProjectMutation.isPending ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingProjectId(null)}
                          className="px-3 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-xs font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div>
                      <h3 className="font-semibold text-lg">{p.name} <span className="text-xs font-mono text-muted-foreground">[{p.key}]</span></h3>
                      {p.description ? (
                        <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic mt-1">No description.</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">ID: {p.id}</p>
                    </div>
                  )}
                  {editingProjectId !== p.id && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => { setEditingProjectId(p.id); setEditProjectName(p.name); setEditProjectDescription(p.description || ''); }}
                        className="text-muted-foreground hover:text-foreground text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (await confirm({
                            title: `Move "${p.name}" to the bin?`,
                            consequence: 'The project and its contents stop appearing in lists.',
                            undo: 'You can restore it from the Bin.',
                            confirmLabel: 'Move to bin',
                          })) {
                            archiveProjectMutation.mutate(p.id);
                          }
                        }}
                        disabled={archiveProjectMutation.isPending}
                        className="text-muted-foreground hover:text-destructive text-sm disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                {updateProjectMutation.isError && (
                  <p className="text-sm text-destructive mb-4">Failed to update project: {(updateProjectMutation.error as Error).message}</p>
                )}
                <RepositoryIntegrationConfig projectId={p.id} />
              </div>
              )}
            />
            {archiveProjectMutation.isError && (
              <p className="text-sm text-destructive">Failed to delete project: {(archiveProjectMutation.error as Error).message}</p>
            )}
            <PaginationControls
              nextCursor={nextCursor}
              isLoading={isFetchingNextPage}
              onNextPage={() => fetchNextPage()}
            />
          </div>
        </ListState>
      </section>
      {confirmDialog}
    </div>
  );
}
