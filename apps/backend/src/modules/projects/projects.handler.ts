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

      const templates = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
      const templateRows = await db.select().from(templates).where(eq((templates as any).id, parsed.templateId)).limit(1);
      if (!templateRows || templateRows.length === 0) {
        throw new ConnectError("template not found", Code.NotFound);
      }
      if (templateRows[0].orgId !== parsed.orgId) {
        throw new ConnectError("template belongs to a different organization", Code.InvalidArgument);
      }

      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const key = await generateUniqueProjectKey(db, ps, parsed.orgId, parsed.name);
      const newId = `p-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        orgId: parsed.orgId,
        templateId: parsed.templateId,
        name: parsed.name,
        key,
        nextTaskNumber: 1,
        ownerId: parsed.ownerId,
      };

      await insertRecord(db, ps, payload, isStandalone);

      if (nc) nc.publish("domain.project.created", Buffer.from(JSON.stringify(payload)));
      return { project: payload };
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
    async archiveProject(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = ArchiveProjectSchema.parse(req);
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const result = await db.select().from(ps).where(eq((ps as any).id, parsed.projectId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("project not found", Code.NotFound);
      await assertOrgAdmin(db, userId, result[0].orgId);

      await softDeleteById(db, ps, parsed.projectId);

      if (nc) nc.publish("domain.project.archived", Buffer.from(JSON.stringify({ projectId: parsed.projectId })));
      return { success: true };
    },
    async restoreProject(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = RestoreProjectSchema.parse(req);
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const result = await db.select().from(ps).where(eq((ps as any).id, parsed.projectId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("project not found", Code.NotFound);
      await assertOrgAdmin(db, userId, result[0].orgId);

      await restoreById(db, ps, parsed.projectId);

      if (nc) nc.publish("domain.project.restored", Buffer.from(JSON.stringify({ projectId: parsed.projectId })));
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

      await db.delete(ps).where(eq((ps as any).id, parsed.projectId));

      if (nc) nc.publish("domain.project.purged", Buffer.from(JSON.stringify({ projectId: parsed.projectId })));
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

      if (nc) nc.publish("domain.project_template.created", Buffer.from(JSON.stringify(payload)));
      return { template: payload };
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
