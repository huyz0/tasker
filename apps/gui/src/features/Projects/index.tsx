import { useEffect, useRef, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { RepositoryIntegrationConfig } from '../../components/ui/repositories/RepositoryIntegrationConfig';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useDebounce } from 'use-debounce';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { ProjectService, ProjectTemplateService, TaskService, RoleService, OrgService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { PaginationControls } from '../../components/PaginationControls';
import { Package } from 'lucide-react';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { VirtualList } from '../../components/ui/VirtualList';
import { ListState } from '../../components/ui/ListState';

// Only the estimate used before a card has been measured — `measureRows` reads
// the real height, because a card grows when its edit form opens.
const PROJECT_ROW_HEIGHT = 220;
const SEARCH_PAGE = 10;

const projectClient = createClient(ProjectService, transport);
const templateClient = createClient(ProjectTemplateService, transport);
const taskClient = createClient(TaskService, transport);
const roleClient = createClient(RoleService, transport);
const orgClient = createClient(OrgService, transport);

/**
 * A project's live task count, read the same way a board column reads its
 * own count (M07-T03): `page.totalCount` from a `limit: 1` request, not a
 * client-side count of a fetched list. Deliberately *not* "N of M done" -
 * a task type's statuses are configurable per type (M14/M15), so there is
 * no single, universal "done" status this could total against across every
 * task type a project might use. A plain count is the honest thing to show.
 */
function ProjectTaskCount({ projectId }: { projectId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tasks', 'count', projectId],
    queryFn: async () => taskClient.listTasks({ projectId, page: { limit: 1 } }),
  });

  if (isLoading) return <span className="text-xs text-muted-foreground">Loading tasks…</span>;
  if (error) return <span className="text-xs text-muted-foreground">Task count unavailable</span>;

  const count = Number(data?.page?.totalCount ?? 0);
  return (
    <span className="text-xs text-muted-foreground">
      {count === 0 ? 'No tasks yet' : count === 1 ? '1 task' : `${count} tasks`}
    </span>
  );
}

type Grant = { id: string; subjectType: string; subjectId: string; roleId: string; roleName: string };

/**
 * Project-scoped access, granted directly on the project it applies to.
 *
 * The primitive behind this (`grantRole`/`listGrants`/`revokeGrant` with
 * `scopeType: 'project'`) has existed since M10 and is fully tested there -
 * "a project-scoped grant reaches the project, with no organization
 * membership at all." Nothing in the GUI ever called it with that scope:
 * a real capability with no screen. Collapsed behind a toggle by default,
 * same reasoning as the create-template/create-project forms elsewhere on
 * this page - a third eager widget per card (after the description and the
 * task count) would make an already-dense list heavier for everyone to load
 * the one time in ten anyone opens it.
 */
