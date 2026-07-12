import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, inArray } from "drizzle-orm";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";
import crypto from "node:crypto";
import { logger } from "../../lib/logger";
import { requireUserId, assertOrgMember, getProjectOrgId, getRepositoryLinkOrgId } from "../../lib/authz";
import { ConnectError, Code } from "@connectrpc/connect";
import { config } from "../../config";

const ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY = config.appEncryptionSecret;

function encryptToken(token: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptToken(encryptedString: string): string {
    const parts = encryptedString.split(':');
    if (parts.length !== 3) throw new Error("Invalid encrypted token format");
    const ivHex = parts[0];
    const authTagHex = parts[1];
    const encryptedHex = parts[2];
    
    if (!ivHex || !authTagHex || !encryptedHex) throw new Error("Missing encrypted components");
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Direct-token links (authEmail set) use Basic auth per Atlassian's API-token
// scheme; OAuth2-issued links (authEmail null) use the token as a Bearer
// access token, per Bitbucket's standard OAuth2 flow.
function bitbucketAuthHeader(token: string, authEmail?: string | null): string {
  if (authEmail) {
    return `Basic ${Buffer.from(`${authEmail}:${token}`).toString('base64')}`;
  }
  return `Bearer ${token}`;
}

const AddRepositoryLinkSchema = z.object({
  projectId: z.string().min(1),
  provider: z.string().min(1),
  remoteName: z.string().min(1),
  oauthCode: z.string().optional(),
  // Direct-token flow - a pre-existing API token used as-is, as an
  // alternative to the OAuth2 authorization-code exchange. For GitHub this
  // is a personal access token, used as a Bearer token exactly like an
  // OAuth2 access token. For Bitbucket this is an Atlassian API token
  // (the app-password replacement), which requires Basic auth, so `email`
  // is required alongside it.
  apiToken: z.string().optional(),
  email: z.string().optional(),
}).refine((v) => {
  if (v.oauthCode) return true;
  if (!v.apiToken) return false;
  return v.provider !== "bitbucket" || !!v.email;
}, {
  message: "either oauthCode, or apiToken (with email required for Bitbucket), is required",
});

const ListRepositoryLinksSchema = z.object({
  projectId: z.string().min(1),
  page: z.any().optional()
});

const SyncPullRequestsSchema = z.object({
  projectId: z.string().min(1)
});

const ListPullRequestsSchema = z.object({
  projectId: z.string().min(1)
});

const ListBuildsSchema = z.object({
  repositoryLinkId: z.string().min(1),
  page: z.any().optional()
});

const ListDeploymentsSchema = z.object({
  buildId: z.string().min(1),
  repositoryLinkId: z.string().min(1),
  commitSha: z.string().min(1),
});

interface NormalizedPullRequest {
  remoteId: string;
  title: string;
  status: string;
  url: string;
}

async function fetchGithubPullRequests(remoteName: string, token: string): Promise<NormalizedPullRequest[]> {
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

async function fetchBitbucketPullRequests(remoteName: string, token: string, authEmail?: string | null): Promise<NormalizedPullRequest[]> {
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

interface NormalizedBuild {
  id: string;
  status: string;
  commitSha: string;
  createdAt: string;
}

async function fetchGithubBuilds(remoteName: string, token: string): Promise<NormalizedBuild[]> {
  const response = await fetch(`https://api.github.com/repos/${remoteName}/actions/runs?per_page=10`, {
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

async function fetchBitbucketBuilds(remoteName: string, token: string, authEmail?: string | null): Promise<NormalizedBuild[]> {
  const response = await fetch(`https://api.bitbucket.org/2.0/repositories/${remoteName}/pipelines/?sort=-created_on&pagelen=10`, {
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

interface NormalizedDeployment {
  id: string;
  environment: string;
  status: string;
  createdAt: string;
}

async function fetchGithubDeployments(remoteName: string, commitSha: string, token: string): Promise<NormalizedDeployment[]> {
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "Tasker-Agent"
  };

  // GitHub deployments are keyed by commit sha, not by our workflow-run
  // based build id - there's no other stable link between a CI run and
  // a deployment, so this is the only correct way to associate them.
  const response = await fetch(`https://api.github.com/repos/${remoteName}/deployments?sha=${commitSha}&per_page=10`, { headers });
  if (!response.ok) throw new Error(`GitHub API returned ${response.status} while fetching deployments for ${remoteName}`);

  const rawDeployments = await response.json() as any[];
  return Promise.all(rawDeployments.map(async (deployment: any) => {
    let status = 'PENDING';
    try {
      // Statuses are returned newest-first; the latest one is this
      // deployment's current state.
      const statusesResponse = await fetch(`https://api.github.com/repos/${remoteName}/deployments/${deployment.id}/statuses?per_page=1`, { headers });
      if (statusesResponse.ok) {
        const statuses = await statusesResponse.json() as any[];
        const state = statuses[0]?.state;
        if (state === 'success') status = 'SUCCESS';
        else if (state === 'failure' || state === 'error') status = 'FAILURE';
      }
    } catch (e) {
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

async function fetchBitbucketDeployments(remoteName: string, commitSha: string, token: string, authEmail?: string | null): Promise<NormalizedDeployment[]> {
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

export const createRepositoriesHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  
  return {
    async addRepositoryLink(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = AddRepositoryLinkSchema.parse(req);
      const orgId = await getProjectOrgId(db, parsed.projectId);
      await assertOrgMember(db, userId, orgId);

      const links = isStandalone ? schemaSqlite.repositoryLinks : schemaMysql.repositoryLinks;

      let tokenToStore = "";
      let authEmail: string | null = null;
      if (parsed.apiToken) {
        if (parsed.provider !== "github" && parsed.provider !== "bitbucket") {
          throw new Error(`The direct-token flow is only supported for GitHub and Bitbucket, not ${parsed.provider}`);
        }
        // GitHub personal access tokens are used as a Bearer token, exactly
        // like an OAuth2 access token, so no authEmail is needed. Bitbucket's
        // Atlassian API tokens require Basic auth, hence the email.
        if (parsed.provider === "bitbucket" && !parsed.email) {
          throw new Error("email is required alongside apiToken for Bitbucket");
        }
        tokenToStore = parsed.apiToken;
        authEmail = parsed.provider === "bitbucket" ? parsed.email! : null;
      } else if (parsed.provider === "github") {
        if (!parsed.oauthCode) throw new Error("oauthCode is required");
        const response = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            client_id: process.env.GITHUB_CLIENT_ID || "",
            client_secret: process.env.GITHUB_CLIENT_SECRET || "",
            code: parsed.oauthCode
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to exchange GitHub token`);
        }

        const data = await response.json() as any;
        if (data.error) {
          throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
        }

        tokenToStore = data.access_token;
      } else if (parsed.provider === "bitbucket") {
        if (!parsed.oauthCode) throw new Error("oauthCode is required");
        // Bitbucket Cloud's OAuth2 token endpoint authenticates the client via
        // HTTP Basic (client_id:client_secret), not a body param like GitHub,
        // and expects a form-encoded body rather than JSON.
        const basicAuth = Buffer.from(`${process.env.BITBUCKET_CLIENT_ID || ""}:${process.env.BITBUCKET_CLIENT_SECRET || ""}`).toString("base64");
        const response = await fetch("https://bitbucket.org/site/oauth2/access_token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${basicAuth}`,
          },
          body: new URLSearchParams({ grant_type: "authorization_code", code: parsed.oauthCode }).toString(),
        });

        if (!response.ok) {
          throw new Error(`Failed to exchange Bitbucket token`);
        }

        const data = await response.json() as any;
        if (data.error) {
          throw new Error(`Bitbucket OAuth error: ${data.error_description || data.error}`);
        }

        tokenToStore = data.access_token;
      } else {
        throw new Error(`Unsupported repository provider: ${parsed.provider}`);
      }
      const accessTokenEncrypted = encryptToken(tokenToStore);

      const newId = `replink-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        projectId: parsed.projectId,
        provider: parsed.provider,
        remoteName: parsed.remoteName,
        accessTokenEncrypted: accessTokenEncrypted,
        authEmail,
      };

      await insertRecord(db, links, payload, isStandalone, true);

      if (nc) nc.publish("domain.repository.linked", Buffer.from(JSON.stringify(payload)));
      
      return { 
        link: { ...payload, createdAt: new Date().toISOString() } 
      };
    },
    
    async listRepositoryLinks(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = ListRepositoryLinksSchema.parse(req);
      const orgId = await getProjectOrgId(db, parsed.projectId);
      await assertOrgMember(db, userId, orgId);

      const links = isStandalone ? schemaSqlite.repositoryLinks : schemaMysql.repositoryLinks;
      
      const { items, nextCursor, totalCount } = await executePaginatedQuery(
          db, 
          links, 
          eq((links as any).projectId, parsed.projectId), 
          parsed.page
      );

      return {
        links: items.map((t: any) => ({
          ...t,
          // Mask the token in the API response!
          accessTokenEncrypted: undefined, 
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
    
    async syncPullRequests(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = SyncPullRequestsSchema.parse(req);
      const orgId = await getProjectOrgId(db, parsed.projectId);
      await assertOrgMember(db, userId, orgId);

      const linksTable = isStandalone ? schemaSqlite.repositoryLinks : schemaMysql.repositoryLinks;
      const prsTable = isStandalone ? schemaSqlite.remotePullRequests : schemaMysql.remotePullRequests;
      const tasksTable = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;

      const links = await db.select().from(linksTable).where(eq((linksTable as any).projectId, parsed.projectId));
      const failures: string[] = [];

      // A PR's title conventionally references a task by its human-readable
      // displayId (e.g. "SP-42: fix login bug") - resolve that back to a real
      // taskId so the GUI can show PRs on their linked task instead of
      // leaving remotePullRequests.taskId permanently null.
      const projectTasks = await db.select({ id: (tasksTable as any).id, displayId: (tasksTable as any).displayId })
        .from(tasksTable)
        .where(eq((tasksTable as any).projectId, parsed.projectId));
      const taskIdByDisplayId = new Map<string, string>(
        projectTasks.filter((t: any) => t.displayId).map((t: any) => [t.displayId, t.id])
      );
      function resolveTaskId(title: string): string | null {
        for (const [displayId, taskId] of taskIdByDisplayId) {
          if (new RegExp(`\\b${displayId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(title)) {
            return taskId;
          }
        }
        return null;
      }

      for (const link of links) {
        if (link.provider !== "github" && link.provider !== "bitbucket") continue;
        try {
          const token = decryptToken(link.accessTokenEncrypted);
          const normalizedPrs = link.provider === "github"
            ? await fetchGithubPullRequests(link.remoteName, token)
            : await fetchBitbucketPullRequests(link.remoteName, token, link.authEmail);

          // Batch-fetch existing PRs for this link once, scoped by repositoryLinkId,
          // instead of querying per-PR (N+1) and matching on remotePrId globally
          // (which could collide with another repo's PR #<n>).
          const existingByRemoteId = new Map<string, any>();
          const existingRows = await db.select().from(prsTable).where(eq((prsTable as any).repositoryLinkId, link.id));
          for (const row of existingRows) {
            existingByRemoteId.set(row.remotePrId, row);
          }

          for (const pr of normalizedPrs) {
            const existing = existingByRemoteId.get(pr.remoteId);
            const taskId = resolveTaskId(pr.title);

            if (!existing) {
              await insertRecord(db, prsTable, {
                id: `pr-${crypto.randomUUID()}`,
                repositoryLinkId: link.id,
                taskId,
                remotePrId: pr.remoteId,
                title: pr.title,
                status: pr.status,
                url: pr.url
              }, isStandalone, 'updatedAt');
            } else {
              await db.update(prsTable).set({
                title: pr.title,
                status: pr.status,
                taskId,
                updatedAt: isStandalone ? new Date() : undefined // MySQL usually has auto-update, but fallback
              }).where(and(eq((prsTable as any).id, existing.id), eq((prsTable as any).repositoryLinkId, link.id)));
            }
          }
        } catch (e) {
           failures.push(link.remoteName);
           logger.error({ remoteName: link.remoteName, err: e }, "syncPullRequests.failed");
        }
      }

      if (nc) nc.publish("domain.repository.sync_requested", Buffer.from(JSON.stringify({ projectId: parsed.projectId })));

      return { success: failures.length === 0 };
    },

    async listPullRequests(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = ListPullRequestsSchema.parse(req);
      const orgId = await getProjectOrgId(db, parsed.projectId);
      await assertOrgMember(db, userId, orgId);

      const linksTable = isStandalone ? schemaSqlite.repositoryLinks : schemaMysql.repositoryLinks;
      const prsTable = isStandalone ? schemaSqlite.remotePullRequests : schemaMysql.remotePullRequests;

      const links = await db.select().from(linksTable).where(eq((linksTable as any).projectId, parsed.projectId));
      if (links.length === 0) return { pullRequests: [] };

      const linkIds = links.map((l: any) => l.id);
      const prs = await db.select().from(prsTable).where(inArray((prsTable as any).repositoryLinkId, linkIds));

      return {
        pullRequests: prs.map((pr: any) => ({
          ...pr,
          updatedAt: pr.updatedAt instanceof Date ? pr.updatedAt.toISOString() : pr.updatedAt,
        })),
      };
    },

    async listBuilds(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = ListBuildsSchema.parse(req);
      const orgId = await getRepositoryLinkOrgId(db, parsed.repositoryLinkId);
      await assertOrgMember(db, userId, orgId);

      const linksTable = isStandalone ? schemaSqlite.repositoryLinks : schemaMysql.repositoryLinks;
      const links = await db.select().from(linksTable).where(eq((linksTable as any).id, parsed.repositoryLinkId));

      if (links.length === 0) throw new ConnectError("Repository link not found", Code.NotFound);
      const link = links[0];

      if (link.provider !== "github" && link.provider !== "bitbucket") {
        return { builds: [] };
      }

      let normalizedBuilds: NormalizedBuild[];
      try {
        const token = decryptToken(link.accessTokenEncrypted);
        normalizedBuilds = link.provider === "github"
          ? await fetchGithubBuilds(link.remoteName, token)
          : await fetchBitbucketBuilds(link.remoteName, token, link.authEmail);
      } catch (e) {
        logger.error({ remoteName: link.remoteName, err: e }, "listBuilds.fetch_failed");
        throw e;
      }

      return { builds: normalizedBuilds.map((b) => ({ ...b, repositoryLinkId: link.id })) };
    },

    async listDeployments(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = ListDeploymentsSchema.parse(req);
      const orgId = await getRepositoryLinkOrgId(db, parsed.repositoryLinkId);
      await assertOrgMember(db, userId, orgId);

      const linksTable = isStandalone ? schemaSqlite.repositoryLinks : schemaMysql.repositoryLinks;
      const links = await db.select().from(linksTable).where(eq((linksTable as any).id, parsed.repositoryLinkId));

      if (links.length === 0) throw new ConnectError("Repository link not found", Code.NotFound);
      const link = links[0];

      if (link.provider !== "github" && link.provider !== "bitbucket") {
        return { deployments: [] };
      }

      let normalizedDeployments: NormalizedDeployment[];
      try {
        const token = decryptToken(link.accessTokenEncrypted);
        normalizedDeployments = link.provider === "github"
          ? await fetchGithubDeployments(link.remoteName, parsed.commitSha, token)
          : await fetchBitbucketDeployments(link.remoteName, parsed.commitSha, token, link.authEmail);
      } catch (e) {
        logger.error({ remoteName: link.remoteName, err: e }, "listDeployments.fetch_failed");
        throw e;
      }

      return { deployments: normalizedDeployments.map((d) => ({ ...d, buildId: parsed.buildId })) };
    }
  };
};
