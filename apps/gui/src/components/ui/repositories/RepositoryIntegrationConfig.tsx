import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { RepositoryService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";

const transport = createConnectTransport({
  baseUrl: "http://localhost:8080",
});
const repositoryClient = createClient(RepositoryService, transport);

interface RepositoryIntegrationConfigProps {
  projectId: string;
}

export function RepositoryIntegrationConfig({ projectId }: RepositoryIntegrationConfigProps) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState('github');
  const [remoteName, setRemoteName] = useState('');
  const [oauthCode, setOauthCode] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['repositoryLinks', projectId],
    queryFn: async () => {
      const resp = await repositoryClient.listRepositoryLinks({ projectId });
      return resp.links;
    }
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const resp = await repositoryClient.addRepositoryLink({
        projectId,
        provider,
        remoteName,
        oauthCode,
      });
      return resp.link;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositoryLinks', projectId] });
      setRemoteName('');
      setOauthCode('');
    }
  });

  return (
    <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm mt-4">
      <h3 className="text-lg font-semibold mb-4">Repository Integrations</h3>
      
      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">Error loading links</p>}
      
      {data && data.length > 0 && (
        <ul className="mb-6 space-y-2">
          {data.map(link => (
            <li key={link.id} className="text-sm flex justify-between items-center bg-muted/30 px-3 py-2 rounded">
              <span><strong>{link.provider}</strong>: {link.remoteName}</span>
              <button 
                onClick={async () => {
                   await repositoryClient.syncPullRequests({ projectId });
                   alert("Sync triggered!");
                }}
                className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded hover:bg-secondary/80"
              >
                Sync PRs
              </button>
            </li>
          ))}
        </ul>
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
          <input 
            type="text" 
            placeholder="OAuth Code (Mock)" 
            value={oauthCode}
            onChange={e => setOauthCode(e.target.value)}
            className="border p-2 rounded text-sm flex-1 bg-background"
          />
          <button 
            disabled={mutation.isPending || !remoteName || !oauthCode}
            onClick={() => mutation.mutate()}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? 'Linking...' : 'Link'}
          </button>
        </div>
      </div>
    </div>
  );
}
