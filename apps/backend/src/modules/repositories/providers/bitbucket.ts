import type { NormalizedPullRequest, NormalizedBuild, NormalizedDeployment } from "./github";
import { clampBuildsPerPage } from "./github";

// Direct-token links (authEmail set) use Basic auth per Atlassian's API-token
// scheme; OAuth2-issued links (authEmail null) use the token as a Bearer
// access token, per Bitbucket's standard OAuth2 flow.
export function bitbucketAuthHeader(token: string, authEmail?: string | null): string {
  if (authEmail) {
    return `Basic ${Buffer.from(`${authEmail}:${token}`).toString('base64')}`;
  }
  return `Bearer ${token}`;
}

export async function fetchBitbucketPullRequests(remoteName: string, token: string, authEmail?: string | null): Promise<NormalizedPullRequest[]> {
  // Bitbucket Cloud's pullrequests endpoint only returns OPEN PRs unless
  // explicitly told otherwise - repeat the `state` param per value to mirror
  // GitHub's state=all.
  const response = await fetch(
    `https://api.bitbucket.org/2.0/repositories/${remoteName}/pullrequests?state=OPEN&state=MERGED&state=DECLINED&state=SUPERSEDED&pagelen=50`,
    { headers: { "Authorization": bitbucketAuthHeader(token, authEmail) } }
  );
  if (!response.ok) throw new Error(`Bitbucket API returned ${response.status} while fetching pull requests for ${remoteName}`);

  const data = await response.json() as any;
  const prs = (data.values || []) as any[];
  return prs.map((pr: any) => ({
    remoteId: String(pr.id),
    title: pr.title,
    status: pr.state === 'MERGED' ? 'merged' : (pr.state === 'OPEN' ? (pr.draft ? 'draft' : 'open') : 'closed'),
    url: pr.links?.html?.href,
  }));
}

export async function fetchBitbucketBuilds(remoteName: string, token: string, authEmail?: string | null, limit?: number): Promise<NormalizedBuild[]> {
  const response = await fetch(`https://api.bitbucket.org/2.0/repositories/${remoteName}/pipelines/?sort=-created_on&pagelen=${clampBuildsPerPage(limit)}`, {
    headers: { "Authorization": bitbucketAuthHeader(token, authEmail) }
  });
  if (!response.ok) throw new Error(`Bitbucket API returned ${response.status} while fetching builds for ${remoteName}`);

  const data = await response.json() as any;
  const pipelines = (data.values || []) as any[];
  return pipelines.map((pipeline: any) => {
    let status = 'PENDING';
    if (pipeline.state?.name === 'COMPLETED') {
      status = pipeline.state?.result?.name === 'SUCCESSFUL' ? 'SUCCESS' : 'FAILURE';
    }
    return {
      id: String(pipeline.uuid).replace(/[{}]/g, ''),
      status,
      commitSha: pipeline.target?.commit?.hash,
      createdAt: pipeline.created_on,
    };
  });
}

export async function fetchBitbucketBuildCommitSha(remoteName: string, buildId: string, token: string, authEmail?: string | null): Promise<string | null> {
  const response = await fetch(`https://api.bitbucket.org/2.0/repositories/${remoteName}/pipelines/${buildId}`, {
    headers: { "Authorization": bitbucketAuthHeader(token, authEmail) }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Bitbucket API returned ${response.status} while fetching build ${buildId} for ${remoteName}`);
  const pipeline = await response.json() as any;
  return pipeline.target?.commit?.hash ?? null;
}

export async function fetchBitbucketDeployments(remoteName: string, commitSha: string, token: string, authEmail?: string | null): Promise<NormalizedDeployment[]> {
  const headers = { "Authorization": bitbucketAuthHeader(token, authEmail) };

  // Bitbucket's deployments endpoint has no server-side commit-sha filter,
  // unlike GitHub's - fetch recent deployments and filter client-side by the
  // commit hash on each deployment's deployable.
  const response = await fetch(`https://api.bitbucket.org/2.0/repositories/${remoteName}/deployments/?sort=-created_on&pagelen=25`, { headers });
  if (!response.ok) throw new Error(`Bitbucket API returned ${response.status} while fetching deployments for ${remoteName}`);

  const data = await response.json() as any;
  const deployments = (data.values || []) as any[];
  return deployments
    .filter((deployment: any) => deployment.deployable?.commit?.hash === commitSha)
    .map((deployment: any) => {
      let status = 'PENDING';
      if (deployment.state?.name === 'COMPLETED') {
        status = deployment.state?.status === 'SUCCESSFUL' ? 'SUCCESS' : 'FAILURE';
      }
      return {
        id: String(deployment.uuid).replace(/[{}]/g, ''),
        environment: deployment.environment?.name,
        status,
        createdAt: deployment.created_on ?? new Date().toISOString(),
      };
    });
}
