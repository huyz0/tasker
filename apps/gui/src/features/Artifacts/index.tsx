import { useEffect, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { ArtifactService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { Label } from '../../components/ui/labels';
import { Folder, FolderOpen, FileText, X } from 'lucide-react';
import { fetchAllPages } from '../../lib/fetchAllPages';
import { InlineCreateForm } from '../../components/ui/InlineCreateForm';

const artifactClient = createClient(ArtifactService, transport);

export function ArtifactsBrowser() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  useEffect(() => setActivePageTitle('Artifacts'), [setActivePageTitle]);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<any | null>(null);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [isAddingArtifact, setIsAddingArtifact] = useState(false);
  const queryClient = useQueryClient();

  // Fetch all folders for the project - loop through every page, not just
  // the first, or folders past the default page size become unreachable.
  const { data: foldersData, isLoading: isLoadingFolders } = useQuery({
    queryKey: ['folders', activeProjectId],
    queryFn: async () => fetchAllPages(async (cursor) => {
      const resp = await artifactClient.listFolders({ projectId: activeProjectId, page: cursor ? { cursor } : undefined });
      return { items: resp.folders, nextCursor: resp.page?.nextCursor || undefined };
    })
  });

  // Fetch artifacts for the selected folder, likewise across all pages.
  const { data: artifactsData, isLoading: isLoadingArtifacts } = useQuery({
    queryKey: ['artifacts', selectedFolderId],
    queryFn: async () => {
      if (!selectedFolderId) return [];
      return fetchAllPages(async (cursor) => {
        const resp = await artifactClient.listArtifacts({ folderId: selectedFolderId, page: cursor ? { cursor } : undefined });
        return { items: resp.artifacts, nextCursor: resp.page?.nextCursor || undefined };
      });
    },
    enabled: !!selectedFolderId,
  });

  const archiveFolderMutation = useMutation({
    mutationFn: async (folderId: string) => {
      await artifactClient.archiveFolder({ folderId });
    },
    onSuccess: (_data, folderId) => {
      queryClient.invalidateQueries({ queryKey: ['folders', activeProjectId] });
      queryClient.invalidateQueries({ queryKey: ['folders', 'bin', activeProjectId] });
      if (selectedFolderId === folderId) setSelectedFolderId(null);
    },
  });

  const archiveArtifactMutation = useMutation({
    mutationFn: async (artifactId: string) => {
      await artifactClient.archiveArtifact({ artifactId });
    },
    onSuccess: (_data, artifactId) => {
      queryClient.invalidateQueries({ queryKey: ['artifacts', selectedFolderId] });
      queryClient.invalidateQueries({ queryKey: ['artifacts', 'bin', activeProjectId] });
      if (selectedArtifact?.id === artifactId) setSelectedArtifact(null);
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      await artifactClient.createFolder({ projectId: activeProjectId, name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', activeProjectId] });
      setIsAddingFolder(false);
    },
  });

  const createArtifactMutation = useMutation({
    mutationFn: async ({ folderId, name }: { folderId: string; name: string }) => {
      await artifactClient.createArtifact({ folderId, name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts', selectedFolderId] });
      setIsAddingArtifact(false);
    },
  });

  const rootFolders = foldersData?.filter(f => !f.parentId) || [];

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
          {isLoadingFolders && <p className="p-2 text-muted-foreground text-xs">Loading folders...</p>}
          {!isLoadingFolders && rootFolders.length === 0 && !isAddingFolder && (
             <p className="p-2 text-muted-foreground text-xs">No folders yet.</p>
          )}

          {rootFolders.map(folder => (
            <div key={folder.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedFolderId(selectedFolderId === folder.id ? null : folder.id);
                  setIsAddingArtifact(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedFolderId(selectedFolderId === folder.id ? null : folder.id);
                    setIsAddingArtifact(false);
                  }
                }}
                className={`px-2 py-1 hover:bg-muted font-medium cursor-pointer flex items-center justify-between gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm ${selectedFolderId === folder.id ? 'bg-muted text-primary' : ''}`}
              >
                <span className="flex items-center gap-2">{selectedFolderId === folder.id ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />} {folder.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Move "${folder.name}" to the bin? You can restore it later.`)) {
                      archiveFolderMutation.mutate(folder.id);
                    }
                  }}
                  disabled={archiveFolderMutation.isPending}
                  aria-label={`Delete folder ${folder.name}`}
                  className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-muted-foreground hover:text-destructive text-xs disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Show artifacts if this folder is selected */}
              {selectedFolderId === folder.id && (
                <div className="pl-6 mt-1 space-y-1">
                  {isLoadingArtifacts && <div className="text-xs text-muted-foreground px-2 py-1">Loading...</div>}
                  {artifactsData?.map(artifact => (
                    <div
                      key={artifact.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedArtifact(artifact)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedArtifact(artifact);
                        }
                      }}
                      className={`px-2 py-1 hover:bg-muted cursor-pointer flex items-center justify-between gap-2 rounded-sm text-xs group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${selectedArtifact?.id === artifact.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground'}`}
                    >
                      <span className="flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> {artifact.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Move "${artifact.name}" to the bin? You can restore it later.`)) {
                            archiveArtifactMutation.mutate(artifact.id);
                          }
                        }}
                        disabled={archiveArtifactMutation.isPending}
                        aria-label={`Delete artifact ${artifact.name}`}
                        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-destructive disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {!isLoadingArtifacts && artifactsData?.length === 0 && !isAddingArtifact && (
                    <div className="text-xs text-muted-foreground/50 px-2 py-1 italic">Empty folder</div>
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
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Editor Main Content */}
      <div className="flex-1 flex flex-col bg-card border rounded-lg overflow-hidden shadow-sm">
        {selectedArtifact ? (
          <>
            <div className="flex bg-muted/30 border-b overflow-x-auto text-sm">
               <div className="px-4 py-2 border-r bg-card border-t border-t-primary cursor-pointer flex items-center gap-2">
                 <FileText className="w-3.5 h-3.5 text-primary" /> {selectedArtifact.name}
               </div>
            </div>
            <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
               <div className="prose prose-sm dark:prose-invert max-w-none">
                 {!selectedArtifact.content ? (
                   <p className="text-muted-foreground italic">This artifact has no content.</p>
                 ) : selectedArtifact.contentType?.startsWith("image/") ? (
                   <img
                     src={`data:${selectedArtifact.contentType};base64,${selectedArtifact.content}`}
                     alt={selectedArtifact.name}
                     className="max-w-full rounded-md border"
                   />
                 ) : (
                   <MarkdownRenderer content={selectedArtifact.content} />
                 )}
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
    </div>
  );
}
