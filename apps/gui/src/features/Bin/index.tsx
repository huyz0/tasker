import { useEffect, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import {
  OrgService,
  ProjectService,
  TaskService,
  AgentService,
  ArtifactService,
} from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { fetchAllPages } from '../../lib/fetchAllPages';

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
  const { data, isLoading } = useQuery({
    queryKey: ['orgs', 'bin'],
    queryFn: async () => fetchAllPages(async (cursor) => {
      const resp = await orgClient.listOrgs({ onlyDeleted: true, page: cursor ? { cursor } : undefined });
      return { items: resp.organizations, nextCursor: resp.page?.nextCursor || undefined };
    }),
  });
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
      items={data}
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
  const { data, isLoading } = useQuery({
    queryKey: ['projects', 'bin', activeOrgId],
    queryFn: async () => fetchAllPages(async (cursor) => {
      const resp = await projectClient.listProjects({ orgId: activeOrgId, onlyDeleted: true, page: cursor ? { cursor } : undefined });
      return { items: resp.projects, nextCursor: resp.page?.nextCursor || undefined };
    }),
    enabled: Boolean(activeOrgId),
  });
  const restoreMutation = useMutation({
    mutationFn: async (projectId: string) => { await projectClient.restoreProject({ projectId }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', 'bin', activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ['projects', activeOrgId] });
    },
  });
  const purgeMutation = useMutation({
    mutationFn: async (projectId: string) => { await projectClient.purgeProject({ projectId }); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', 'bin', activeOrgId] }),
  });
  return (
    <BinList
      isLoading={isLoading}
      items={data}
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
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'bin', activeProjectId],
    queryFn: async () => fetchAllPages(async (cursor) => {
      const resp = await taskClient.listTasks({ projectId: activeProjectId, onlyDeleted: true, page: cursor ? { cursor } : undefined });
      return { items: resp.tasks, nextCursor: resp.page?.nextCursor || undefined };
    }),
    enabled: Boolean(activeProjectId),
  });
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
      items={data}
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
  const { data, isLoading } = useQuery({
    queryKey: ['agents', 'bin', activeOrgId],
    queryFn: async () => fetchAllPages(async (cursor) => {
      const resp = await agentClient.listAgents({ orgId: activeOrgId, onlyDeleted: true, page: cursor ? { cursor } : undefined });
      return { items: resp.agents, nextCursor: resp.page?.nextCursor || undefined };
    }),
    enabled: Boolean(activeOrgId),
  });
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
      items={data}
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
  const { data, isLoading } = useQuery({
    queryKey: ['folders', 'bin', activeProjectId],
    queryFn: async () => fetchAllPages(async (cursor) => {
      const resp = await artifactClient.listFolders({ projectId: activeProjectId, onlyDeleted: true, page: cursor ? { cursor } : undefined });
      return { items: resp.folders, nextCursor: resp.page?.nextCursor || undefined };
    }),
    enabled: Boolean(activeProjectId),
  });
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
      items={data}
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
  const { data: folders } = useQuery({
    queryKey: ['folders', activeProjectId],
    queryFn: async () => fetchAllPages(async (cursor) => {
      const resp = await artifactClient.listFolders({ projectId: activeProjectId, page: cursor ? { cursor } : undefined });
      return { items: resp.folders, nextCursor: resp.page?.nextCursor || undefined };
    }),
    enabled: Boolean(activeProjectId),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['artifacts', 'bin', activeProjectId, folders?.map(f => f.id).join(',')],
    queryFn: async () => {
      const perFolder = await Promise.all(
        (folders ?? []).map(f => fetchAllPages(async (cursor) => {
          const resp = await artifactClient.listArtifacts({ folderId: f.id, onlyDeleted: true, page: cursor ? { cursor } : undefined });
          return { items: resp.artifacts, nextCursor: resp.page?.nextCursor || undefined };
        }))
      );
      return perFolder.flat();
    },
    enabled: Boolean(activeProjectId) && Boolean(folders),
  });
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
      items={data}
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

function BinList({ isLoading, items, onRestore, isRestoring, restoreError, onPurge, isPurging, purgeError, emptyMessage, labelKey = 'name' }: {
  isLoading: boolean;
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
  if (isLoading) {
    return <p className="text-sm text-muted-foreground text-center py-8">Loading bin...</p>;
  }
  if (!items || items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">{emptyMessage}</p>;
  }
  return (
    <div className="border rounded-md divide-y">
      {restoreError && (
        <p className="text-sm text-destructive p-3">Failed to restore: {restoreError.message}</p>
      )}
      {purgeError && (
        <p className="text-sm text-destructive p-3">Failed to delete forever: {purgeError.message}</p>
      )}
      {items.map((item) => (
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
              onClick={() => {
                if (window.confirm('Permanently delete this item? This cannot be undone.')) {
                  onPurge(item.id);
                }
              }}
              disabled={isRestoring || isPurging}
              className="px-3 py-1 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-md text-xs font-medium disabled:opacity-50"
            >
              {isPurging ? 'Deleting...' : 'Delete Forever'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

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
