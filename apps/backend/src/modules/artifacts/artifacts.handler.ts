import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";

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
  };
};
