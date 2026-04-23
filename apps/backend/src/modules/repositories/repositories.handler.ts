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
      const linksTable = isStandalone ? schemaSqlite.repositoryLinks : schemaMysql.repositoryLinks;
      const prsTable = isStandalone ? schemaSqlite.remotePullRequests : schemaMysql.remotePullRequests;
      
      const links = await db.select().from(linksTable).where(eq((linksTable as any).projectId, parsed.projectId));
      
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
            if (response.ok) {
              const prs = await response.json() as any[];
              for (const pr of prs) {
                const existing = await db.select().from(prsTable).where(eq((prsTable as any).remotePrId, String(pr.number)));
                const prStatus = pr.merged_at ? 'merged' : (pr.state === 'closed' ? 'closed' : (pr.draft ? 'draft' : 'open'));
                
                if (existing.length === 0) {
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
                  }).where(eq((prsTable as any).id, existing[0].id));
                }
              }
            }
          } catch (e) {
             console.error("Failed to sync repo", link.remoteName, e);
          }
        }
      }
      
      if (nc) nc.publish("domain.repository.sync_requested", Buffer.from(JSON.stringify({ projectId: parsed.projectId })));
      
      return { success: true };
    }
  };
};
