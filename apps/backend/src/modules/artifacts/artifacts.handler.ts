import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, not } from "drizzle-orm";
import { insertRecord, executePaginatedQuery, notDeleted, softDeleteById, restoreById } from "../../db/query-builder";
import { requireUserId, assertOrgMember, assertOrgAdmin, getProjectOrgId, getFolderOrgId, getTaskOrgId, getArtifactOrgId } from "../../lib/authz";
import { ConnectError, Code } from "@connectrpc/connect";

// --- Zod Request Schemas ---

const CreateFolderSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  parentId: z.string().nullable().optional(),
  name: z.string().min(1, "name is required").max(256),
});

const UpdateFolderSchema = z.object({
  folderId: z.string().min(1, "folderId is required"),
  name: z.string().min(1, "name is required").max(256),
});

const CreateArtifactSchema = z.object({
  folderId: z.string().min(1, "folderId is required"),
  name: z.string().min(1, "name is required").max(256),
  description: z.string().max(1024).optional().default(""),
  // For images, content is base64-encoded and contentType is the image's
  // MIME type (e.g. "image/png") - up to ~10MB of raw image data.
  content: z.string().max(15_000_000).optional().default(""),
  // Proto3 can't distinguish an omitted string field from an empty one - the
  // CLI/GUI always send contentType: "" when the caller didn't pick one - so
  // "" must be treated the same as "not provided" for the default to apply.
  contentType: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).max(128).optional().default("text/markdown")),
});

const UpdateArtifactContentSchema = z.object({
  artifactId: z.string().min(1, "artifactId is required"),
  content: z.string().max(15_000_000),
  contentType: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).max(128).optional()),
});

const LinkTaskArtifactSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  artifactId: z.string().min(1, "artifactId is required"),
});

const ArchiveArtifactSchema = z.object({
  artifactId: z.string().min(1, "artifactId is required"),
});

const RestoreArtifactSchema = z.object({
  artifactId: z.string().min(1, "artifactId is required"),
});

const ArchiveFolderSchema = z.object({
  folderId: z.string().min(1, "folderId is required"),
});

const RestoreFolderSchema = z.object({
  folderId: z.string().min(1, "folderId is required"),
});

const PurgeArtifactSchema = z.object({
  artifactId: z.string().min(1, "artifactId is required"),
});

