import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, inArray } from "drizzle-orm";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";
import crypto from "node:crypto";
import { logger } from "../../lib/logger";
import { requireUserId, assertOrgMember, assertOrgAdmin, getProjectOrgId, getRepositoryLinkOrgId } from "../../lib/authz";
import { ConnectError, Code } from "@connectrpc/connect";
import { encryptToken, decryptToken } from "../../lib/crypto";
import {
  fetchGithubPullRequests,
  fetchGithubBuilds,
  fetchGithubBuildCommitSha,
  fetchGithubDeployments,
  type NormalizedBuild,
  type NormalizedDeployment,
} from "./providers/github";
import {
  fetchBitbucketPullRequests,
  fetchBitbucketBuilds,
  fetchBitbucketBuildCommitSha,
  fetchBitbucketDeployments,
} from "./providers/bitbucket";

// Distinguishes a real DB-level unique-constraint violation (a concurrent
// syncPullRequests call for the same link won the race for the same remote
// PR) from any other insert failure, so only the former is treated as a
// benign no-op.
function isRemotePrConflict(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e);
  return msg.includes("remote_pull_requests_repo_remote_pr_idx") || msg.includes("UNIQUE constraint failed") || msg.includes("Duplicate entry");
}

const RemoveRepositoryLinkSchema = z.object({
  repositoryLinkId: z.string().min(1, "repositoryLinkId is required"),
});

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
  page: z.object({ limit: z.number().optional() }).nullable().optional(),
});

const ListDeploymentsSchema = z.object({
  buildId: z.string().min(1),
  repositoryLinkId: z.string().min(1),
  commitSha: z.string().min(1),
});


