import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLayoutStore } from '../../store/layout';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { TaskArtifactLinks } from "../Tasks/TaskArtifactLinks";
import { Comment } from "../../components/ui/comments";
import { ArtifactUpload } from "./ArtifactUpload";
import { Breadcrumbs } from "../../components/layout/Breadcrumbs";
import { transport } from "../../lib/connectTransport";
import { ArtifactService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { Label } from '../../components/ui/labels';
import { Folder, FolderOpen, FileText, X } from 'lucide-react';
import { fetchAllPages } from '../../lib/fetchAllPages';
import { InlineCreateForm } from '../../components/ui/InlineCreateForm';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ListState } from '../../components/ui/ListState';
import { VirtualList } from '../../components/ui/VirtualList';

// Artifact rows are `px-2 py-1` around a 12px line — a fixed height, which is
// what lets the virtualizer skip per-row measurement. Kept beside the row's own
// classes so the two cannot drift apart silently.
const ARTIFACT_ROW_HEIGHT = 28;

const artifactClient = createClient(ArtifactService, transport);

export function ArtifactsBrowser() {
  const { confirm, confirmDialog } = useConfirm();
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  useEffect(() => setActivePageTitle('Artifacts'), [setActivePageTitle]);

  // The open artifact lives in the URL (`/artifacts/:artifactId`) rather than
  // in local state, so a shared link, a browser reload and the back button all
  // land on the same document instead of the empty-editor placeholder.
  const { artifactId = null } = useParams<{ artifactId: string }>();
  const navigate = useNavigate();

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  // Which folders show their children. Separate from selectedFolderId, which is
  // the one folder whose artifacts are listed: reaching a folder three levels
  // down means every folder above it is open at the same time, and one
  // selection cannot express that.
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [addingSubfolderTo, setAddingSubfolderTo] = useState<string | null>(null);
  const [isAddingArtifact, setIsAddingArtifact] = useState(false);
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const queryClient = useQueryClient();

  // The one remaining `fetchAllPages` in this view, and a deliberate one
  // (M07 exit criterion 1): this renders a *tree*, and a tree with some of its
  // branches missing is not a partially-loaded tree, it is a wrong one — a
  // folder absent from the list is indistinguishable from a folder that does
  // not exist. Bounded by the project's folder count, which is navigation
  // structure a person maintains by hand, not per-item data.
  const { data: foldersData, isLoading: isLoadingFolders, error: foldersError, refetch: refetchFolders } = useQuery({
    queryKey: ['folders', activeProjectId],
    queryFn: async () => fetchAllPages(async (cursor) => {
      const resp = await artifactClient.listFolders({ projectId: activeProjectId, page: cursor ? { cursor } : undefined });
      return { items: resp.folders, nextCursor: resp.page?.nextCursor || undefined };
    }),
    enabled: !!activeProjectId,
  });

  // Paged, not fetch-all: a folder is unbounded. The seeded scale fixture puts
  // 100,000 artifacts in one folder, and walking every page of that to render a
  // list took as many round trips as the folder had pages (M07-T12).
  const {
    data: artifactPages,
    isLoading: isLoadingArtifacts,
    error: artifactsError,
    refetch: refetchArtifacts,
    fetchNextPage: fetchNextArtifactPage,
    hasNextPage: hasMoreArtifacts,
    isFetchingNextPage: isFetchingMoreArtifacts,
  } = useInfiniteQuery({
    queryKey: ['artifacts', selectedFolderId],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const resp = await artifactClient.listArtifacts({
        // `enabled` below gates on a selected folder, so this is never null
        // when the query runs.
        folderId: selectedFolderId!,
        page: pageParam ? { cursor: pageParam } : undefined,
      });
      return { items: resp.artifacts, nextCursor: resp.page?.nextCursor || undefined };
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!selectedFolderId,
  });
  const artifactsData = artifactPages?.pages.flatMap((p) => p.items);

  // A deep link carries the artifact id but not its folder. This used to walk
  // every folder in the project and every page of each until the row turned up
  // — O(folders x pages) requests to find one. `getArtifact` answers it in one
  // (M07-T12), and it returns the folderId that the tree needs to expand.
  const { data: locatedArtifact } = useQuery({
    queryKey: ['artifactLocate', artifactId],
    queryFn: async () => {
      const resp = await artifactClient.getArtifact({ artifactId: artifactId! });
      return resp.artifact ? { artifact: resp.artifact, folderId: resp.artifact.folderId } : null;
    },
    enabled: !!artifactId && !artifactsData?.some(a => a.id === artifactId),
  });

  useEffect(() => {
    if (locatedArtifact && selectedFolderId !== locatedArtifact.folderId) {
      setSelectedFolderId(locatedArtifact.folderId);
    }
  }, [locatedArtifact, selectedFolderId]);

  const selectedArtifact = artifactId
    ? (artifactsData?.find(a => a.id === artifactId) ?? locatedArtifact?.artifact ?? null)
    : null;

  // The body, fetched only for the artifact actually open. `listArtifacts` no
  // longer carries `content` — returning every body to render a list of names
  // cost 2,008 KB for 50 images (M07-T01/T02).
  const contentQuery = useQuery({
    queryKey: ['artifactContent', artifactId],
    enabled: !!artifactId,
    queryFn: async () => artifactClient.getArtifactContent({ artifactId: artifactId! }),
  });
  const artifactContent = contentQuery.data?.content ?? '';

  const archiveFolderMutation = useMutation({
    mutationFn: async (folderId: string) => {
      await artifactClient.archiveFolder({ folderId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', activeProjectId] });
      queryClient.invalidateQueries({ queryKey: ['folders', 'bin', activeProjectId] });
      queryClient.invalidateQueries({ queryKey: ['artifactLocate'] });
    },
  });

  // Whether the folder being deleted is the open one has to be decided here,
  // at click time: a mutation-level `onSuccess` closure lags a render behind
  // the component's state and would still see the previous selection.
  const deleteFolder = (folderId: string) => {
    const wasOpen = selectedFolderId === folderId;
    archiveFolderMutation.mutate(folderId, {
      onSuccess: () => {
        if (!wasOpen) return;
        setSelectedFolderId(null);
        if (artifactId) navigate('/artifacts');
      },
    });
  };

  const updateFolderMutation = useMutation({
    mutationFn: async (variables: { folderId: string; name: string }) => {
      await artifactClient.updateFolder(variables);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', activeProjectId] });
      setEditingFolderId(null);
    },
  });

  const archiveArtifactMutation = useMutation({
    mutationFn: async (targetArtifactId: string) => {
      await artifactClient.archiveArtifact({ artifactId: targetArtifactId });
    },
    onSuccess: () => {
      // Keyed on 'artifacts' alone, not ['artifacts', selectedFolderId]: a
      // mutation-level onSuccess closure lags a render behind component state
      // (the same hazard deleteFolder works around), so the folder id captured
      // here can be the previously selected one - or null - and the list the
      // user is looking at would never refetch. React Query matches query keys
      // by prefix, so this invalidates every artifacts list, bin included.
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.invalidateQueries({ queryKey: ['artifactLocate'] });
    },
  });

  // Same reason as deleteFolder: the open-artifact check has to be made at
  // click time, not inside the mutation-level callback.
  const deleteArtifact = (targetArtifactId: string) => {
    const wasOpen = artifactId === targetArtifactId;
    archiveArtifactMutation.mutate(targetArtifactId, {
      onSuccess: () => {
        if (wasOpen) navigate('/artifacts');
      },
    });
  };

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      await artifactClient.createFolder({ projectId: activeProjectId, name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', activeProjectId] });
      setIsAddingFolder(false);
    },
  });

  const createSubfolderMutation = useMutation({
    mutationFn: async ({ parentId, name }: { parentId: string; name: string }) => {
      await artifactClient.createFolder({ projectId: activeProjectId, parentId, name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', activeProjectId] });
      setAddingSubfolderTo(null);
    },
  });

  const createArtifactMutation = useMutation({
    mutationFn: async ({ folderId, name }: { folderId: string; name: string }) => {
      await artifactClient.createArtifact({ folderId, name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      setIsAddingArtifact(false);
    },
  });

  const updateContentMutation = useMutation({
    mutationFn: async ({ artifactId, content }: { artifactId: string; content: string }) => {
      const resp = await artifactClient.updateArtifactContent({ artifactId, content });
      return resp.artifact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.invalidateQueries({ queryKey: ['artifactLocate'] });
      // The body now lives in its own query, so saving has to invalidate that
      // too — otherwise the editor closes onto the text that was just replaced.
      queryClient.invalidateQueries({ queryKey: ['artifactContent'] });
      setIsEditingContent(false);
    },
  });

  const selectArtifact = (artifact: { id: string }) => {
    setIsEditingContent(false);
    navigate(`/artifacts/${artifact.id}`);
  };

  const toggleFolder = (folderId: string) => {
    const collapsing = selectedFolderId === folderId;
    setSelectedFolderId(collapsing ? null : folderId);
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (collapsing) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
    setIsAddingArtifact(false);
    setAddingSubfolderTo(null);
    // Collapsing the folder holding the open artifact closes the artifact too;
    // otherwise the deep-link lookup would immediately re-expand the folder.
    if (collapsing && artifactId) navigate('/artifacts');
  };

  const rootFolders = foldersData?.filter(f => !f.parentId) || [];
  const childrenOf = (parentId: string) => (foldersData ?? []).filter((f: any) => f.parentId === parentId);

  // A deep link lands on an artifact, not on a path. Every folder above it has
  // to open or the artifact's own folder is not on screen to be selected.
  useEffect(() => {
    if (!selectedFolderId || !foldersData) return;
    const byId = new Map(foldersData.map((f: any) => [f.id, f]));
    const path: string[] = [];
    let cursor: any = byId.get(selectedFolderId);
    // Bounded by the number of folders: a parent cycle would otherwise spin
    // here forever, and nothing in the schema forbids one.
    for (let i = 0; cursor && i <= foldersData.length; i++) {
      path.push(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
    }
    setExpandedFolderIds((prev) => {
      if (path.every((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      path.forEach((id) => next.add(id));
      return next;
    });
  }, [selectedFolderId, foldersData]);

  // docs / specs / drafts / readme.md — the artifact's own path, which is the
  // only thing that tells two files of the same name apart (M05-T06 recorded
  // the gap this fills).
  const artifactCrumbs = (() => {
    if (!selectedArtifact) return [];
    const byId = new Map((foldersData ?? []).map((f: any) => [f.id, f]));
    const path: any[] = [];
    let cursor: any = byId.get((selectedArtifact as any).folderId ?? selectedFolderId ?? '');
    for (let i = 0; cursor && i <= (foldersData?.length ?? 0); i++) {
      path.unshift(cursor);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
    }
    return [
      { label: 'Artifacts', to: '/artifacts' },
      ...path.map((f: any) => ({ label: f.name })),
      { label: selectedArtifact.name },
    ];
  })();

  const renderFolder = (folder: any, depth: number) => (
            <div key={folder.id}>
              {editingFolderId === folder.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editFolderName.trim()) updateFolderMutation.mutate({ folderId: folder.id, name: editFolderName.trim() });
                  }}
                  className="px-2 py-1 flex items-center gap-1"
                >
                  <input
                    autoFocus
                    value={editFolderName}
                    onChange={(e) => setEditFolderName(e.target.value)}
                    className="flex-1 text-sm bg-transparent border-b outline-none focus:border-primary"
                  />
                  <button type="submit" disabled={!editFolderName.trim() || updateFolderMutation.isPending} className="text-xs text-primary disabled:opacity-50">Save</button>
                  <button type="button" onClick={() => setEditingFolderId(null)} className="text-xs text-muted-foreground">Cancel</button>
                </form>
              ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleFolder(folder.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleFolder(folder.id);
                  }
                }}
                style={{ paddingLeft: depth * 12 + 8 }}
                className={`pr-2 py-1 hover:bg-muted font-medium cursor-pointer flex items-center justify-between gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm ${selectedFolderId === folder.id ? 'bg-muted text-primary' : ''}`}
              >
                <span className="flex items-center gap-2">{selectedFolderId === folder.id ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />} {folder.name}</span>
                <span className="flex items-center gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingFolderId(folder.id);
                      setEditFolderName(folder.name);
                    }}
                    aria-label={`Rename folder ${folder.name}`}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (await confirm({
                        title: `Move "${folder.name}" to the bin?`,
                        consequence: 'The folder and the artifacts inside it stop appearing in the explorer.',
                        undo: 'You can restore it from the Bin.',
                        confirmLabel: 'Move to bin',
                      })) {
                        deleteFolder(folder.id);
                      }
                    }}
                    disabled={archiveFolderMutation.isPending}
                    aria-label={`Delete folder ${folder.name}`}
                    className="text-muted-foreground hover:text-destructive text-xs disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              </div>
              )}

              {/* Show artifacts if this folder is selected */}
              {selectedFolderId === folder.id && (
                <div className="pl-6 mt-1 space-y-1">
                  {(isLoadingArtifacts || artifactsError) && (
                    <ListState
                      isLoading={isLoadingArtifacts}
                      error={artifactsError}
                      isEmpty={false}
                      loadingMessage="Loading artifacts…"
                      emptyMessage=""
                      onRetry={() => refetchArtifacts()}
                    />
                  )}
                  {/* Virtualized: a folder holds up to 100,000 artifacts and
                      every one of them used to become a DOM node (M07-T14). */}
                  <VirtualList
                    items={artifactsData ?? []}
                    rowHeight={ARTIFACT_ROW_HEIGHT}
                    className="max-h-64 overflow-y-auto"
                    renderRow={(artifact) => (
                                      <div
                        key={artifact.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectArtifact(artifact)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            selectArtifact(artifact);
                          }
                        }}
                        className={`px-2 py-1 hover:bg-muted cursor-pointer flex items-center justify-between gap-2 rounded-sm text-xs group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${selectedArtifact?.id === artifact.id ? 'bg-primary-subtle text-primary-subtle-foreground font-medium' : 'text-muted-foreground'}`}
                      >
                        <span className="flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> {artifact.name}</span>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (await confirm({
                              title: `Move "${artifact.name}" to the bin?`,
                              consequence: 'The artifact stops appearing in the explorer and on any task it is linked to.',
                              undo: 'You can restore it from the Bin.',
                              confirmLabel: 'Move to bin',
                            })) {
                              deleteArtifact(artifact.id);
                            }
                          }}
                          disabled={archiveArtifactMutation.isPending}
                          aria-label={`Delete artifact ${artifact.name}`}
                          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-destructive disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  />
                  {!isLoadingArtifacts && artifactsData?.length === 0 && !isAddingArtifact && (
                    <div className="text-xs text-muted-foreground/50 px-2 py-1 italic">Empty folder</div>
                  )}
                  {hasMoreArtifacts && (
                    <button
                      type="button"
                      onClick={() => fetchNextArtifactPage()}
                      disabled={isFetchingMoreArtifacts}
                      className="text-xs text-primary hover:underline px-2 py-1 disabled:opacity-50"
                    >
                      {isFetchingMoreArtifacts ? 'Loading…' : 'Load more artifacts'}
                    </button>
                  )}
                  {isAddingArtifact ? (
                    <InlineCreateForm
                      className="flex gap-1 px-1"
                      placeholder="Artifact name"
                      isSubmitting={createArtifactMutation.isPending}
                      onSubmit={(name) => createArtifactMutation.mutate({ folderId: folder.id, name })}
                      onCancel={() => setIsAddingArtifact(false)}
                    />
                  ) : (
                    <button
                      onClick={() => setIsAddingArtifact(true)}
                      className="w-full text-left px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm"
                    >
                      + New artifact
                    </button>
                  )}
                  <ArtifactUpload folderId={folder.id} />
                </div>
              )}
              {/* Children, then this folder's own artifacts. The schema has
                  stored parentId since M01 and the tree only ever rendered
                  folders with none, so everything below the top level was
                  invisible - not missing, unreachable. */}
              {expandedFolderIds.has(folder.id) && childrenOf(folder.id).map((child: any) => renderFolder(child, depth + 1))}
              {expandedFolderIds.has(folder.id) && (
                addingSubfolderTo === folder.id ? (
                  <div style={{ paddingLeft: (depth + 1) * 12 }}>
                    <InlineCreateForm
                      placeholder="Subfolder name"
                      isSubmitting={createFolderMutation.isPending}
                      onSubmit={(name) => createSubfolderMutation.mutate({ parentId: folder.id, name })}
                      onCancel={() => setAddingSubfolderTo(null)}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingSubfolderTo(folder.id)}
                    style={{ paddingLeft: (depth + 1) * 12 + 8 }}
                    className="w-full text-left py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm"
                  >
                    + Subfolder in {folder.name}
                  </button>
                )
              )}
            </div>
  );

  return (
    <div className="flex h-full gap-6">
      {/* File Tree Left Sidebar */}
      <div className="w-64 flex-shrink-0 flex flex-col bg-card border rounded-lg overflow-hidden shadow-sm">
        <div className="p-3 border-b text-sm font-semibold flex justify-between items-center">
          Artifacts Explorer
          <button
            onClick={() => setIsAddingFolder(true)}
            className="text-xs text-muted-foreground hover:text-foreground"
            title="New folder"
          >
            + Folder
          </button>
        </div>
        <div className="p-2 space-y-1 text-sm overflow-y-auto">
          {isAddingFolder && (
            <InlineCreateForm
              placeholder="Folder name"
              isSubmitting={createFolderMutation.isPending}
              onSubmit={(name) => createFolderMutation.mutate(name)}
              onCancel={() => setIsAddingFolder(false)}
            />
          )}
          {(isLoadingFolders || foldersError || (rootFolders.length === 0 && !isAddingFolder)) && (
            // `rootFolders` is derived from the query data, so a failed load
            // gives an empty array and this pane used to say "No folders yet."
            <ListState
              isLoading={isLoadingFolders}
              error={foldersError}
              isEmpty
              loadingMessage="Loading folders…"
              emptyMessage="No folders yet."
              emptyAction={<p className="text-xs">Use “+ New folder” above to add one.</p>}
              onRetry={() => refetchFolders()}
            />
          )}

          {rootFolders.map((folder: any) => renderFolder(folder, 0))}
        </div>
      </div>

      {/* Editor Main Content */}
      <div className="flex-1 flex flex-col bg-card border rounded-lg overflow-hidden shadow-sm">
        {selectedArtifact ? (
          <>
            <div className="flex items-center justify-between bg-muted/30 border-b overflow-x-auto text-sm">
               <div className="px-4 py-2 border-r bg-card border-t border-t-primary cursor-pointer flex items-center gap-2">
                 <FileText className="w-3.5 h-3.5 text-primary" /> {selectedArtifact.name}
               </div>
               {!selectedArtifact.contentType?.startsWith("image/") && (
                 isEditingContent ? (
                   <div className="flex items-center gap-2 pr-3">
                     <button
                       onClick={() => updateContentMutation.mutate({ artifactId: selectedArtifact.id, content: editedContent })}
                       disabled={updateContentMutation.isPending}
                       className="text-xs px-3 py-1 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                     >
                       {updateContentMutation.isPending ? 'Saving...' : 'Save'}
                     </button>
                     <button
                       onClick={() => setIsEditingContent(false)}
                       disabled={updateContentMutation.isPending}
                       className="text-xs px-3 py-1 rounded-md hover:bg-muted"
                     >
                       Cancel
                     </button>
                   </div>
                 ) : (
                   <button
                     onClick={() => { setEditedContent(artifactContent); setIsEditingContent(true); }}
                     className="text-xs px-3 py-1 mr-3 rounded-md hover:bg-muted text-muted-foreground"
                   >
                     Edit
                   </button>
                 )
               )}
            </div>
            <Breadcrumbs className="px-6 pt-4" items={artifactCrumbs} />
            <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
               {updateContentMutation.isError && (
                 <p className="text-sm text-destructive mb-3">Failed to save: {(updateContentMutation.error as Error).message}</p>
               )}
               {isEditingContent ? (
                 <textarea
                   autoFocus
                   value={editedContent}
                   onChange={(e) => setEditedContent(e.target.value)}
                   className="w-full h-full min-h-[300px] rounded-md border bg-background p-3 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/50"
                 />
               ) : (
               <div className="prose prose-sm dark:prose-invert max-w-none">
                 {contentQuery.isLoading || contentQuery.error || !artifactContent ? (
                   <ListState
                     isLoading={contentQuery.isLoading}
                     error={contentQuery.error}
                     isEmpty
                     loadingMessage="Loading this artifact…"
                     emptyMessage="This artifact has no content."
                     emptyAction={<p className="text-xs">Use Edit above to add some.</p>}
                     onRetry={() => contentQuery.refetch()}
                   />
                 ) : selectedArtifact.contentType?.startsWith("image/") ? (
                   <img
                     src={`data:${selectedArtifact.contentType};base64,${artifactContent}`}
                     alt={selectedArtifact.name}
                     className="max-w-full rounded-md border"
                   />
                 ) : (
                   <MarkdownRenderer content={artifactContent} />
                 )}
               </div>
               )}
               <div className="mt-6 not-prose">
                 {/* The backend has accepted entityType "artifact" since M01;
                     nothing mounted it, so the comments existed and were
                     unreachable. */}
                 <h3 className="text-lg font-semibold tracking-tight mb-4">Comments</h3>
                 <Comment.Provider entityId={selectedArtifact.id} entityType="artifact">
                   <Comment.List />
                   <Comment.Composer />
                 </Comment.Provider>
               </div>
               <div className="mt-6 not-prose">
                 <h3 className="text-sm font-semibold tracking-tight mb-3">Tasks</h3>
                 <TaskArtifactLinks artifactId={selectedArtifact.id} orgId={activeOrgId} />
               </div>
               <div className="mt-6 not-prose">
                 <h3 className="text-sm font-semibold tracking-tight mb-3">Labels</h3>
                 <Label.Provider entityId={selectedArtifact.id} entityType="artifact" orgId={activeOrgId}>
                   <Label.Chips />
                   <div className="mt-3">
                     <Label.Picker />
                   </div>
                 </Label.Provider>
               </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm flex-col gap-2">
             <FileText className="w-10 h-10 mb-2 opacity-50" />
             Select an artifact from the explorer to view its contents
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