const PurgeFolderSchema = z.object({
  folderId: z.string().min(1, "folderId is required"),
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
      publishDomainEvent(nc, "domain.folder.created", folderResp);
      return { folder: folderResp };
    },

    async updateFolder(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = UpdateFolderSchema.parse(req);
      const orgId = await getFolderOrgId(db, parsed.folderId);
      await assertOrgMember(db, userId, orgId);

      const folders = isStandalone ? schemaSqlite.folders : schemaMysql.folders;
      const existing = await db.select().from(folders).where(eq((folders as any).id, parsed.folderId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("folder not found", Code.NotFound);

      await db.update(folders).set({ name: parsed.name }).where(eq((folders as any).id, parsed.folderId));

      const updated = { ...existing[0], name: parsed.name };
      publishDomainEvent(nc, "domain.folder.updated", updated);
      return { folder: updated };
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
        contentType: parsed.contentType,
      };

      await insertRecord(db, artifacts, payload, isStandalone);

      publishDomainEvent(nc, "domain.artifact.created", payload);
      return { artifact: payload };
    },

    async updateArtifactContent(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = UpdateArtifactContentSchema.parse(req);
      const orgId = await getArtifactOrgId(db, parsed.artifactId);
      await assertOrgMember(db, userId, orgId);

      const artifacts = isStandalone ? schemaSqlite.artifacts : schemaMysql.artifacts;
      const existing = await db.select().from(artifacts).where(eq((artifacts as any).id, parsed.artifactId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("artifact not found", Code.NotFound);

      const updates = {
        content: parsed.content,
        contentType: parsed.contentType ?? existing[0].contentType,
      };
      await db.update(artifacts).set(updates).where(eq((artifacts as any).id, parsed.artifactId));

      const artifactResp = { ...existing[0], ...updates };
      publishDomainEvent(nc, "domain.artifact.content_updated", artifactResp);
      return { artifact: artifactResp };
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
      if (!req.projectId) throw new ConnectError("projectId is required", Code.InvalidArgument);
      const orgId = await getProjectOrgId(db, req.projectId);
      await assertOrgMember(db, userId, orgId);

      const flds = isStandalone ? schemaSqlite.folders : schemaMysql.folders;
      const deletedFolderFilter = req.onlyDeleted ? not(notDeleted(flds)) : notDeleted(flds);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, flds, and(eq((flds as any).projectId, req.projectId), deletedFolderFilter), req.page, (flds as any).name, { name: (flds as any).name, createdAt: (flds as any).createdAt });

      return {
        folders: items.map((f: any) => ({
          ...f,
          createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : f.createdAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
    async listArtifacts(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      if (!req.folderId) throw new ConnectError("folderId is required", Code.InvalidArgument);
      const orgId = await getFolderOrgId(db, req.folderId);
      await assertOrgMember(db, userId, orgId);

      const arts = isStandalone ? schemaSqlite.artifacts : schemaMysql.artifacts;
      const deletedArtifactFilter = req.onlyDeleted ? not(notDeleted(arts)) : notDeleted(arts);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, arts, and(eq((arts as any).folderId, req.folderId), deletedArtifactFilter), req.page, (arts as any).name, { name: (arts as any).name, createdAt: (arts as any).createdAt });

      return {
        artifacts: items.map((a: any) => ({
          ...a,
          createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
    async archiveArtifact(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = ArchiveArtifactSchema.parse(req);
      const orgId = await getArtifactOrgId(db, parsed.artifactId);
      await assertOrgAdmin(db, userId, orgId);

      const arts = isStandalone ? schemaSqlite.artifacts : schemaMysql.artifacts;
      await softDeleteById(db, arts, parsed.artifactId);

      publishDomainEvent(nc, "domain.artifact.archived", { artifactId: parsed.artifactId });
      return { success: true };
    },
    async restoreArtifact(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = RestoreArtifactSchema.parse(req);
      const orgId = await getArtifactOrgId(db, parsed.artifactId, true);
      await assertOrgAdmin(db, userId, orgId);

      const arts = isStandalone ? schemaSqlite.artifacts : schemaMysql.artifacts;
      await restoreById(db, arts, parsed.artifactId);

      publishDomainEvent(nc, "domain.artifact.restored", { artifactId: parsed.artifactId });
      return { success: true };
    },
    async archiveFolder(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = ArchiveFolderSchema.parse(req);
      const orgId = await getFolderOrgId(db, parsed.folderId);
      await assertOrgAdmin(db, userId, orgId);

      const folders = isStandalone ? schemaSqlite.folders : schemaMysql.folders;
      await softDeleteById(db, folders, parsed.folderId);

      publishDomainEvent(nc, "domain.folder.archived", { folderId: parsed.folderId });
      return { success: true };
    },
    async restoreFolder(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = RestoreFolderSchema.parse(req);
      const orgId = await getFolderOrgId(db, parsed.folderId, true);
      await assertOrgAdmin(db, userId, orgId);

      const folders = isStandalone ? schemaSqlite.folders : schemaMysql.folders;
      await restoreById(db, folders, parsed.folderId);

      publishDomainEvent(nc, "domain.folder.restored", { folderId: parsed.folderId });
      return { success: true };
    },
    async purgeArtifact(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = PurgeArtifactSchema.parse(req);
      const orgId = await getArtifactOrgId(db, parsed.artifactId, true);
      await assertOrgAdmin(db, userId, orgId);

      const arts = isStandalone ? schemaSqlite.artifacts : schemaMysql.artifacts;
      const existing = await db.select().from(arts).where(eq((arts as any).id, parsed.artifactId)).limit(1);
      if (!existing[0]?.deletedAt) {
        throw new ConnectError("artifact must be archived before it can be purged", Code.FailedPrecondition);
      }

      const links = isStandalone ? schemaSqlite.taskArtifactLinks : schemaMysql.taskArtifactLinks;
      const remainingLinks = await db.select().from(links).where(eq((links as any).artifactId, parsed.artifactId));
      if (remainingLinks.length > 0) {
        throw new ConnectError("artifact is still linked to tasks - unlink it first", Code.FailedPrecondition);
      }

      const comments = isStandalone ? schemaSqlite.comments : schemaMysql.comments;
      const entityLabels = isStandalone ? schemaSqlite.entityLabels : schemaMysql.entityLabels;
      await db.delete(comments).where(and(eq((comments as any).entityId, parsed.artifactId), eq((comments as any).entityType, "artifact")));
      await db.delete(entityLabels).where(and(eq((entityLabels as any).entityId, parsed.artifactId), eq((entityLabels as any).entityType, "artifact")));
      await db.delete(arts).where(eq((arts as any).id, parsed.artifactId));

      publishDomainEvent(nc, "domain.artifact.purged", { artifactId: parsed.artifactId });
      return { success: true };
    },
    async purgeFolder(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = PurgeFolderSchema.parse(req);
      const orgId = await getFolderOrgId(db, parsed.folderId, true);
      await assertOrgAdmin(db, userId, orgId);

      const folders = isStandalone ? schemaSqlite.folders : schemaMysql.folders;
      const existing = await db.select().from(folders).where(eq((folders as any).id, parsed.folderId)).limit(1);
      if (!existing[0]?.deletedAt) {
        throw new ConnectError("folder must be archived before it can be purged", Code.FailedPrecondition);
      }

      const arts = isStandalone ? schemaSqlite.artifacts : schemaMysql.artifacts;
      const [remainingChildFolders, remainingArtifacts] = await Promise.all([
        db.select().from(folders).where(eq((folders as any).parentId, parsed.folderId)),
        db.select().from(arts).where(eq((arts as any).folderId, parsed.folderId)),
      ]);
      if (remainingChildFolders.length > 0 || remainingArtifacts.length > 0) {
        throw new ConnectError("folder still has sub-folders or artifacts - archive or remove them first", Code.FailedPrecondition);
      }

      await db.delete(folders).where(eq((folders as any).id, parsed.folderId));

      publishDomainEvent(nc, "domain.folder.purged", { folderId: parsed.folderId });
      return { success: true };
    },
  };
};