export const createRepositoriesHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  
  return {
    async addRepositoryLink(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = AddRepositoryLinkSchema.parse(req);
      const orgId = await getProjectOrgId(db, parsed.projectId);
      await assertOrgAdmin(db, userId, orgId);

      const links = isStandalone ? schemaSqlite.repositoryLinks : schemaMysql.repositoryLinks;

      let tokenToStore = "";
      let authEmail: string | null = null;
      if (parsed.apiToken) {
        if (parsed.provider !== "github" && parsed.provider !== "bitbucket") {
          throw new ConnectError(`The direct-token flow is only supported for GitHub and Bitbucket, not ${parsed.provider}`, Code.InvalidArgument);
        }
        // GitHub personal access tokens are used as a Bearer token, exactly
        // like an OAuth2 access token, so no authEmail is needed. Bitbucket's
        // Atlassian API tokens require Basic auth, hence the email - already
        // enforced by AddRepositoryLinkSchema's own refine (apiToken with a
        // bitbucket provider requires email), so parsed.email is guaranteed
        // present here for that combination.
        tokenToStore = parsed.apiToken;
        authEmail = parsed.provider === "bitbucket" ? parsed.email! : null;
      } else if (parsed.provider === "github") {
        if (!parsed.oauthCode) throw new ConnectError("oauthCode is required", Code.InvalidArgument);
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
          throw new ConnectError(`Failed to exchange GitHub token: oauthCode is likely invalid or expired`, Code.InvalidArgument);
        }

        const data = await response.json() as any;
        if (data.error) {
          throw new ConnectError(`GitHub OAuth error: ${data.error_description || data.error}`, Code.InvalidArgument);
        }
        if (!data.access_token) {
          throw new ConnectError("GitHub OAuth response did not include an access_token", Code.InvalidArgument);
        }

        tokenToStore = data.access_token;
      } else if (parsed.provider === "bitbucket") {
        if (!parsed.oauthCode) throw new ConnectError("oauthCode is required", Code.InvalidArgument);
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
          throw new ConnectError(`Failed to exchange Bitbucket token: oauthCode is likely invalid or expired`, Code.InvalidArgument);
        }

        const data = await response.json() as any;
        if (data.error) {
          throw new ConnectError(`Bitbucket OAuth error: ${data.error_description || data.error}`, Code.InvalidArgument);
        }
        if (!data.access_token) {
          throw new ConnectError("Bitbucket OAuth response did not include an access_token", Code.InvalidArgument);
        }

        tokenToStore = data.access_token;
      } else {
        throw new ConnectError(`Unsupported repository provider: ${parsed.provider}`, Code.InvalidArgument);
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

      publishDomainEvent(nc, "domain.repository.linked", payload);
      
      return { 
        link: { ...payload, createdAt: new Date().toISOString() } 
      };
    },
    
    async removeRepositoryLink(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = RemoveRepositoryLinkSchema.parse(req);
      const orgId = await getRepositoryLinkOrgId(db, parsed.repositoryLinkId);
      await assertOrgAdmin(db, userId, orgId);

      const links = isStandalone ? schemaSqlite.repositoryLinks : schemaMysql.repositoryLinks;
      const pullRequests = isStandalone ? schemaSqlite.remotePullRequests : schemaMysql.remotePullRequests;

      await db.delete(pullRequests).where(eq((pullRequests as any).repositoryLinkId, parsed.repositoryLinkId));
      await db.delete(links).where(eq((links as any).id, parsed.repositoryLinkId));

      publishDomainEvent(nc, "domain.repository.unlinked", { repositoryLinkId: parsed.repositoryLinkId });
      return { success: true };
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
      // Every task in a project shares the same displayId key prefix (e.g.
      // "SP" in "SP-42" - see projects.key), so it only needs deriving once
      // per sync call, from any one existing displayId, not looked up per PR.
      const keyPrefix = (() => {
        for (const t of projectTasks) {
          const match = /^(.+)-\d+$/.exec(t.displayId ?? "");
          if (match) return match[1];
        }
        return null;
      })();
      // Extracts a "KEY-<number>" token directly out of the title with one
      // regex pass, instead of testing every one of the project's task
      // displayIds against the title - the previous approach was
      // O(tasks x PRs) regex compilations+tests per sync call, which gets
      // very expensive for a project with thousands of tasks.
      const displayIdPattern = keyPrefix ? new RegExp(`\\b${keyPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)\\b`, "g") : null;
      function resolveTaskId(title: string): string | null {
        if (!keyPrefix || !displayIdPattern) return null;
        for (const match of title.matchAll(displayIdPattern)) {
          const taskId = taskIdByDisplayId.get(`${keyPrefix}-${match[1]}`);
          if (taskId) return taskId;
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
              // The existingByRemoteId snapshot was taken once, up front - a
              // concurrent sync for the same link could insert this exact PR
              // in between, so fall back to treating the DB's own unique-
              // constraint violation as "someone else just inserted it",
              // same pattern as createLabel's race handling.
              try {
                await insertRecord(db, prsTable, {
                  id: `pr-${crypto.randomUUID()}`,
                  repositoryLinkId: link.id,
                  taskId,
                  remotePrId: pr.remoteId,
                  title: pr.title,
                  status: pr.status,
                  url: pr.url
                }, isStandalone, 'updatedAt');
              } catch (e) {
                if (!isRemotePrConflict(e)) throw e;
              }
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

      publishDomainEvent(nc, "domain.repository.sync_requested", { projectId: parsed.projectId });

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
          ? await fetchGithubBuilds(link.remoteName, token, parsed.page?.limit)
          : await fetchBitbucketBuilds(link.remoteName, token, link.authEmail, parsed.page?.limit);
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
      let buildCommitSha: string | null;
      try {
        const token = decryptToken(link.accessTokenEncrypted);
        [normalizedDeployments, buildCommitSha] = await Promise.all([
          link.provider === "github"
            ? fetchGithubDeployments(link.remoteName, parsed.commitSha, token)
            : fetchBitbucketDeployments(link.remoteName, parsed.commitSha, token, link.authEmail),
          link.provider === "github"
            ? fetchGithubBuildCommitSha(link.remoteName, parsed.buildId, token)
            : fetchBitbucketBuildCommitSha(link.remoteName, parsed.buildId, token, link.authEmail),
        ]);
      } catch (e) {
        logger.error({ remoteName: link.remoteName, err: e }, "listDeployments.fetch_failed");
        throw e;
      }

      if (buildCommitSha !== parsed.commitSha) {
        throw new ConnectError("buildId does not correspond to the given commitSha", Code.InvalidArgument);
      }

      return { deployments: normalizedDeployments.map((d) => ({ ...d, buildId: parsed.buildId })) };
    }
  };
};
