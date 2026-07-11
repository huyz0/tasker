import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq } from "drizzle-orm";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";
import { requireUserId, assertOrgMember, getProjectOrgId, getFolderOrgId, getTaskOrgId, getArtifactOrgId } from "../../lib/authz";
import { ConnectError, Code } from "@connectrpc/connect";

// --- Zod Request Schemas ---

const CreateFolderSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  parentId: z.string().nullable().optional(),
  name: z.string().min(1, "name is required").max(256),
});

const CreateArtifactSchema = z.object({
  folderId: z.string().min(1, "folderId is required"),
  name: z.string().min(1, "name is required").max(256),
  description: z.string().max(1024).optional().default(""),
  content: z.string().max(8192).optional().default(""),
});

const LinkTaskArtifactSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  artifactId: z.string().min(1, "artifactId is required"),
});

// --- Handler Factory ---

export const createArtifactsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";

  return {
    async createFolder(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = CreateFolderSchema.parse(req);
      const orgId = await getProjectOrgId(db, parsed.projectId);
      await assertOrgMember(db, userId, orgId);

      if (parsed.parentId) {
        const folders = isStandalone ? schemaSqlite.folders : schemaMysql.folders;
        const parentRows = await db.select().from(folders).where(eq((folders as any).id, parsed.parentId)).limit(1);
        if (!parentRows || parentRows.length === 0) throw new ConnectError("parent folder not found", Code.NotFound);
        if (parentRows[0].projectId !== parsed.projectId) {
          throw new ConnectError("parent folder belongs to a different project", Code.InvalidArgument);
        }
      }

      const folders = isStandalone ? schemaSqlite.folders : schemaMysql.folders;
      const newId = `fld-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        projectId: parsed.projectId,
        parentId: parsed.parentId || null,
        name: parsed.name,
      };

      await insertRecord(db, folders, payload, isStandalone);

      const folderResp = { ...payload };
      if (nc) nc.publish("domain.folder.created", Buffer.from(JSON.stringify(folderResp)));
      return { folder: folderResp };
    },

    async createArtifact(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = CreateArtifactSchema.parse(req);
      const orgId = await getFolderOrgId(db, parsed.folderId);
      await assertOrgMember(db, userId, orgId);

      const artifacts = isStandalone ? schemaSqlite.artifacts : schemaMysql.artifacts;
      const newId = `art-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        folderId: parsed.folderId,
        name: parsed.name,
        description: parsed.description,
        content: parsed.content,
      };

      await insertRecord(db, artifacts, payload, isStandalone);

      if (nc) nc.publish("domain.artifact.created", Buffer.from(JSON.stringify(payload)));
      return { artifact: payload };
    },

    async linkTaskArtifact(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = LinkTaskArtifactSchema.parse(req);
      const taskOrgId = await getTaskOrgId(db, parsed.taskId);
      const artifactOrgId = await getArtifactOrgId(db, parsed.artifactId);
      if (taskOrgId !== artifactOrgId) {
        throw new ConnectError("task and artifact belong to different organizations", Code.InvalidArgument);
      }
      await assertOrgMember(db, userId, taskOrgId);

      const links = isStandalone ? schemaSqlite.taskArtifactLinks : schemaMysql.taskArtifactLinks;
      const newId = `tal-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        taskId: parsed.taskId,
        artifactId: parsed.artifactId,
      };

      await insertRecord(db, links, payload, isStandalone, false);
      return { link: payload };
    },
    async listFolders(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      if (!req.projectId) throw new Error("projectId is required");
      const orgId = await getProjectOrgId(db, req.projectId);
      await assertOrgMember(db, userId, orgId);

      const flds = isStandalone ? schemaSqlite.folders : schemaMysql.folders;
      const { items, nextCursor } = await executePaginatedQuery(db, flds, eq((flds as any).projectId, req.projectId), req.page);

      return {
        folders: items.map((f: any) => ({
          ...f,
          createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : f.createdAt,
        })),
        page: { nextCursor },
      };
    },
    async listArtifacts(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      if (!req.folderId) throw new Error("folderId is required");
      const orgId = await getFolderOrgId(db, req.folderId);
      await assertOrgMember(db, userId, orgId);

      const arts = isStandalone ? schemaSqlite.artifacts : schemaMysql.artifacts;
      const { items, nextCursor } = await executePaginatedQuery(db, arts, eq((arts as any).folderId, req.folderId), req.page);

      return {
        artifacts: items.map((a: any) => ({
          ...a,
          createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
        })),
        page: { nextCursor },
      };
    },
  };
};