function ProjectMembers({ projectId, orgId }: { projectId: string; orgId: string }) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 250);
  const [pendingSubjectId, setPendingSubjectId] = useState('');
  const [grantRoleId, setGrantRoleId] = useState('');

  const rolesQuery = useQuery({
    queryKey: ['roles', orgId],
    queryFn: async () => (await roleClient.listRoles({ orgId })).roles,
    enabled: isOpen && !!orgId,
  });

  const grantsQuery = useQuery({
    queryKey: ['grants', 'project', projectId],
    queryFn: async () => (await roleClient.listGrants({ scopeType: 'project', scopeId: projectId })).grants as Grant[],
    enabled: isOpen,
  });

  const candidatesQuery = useQuery({
    queryKey: ['projectMemberCandidates', orgId, debouncedSearch],
    enabled: isPicking && !!orgId,
    queryFn: () => orgClient.listOrgMembers({ orgId, page: { limit: SEARCH_PAGE, filter: debouncedSearch || undefined } }),
  });

  // M20-T07: a grant only carries subjectId - the raw user id was rendered
  // directly, both as the visible row text and the revoke button's
  // aria-label, naming nobody a screen reader user (or anyone else) could
  // recognize. Shares the exact query key the picker above uses for its own
  // unfiltered page (`debouncedSearch === ''`), so opening this panel and
  // opening "+ Grant access" don't each fetch their own copy of the same
  // page - one request serves both. Best-effort: a subject outside this
  // page's org-member listing still falls back to its raw id.
  const directoryQuery = useQuery({
    queryKey: ['projectMemberCandidates', orgId, ''],
    queryFn: () => orgClient.listOrgMembers({ orgId, page: { limit: SEARCH_PAGE } }),
    enabled: isOpen && !!orgId,
  });
  const directoryById = new Map((directoryQuery.data?.members ?? []).map((m: any) => [m.userId, m]));
  const displayNameFor = (subjectId: string) => directoryById.get(subjectId)?.name || directoryById.get(subjectId)?.email || subjectId;

  const grantMutation = useMutation({
    mutationFn: () => roleClient.grantRole({
      subjectType: 'user', subjectId: pendingSubjectId, scopeType: 'project', scopeId: projectId, roleId: grantRoleId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grants', 'project', projectId] });
      setPendingSubjectId('');
      setGrantRoleId('');
      setIsPicking(false);
      setSearch('');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (grantId: string) => roleClient.revokeGrant({ grantId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['grants', 'project', projectId] }),
  });

  const grants = grantsQuery.data ?? [];
  const candidates = candidatesQuery.data?.members ?? [];

  // No count on the collapsed toggle - that would mean fetching grants
  // eagerly for every card, exactly the cost collapsing this behind a
  // click exists to avoid.
  if (!isOpen) {
    return (
      <button
        onClick={() => { setIsOpen(true); revokeMutation.reset(); }}
        aria-expanded={false}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Members
      </button>
    );
  }

  return (
    <div className="mt-3 border-t pt-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium">Project members</h4>
        <button
          // M20-T06: collapsing this panel doesn't unmount it (isOpen===false
          // is an early return above, not an unmount), so a failed revoke's
          // error used to survive being hidden and reappear on the next
          // expand with no action having been taken yet.
          onClick={() => { setIsOpen(false); revokeMutation.reset(); }}
          aria-expanded={true}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Hide
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Roles granted specifically on this project, in addition to whatever an org-wide role already gives someone.
      </p>

      <ListState
        isLoading={grantsQuery.isLoading}
        error={grantsQuery.error}
        isEmpty={!grantsQuery.isLoading && !grantsQuery.error && grants.length === 0}
        loadingMessage="Loading members…"
        emptyMessage="No one has a project-specific role here yet."
        onRetry={() => grantsQuery.refetch()}
      >
        <ul className="flex flex-col gap-1">
          {grants.map((g) => (
            <li key={g.id} className="flex items-center gap-2 text-xs bg-muted px-2 py-1 rounded-md">
              <span className="flex-1 truncate">{displayNameFor(g.subjectId)}</span>
              <span className="text-muted-foreground">{g.roleName}</span>
              <button
                aria-label={`Revoke ${displayNameFor(g.subjectId)}'s ${g.roleName} access`}
                onClick={async () => {
                  // M20-T07: every other destructive action on this page
                  // (archiving a project, unlinking a repository) confirms
                  // first - revoking someone's access was the one silent
                  // exception, one misclick away from an unannounced,
                  // unconfirmed permission change.
                  if (await confirm({
                    title: `Revoke ${displayNameFor(g.subjectId)}'s ${g.roleName} access to this project?`,
                    consequence: 'They keep whatever an org-wide role already gives them, but lose this project-specific grant.',
                    undo: 'You can grant it again from this same panel.',
                    confirmLabel: 'Revoke access',
                  })) {
                    revokeMutation.mutate(g.id);
                  }
                }}
                // M20-T06: one shared mutation object across every grant row
                // meant revoking one disabled the ✕ on every other row too -
                // compare against the specific grant id this mutation was
                // called with.
                disabled={revokeMutation.isPending && revokeMutation.variables === g.id}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </ListState>
      {revokeMutation.isError && (
        <p className="text-xs text-destructive">Failed to revoke: {(revokeMutation.error as Error).message}</p>
      )}

      {!isPicking ? (
        <button
          onClick={() => { setIsPicking(true); grantMutation.reset(); }}
          className="self-start text-xs text-primary hover:underline"
        >
          + Grant access
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border bg-card p-2">
          {!pendingSubjectId ? (
            <>
              <label className="text-xs font-medium" htmlFor={`project-member-search-${projectId}`}>Search people</label>
              <input
                id={`project-member-search-${projectId}`}
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or email"
                className="rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/50"
              />
              {candidatesQuery.isLoading && <span className="text-xs text-muted-foreground">Searching…</span>}
              {candidatesQuery.error && <span className="text-xs text-destructive">Search failed</span>}
              {candidates.map((m: any) => (
                <button
                  key={m.userId}
                  onClick={() => setPendingSubjectId(m.userId)}
                  className="rounded px-1 py-0.5 text-left text-xs hover:bg-accent"
                >
                  {m.name || m.email}
                </button>
              ))}
              {candidatesQuery.isSuccess && candidates.length === 0 && (
                <span className="text-xs text-muted-foreground">No matches.</span>
              )}
              <button
                onClick={() => { setIsPicking(false); setSearch(''); grantMutation.reset(); }}
                className="self-start text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </>
          ) : (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => { e.preventDefault(); if (grantRoleId) grantMutation.mutate(); }}
            >
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium">Granting to</span>
                <span className="text-xs">{candidates.find((m: any) => m.userId === pendingSubjectId)?.name ?? pendingSubjectId}</span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" htmlFor={`project-grant-role-${projectId}`}>Role</label>
                <select
                  id={`project-grant-role-${projectId}`}
                  value={grantRoleId}
                  onChange={(e) => setGrantRoleId(e.target.value)}
                  className="rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Choose a role…</option>
                  {(rolesQuery.data ?? []).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <button
                type="submit"
                disabled={!grantRoleId || grantMutation.isPending}
                className="px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-md text-xs font-medium"
              >
                {grantMutation.isPending ? 'Granting…' : 'Grant role'}
              </button>
              <button
                type="button"
                onClick={() => { setPendingSubjectId(''); setIsPicking(false); grantMutation.reset(); }}
                className="px-3 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-xs font-medium"
              >
                Cancel
              </button>
            </form>
          )}
          {grantMutation.isError && (
            <p className="text-xs text-destructive">Failed to grant: {(grantMutation.error as Error).message}</p>
          )}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

export function ProjectsWizard() {
  const { confirm, confirmDialog } = useConfirm();
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  const setActiveProjectId = useLayoutStore((s) => s.setActiveProjectId);
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

  // M20-T05: none of the page-level drafts (new project name/description,
  // the new-template form, the two inline edit forms) ever reset on an org
  // switch - typing a project name intended for org A, switching to org B,
  // then clicking "Use Template" created the project in org B carrying org
  // A's draft name, with no visible reset having happened. Skipped on the
  // very first render so mounting doesn't clear a draft nobody has typed
  // yet.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setProjectName('');
    setProjectDescription('');
    setIsAddingTemplate(false);
    setNewTemplateName('');
    setNewTemplateDescription('');
    setEditingTemplateId(null);
    setEditingProjectId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

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
      // M20-T05: `['projects', activeOrgId]` matches no query in the app at
      // all - the sidebar switcher is keyed `['projects', 'switcher', orgId,
      // search]`, so a new project never appeared there. Invalidating the
      // bare `['projects']` prefix (matching every project-list key,
      // including the switcher's and the bin's) is the same pattern the
      // Organizations screen already uses correctly for `['orgs']`.
      queryClient.invalidateQueries({ queryKey: ['projects'] });
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
      // M20-T05: same dead/wrong-key fix as createProjectMutation above -
      // this is also what left a renamed project's stale old name in the
      // sidebar switcher even after the query itself refreshed (see
      // OrgProjectSwitcher's own fix for the other half of that bug).
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditingProjectId(null);
    },
  });

  const archiveProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await projectClient.archiveProject({ projectId });
    },
    onSuccess: (_data, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // M20-T05: archiving the currently-active project left activeProjectId
      // pointing at a project that no longer appears in any list - Tasks,
      // Artifacts, the Bin's own task/folder/artifact tabs, and the
      // Dashboard all kept querying it indefinitely, and the switcher's
      // auto-select-fallback never fires on its own since the id is still
      // non-empty. Clearing it here lets that same fallback pick a
      // survivor once the switcher's project list refetches.
      if (projectId === activeProjectId) setActiveProjectId('');
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
            <label className="sr-only" htmlFor="new-template-name">Template name</label>
            <input
              id="new-template-name"
              autoFocus
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="Template name"
              className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
            <label className="sr-only" htmlFor="new-template-description">Template description</label>
            <textarea
              id="new-template-description"
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
          <label className="sr-only" htmlFor="new-project-name">New project name</label>
          <input
            id="new-project-name"
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
                     <label className="sr-only" htmlFor={`edit-template-name-${t.id}`}>Template name</label>
                     <input
                       id={`edit-template-name-${t.id}`}
                       autoFocus
                       value={editTemplateName}
                       onChange={(e) => setEditTemplateName(e.target.value)}
                       className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                     />
                     <label className="sr-only" htmlFor={`edit-template-description-${t.id}`}>Template description</label>
                     <textarea
                       id={`edit-template-description-${t.id}`}
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
                         onClick={() => { setEditingTemplateId(null); updateTemplateMutation.reset(); }}
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
                           // M20-T06: this mutation object is shared across
                           // every template card - without resetting here,
                           // opening Edit on template B after template A's
                           // edit failed showed A's stale error as if B's
                           // edit had just failed too.
                           updateTemplateMutation.reset();
                         }}
                         className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                       >
                         Edit
                       </button>
                     </div>
                     <p className="text-sm text-muted-foreground mt-1 mb-6 flex-grow">{t.description}</p>
                     <button
                       onClick={() => createProjectMutation.mutate(t.id)}
                       // M20-T06: one shared mutation object across every
                       // template card meant using one showed "Creating..."
                       // and disabled every other card's button too -
                       // compare against the specific template id this
                       // mutation was called with.
                       disabled={(createProjectMutation.isPending && createProjectMutation.variables === t.id) || !projectName.trim()}
                       className="w-full px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                     >
                       {createProjectMutation.isPending && createProjectMutation.variables === t.id ? 'Creating...' : 'Use Template'}
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
                      <label className="sr-only" htmlFor={`edit-project-name-${p.id}`}>Project name</label>
                      <input
                        id={`edit-project-name-${p.id}`}
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
                          onClick={() => { setEditingProjectId(null); updateProjectMutation.reset(); }}
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
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-muted-foreground">ID: {p.id}</p>
                        <span className="text-xs text-muted-foreground">·</span>
                        <ProjectTaskCount projectId={p.id} />
                      </div>
                    </div>
                  )}
                  {editingProjectId !== p.id && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setEditingProjectId(p.id);
                          setEditProjectName(p.name);
                          setEditProjectDescription(p.description || '');
                          // M20-T06: this mutation object is shared across
                          // every project card - without resetting here,
                          // opening Edit on project B after project A's edit
                          // failed showed A's stale error as if B's edit had
                          // just failed too.
                          updateProjectMutation.reset();
                        }}
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
                        // M20-T06: one shared mutation object across every
                        // project row meant archiving one disabled the
                        // Delete button on every other row too - compare
                        // against the specific project id this mutation was
                        // called with.
                        disabled={archiveProjectMutation.isPending && archiveProjectMutation.variables === p.id}
                        className="text-muted-foreground hover:text-destructive text-sm disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                {/* M20-T06: this used to render unconditionally - one shared
                    mutation object for the whole page meant a single failed
                    rename painted this banner on every visible project card,
                    not just the one being edited. Gated on editingProjectId
                    now that Cancel/Edit both reset the mutation, so a stale
                    error can't resurface on an unrelated row either. */}
                {editingProjectId === p.id && updateProjectMutation.isError && (
                  <p className="text-sm text-destructive mb-4">Failed to update project: {(updateProjectMutation.error as Error).message}</p>
                )}
                <RepositoryIntegrationConfig projectId={p.id} />
                <ProjectMembers projectId={p.id} orgId={activeOrgId} />
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
