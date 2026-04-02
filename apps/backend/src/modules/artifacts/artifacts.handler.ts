import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and } from "drizzle-orm";
import { decodeCursor, encodeCursor, buildCursorPaginationWhere, buildPaginationOrderBy } from "../../db/query-builder";

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

// --- Dual-mode Insert Helper ---

const insertRecord = async (
  db: any,
  table: any,
  payload: Record<string, unknown>,
  isStandalone: boolean,
  withTimestamp = true
) => {
  if (isStandalone && withTimestamp) {
    await db.insert(table).values({ ...payload, createdAt: new Date() });
  } else {
    await db.insert(table).values(payload);
  }
};

// --- Handler Factory ---

export const createArtifactsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";

  return {
    async createFolder(req: unknown) {
      const parsed = CreateFolderSchema.parse(req);
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

    async createArtifact(req: unknown) {
      const parsed = CreateArtifactSchema.parse(req);
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

    async linkTaskArtifact(req: unknown) {
      const parsed = LinkTaskArtifactSchema.parse(req);
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
    async listFolders(req: any) {
      if (!req.projectId) throw new Error("projectId is required");
      const page = req.page || {};
      const limit = Math.min(page.limit || 50, 100);
      const cursorData = decodeCursor(page.cursor);

      const flds = isStandalone ? schemaSqlite.folders : schemaMysql.folders;
      let query = db.select().from(flds).where(eq((flds as any).projectId, req.projectId)).limit(limit) as any;

      query = query.orderBy(...buildPaginationOrderBy(flds.createdAt as any, flds.id as any));
      const whereClause = buildCursorPaginationWhere(cursorData, flds.createdAt as any, flds.id as any);
      if (whereClause) {
        query = db.select().from(flds).where(and(eq((flds as any).projectId, req.projectId), whereClause)).limit(limit).orderBy(...buildPaginationOrderBy(flds.createdAt as any, flds.id as any)) as any;
      }

      const result = await query;
      const lastItem = result[result.length - 1];
      const nextCursor = lastItem && result.length === limit ? encodeCursor((lastItem.createdAt instanceof Date ? lastItem.createdAt : new Date(lastItem.createdAt)).getTime(), lastItem.id) : undefined;

      return {
        folders: result.map((f: any) => ({
          ...f,
          createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : f.createdAt,
        })),
        page: { nextCursor },
      };
    },
    async listArtifacts(req: any) {
      if (!req.folderId) throw new Error("folderId is required");
      const page = req.page || {};
      const limit = Math.min(page.limit || 50, 100);
      const cursorData = decodeCursor(page.cursor);

      const arts = isStandalone ? schemaSqlite.artifacts : schemaMysql.artifacts;
      let query = db.select().from(arts).where(eq((arts as any).folderId, req.folderId)).limit(limit) as any;

      query = query.orderBy(...buildPaginationOrderBy(arts.createdAt as any, arts.id as any));
      const whereClause = buildCursorPaginationWhere(cursorData, arts.createdAt as any, arts.id as any);
      if (whereClause) {
        query = db.select().from(arts).where(and(eq((arts as any).folderId, req.folderId), whereClause)).limit(limit).orderBy(...buildPaginationOrderBy(arts.createdAt as any, arts.id as any)) as any;
      }

      const result = await query;
      const lastItem = result[result.length - 1];
      const nextCursor = lastItem && result.length === limit ? encodeCursor((lastItem.createdAt instanceof Date ? lastItem.createdAt : new Date(lastItem.createdAt)).getTime(), lastItem.id) : undefined;

      return {
        artifacts: result.map((a: any) => ({
          ...a,
          createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
        })),
        page: { nextCursor },
      };
    },
  };
};
