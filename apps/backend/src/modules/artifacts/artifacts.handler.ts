import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, not, inArray, sql } from "drizzle-orm";
import { insertRecord, executePaginatedQuery, notDeleted, softDeleteById, restoreById } from "../../db/query-builder";
import { requireUser, getProjectOrgId, getFolderOrgId, getTaskOrgId, getArtifactOrgId, requirePrincipal, authorizePrincipal } from "../../lib/authz";
import { assertCan } from "../../lib/policy";
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

const GetArtifactContentSchema = z.object({
  artifactId: z.string().min(1, "artifactId is required"),
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

const UnlinkTaskArtifactSchema = LinkTaskArtifactSchema;

const ListTaskArtifactLinksSchema = z
  .object({
    taskId: z.string().optional(),
    artifactId: z.string().optional(),
  })
  // Proto3 sends "" for an omitted string, so emptiness - not absence - is what
  // "unset" means on the wire.
  .transform((v) => ({ taskId: v.taskId || undefined, artifactId: v.artifactId || undefined }))
  .refine((v) => Boolean(v.taskId) !== Boolean(v.artifactId), {
    message: "exactly one of taskId or artifactId is required",
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
      const principal = requirePrincipal(contextValues);
      const parsed = CreateFolderSchema.parse(req);
      const orgId = await getProjectOrgId(db, parsed.projectId);
      await authorizePrincipal(db, principal, orgId, { scope: 'artifacts:write', permission: 'artifact:write' });

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
      const principal = requirePrincipal(contextValues);
      const parsed = UpdateFolderSchema.parse(req);
      const orgId = await getFolderOrgId(db, parsed.folderId);
      await authorizePrincipal(db, principal, orgId, { scope: 'artifacts:write', permission: 'artifact:write' });

      const folders = isStandalone ? schemaSqlite.folders : schemaMysql.folders;
      const existing = await db.select().from(folders).where(eq((folders as any).id, parsed.folderId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("folder not found", Code.NotFound);

      await db.update(folders).set({ name: parsed.name }).where(eq((folders as any).id, parsed.folderId));

      const updated = { ...existing[0], name: parsed.name };
      publishDomainEvent(nc, "domain.folder.updated", updated);
      return { folder: updated };
    },

    async createArtifact(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = CreateArtifactSchema.parse(req);
      const orgId = await getFolderOrgId(db, parsed.folderId);
      await authorizePrincipal(db, principal, orgId, { scope: 'artifacts:write', permission: 'artifact:write' });

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
      const principal = requirePrincipal(contextValues);
      const parsed = UpdateArtifactContentSchema.parse(req);
      const orgId = await getArtifactOrgId(db, parsed.artifactId);
      await authorizePrincipal(db, principal, orgId, { scope: 'artifacts:write', permission: 'artifact:write' });

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
      const principal = requirePrincipal(contextValues);
      const parsed = LinkTaskArtifactSchema.parse(req);
      const taskOrgId = await getTaskOrgId(db, parsed.taskId);
      const artifactOrgId = await getArtifactOrgId(db, parsed.artifactId);
      if (taskOrgId !== artifactOrgId) {
        throw new ConnectError("task and artifact belong to different organizations", Code.InvalidArgument);
      }
      await authorizePrincipal(db, principal, taskOrgId, { scope: 'artifacts:write', permission: 'artifact:write' });

      const links = isStandalone ? schemaSqlite.taskArtifactLinks : schemaMysql.taskArtifactLinks;
      const newId = `tal-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        taskId: parsed.taskId,
        artifactId: parsed.artifactId,
      };

      // Clicking twice used to produce two rows, and the artifact then appeared
      // twice on the task. Same treatment as assignTask: a duplicate is
      // success, and the existing row is what comes back.
      const existing = await db
        .select()
        .from(links)
        .where(and(eq((links as any).taskId, parsed.taskId), eq((links as any).artifactId, parsed.artifactId)))
        .limit(1);
      if (existing.length > 0) return { link: existing[0] };

      await insertRecord(db, links, payload, isStandalone, false);
      return { link: payload };
    },
    async unlinkTaskArtifact(req: unknown, { values: contextValues }: { values: any }) {
      // requireUser, not requirePrincipal: an agent that can detach its own
      // output from the task it was given can hide the work. Same argument that
      // keeps unassignTask closed to tokens.
      const userId = requireUser(contextValues);
      const parsed = UnlinkTaskArtifactSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "artifact:write");

      const links = isStandalone ? schemaSqlite.taskArtifactLinks : schemaMysql.taskArtifactLinks;
      // Matched on the exact pair. Matching on the task alone would unlink
      // every artifact on it; on the artifact alone, every task.
      await db
        .delete(links)
        .where(and(eq((links as any).taskId, parsed.taskId), eq((links as any).artifactId, parsed.artifactId)));
      return { success: true };
    },
    async listTaskArtifactLinks(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = ListTaskArtifactLinksSchema.parse(req);
      const orgId = parsed.taskId
        ? await getTaskOrgId(db, parsed.taskId)
        : await getArtifactOrgId(db, parsed.artifactId!);
      await authorizePrincipal(db, principal, orgId, { scope: 'artifacts:read', permission: 'artifact:read' });

      const links = isStandalone ? schemaSqlite.taskArtifactLinks : schemaMysql.taskArtifactLinks;
      const arts = isStandalone ? schemaSqlite.artifacts : schemaMysql.artifacts;
      const tsks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;

      const rows = await db
        .select()
        .from(links)
        .where(parsed.taskId ? eq((links as any).taskId, parsed.taskId) : eq((links as any).artifactId, parsed.artifactId!));
      if (rows.length === 0) return { links: [] };

      // Two lookups for the whole set rather than two per row. Note the artifact
      // select names its columns: `content` can hold ~15MB of base64 image, and
      // a link list has no use for it.
      const artifactIds = [...new Set(rows.map((r: any) => r.artifactId))];
      const taskIds = [...new Set(rows.map((r: any) => r.taskId))];
      const artifactRows = await db
        .select({ id: (arts as any).id, name: (arts as any).name })
        .from(arts)
        .where(inArray((arts as any).id, artifactIds));
      const taskRows = await db
        .select({ id: (tsks as any).id, title: (tsks as any).title })
        .from(tsks)
        .where(inArray((tsks as any).id, taskIds));
      const artifactName = new Map(artifactRows.map((a: any) => [a.id, a.name]));
      const taskTitle = new Map(taskRows.map((t: any) => [t.id, t.title]));

      return {
        links: rows.map((r: any) => ({
          id: r.id,
          taskId: r.taskId,
          artifactId: r.artifactId,
          // The id is a poor label but an identifiable one; blank reads as a
          // rendering bug.
          artifactName: artifactName.get(r.artifactId) ?? r.artifactId,
          taskTitle: taskTitle.get(r.taskId) ?? r.taskId,
        })),
      };
    },
    async listFolders(req: any, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      if (!req.projectId) throw new ConnectError("projectId is required", Code.InvalidArgument);
      const orgId = await getProjectOrgId(db, req.projectId);
      await authorizePrincipal(db, principal, orgId, { scope: 'artifacts:read', permission: 'artifact:read' });

      const flds = isStandalone ? schemaSqlite.folders : schemaMysql.folders;
      const deletedFolderFilter = req.onlyDeleted ? not(notDeleted(flds)) : notDeleted(flds);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(
        db,
        flds,
        and(eq((flds as any).projectId, req.projectId), deletedFolderFilter),
        req.page,
        {
          filterColumn: (flds as any).name,
          sortableColumns: { name: (flds as any).name, createdAt: (flds as any).createdAt },
          select: {
            id: (flds as any).id,
            projectId: (flds as any).projectId,
            parentId: (flds as any).parentId,
            name: (flds as any).name,
            createdAt: (flds as any).createdAt,
            deletedAt: (flds as any).deletedAt,
          },
        },
      );

      return {
        folders: items.map((f: any) => ({
          ...f,
          createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : f.createdAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
    async listArtifacts(req: any, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      if (!req.folderId && !req.projectId) {
        throw new ConnectError("folderId or projectId is required", Code.InvalidArgument);
      }
      // Authorized against whichever scope the caller named — a project-wide
      // list is not a weaker check, it is the same check one level up.
      const orgId = req.folderId
        ? await getFolderOrgId(db, req.folderId)
        : await getProjectOrgId(db, req.projectId);
      await authorizePrincipal(db, principal, orgId, { scope: 'artifacts:read', permission: 'artifact:read' });

      const arts = isStandalone ? schemaSqlite.artifacts : schemaMysql.artifacts;
      const flds2 = isStandalone ? schemaSqlite.folders : schemaMysql.folders;
      const deletedArtifactFilter = req.onlyDeleted ? not(notDeleted(arts)) : notDeleted(arts);
      // Project scope resolves through the folder table rather than fanning out
      // one request per folder, which is what the Bin used to do.
      const scopeCondition = req.folderId
        ? eq((arts as any).folderId, req.folderId)
        : inArray(
            (arts as any).folderId,
            db.select({ id: (flds2 as any).id }).from(flds2).where(eq((flds2 as any).projectId, req.projectId)),
          );
      const { items, nextCursor, totalCount } = await executePaginatedQuery(
        db,
        arts,
        and(scopeCondition, deletedArtifactFilter),
        req.page,
        {
          filterColumn: (arts as any).name,
          sortableColumns: { name: (arts as any).name, createdAt: (arts as any).createdAt },
          // `content` is deliberately absent. It holds the artifact body — up
          // to ~15 MB of base64 for an image — and a file listing needs the
          // name, not the bytes. With `SELECT *` this response was 2,008 KB
          // for 50 images (M07-T01).
          select: {
            id: (arts as any).id,
            folderId: (arts as any).folderId,
            name: (arts as any).name,
            description: (arts as any).description,
            contentType: (arts as any).contentType,
            createdAt: (arts as any).createdAt,
            deletedAt: (arts as any).deletedAt,
            // `length()` is evaluated by the database; the body itself stays
            // there. This is what lets a listing show a file's size without
            // being proportional to it.
            sizeBytes: sql<number>`length(${(arts as any).content})`,
          },
        },
      );

      return {
        artifacts: items.map((a: any) => ({
          ...a,
          createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
          sizeBytes: BigInt(a.sizeBytes ?? 0),
        })),
        page: { nextCursor, totalCount },
      };
    },
    /**
     * One artifact's body.
     *
     * `listArtifacts` no longer returns `content` (M07-T01), so this is how a
     * viewer gets the bytes — one artifact at a time, when something is
     * actually about to render it, rather than every body in the folder on the
     * chance that one of them is opened.
     */
    /**
     * One artifact by id, without its body.
     *
     * Exists because a deep link carries an artifact id and nothing else. The
     * GUI used to resolve that by listing every folder in the project and every
     * page of each until the row turned up — O(folders x pages) requests to
     * find one row (M07-T12).
     */
    async getArtifact(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = GetArtifactContentSchema.parse(req);
      const orgId = await getArtifactOrgId(db, parsed.artifactId);
      await authorizePrincipal(db, principal, orgId, { scope: 'artifacts:read', permission: 'artifact:read' });

      const arts = isStandalone ? schemaSqlite.artifacts : schemaMysql.artifacts;
      // Names its columns for the same reason the list does: `content` can hold
      // ~15 MB of base64, and this response is not where it belongs.
      const rows = await db
        .select({
          id: (arts as any).id,
          folderId: (arts as any).folderId,
          name: (arts as any).name,
          description: (arts as any).description,
          contentType: (arts as any).contentType,
        })
        .from(arts)
        .where(and(eq((arts as any).id, parsed.artifactId), notDeleted(arts)))
        .limit(1);
      if (rows.length === 0) throw new ConnectError("Artifact not found", Code.NotFound);

      return { artifact: rows[0] };
    },

    async getArtifactContent(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = GetArtifactContentSchema.parse(req);
      // Authorized against the artifact's own organization, exactly as the
      // list is - a narrower response is not a weaker check.
      const orgId = await getArtifactOrgId(db, parsed.artifactId);
      await authorizePrincipal(db, principal, orgId, { scope: 'artifacts:read', permission: 'artifact:read' });

      const arts = isStandalone ? schemaSqlite.artifacts : schemaMysql.artifacts;
      const rows = await db
        .select({
          content: (arts as any).content,
          contentType: (arts as any).contentType,
        })
        .from(arts)
        .where(eq((arts as any).id, parsed.artifactId))
        .limit(1);
      if (!rows || rows.length === 0) throw new ConnectError("artifact not found", Code.NotFound);

      const content = rows[0].content ?? "";
      return {
        content,
        contentType: rows[0].contentType,
        sizeBytes: BigInt(content.length),
      };
    },
    async archiveArtifact(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ArchiveArtifactSchema.parse(req);
      const orgId = await getArtifactOrgId(db, parsed.artifactId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "artifact:admin");

      const arts = isStandalone ? schemaSqlite.artifacts : schemaMysql.artifacts;
      await softDeleteById(db, arts, parsed.artifactId);

      publishDomainEvent(nc, "domain.artifact.archived", { artifactId: parsed.artifactId });
      return { success: true };
    },
    async restoreArtifact(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RestoreArtifactSchema.parse(req);
      const orgId = await getArtifactOrgId(db, parsed.artifactId, true);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "artifact:admin");

      const arts = isStandalone ? schemaSqlite.artifacts : schemaMysql.artifacts;
      await restoreById(db, arts, parsed.artifactId);

      publishDomainEvent(nc, "domain.artifact.restored", { artifactId: parsed.artifactId });
      return { success: true };
    },
    async archiveFolder(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ArchiveFolderSchema.parse(req);
      const orgId = await getFolderOrgId(db, parsed.folderId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "artifact:admin");

      const folders = isStandalone ? schemaSqlite.folders : schemaMysql.folders;
      await softDeleteById(db, folders, parsed.folderId);

      publishDomainEvent(nc, "domain.folder.archived", { folderId: parsed.folderId });
      return { success: true };
    },
    async restoreFolder(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RestoreFolderSchema.parse(req);
      const orgId = await getFolderOrgId(db, parsed.folderId, true);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "artifact:admin");

      const folders = isStandalone ? schemaSqlite.folders : schemaMysql.folders;
      await restoreById(db, folders, parsed.folderId);

      publishDomainEvent(nc, "domain.folder.restored", { folderId: parsed.folderId });
      return { success: true };
    },
    async purgeArtifact(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = PurgeArtifactSchema.parse(req);
      const orgId = await getArtifactOrgId(db, parsed.artifactId, true);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "artifact:admin");

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
      const userId = requireUser(contextValues);
      const parsed = PurgeFolderSchema.parse(req);
      const orgId = await getFolderOrgId(db, parsed.folderId, true);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "artifact:admin");

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
