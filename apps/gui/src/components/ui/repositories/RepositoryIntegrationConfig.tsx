import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../../lib/connectTransport";
import { RepositoryService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { TONE_CLASSES, buildTone, pullRequestTone } from '../statusStyles';
import { useConfirm } from '../ConfirmDialog';
import { Button } from '../button';
import { GitBranch } from 'lucide-react';

/**
 * GitHub's mark, drawn in `currentColor`. lucide dropped its brand icons, and
 * the button this sits in used to be a `#2b3137` brand fill with white text,
 * which all but vanished on the dark theme's near-black card. An outline
 * button with the mark says "GitHub" without borrowing the vendor's colour.
 */
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

// Identifiers and secrets, not prose: no spellcheck (which can also ship the
// value to a cloud spellchecker) and no autofill guessing a saved password in.
const CREDENTIAL_FIELD = { spellCheck: false, autoComplete: 'off' } as const;

const repositoryClient = createClient(RepositoryService, transport);

interface RepositoryIntegrationConfigProps {
  projectId: string;
}


function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-2xs px-2 py-0.5 rounded uppercase font-bold tracking-wider border ${TONE_CLASSES[buildTone(status)]}`}>
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

  if (isLoading) return <p className="text-xs text-muted-foreground pl-4 py-1">Loading deployments…</p>;
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
      const allBuilds: Awaited<ReturnType<typeof repositoryClient.listBuilds>>['builds'] = [];
      let cursor: string | undefined;
      do {
        const resp = await repositoryClient.listBuilds({ repositoryLinkId, page: cursor ? { cursor } : undefined });
        allBuilds.push(...resp.builds);
        cursor = resp.page?.nextCursor || undefined;
      } while (cursor);
      return allBuilds;
    },
  });

  if (isLoading) return <p className="text-xs text-muted-foreground pl-3 py-2">Loading builds…</p>;
  if (error) return <p className="text-xs text-destructive pl-3 py-2">Failed to load builds</p>;
  if (!builds || builds.length === 0) return <p className="text-xs text-muted-foreground pl-3 py-2">No builds found.</p>;

  return (
    <ul className="pl-3 py-1 space-y-1">
      {builds.map(build => (
        <li key={build.id}>
          {/* M20-T07: a bare <div onClick> is invisible to a screen reader
              and unreachable from the keyboard - this is a disclosure toggle
              like every other one on this page, so it gets a real button
              and an aria-expanded state like the rest of them. */}
          <button
            type="button"
            onClick={() => setExpandedBuildId(expandedBuildId === build.id ? null : build.id)}
            aria-expanded={expandedBuildId === build.id}
            className="w-full text-left text-xs flex items-center justify-between px-2 py-1 rounded bg-muted/20 cursor-pointer hover:bg-muted/30"
          >
            <span>{build.commitSha.substring(0, 7)}</span>
            <StatusBadge status={build.status} />
          </button>
          {expandedBuildId === build.id && (
            <DeploymentsList buildId={build.id} repositoryLinkId={repositoryLinkId} commitSha={build.commitSha} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function RepositoryIntegrationConfig({ projectId }: RepositoryIntegrationConfigProps) {
  const { confirm, confirmDialog } = useConfirm();

  const [provider, setProvider] = useState('github');
  const [remoteName, setRemoteName] = useState('');
  const [bitbucketEmail, setBitbucketEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['repositoryLinks', projectId],
    queryFn: async () => {
      const allLinks: Awaited<ReturnType<typeof repositoryClient.listRepositoryLinks>>['links'] = [];
      let cursor: string | undefined;
      do {
        const resp = await repositoryClient.listRepositoryLinks({ projectId, page: cursor ? { cursor } : undefined });
        allLinks.push(...resp.links);
        cursor = resp.page?.nextCursor || undefined;
      } while (cursor);
      return allLinks;
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

  const removeLinkMutation = useMutation({
    mutationFn: async (repositoryLinkId: string) => {
      await repositoryClient.removeRepositoryLink({ repositoryLinkId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['repositoryLinks', projectId] }),
  });

  const addLinkMutation = useMutation({
    mutationFn: async () => {
      await repositoryClient.addRepositoryLink({
        projectId,
        provider,
        remoteName,
        email: provider === 'bitbucket' ? bitbucketEmail : '',
        apiToken,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositoryLinks', projectId] });
      setRemoteName('');
      setBitbucketEmail('');
      setApiToken('');
    },
  });

  return (
    <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm mt-4">
      <h3 className="text-lg font-semibold mb-4">Repository integrations</h3>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
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
                    aria-expanded={expandedLinkId === link.id}
                    className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded hover:bg-secondary/80"
                  >
                    {expandedLinkId === link.id ? 'Hide Builds' : 'Show Builds'}
                  </button>
                  <button
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                    className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded hover:bg-secondary/80 disabled:opacity-50"
                  >
                    {syncMutation.isPending ? 'Syncing…' : 'Sync PRs'}
                  </button>
                  <button
                    onClick={async () => {
                      if (await confirm({
                        title: `Unlink ${link.provider}: ${link.remoteName}?`,
                        consequence: 'Pull requests and builds from this repository stop appearing on tasks.',
                        undo: 'You can link the repository again, but the connection history is not kept.',
                        confirmLabel: 'Unlink',
                      })) {
                        removeLinkMutation.mutate(link.id);
                      }
                    }}
                    // M20-T06: one shared mutation object across every link's
                    // row meant unlinking link A disabled the Unlink button
                    // on every other link too, not just A's - comparing
                    // against the specific link id this mutation was called
                    // with (unlike syncMutation just above, which really is
                    // one project-wide action shared across every row, so
                    // its blanket isPending is correct as-is).
                    disabled={removeLinkMutation.isPending && removeLinkMutation.variables === link.id}
                    className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 disabled:opacity-50"
                  >
                    Unlink
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
      {removeLinkMutation.isError && (
        <p className="text-sm text-destructive mb-4">Failed to unlink repository: {(removeLinkMutation.error as Error).message}</p>
      )}

      {data && data.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium mb-2">Pull requests</h4>
          {pullRequests && pullRequests.length > 0 ? (
            <ul className="space-y-1">
              {pullRequests.map(pr => (
                <li key={pr.id} className="text-sm flex items-center justify-between px-3 py-2 rounded bg-muted/20">
                  <span>#{pr.remotePrId}: {pr.title}</span>
                  <span className={`text-2xs px-2 py-0.5 rounded uppercase font-bold tracking-wider border ${TONE_CLASSES[pullRequestTone(pr.status)]}`}>
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
        <h4 className="text-sm font-medium">Add new link</h4>
        <div className="flex gap-2 min-w-0">
          <select
            aria-label="Repository provider"
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="border p-2 rounded text-sm bg-background"
          >
            <option value="github">GitHub</option>
            <option value="bitbucket">Bitbucket</option>
          </select>
          <input
            type="text"
            aria-label="Repository remote"
            name="repository-remote"
            {...CREDENTIAL_FIELD}
            placeholder="Remote (e.g. huyz0/tasker)"
            value={remoteName}
            onChange={e => setRemoteName(e.target.value)}
            className="border p-2 rounded text-sm flex-1 min-w-0 w-full bg-background"
          />
        </div>

        <div className="flex flex-col gap-2 p-3 rounded border border-dashed">
          {provider === 'bitbucket' ? (
            <>
              <p className="text-xs text-muted-foreground">
                Link with a direct Atlassian API token (Basic auth) - the app-password replacement.
                Generate one at <span className="font-mono">id.atlassian.com/manage-profile/security/api-tokens</span>.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="email"
                  aria-label="Atlassian account email"
                  name="atlassian-account-email"
                  {...CREDENTIAL_FIELD}
                  placeholder="Atlassian account email"
                  value={bitbucketEmail}
                  onChange={e => setBitbucketEmail(e.target.value)}
                  className="border p-2 rounded text-sm flex-1 min-w-0 bg-background"
                />
                <input
                  type="password"
                  aria-label="API token"
                  name="bitbucket-api-token"
                  {...CREDENTIAL_FIELD}
                  placeholder="API token"
                  value={apiToken}
                  onChange={e => setApiToken(e.target.value)}
                  className="border p-2 rounded text-sm flex-1 min-w-0 bg-background"
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Link with a direct personal access token (used as a Bearer token, same as OAuth2).
                Generate one at <span className="font-mono">github.com/settings/tokens</span> with the "repo" scope.
              </p>
              <input
                type="password"
                aria-label="Personal access token"
                name="github-personal-access-token"
                {...CREDENTIAL_FIELD}
                placeholder="Personal access token"
                value={apiToken}
                onChange={e => setApiToken(e.target.value)}
                className="border p-2 rounded text-sm w-full min-w-0 bg-background"
              />
            </>
          )}
          <Button
            disabled={!remoteName || !apiToken || (provider === 'bitbucket' && !bitbucketEmail) || addLinkMutation.isPending}
            onClick={() => addLinkMutation.mutate()}
          >
            {addLinkMutation.isPending ? 'Linking…' : 'Link with API token'}
          </Button>
          {addLinkMutation.isError && (
            <p className="text-sm text-destructive">Failed to link: {(addLinkMutation.error as Error).message}</p>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={!remoteName}
            onClick={() => {
              // Binds the callback to this browser tab, so an attacker can't
              // get a victim to complete this project's repo link using the
              // attacker's own OAuth code (login CSRF) - the nonce only
              // exists in sessionStorage if this tab actually started the
              // flow, and an attacker-crafted callback link can't set it.
              const nonce = crypto.randomUUID();
              sessionStorage.setItem('repoLinkOauthNonce', nonce);
              const state = btoa(JSON.stringify({ projectId, provider, remoteName, nonce }));
              const redirectUri = window.location.origin + "/oauth/callback";
              if (provider === 'bitbucket') {
                const clientId = import.meta.env.VITE_BITBUCKET_CLIENT_ID || "MOCK_CLIENT_ID";
                window.location.href = `https://bitbucket.org/site/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
              } else {
                const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || "MOCK_CLIENT_ID";
                window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=repo`;
              }
            }}
          >
            {provider === 'github'
              ? <GitHubMark className="h-4 w-4 shrink-0" />
              : <GitBranch className="h-4 w-4 shrink-0" aria-hidden="true" />}
            Connect {provider === 'github' ? 'GitHub' : 'Bitbucket'} via OAuth
          </Button>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
