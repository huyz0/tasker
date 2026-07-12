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

const STATUS_STYLES: Record<string, string> = {
  SUCCESS: 'bg-green-500/10 text-green-500 border-green-500/20',
  FAILURE: 'bg-red-500/10 text-red-500 border-red-500/20',
  PENDING: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider border ${STATUS_STYLES[status] || 'bg-muted text-muted-foreground border-border'}`}>
      {status}
    </span>
  );
}

function DeploymentsList({ buildId, repositoryLinkId, commitSha }: { buildId: string; repositoryLinkId: string; commitSha: string }) {
  const { data: deployments, isLoading } = useQuery({
    queryKey: ['deployments', repositoryLinkId, commitSha],
    queryFn: async () => {
      const resp = await repositoryClient.listDeployments({ buildId, repositoryLinkId, commitSha });
      return resp.deployments;
    },
  });

  if (isLoading) return <p className="text-xs text-muted-foreground pl-4 py-1">Loading deployments...</p>;
  if (!deployments || deployments.length === 0) return <p className="text-xs text-muted-foreground pl-4 py-1">No deployments for this build.</p>;

  return (
    <ul className="pl-4 py-1 space-y-1">
      {deployments.map(d => (
        <li key={d.id} className="text-xs flex items-center justify-between px-2 py-1 rounded bg-muted/10">
          <span>{d.environment}</span>
          <StatusBadge status={d.status} />
        </li>
      ))}
    </ul>
  );
}

function BuildsPanel({ repositoryLinkId }: { repositoryLinkId: string }) {
  const [expandedBuildId, setExpandedBuildId] = useState<string | null>(null);

  const { data: builds, isLoading, error } = useQuery({
    queryKey: ['builds', repositoryLinkId],
    queryFn: async () => {
      const resp = await repositoryClient.listBuilds({ repositoryLinkId });
      return resp.builds;
    },
  });

  if (isLoading) return <p className="text-xs text-muted-foreground pl-3 py-2">Loading builds...</p>;
  if (error) return <p className="text-xs text-destructive pl-3 py-2">Failed to load builds</p>;
  if (!builds || builds.length === 0) return <p className="text-xs text-muted-foreground pl-3 py-2">No builds found.</p>;

  return (
    <ul className="pl-3 py-1 space-y-1">
      {builds.map(build => (
        <li key={build.id}>
          <div
            onClick={() => setExpandedBuildId(expandedBuildId === build.id ? null : build.id)}
            className="text-xs flex items-center justify-between px-2 py-1 rounded bg-muted/20 cursor-pointer hover:bg-muted/30"
          >
            <span>{build.commitSha.substring(0, 7)}</span>
            <StatusBadge status={build.status} />
          </div>
          {expandedBuildId === build.id && (
            <DeploymentsList buildId={build.id} repositoryLinkId={repositoryLinkId} commitSha={build.commitSha} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function RepositoryIntegrationConfig({ projectId }: RepositoryIntegrationConfigProps) {

  const [provider, setProvider] = useState('github');
  const [remoteName, setRemoteName] = useState('');
  const [bitbucketEmail, setBitbucketEmail] = useState('');
  const [bitbucketApiToken, setBitbucketApiToken] = useState('');
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null);
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

  const addLinkMutation = useMutation({
    mutationFn: async () => {
      await repositoryClient.addRepositoryLink({
        projectId,
        provider,
        remoteName,
        email: bitbucketEmail,
        apiToken: bitbucketApiToken,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositoryLinks', projectId] });
      setRemoteName('');
      setBitbucketEmail('');
      setBitbucketApiToken('');
    },
  });

  return (
    <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm mt-4">
      <h3 className="text-lg font-semibold mb-4">Repository Integrations</h3>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">Error loading links</p>}

      {data && data.length > 0 && (
        <ul className="mb-4 space-y-2">
          {data.map(link => (
            <li key={link.id} className="bg-muted/30 rounded">
              <div className="text-sm flex justify-between items-center px-3 py-2">
                <span><strong>{link.provider}</strong>: {link.remoteName}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpandedLinkId(expandedLinkId === link.id ? null : link.id)}
                    className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded hover:bg-secondary/80"
                  >
                    {expandedLinkId === link.id ? 'Hide Builds' : 'Show Builds'}
                  </button>
                  <button
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                    className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded hover:bg-secondary/80 disabled:opacity-50"
                  >
                    {syncMutation.isPending ? 'Syncing...' : 'Sync PRs'}
                  </button>
                </div>
              </div>
              {expandedLinkId === link.id && <BuildsPanel repositoryLinkId={link.id} />}
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
        <h4 className="text-sm font-medium">Add New Link</h4>
        <div className="flex gap-2">
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="border p-2 rounded text-sm bg-background"
          >
            <option value="github">GitHub</option>
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

        {provider === 'bitbucket' && (
          <div className="flex flex-col gap-2 p-3 rounded border border-dashed">
            <p className="text-xs text-muted-foreground">
              Link with a direct Atlassian API token (Basic auth) - the app-password replacement.
              Generate one at <span className="font-mono">id.atlassian.com/manage-profile/security/api-tokens</span>.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Atlassian account email"
                value={bitbucketEmail}
                onChange={e => setBitbucketEmail(e.target.value)}
                className="border p-2 rounded text-sm flex-1 bg-background"
              />
              <input
                type="password"
                placeholder="API token"
                value={bitbucketApiToken}
                onChange={e => setBitbucketApiToken(e.target.value)}
                className="border p-2 rounded text-sm flex-1 bg-background"
              />
            </div>
            <button
              disabled={!remoteName || !bitbucketEmail || !bitbucketApiToken || addLinkMutation.isPending}
              onClick={() => addLinkMutation.mutate()}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {addLinkMutation.isPending ? 'Linking...' : 'Link with API token'}
            </button>
            {addLinkMutation.isError && (
              <p className="text-sm text-destructive">Failed to link: {(addLinkMutation.error as Error).message}</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            disabled={!remoteName}
            onClick={() => {
              const state = btoa(JSON.stringify({ projectId, provider, remoteName }));
              const redirectUri = window.location.origin + "/oauth/callback";
              if (provider === 'bitbucket') {
                const clientId = import.meta.env.VITE_BITBUCKET_CLIENT_ID || "MOCK_CLIENT_ID";
                window.location.href = `https://bitbucket.org/site/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
              } else {
                const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || "MOCK_CLIENT_ID";
                window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=repo`;
              }
            }}
            className="px-4 py-2 flex-1 bg-[#2b3137] text-white text-sm font-medium rounded hover:bg-[#2b3137]/90 disabled:opacity-50 transition-colors"
          >
            Connect {provider === 'github' ? 'GitHub' : 'Bitbucket'} via OAuth
          </button>
        </div>
      </div>
    </div>
  );
}
