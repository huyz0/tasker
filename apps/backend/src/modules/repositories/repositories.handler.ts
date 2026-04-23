import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq } from "drizzle-orm";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY = process.env.APP_ENCRYPTION_SECRET || "00000000000000000000000000000000"; // Fallback for dev only

function encryptToken(token: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
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

export const createRepositoriesHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  
  return {
    async addRepositoryLink(req: unknown) {
      const parsed = AddRepositoryLinkSchema.parse(req);
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
    
    async listRepositoryLinks(req: unknown) {
      const parsed = ListRepositoryLinksSchema.parse(req);
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
    
    async syncPullRequests(req: unknown) {
      const parsed = SyncPullRequestsSchema.parse(req);
      // Background logic would trigger a worker or external integration service here
      if (nc) nc.publish("domain.repository.sync_requested", Buffer.from(JSON.stringify({ projectId: parsed.projectId })));
      
      return { success: true };
    }
  };
};
