import { useEffect, useState } from 'react';
import { useLayoutStore } from '../../store/layout';
import { MarkdownRenderer } from '../../components/ui/MarkdownRenderer';
import { useQuery } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { ArtifactService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";

const transport = createConnectTransport({
  baseUrl: "http://localhost:8080",
});
const artifactClient = createClient(ArtifactService, transport);

export function ArtifactsBrowser() {
  const setActivePageTitle = useLayoutStore((s) => s.setActivePageTitle);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  useEffect(() => setActivePageTitle('Artifacts'), [setActivePageTitle]);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<any | null>(null);

  // Fetch all folders for the project
  const { data: foldersData, isLoading: isLoadingFolders } = useQuery({
    queryKey: ['folders', activeProjectId],
    queryFn: async () => {
      const resp = await artifactClient.listFolders({ projectId: activeProjectId });
      return resp.folders;
    }
  });

  // Fetch artifacts for the selected folder
  const { data: artifactsData, isLoading: isLoadingArtifacts } = useQuery({
    queryKey: ['artifacts', selectedFolderId],
    queryFn: async () => {
      if (!selectedFolderId) return [];
      const resp = await artifactClient.listArtifacts({ folderId: selectedFolderId });
      return resp.artifacts;
    },
    enabled: !!selectedFolderId,
  });

  const rootFolders = foldersData?.filter(f => !f.parentId) || [];

  return (
    <div className="flex h-full gap-6">
      {/* File Tree Left Sidebar */}
      <div className="w-64 flex-shrink-0 flex flex-col bg-card border rounded-lg overflow-hidden shadow-sm">
        <div className="p-3 border-b text-sm font-semibold flex justify-between items-center">
          Artifacts Explorer
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Project Alpha</span>
        </div>
        <div className="p-2 space-y-1 text-sm overflow-y-auto">
          {isLoadingFolders && <p className="p-2 text-muted-foreground text-xs">Loading folders...</p>}
          {!isLoadingFolders && rootFolders.length === 0 && (
             <p className="p-2 text-muted-foreground text-xs">No folders found. Seed from backend.</p>
          )}
          
          {rootFolders.map(folder => (
            <div key={folder.id}>
              <div 
                onClick={() => setSelectedFolderId(selectedFolderId === folder.id ? null : folder.id)}
                className={`px-2 py-1 hover:bg-muted font-medium cursor-pointer flex items-center gap-2 ${selectedFolderId === folder.id ? 'bg-muted text-primary' : ''}`}
              >
                <span>{selectedFolderId === folder.id ? '📂' : '📁'}</span> {folder.name}
              </div>
              
              {/* Show artifacts if this folder is selected */}
              {selectedFolderId === folder.id && (
                <div className="pl-6 mt-1 space-y-1">
                  {isLoadingArtifacts && <div className="text-xs text-muted-foreground px-2 py-1">Loading...</div>}
                  {artifactsData?.map(artifact => (
                    <div 
                      key={artifact.id}
                      onClick={() => setSelectedArtifact(artifact)}
                      className={`px-2 py-1 hover:bg-muted cursor-pointer flex items-center gap-2 rounded-sm text-xs ${selectedArtifact?.id === artifact.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground'}`}
                    >
                      <span>📄</span> {artifact.name}
                    </div>
                  ))}
                  {!isLoadingArtifacts && artifactsData?.length === 0 && (
                    <div className="text-xs text-muted-foreground/50 px-2 py-1 italic">Empty folder</div>
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
                 <span className="text-blue-500 font-bold text-xs">M</span> {selectedArtifact.name}
               </div>
            </div>
            <div className="flex-1 p-6 overflow-y-auto custom-scrollbar prose prose-sm dark:prose-invert max-w-none">
               {selectedArtifact.content ? (
                 <MarkdownRenderer content={selectedArtifact.content} />
               ) : (
                 <p className="text-muted-foreground italic">This artifact has no content.</p>
               )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm flex-col gap-2">
             <div className="text-4xl mb-2">📄</div>
             Select an artifact from the explorer to view its contents
          </div>
        )}
      </div>
    </div>
  );
}
