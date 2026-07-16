import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, not } from "drizzle-orm";
import { insertRecord, executePaginatedQuery, notDeleted, softDeleteById, restoreById } from "../../db/query-builder";
import { requireUserId, assertOrgMember, assertOrgAdmin } from "../../lib/authz";
import { ConnectError, Code } from "@connectrpc/connect";

/** Derives a short, human-typeable project key from its name, e.g. "Engineering Docs" -> "ED", "Backend" -> "BACKEN". */
function baseKeyFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const raw = words.length > 1 ? words.map((w) => w[0]).join("") : name;
  const alnum = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (alnum || "PROJ").slice(0, 6);
}

/** Appends a numeric suffix until the key is unique within the org - project keys are the display-ID prefix, so collisions would be genuinely confusing. */
async function generateUniqueProjectKey(db: any, projectsTable: any, orgId: string, name: string): Promise<string> {
  const base = baseKeyFromName(name);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = await db.select().from(projectsTable)
      .where(and(eq((projectsTable as any).orgId, orgId), eq((projectsTable as any).key, candidate)))
      .limit(1);
    if (!existing || existing.length === 0) return candidate;
    candidate = `${base}${suffix}`;
    suffix++;
  }
}

/**
 * This SELECT-then-INSERT check alone can't prevent two concurrent requests
 * from both picking the same "unique" candidate key before either commits -
 * the DB-level unique index (projects_org_id_key_idx) is what actually
 * prevents the duplicate, and this recognizes that specific violation so the
 * caller can regenerate a fresh candidate and retry instead of surfacing a
 * raw DB error.
 */
function isProjectKeyConflict(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e);
  return msg.includes("projects_org_id_key_idx") || msg.includes("UNIQUE constraint failed") || msg.includes("Duplicate entry");
}

// --- Zod Request Schemas ---

const GetProjectSchema = z.object({
  id: z.string().min(1, "id is required"),
});

const CreateProjectSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  templateId: z.string().min(1, "templateId is required"),
  name: z.string().min(1, "name is required").max(256),
  ownerId: z.string().min(1, "ownerId is required"),
});

const GetTemplateSchema = z.object({
  id: z.string().min(1, "id is required"),
});

const CreateTemplateSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  name: z.string().min(1, "name is required").max(256),
  description: z.string().max(1024).optional().default(""),
  rootTaskTypeId: z.string().nullable().optional(),
});

const UpdateProjectSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  name: z.string().min(1, "name is required").max(256),
});

const UpdateTemplateSchema = z.object({
  id: z.string().min(1, "id is required"),
  name: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).max(256).optional()),
  description: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(1024).optional()),
  rootTaskTypeId: z.preprocess((v) => (v === "" ? undefined : v), z.string().nullable().optional()),
});

const ArchiveProjectSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
});

const RestoreProjectSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
});

const PurgeProjectSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
});

// --- Handler Factories ---

