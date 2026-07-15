import { logger } from "../../../lib/logger";

export interface NormalizedPullRequest {
  remoteId: string;
  title: string;
  status: string;
  url: string;
}

export interface NormalizedBuild {
  id: string;
  status: string;
  commitSha: string;
  createdAt: string;
}

export interface NormalizedDeployment {
  id: string;
  environment: string;
  status: string;
  createdAt: string;
}

// GitHub/Bitbucket cap page size at 100; clamp so a caller-supplied limit
// can't be used to request an unbounded page from the upstream provider.
export function clampBuildsPerPage(limit: number | undefined): number {
  return Math.min(Math.max(limit || 10, 1), 100);
}

export async function fetchGithubPullRequests(remoteName: string, token: string): Promise<NormalizedPullRequest[]> {
  const response = await fetch(`https://api.github.com/repos/${remoteName}/pulls?state=all&per_page=50`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Tasker-Agent"
    }
  });
  if (!response.ok) throw new Error(`GitHub API returned ${response.status} while fetching pull requests for ${remoteName}`);

  const prs = await response.json() as any[];
  return prs.map((pr: any) => ({
    remoteId: String(pr.number),
    title: pr.title,
    status: pr.merged_at ? 'merged' : (pr.state === 'closed' ? 'closed' : (pr.draft ? 'draft' : 'open')),
    url: pr.html_url,
  }));
}

export async function fetchGithubBuilds(remoteName: string, token: string, limit?: number): Promise<NormalizedBuild[]> {
  const response = await fetch(`https://api.github.com/repos/${remoteName}/actions/runs?per_page=${clampBuildsPerPage(limit)}`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Tasker-Agent"
    }
  });
  if (!response.ok) throw new Error(`GitHub API returned ${response.status} while fetching builds for ${remoteName}`);

  const data = await response.json() as any;
  return data.workflow_runs.map((run: any) => {
    let status = 'PENDING';
    if (run.status === 'completed') {
      status = run.conclusion === 'success' ? 'SUCCESS' : 'FAILURE';
    }
    return {
      id: String(run.id),
      status,
      commitSha: run.head_sha,
      createdAt: run.created_at,
    };
  });
}

// Fetches a single build by id so listDeployments can confirm the
// caller-supplied buildId actually produced commitSha before echoing it back
// - without this, a caller could pass any buildId (even one belonging to a
// different commit or repository) and have it silently attached to
// unrelated deployment records in the response.
export async function fetchGithubBuildCommitSha(remoteName: string, buildId: string, token: string): Promise<string | null> {
  const response = await fetch(`https://api.github.com/repos/${remoteName}/actions/runs/${buildId}`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Tasker-Agent"
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub API returned ${response.status} while fetching build ${buildId} for ${remoteName}`);
  const run = await response.json() as any;
  return run.head_sha ?? null;
}

// GitHub's REST API has no way to fetch a deployment's latest status in the
// same call as the deployments list, so resolving status for N deployments
// unavoidably means N extra requests. `per_page=10` bounds the fan-out to a
// small, fixed number rather than letting it grow with the repo's history,
// and each of those N requests gets its own timeout so one slow/hanging
// upstream call can't stall the whole listDeployments request indefinitely.
const GITHUB_STATUS_FETCH_TIMEOUT_MS = 5000;

export async function fetchGithubDeployments(remoteName: string, commitSha: string, token: string): Promise<NormalizedDeployment[]> {
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "Tasker-Agent"
  };

  // GitHub deployments are keyed by commit sha, not by our workflow-run
  // based build id - there's no other stable link between a CI run and
  // a deployment, so this is the only correct way to associate them.
  const response = await fetch(`https://api.github.com/repos/${remoteName}/deployments?sha=${commitSha}&per_page=10`, { headers, signal: AbortSignal.timeout(GITHUB_STATUS_FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`GitHub API returned ${response.status} while fetching deployments for ${remoteName}`);

  const rawDeployments = await response.json() as any[];
  return Promise.all(rawDeployments.map(async (deployment: any) => {
    let status = 'PENDING';
    try {
      // Statuses are returned newest-first; the latest one is this
      // deployment's current state.
      const statusesResponse = await fetch(`https://api.github.com/repos/${remoteName}/deployments/${deployment.id}/statuses?per_page=1`, { headers, signal: AbortSignal.timeout(GITHUB_STATUS_FETCH_TIMEOUT_MS) });
      if (statusesResponse.ok) {
        const statuses = await statusesResponse.json() as any[];
        const state = statuses[0]?.state;
        if (state === 'success') status = 'SUCCESS';
        else if (state === 'failure' || state === 'error') status = 'FAILURE';
      }
    } catch (e) {
      // Includes a timed-out status fetch (AbortSignal.timeout throws a
      // DOMException) - one deployment's status being unavailable
      // shouldn't fail the whole list, it just stays 'PENDING'.
      logger.error({ remoteName, deploymentId: deployment.id, err: e }, "listDeployments.status_fetch_failed");
    }

    return {
      id: String(deployment.id),
      environment: deployment.environment,
      status,
      createdAt: deployment.created_at,
    };
  }));
}
