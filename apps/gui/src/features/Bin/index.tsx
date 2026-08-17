import { useEffect, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import {
  OrgService,
  ProjectService,
  TaskService,
  AgentService,
  ArtifactService,
} from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { VirtualList } from '../../components/ui/VirtualList';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ListState } from '../../components/ui/ListState';

const orgClient = createClient(OrgService, transport);
const projectClient = createClient(ProjectService, transport);
const taskClient = createClient(TaskService, transport);
const agentClient = createClient(AgentService, transport);
const artifactClient = createClient(ArtifactService, transport);

type EntityKind = 'organizations' | 'projects' | 'tasks' | 'agents' | 'folders' | 'artifacts';

const TABS: { id: EntityKind; label: string }[] = [
  { id: 'organizations', label: 'Organizations' },
  { id: 'projects', label: 'Projects' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'agents', label: 'Agents' },
  { id: 'folders', label: 'Folders' },
  { id: 'artifacts', label: 'Artifacts' },
];

function OrganizationsBin() {
  const queryClient = useQueryClient();
  const { data: pages, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['orgs', 'bin'],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) =>
      orgClient.listOrgs({ onlyDeleted: true, page: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
  });
  const data = pages?.pages.flatMap((p) => p.organizations);
  const total = Number(pages?.pages[0]?.page?.totalCount ?? 0);
  const restoreMutation = useMutation({
    mutationFn: async (orgId: string) => { await orgClient.restoreOrg({ orgId }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgs', 'bin'] });
      queryClient.invalidateQueries({ queryKey: ['orgs'] });
    },
  });
  const purgeMutation = useMutation({
    mutationFn: async (orgId: string) => { await orgClient.purgeOrg({ orgId }); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orgs', 'bin'] }),
  });
  return (
    <BinList
      isLoading={isLoading}
      error={error}
      onRetry={() => refetch()}
      items={data}
      total={total}
      hasMore={hasNextPage}
      isLoadingMore={isFetchingNextPage}
      onLoadMore={() => fetchNextPage()}
      onRestore={(id) => restoreMutation.mutate(id)}
      isRestoring={restoreMutation.isPending}
      restoreError={restoreMutation.error as Error | null}
      onPurge={(id) => purgeMutation.mutate(id)}
      isPurging={purgeMutation.isPending}
      purgeError={purgeMutation.error as Error | null}
      emptyMessage="No archived organizations."
    />
  );
}

function ProjectsBin() {
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();
  const { data: pages, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['projects', 'bin', activeOrgId],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) =>
      projectClient.listProjects({ orgId: activeOrgId, onlyDeleted: true, page: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
    enabled: Boolean(activeOrgId),
  });
  const data = pages?.pages.flatMap((p) => p.projects);
  const total = Number(pages?.pages[0]?.page?.totalCount ?? 0);
  const restoreMutation = useMutation({
    mutationFn: async (projectId: string) => { await projectClient.restoreProject({ projectId }); },
    onSuccess: () => {
      // M20-T05: `['projects', activeOrgId]` matches no query in the app -
      // the sidebar switcher is keyed `['projects', 'switcher', orgId,
      // search]`, so a restored project never reappeared there. The bare
      // `['projects']` prefix covers every project-list key at once,
      // including this bin's own and the switcher's.
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
  const purgeMutation = useMutation({
    mutationFn: async (projectId: string) => { await projectClient.purgeProject({ projectId }); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', 'bin', activeOrgId] }),
  });
  return (
    <BinList
      isLoading={isLoading}
      error={error}
      onRetry={() => refetch()}
      items={data}
      total={total}
      hasMore={hasNextPage}
      isLoadingMore={isFetchingNextPage}
      onLoadMore={() => fetchNextPage()}
      onRestore={(id) => restoreMutation.mutate(id)}
      isRestoring={restoreMutation.isPending}
      restoreError={restoreMutation.error as Error | null}
      onPurge={(id) => purgeMutation.mutate(id)}
      isPurging={purgeMutation.isPending}
      purgeError={purgeMutation.error as Error | null}
      emptyMessage="No archived projects in the active organization."
    />
  );
}

function TasksBin() {
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  const queryClient = useQueryClient();
  const { data: pages, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['tasks', 'bin', activeProjectId],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) =>
      taskClient.listTasks({ projectId: activeProjectId, onlyDeleted: true, page: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
    enabled: Boolean(activeProjectId),
  });
  const data = pages?.pages.flatMap((p) => p.tasks);
  const total = Number(pages?.pages[0]?.page?.totalCount ?? 0);
  const restoreMutation = useMutation({
    mutationFn: async (taskId: string) => { await taskClient.restoreTask({ taskId }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'bin', activeProjectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId] });
    },
  });
  const purgeMutation = useMutation({
    mutationFn: async (taskId: string) => { await taskClient.purgeTask({ taskId }); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', 'bin', activeProjectId] }),
  });
  return (
    <BinList
      isLoading={isLoading}
      error={error}
      onRetry={() => refetch()}
      items={data}
      total={total}
      hasMore={hasNextPage}
      isLoadingMore={isFetchingNextPage}
      onLoadMore={() => fetchNextPage()}
      labelKey="title"
      onRestore={(id) => restoreMutation.mutate(id)}
      isRestoring={restoreMutation.isPending}
      restoreError={restoreMutation.error as Error | null}
      onPurge={(id) => purgeMutation.mutate(id)}
      isPurging={purgeMutation.isPending}
      purgeError={purgeMutation.error as Error | null}
      emptyMessage="No archived tasks in the active project."
    />
  );
}

function AgentsBin() {
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();
  const { data: pages, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['agents', 'bin', activeOrgId],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) =>
      agentClient.listAgents({ orgId: activeOrgId, onlyDeleted: true, page: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
    enabled: Boolean(activeOrgId),
  });
  const data = pages?.pages.flatMap((p) => p.agents);
  const total = Number(pages?.pages[0]?.page?.totalCount ?? 0);
  const restoreMutation = useMutation({
    mutationFn: async (agentId: string) => { await agentClient.restoreAgent({ agentId }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'bin', activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ['agents', activeOrgId] });
    },
  });
  const purgeMutation = useMutation({
    mutationFn: async (agentId: string) => { await agentClient.purgeAgent({ agentId }); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents', 'bin', activeOrgId] }),
  });
  return (
    <BinList
      isLoading={isLoading}
      error={error}
      onRetry={() => refetch()}
      items={data}
      total={total}
      hasMore={hasNextPage}
      isLoadingMore={isFetchingNextPage}
      onLoadMore={() => fetchNextPage()}
      onRestore={(id) => restoreMutation.mutate(id)}
      isRestoring={restoreMutation.isPending}
      restoreError={restoreMutation.error as Error | null}
      onPurge={(id) => purgeMutation.mutate(id)}
      isPurging={purgeMutation.isPending}
      purgeError={purgeMutation.error as Error | null}
      emptyMessage="No archived agents in the active organization."
    />
  );
}

function FoldersBin() {
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  const queryClient = useQueryClient();
  const { data: pages, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['folders', 'bin', activeProjectId],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) =>
      artifactClient.listFolders({ projectId: activeProjectId, onlyDeleted: true, page: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
    enabled: Boolean(activeProjectId),
  });
  const data = pages?.pages.flatMap((p) => p.folders);
  const total = Number(pages?.pages[0]?.page?.totalCount ?? 0);
  const restoreMutation = useMutation({
    mutationFn: async (folderId: string) => { await artifactClient.restoreFolder({ folderId }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', 'bin', activeProjectId] });
      queryClient.invalidateQueries({ queryKey: ['folders', activeProjectId] });
    },
  });
  const purgeMutation = useMutation({
    mutationFn: async (folderId: string) => { await artifactClient.purgeFolder({ folderId }); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders', 'bin', activeProjectId] }),
  });
  return (
    <BinList
      isLoading={isLoading}
      error={error}
      onRetry={() => refetch()}
      items={data}
      total={total}
      hasMore={hasNextPage}
      isLoadingMore={isFetchingNextPage}
      onLoadMore={() => fetchNextPage()}
      onRestore={(id) => restoreMutation.mutate(id)}
      isRestoring={restoreMutation.isPending}
      restoreError={restoreMutation.error as Error | null}
      onPurge={(id) => purgeMutation.mutate(id)}
      isPurging={purgeMutation.isPending}
      purgeError={purgeMutation.error as Error | null}
      emptyMessage="No archived folders in the active project."
    />
  );
}

function ArtifactsBin() {
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  const queryClient = useQueryClient();
  // One project-scoped request. This used to list every folder in the project
  // (all pages), then every deleted artifact in each folder (all pages) — a
  // fan-out proportional to the folder tree, to render one small list. The
  // server answers it directly now (M07-T04).
  const { data: pages, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['artifacts', 'bin', activeProjectId],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) =>
      artifactClient.listArtifacts({ projectId: activeProjectId, onlyDeleted: true, page: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
    enabled: Boolean(activeProjectId),
  });
  const data = pages?.pages.flatMap((p) => p.artifacts);
  const total = Number(pages?.pages[0]?.page?.totalCount ?? 0);
  const restoreMutation = useMutation({
    mutationFn: async (artifactId: string) => { await artifactClient.restoreArtifact({ artifactId }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts', 'bin', activeProjectId] });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    },
  });
  const purgeMutation = useMutation({
    mutationFn: async (artifactId: string) => { await artifactClient.purgeArtifact({ artifactId }); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artifacts', 'bin', activeProjectId] }),
  });
  return (
    <BinList
      isLoading={isLoading}
      error={error}
      onRetry={() => refetch()}
      items={data}
      total={total}
      hasMore={hasNextPage}
      isLoadingMore={isFetchingNextPage}
      onLoadMore={() => fetchNextPage()}
      onRestore={(id) => restoreMutation.mutate(id)}
      isRestoring={restoreMutation.isPending}
      restoreError={restoreMutation.error as Error | null}
      onPurge={(id) => purgeMutation.mutate(id)}
      isPurging={purgeMutation.isPending}
      purgeError={purgeMutation.error as Error | null}
      emptyMessage="No archived artifacts in the active project."
    />
  );
}

function BinList({ isLoading, error, onRetry, items, total, onLoadMore, hasMore, isLoadingMore, onRestore, isRestoring, restoreError, onPurge, isPurging, purgeError, emptyMessage, labelKey = 'name' }: {
  isLoading: boolean;
  /** The server's count of the whole bin, not the number of rows loaded. */
  total: number;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  /** The *query* error. `restoreError`/`purgeError` are mutations — a failed
   *  load used to fall through to `emptyMessage` and claim the bin was empty. */
  error: unknown;
  onRetry: () => void;
  items: any[] | undefined;
  onRestore: (id: string) => void;
  isRestoring: boolean;
  restoreError: Error | null;
  onPurge: (id: string) => void;
  isPurging: boolean;
  purgeError: Error | null;
  emptyMessage: string;
  labelKey?: string;
}) {
  const { confirm, confirmDialog } = useConfirm();

  if (isLoading || error || !items || items.length === 0) {
    return (
      <ListState
        isLoading={isLoading}
        error={error}
        isEmpty
        loadingMessage="Loading bin…"
        emptyMessage={emptyMessage}
        emptyAction={<p className="text-xs">Anything you move to the bin appears here and can be restored.</p>}
        onRetry={onRetry}
      />
    );
  }
  return (
    <div className="border rounded-md divide-y">
      {restoreError && (
        <p className="text-sm text-destructive p-3">Failed to restore: {restoreError.message}</p>
      )}
      {purgeError && (
        <p className="text-sm text-destructive p-3">Failed to delete forever: {purgeError.message}</p>
      )}
      {/* Virtualized: the bin holds everything ever deleted in the org, which
          is unbounded and grows with use (M07-T14). */}
      <VirtualList
        items={items}
        rowHeight={BIN_ROW_HEIGHT}
        className="max-h-[60vh] overflow-y-auto divide-y"
        renderRow={(item: any) => (
        <div key={item.id} className="p-3 text-sm flex justify-between items-center">
          <div>
            <span className="font-medium">{item[labelKey] ?? item.id}</span>
            {item.deletedAt && (
              <span className="text-xs text-muted-foreground ml-2">Deleted {new Date(item.deletedAt).toLocaleString()}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRestore(item.id)}
              disabled={isRestoring || isPurging}
              className="px-3 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md text-xs font-medium disabled:opacity-50"
            >
              {isRestoring ? 'Restoring...' : 'Restore'}
            </button>
            <button
              onClick={async () => {
                if (await confirm({
                  title: `Permanently delete "${item[labelKey] ?? item.id}"?`,
                  consequence: 'It is removed from the database immediately.',
                  undo: null,
                  confirmLabel: 'Delete forever',
                })) {
                  onPurge(item.id);
                }
              }}
              disabled={isRestoring || isPurging}
              className="px-3 py-1 bg-destructive-subtle text-destructive-subtle-foreground hover:bg-destructive hover:text-destructive-foreground rounded-md text-xs font-medium disabled:opacity-50"
            >
              {isPurging ? 'Deleting...' : 'Delete Forever'}
            </button>
          </div>
        </div>
        )}
      />
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="w-full p-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {isLoadingMore ? 'Loading…' : `Load more (${items.length} of ${total})`}
        </button>
      )}
      {confirmDialog}
    </div>
  );
}

// Bin rows are `p-3` around a single line of text with buttons — a fixed
// height, kept beside the row's own classes so the two cannot drift.
const BIN_ROW_HEIGHT = 57;

export function BinDashboard() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  useEffect(() => setActivePageTitle('Bin'), [setActivePageTitle]);

  const [activeTab, setActiveTab] = useState<EntityKind>('organizations');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Bin</h1>
        <p className="text-muted-foreground mt-1">
          Archived items can be restored here, or permanently deleted (only allowed once empty of any remaining contents). Anything left untouched is automatically purged after each organization's retention period.
        </p>
      </div>

      <div className="border rounded-lg bg-card shadow-sm">
        <div className="flex border-b overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${
                activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {activeTab === 'organizations' && <OrganizationsBin />}
          {activeTab === 'projects' && <ProjectsBin />}
          {activeTab === 'tasks' && <TasksBin />}
          {activeTab === 'agents' && <AgentsBin />}
          {activeTab === 'folders' && <FoldersBin />}
          {activeTab === 'artifacts' && <ArtifactsBin />}
        </div>
      </div>
    </div>
  );
}