export const createProjectsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async getProject(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = GetProjectSchema.parse(req);
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const result = await db.select().from(ps).where(eq((ps as any).id, parsed.id)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("project not found", Code.NotFound);
      await assertOrgMember(db, userId, result[0].orgId);
      return { project: result[0] };
    },
    async createProject(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = CreateProjectSchema.parse(req);
      await assertOrgMember(db, userId, parsed.orgId);
      try {
        await assertOrgMember(db, parsed.ownerId, parsed.orgId);
      } catch (e) {
        if (e instanceof ConnectError && e.code === Code.PermissionDenied) {
          throw new ConnectError("ownerId is not a member of this organization", Code.InvalidArgument);
        }
        throw e;
      }

      const templates = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
      const templateRows = await db.select().from(templates).where(eq((templates as any).id, parsed.templateId)).limit(1);
      if (!templateRows || templateRows.length === 0) {
        throw new ConnectError("template not found", Code.NotFound);
      }
      if (templateRows[0].orgId !== parsed.orgId) {
        throw new ConnectError("template belongs to a different organization", Code.InvalidArgument);
      }

      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const newId = `p-${crypto.randomUUID()}`;

      // Retry on a real DB-level key conflict (a concurrent request won the
      // race for the same candidate key), not just the pre-check above.
      const MAX_ATTEMPTS = 5;
      let lastError: unknown;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const key = await generateUniqueProjectKey(db, ps, parsed.orgId, parsed.name);
        const payload = {
          id: newId,
          orgId: parsed.orgId,
          templateId: parsed.templateId,
          name: parsed.name,
          key,
          nextTaskNumber: 1,
          ownerId: parsed.ownerId,
        };
        try {
          await insertRecord(db, ps, payload, isStandalone);
          publishDomainEvent(nc, "domain.project.created", payload);
          return { project: payload };
        } catch (e) {
          if (!isProjectKeyConflict(e)) throw e;
          lastError = e;
        }
      }
      throw lastError;
    },
    async listProjects(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      if (!req.orgId) throw new ConnectError("orgId is required", Code.InvalidArgument);
      await assertOrgMember(db, userId, req.orgId);

      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const deletedFilter = req.onlyDeleted ? not(notDeleted(ps)) : notDeleted(ps);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, ps, and(eq((ps as any).orgId, req.orgId), deletedFilter), req.page, (ps as any).name, { name: (ps as any).name, createdAt: (ps as any).createdAt });

      return {
        projects: items.map((p: any) => ({
          ...p,
          createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
    async updateProject(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = UpdateProjectSchema.parse(req);
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const result = await db.select().from(ps).where(eq((ps as any).id, parsed.projectId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("project not found", Code.NotFound);
      await assertOrgMember(db, userId, result[0].orgId);

      await db.update(ps).set({ name: parsed.name }).where(eq((ps as any).id, parsed.projectId));

      const updated = { ...result[0], name: parsed.name };
      publishDomainEvent(nc, "domain.project.updated", updated);
      return { project: updated };
    },
    async archiveProject(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = ArchiveProjectSchema.parse(req);
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const result = await db.select().from(ps).where(eq((ps as any).id, parsed.projectId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("project not found", Code.NotFound);
      await assertOrgAdmin(db, userId, result[0].orgId);

      await softDeleteById(db, ps, parsed.projectId);

      publishDomainEvent(nc, "domain.project.archived", { projectId: parsed.projectId });
      return { success: true };
    },
    async restoreProject(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = RestoreProjectSchema.parse(req);
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const result = await db.select().from(ps).where(eq((ps as any).id, parsed.projectId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("project not found", Code.NotFound);
      await assertOrgAdmin(db, userId, result[0].orgId);

      const orgsTable = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const orgRows = await db.select().from(orgsTable).where(eq((orgsTable as any).id, result[0].orgId)).limit(1);
      if (orgRows[0]?.deletedAt) {
        throw new ConnectError("cannot restore a project into an archived organization - restore the organization first", Code.FailedPrecondition);
      }

      await restoreById(db, ps, parsed.projectId);

      publishDomainEvent(nc, "domain.project.restored", { projectId: parsed.projectId });
      return { success: true };
    },
    async purgeProject(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = PurgeProjectSchema.parse(req);
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const result = await db.select().from(ps).where(eq((ps as any).id, parsed.projectId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("project not found", Code.NotFound);
      await assertOrgAdmin(db, userId, result[0].orgId);
      if (!result[0].deletedAt) {
        throw new ConnectError("project must be archived before it can be purged", Code.FailedPrecondition);
      }

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const folders = isStandalone ? schemaSqlite.folders : schemaMysql.folders;
      const repositoryLinks = isStandalone ? schemaSqlite.repositoryLinks : schemaMysql.repositoryLinks;

      const [remainingTasks, remainingFolders, remainingRepoLinks] = await Promise.all([
        db.select().from(tasks).where(eq((tasks as any).projectId, parsed.projectId)),
        db.select().from(folders).where(eq((folders as any).projectId, parsed.projectId)),
        db.select().from(repositoryLinks).where(eq((repositoryLinks as any).projectId, parsed.projectId)),
      ]);
      if (remainingTasks.length > 0 || remainingFolders.length > 0 || remainingRepoLinks.length > 0) {
        throw new ConnectError("project still has tasks, folders, or repository links - archive or remove them first", Code.FailedPrecondition);
      }

      // Project-scoped task types have no dedicated delete/archive endpoint
      // of their own, so - unlike tasks/folders/repositoryLinks above - they
      // can't be "removed first" by the caller. Force-cascade them here,
      // same as purgeOrg does for org-scoped task types, instead of leaving
      // them behind with a dangling projectId once the project is gone.
      const taskTypes = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const taskStatuses = isStandalone ? schemaSqlite.taskStatuses : schemaMysql.taskStatuses;
      const taskStatusTransitions = isStandalone ? schemaSqlite.taskStatusTransitions : schemaMysql.taskStatusTransitions;
      const projectTaskTypes = await db.select().from(taskTypes).where(eq((taskTypes as any).projectId, parsed.projectId));
      for (const taskType of projectTaskTypes) {
        await db.delete(taskStatusTransitions).where(eq((taskStatusTransitions as any).taskTypeId, taskType.id));
        await db.delete(taskStatuses).where(eq((taskStatuses as any).taskTypeId, taskType.id));
        await db.delete(taskTypes).where(eq((taskTypes as any).id, taskType.id));
      }

      await db.delete(ps).where(eq((ps as any).id, parsed.projectId));

      publishDomainEvent(nc, "domain.project.purged", { projectId: parsed.projectId });
      return { success: true };
    },
  };
};

export const createProjectTemplatesHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async getTemplate(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = GetTemplateSchema.parse(req);
      const pts = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
      const result = await db.select().from(pts).where(eq((pts as any).id, parsed.id)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("template not found", Code.NotFound);
      await assertOrgMember(db, userId, result[0].orgId);
      return { template: result[0] };
    },
    async createTemplate(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = CreateTemplateSchema.parse(req);
      await assertOrgMember(db, userId, parsed.orgId);

      if (parsed.rootTaskTypeId) {
        const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
        const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.rootTaskTypeId)).limit(1);
        if (!typeRows || typeRows.length === 0) throw new ConnectError("root task type not found", Code.NotFound);
        if (typeRows[0].orgId !== parsed.orgId) {
          throw new ConnectError("root task type belongs to a different organization", Code.InvalidArgument);
        }
      }

      const pts = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
      const newId = `pt-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        orgId: parsed.orgId,
        name: parsed.name,
        description: parsed.description,
        rootTaskTypeId: parsed.rootTaskTypeId || null,
      };

      await insertRecord(db, pts, payload, isStandalone);

      publishDomainEvent(nc, "domain.project_template.created", payload);
      return { template: payload };
    },
    async updateTemplate(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = UpdateTemplateSchema.parse(req);
      const pts = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
      const result = await db.select().from(pts).where(eq((pts as any).id, parsed.id)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("template not found", Code.NotFound);
      await assertOrgMember(db, userId, result[0].orgId);

      if (parsed.rootTaskTypeId) {
        const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
        const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.rootTaskTypeId)).limit(1);
        if (!typeRows || typeRows.length === 0) throw new ConnectError("root task type not found", Code.NotFound);
        if (typeRows[0].orgId !== result[0].orgId) {
          throw new ConnectError("root task type belongs to a different organization", Code.InvalidArgument);
        }
      }

      const updates: Record<string, unknown> = {};
      if (parsed.name !== undefined) updates.name = parsed.name;
      if (parsed.description !== undefined) updates.description = parsed.description;
      if (parsed.rootTaskTypeId !== undefined) updates.rootTaskTypeId = parsed.rootTaskTypeId;

      await db.update(pts).set(updates).where(eq((pts as any).id, parsed.id));

      const updated = { ...result[0], ...updates };
      publishDomainEvent(nc, "domain.project_template.updated", updated);
      return { template: updated };
    },
    async listTemplates(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      if (!req.orgId) throw new ConnectError("orgId is required", Code.InvalidArgument);
      await assertOrgMember(db, userId, req.orgId);

      const pts = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, pts, eq((pts as any).orgId, req.orgId), req.page, (pts as any).name, { name: (pts as any).name, createdAt: (pts as any).createdAt });

      return {
        templates: items.map((t: any) => ({
          ...t,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
  };
};
