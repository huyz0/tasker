import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, inArray } from "drizzle-orm";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";
import crypto from "node:crypto";
import { logger } from "../../lib/logger";
import { requireUserId, assertOrgMember, getProjectOrgId, getRepositoryLinkOrgId } from "../../lib/authz";
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

const AddRepositoryLinkSchema = z.object({
  projectId: z.string().min(1),
  provider: z.string().min(1),
  remoteName: z.string().min(1),
  oauthCode: z.string().min(1)
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
      if (parsed.provider === "github") {
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
      } else {
        // Fallback for other providers that aren't implemented yet
        tokenToStore = `mock_token_${parsed.oauthCode}`;
      }
      const accessTokenEncrypted = encryptToken(tokenToStore);

      const newId = `replink-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        projectId: parsed.projectId,
        provider: parsed.provider,
        remoteName: parsed.remoteName,
        accessTokenEncrypted: accessTokenEncrypted,
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
      
      const { items, nextCursor } = await executePaginatedQuery(
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
        page: { nextCursor },
      };
    },
    
    async syncPullRequests(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = SyncPullRequestsSchema.parse(req);
      const orgId = await getProjectOrgId(db, parsed.projectId);
      await assertOrgMember(db, userId, orgId);

      const linksTable = isStandalone ? schemaSqlite.repositoryLinks : schemaMysql.repositoryLinks;
      const prsTable = isStandalone ? schemaSqlite.remotePullRequests : schemaMysql.remotePullRequests;

      const links = await db.select().from(linksTable).where(eq((linksTable as any).projectId, parsed.projectId));
      const failures: string[] = [];

      for (const link of links) {
        if (link.provider === "github") {
          try {
            const token = decryptToken(link.accessTokenEncrypted);
            const response = await fetch(`https://api.github.com/repos/${link.remoteName}/pulls?state=all&per_page=50`, {
              headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "Tasker-Agent"
              }
            });
            if (!response.ok) {
              failures.push(link.remoteName);
              logger.error({ remoteName: link.remoteName, status: response.status }, "syncPullRequests.provider_error");
              continue;
            }
            const prs = await response.json() as any[];

            // Batch-fetch existing PRs for this link once, scoped by repositoryLinkId,
            // instead of querying per-PR (N+1) and matching on remotePrId globally
            // (which could collide with another repo's PR #<n>).
            const existingByRemoteId = new Map<string, any>();
            const existingRows = await db.select().from(prsTable).where(eq((prsTable as any).repositoryLinkId, link.id));
            for (const row of existingRows) {
              existingByRemoteId.set(row.remotePrId, row);
            }

            for (const pr of prs) {
              const existing = existingByRemoteId.get(String(pr.number));
              const prStatus = pr.merged_at ? 'merged' : (pr.state === 'closed' ? 'closed' : (pr.draft ? 'draft' : 'open'));

              if (!existing) {
                await insertRecord(db, prsTable, {
                  id: `pr-${crypto.randomUUID()}`,
                  repositoryLinkId: link.id,
                  remotePrId: String(pr.number),
                  title: pr.title,
                  status: prStatus,
                  url: pr.html_url
                }, isStandalone, 'updatedAt');
              } else {
                await db.update(prsTable).set({
                  title: pr.title,
                  status: prStatus,
                  updatedAt: isStandalone ? new Date() : undefined // MySQL usually has auto-update, but fallback
                }).where(and(eq((prsTable as any).id, existing.id), eq((prsTable as any).repositoryLinkId, link.id)));
              }
            }
          } catch (e) {
             failures.push(link.remoteName);
             logger.error({ remoteName: link.remoteName, err: e }, "syncPullRequests.failed");
          }
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

      if (links.length === 0) throw new Error("Repository link not found");
      const link = links[0];
      
      if (link.provider === "github") {
        let response: Response;
        try {
          const token = decryptToken(link.accessTokenEncrypted);
          response = await fetch(`https://api.github.com/repos/${link.remoteName}/actions/runs?per_page=10`, {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Accept": "application/vnd.github.v3+json",
              "User-Agent": "Tasker-Agent"
            }
          });
        } catch (e) {
          logger.error({ remoteName: link.remoteName, err: e }, "listBuilds.fetch_failed");
          throw new Error(`Failed to fetch builds for ${link.remoteName}: ${(e as Error).message}`);
        }

        if (!response.ok) {
          logger.error({ remoteName: link.remoteName, status: response.status }, "listBuilds.provider_error");
          throw new Error(`GitHub API returned ${response.status} while fetching builds for ${link.remoteName}`);
        }

        const data = await response.json() as any;
        const builds = data.workflow_runs.map((run: any) => {
           let status = 'PENDING';
           if (run.status === 'completed') {
             status = run.conclusion === 'success' ? 'SUCCESS' : 'FAILURE';
           }
           return {
             id: String(run.id),
             repositoryLinkId: link.id,
             status: status,
             commitSha: run.head_sha,
             createdAt: run.created_at
           };
        });
        return { builds };
      }
      return { builds: [] };
    },

    async listDeployments(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = ListDeploymentsSchema.parse(req);
      const orgId = await getRepositoryLinkOrgId(db, parsed.repositoryLinkId);
      await assertOrgMember(db, userId, orgId);

      const linksTable = isStandalone ? schemaSqlite.repositoryLinks : schemaMysql.repositoryLinks;
      const links = await db.select().from(linksTable).where(eq((linksTable as any).id, parsed.repositoryLinkId));

      if (links.length === 0) throw new Error("Repository link not found");
      const link = links[0];

      if (link.provider !== "github") {
        return { deployments: [] };
      }

      const token = decryptToken(link.accessTokenEncrypted);
      const headers = {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Tasker-Agent"
      };

      let deploymentsResponse: Response;
      try {
        // GitHub deployments are keyed by commit sha, not by our workflow-run
        // based build id - there's no other stable link between a CI run and
        // a deployment, so this is the only correct way to associate them.
        deploymentsResponse = await fetch(
          `https://api.github.com/repos/${link.remoteName}/deployments?sha=${parsed.commitSha}&per_page=10`,
          { headers }
        );
      } catch (e) {
        logger.error({ remoteName: link.remoteName, err: e }, "listDeployments.fetch_failed");
        throw new Error(`Failed to fetch deployments for ${link.remoteName}: ${(e as Error).message}`);
      }

      if (!deploymentsResponse.ok) {
        logger.error({ remoteName: link.remoteName, status: deploymentsResponse.status }, "listDeployments.provider_error");
        throw new Error(`GitHub API returned ${deploymentsResponse.status} while fetching deployments for ${link.remoteName}`);
      }

      const rawDeployments = await deploymentsResponse.json() as any[];

      const deployments = await Promise.all(rawDeployments.map(async (deployment: any) => {
        let status = 'PENDING';
        try {
          // Statuses are returned newest-first; the latest one is this
          // deployment's current state.
          const statusesResponse = await fetch(
            `https://api.github.com/repos/${link.remoteName}/deployments/${deployment.id}/statuses?per_page=1`,
            { headers }
          );
          if (statusesResponse.ok) {
            const statuses = await statusesResponse.json() as any[];
            const state = statuses[0]?.state;
            if (state === 'success') status = 'SUCCESS';
            else if (state === 'failure' || state === 'error') status = 'FAILURE';
          }
        } catch (e) {
          logger.error({ remoteName: link.remoteName, deploymentId: deployment.id, err: e }, "listDeployments.status_fetch_failed");
        }

        return {
          id: String(deployment.id),
          buildId: parsed.buildId,
          environment: deployment.environment,
          status,
          createdAt: deployment.created_at,
        };
      }));

      return { deployments };
    }
  };
};
