import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../../lib/connectTransport";
import { RepositoryService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";

const repositoryClient = createClient(RepositoryService, transport);

interface RepositoryIntegrationConfigProps {
  projectId: string;
}

const PR_STATUS_STYLES: Record<string, string> = {
  open: 'bg-green-500/10 text-green-500 border-green-500/20',
  merged: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  closed: 'bg-red-500/10 text-red-500 border-red-500/20',
  draft: 'bg-muted text-muted-foreground border-border',
};

export function RepositoryIntegrationConfig({ projectId }: RepositoryIntegrationConfigProps) {

  const [provider, setProvider] = useState('github');
  const [remoteName, setRemoteName] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['repositoryLinks', projectId],
    queryFn: async () => {
      const resp = await repositoryClient.listRepositoryLinks({ projectId });
      return resp.links;
    }
  });

  const { data: pullRequests } = useQuery({
    queryKey: ['pullRequests', projectId],
    queryFn: async () => {
      const resp = await repositoryClient.listPullRequests({ projectId });
      return resp.pullRequests;
    },
    enabled: !!data && data.length > 0,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      await repositoryClient.syncPullRequests({ projectId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pullRequests', projectId] }),
  });

  return (
    <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm mt-4">
      <h3 className="text-lg font-semibold mb-4">Repository Integrations</h3>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">Error loading links</p>}

      {data && data.length > 0 && (
        <ul className="mb-4 space-y-2">
          {data.map(link => (
            <li key={link.id} className="text-sm flex justify-between items-center bg-muted/30 px-3 py-2 rounded">
              <span><strong>{link.provider}</strong>: {link.remoteName}</span>
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded hover:bg-secondary/80 disabled:opacity-50"
              >
                {syncMutation.isPending ? 'Syncing...' : 'Sync PRs'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {syncMutation.isError && (
        <p className="text-sm text-destructive mb-4">Failed to sync pull requests: {(syncMutation.error as Error).message}</p>
      )}

      {data && data.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium mb-2">Pull Requests</h4>
          {pullRequests && pullRequests.length > 0 ? (
            <ul className="space-y-1">
              {pullRequests.map(pr => (
                <li key={pr.id} className="text-sm flex items-center justify-between px-3 py-2 rounded bg-muted/20">
                  <span>#{pr.remotePrId}: {pr.title}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider border ${PR_STATUS_STYLES[pr.status] || PR_STATUS_STYLES.draft}`}>
                    {pr.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No pull requests synced yet.</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 mt-4 pt-4 border-t">
        <h4 className="text-sm font-medium">Add New Link (OAuth flow simulation)</h4>
        <div className="flex gap-2">
          <select 
            value={provider} 
            onChange={e => setProvider(e.target.value)}
            className="border p-2 rounded text-sm bg-background"
          >
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
            <option value="bitbucket">Bitbucket</option>
          </select>
          <input 
            type="text" 
            placeholder="Remote (e.g. huyz0/tasker)" 
            value={remoteName}
            onChange={e => setRemoteName(e.target.value)}
            className="border p-2 rounded text-sm flex-1 bg-background"
          />
        </div>
        <div className="flex gap-2">
          <button 
            disabled={!remoteName}
            onClick={() => {
              const state = btoa(JSON.stringify({ projectId, provider, remoteName }));
              const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || "MOCK_CLIENT_ID";
              const redirectUri = window.location.origin + "/oauth/callback";
              window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=repo`;
            }}
            className="px-4 py-2 flex-1 bg-[#2b3137] text-white text-sm font-medium rounded hover:bg-[#2b3137]/90 disabled:opacity-50 transition-colors"
          >
            Connect {provider === 'github' ? 'GitHub' : provider}
          </button>
        </div>
      </div>
    </div>
  );
}
