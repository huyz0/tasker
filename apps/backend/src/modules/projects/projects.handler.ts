import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, not } from "drizzle-orm";
import { insertRecord, executePaginatedQuery, notDeleted, softDeleteById, restoreById } from "../../db/query-builder";
import { requireUser, requirePrincipal, authorizePrincipal } from "../../lib/authz";
import { assertCan } from "../../lib/policy";
import { bulkPurgeTaskTypes } from "../../lib/cascadePurge";
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

// Distinguishes a real DB-level unique-constraint violation (a concurrent
// createTemplate/updateTemplate call won the race for the same name) from
// any other insert/update failure, so only the former is treated as a
// benign name collision rather than a raw DB error reaching the caller
// (M20-T04, same pattern as artifacts.handler.ts/labels.handler.ts).
function isUniqueConstraintConflict(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e);
  return (
    msg.includes("project_templates_org_id_name_idx") ||
    msg.includes("UNIQUE constraint failed") ||
    msg.includes("Duplicate entry")
  );
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
  description: z.string().max(1024).optional().default(""),
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
  // Real proto3 presence, not the "" -> unset squash M14-T01 had to fix for
  // tasks: unset means "don't touch the description", an explicit empty
  // string means "clear it", and the two must stay distinguishable here too.
  description: z.string().max(1024).optional(),
});

const UpdateTemplateSchema = z.object({
  id: z.string().min(1, "id is required"),
  // M20-T03: real proto3 presence (UpdateProjectTemplateRequest already
  // declares all three fields `optional`), not the "" -> unset squash that
  // used to sit here - unset meant "don't touch", but so did an *explicit*
  // empty description or root task type, which made both permanently
  // unclearable: the handler echoed back the stale value as if the save
  // had worked. `name` keeps a floor of 1: unlike description/
  // rootTaskTypeId, an empty name isn't a meaningful "clear", it's just
  // invalid input, same as CreateTemplateSchema already requires on create.
  name: z.string().min(1, "name cannot be empty").max(256).optional(),
  description: z.string().max(1024).optional(),
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

const ListProjectsSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  page: z.any().optional(),
  onlyDeleted: z.boolean().optional(),
});

const ListTemplatesSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  page: z.any().optional(),
});

// --- Handler Factories ---

export const createProjectsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async getProject(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = GetProjectSchema.parse(req);
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const result = await db.select().from(ps).where(eq((ps as any).id, parsed.id)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("project not found", Code.NotFound);
      // Project scope, not organization scope: a project-scoped grant (M10-T10)
      // must reach this on its own, without also holding org-wide access.
      // can()'s project->org ancestor climbing means an org-level grant still
      // works too - this only widens what's accepted, never narrows it.
      await authorizePrincipal(db, principal, result[0].orgId, { scope: 'projects:read', permission: 'project:read' }, { type: 'project', id: parsed.id });
      // M20-T01: deletedAt is a JS Date straight off the row (or null) - the
      // wire field is `string deletedAt = 6`, and connect's protobuf JSON
      // encoder throws ("expected string, got object") on a Date, not just
      // silently stringifying it. Every archived project 500'd on this RPC.
      // M20-T02: createdAt needs the same conversion now that it's on the
      // wire at all - previously computing it here would have been pointless
      // since Project had nowhere to put it.
      return {
        project: {
          ...result[0],
          deletedAt: result[0].deletedAt instanceof Date ? result[0].deletedAt.toISOString() : result[0].deletedAt,
          createdAt: result[0].createdAt instanceof Date ? result[0].createdAt.toISOString() : result[0].createdAt,
        },
      };
    },
    async createProject(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = CreateProjectSchema.parse(req);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: parsed.orgId }, "project:write");
      try {
        await assertCan(db, { kind: "user", userId: parsed.ownerId }, { type: "organization", id: parsed.orgId }, "project:write");
      } catch (e) {
        if (e instanceof ConnectError && e.code === Code.PermissionDenied) {
          // M20-T04: assertCan reports PermissionDenied for both "not a
          // member at all" and "a member, but their role (e.g. viewer,
          // ADR-0006) lacks project:write" - the old message claimed the
          // former unconditionally, which is simply false for the latter
          // case and sends whoever reads it looking at the member list for
          // a name that's actually right there.
          throw new ConnectError("ownerId cannot own a project in this organization - not a member, or their role lacks project:write", Code.InvalidArgument);
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
        // M20-T02: set explicitly rather than left to insertRecord's default
        // - that default only fires in standalone/sqlite mode, and either
        // way it was never added to the object returned below, only to the
        // copy insertRecord wrote to the DB (same bug already fixed for
        // Agents/Artifacts/Tasks' create* RPCs).
        const payload = {
          id: newId,
          orgId: parsed.orgId,
          templateId: parsed.templateId,
          name: parsed.name,
          key,
          nextTaskNumber: 1,
          ownerId: parsed.ownerId,
          description: parsed.description,
          createdAt: new Date(),
        };
        try {
          await insertRecord(db, ps, payload, isStandalone, false);
          const projectResp = { ...payload, createdAt: payload.createdAt.toISOString() };
          publishDomainEvent(nc, "domain.project.created", projectResp);
          return { project: projectResp };
        } catch (e) {
          if (!isProjectKeyConflict(e)) throw e;
          lastError = e;
        }
      }
      throw lastError;
    },
    async listProjects(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = ListProjectsSchema.parse(req);
      await authorizePrincipal(db, principal, parsed.orgId, { scope: 'projects:read', permission: 'project:read' });

      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const deletedFilter = parsed.onlyDeleted ? not(notDeleted(ps)) : notDeleted(ps);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, ps, and(eq((ps as any).orgId, parsed.orgId), deletedFilter), parsed.page, {
        filterColumn: (ps as any).name,
        sortableColumns: { name: (ps as any).name, createdAt: (ps as any).createdAt },
        select: {
          id: (ps as any).id,
          orgId: (ps as any).orgId,
          templateId: (ps as any).templateId,
          name: (ps as any).name,
          key: (ps as any).key,
          ownerId: (ps as any).ownerId,
          description: (ps as any).description,
          createdAt: (ps as any).createdAt,
          deletedAt: (ps as any).deletedAt,
        },
        // M20-T02: onlyDeleted narrows `scope` (baseCondition) just as much
        // as the free-text filter does, but executePaginatedQuery's cached-
        // totalCount guard only ever compared `filter` - a cursor minted
        // while paging active projects and then reused against a request
        // for the bin (or vice versa) would report the wrong set's count.
        // Same fix as M19-T03's listTasks facets.
        extraCacheKey: parsed.onlyDeleted ? "1" : "0",
      });

      return {
        projects: items.map((p: any) => ({
          ...p,
          createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
          // M20-T01: see getProject's comment - the same Date-vs-string
          // encoding crash, and this is the path that actually triggers it
          // in practice (onlyDeleted:true selects nothing but archived
          // rows, so every row here has a non-null deletedAt).
          deletedAt: p.deletedAt instanceof Date ? p.deletedAt.toISOString() : p.deletedAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
    async updateProject(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = UpdateProjectSchema.parse(req);
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const result = await db.select().from(ps).where(eq((ps as any).id, parsed.projectId)).limit(1);
      // Project scope, not organization scope: a project-scoped grant
      // (M10-T10) must reach this on its own. can()'s project->org ancestor
      // climbing means an org-level grant still works too.
      if (!result || result.length === 0) throw new ConnectError("project not found", Code.NotFound);
      await assertCan(db, { kind: "user", userId }, { type: "project", id: parsed.projectId }, "project:write");

      const updates: Record<string, unknown> = { name: parsed.name };
      if (parsed.description !== undefined) updates.description = parsed.description;
      await db.update(ps).set(updates).where(eq((ps as any).id, parsed.projectId));

      const updated = {
        ...result[0],
        ...updates,
        // M20-T01: same Date-vs-string encoding crash as getProject/
        // listProjects - reachable here too since nothing stops updateProject
        // from being called on an already-archived row.
        deletedAt: result[0].deletedAt instanceof Date ? result[0].deletedAt.toISOString() : result[0].deletedAt,
        createdAt: result[0].createdAt instanceof Date ? result[0].createdAt.toISOString() : result[0].createdAt,
      };
      publishDomainEvent(nc, "domain.project.updated", updated);
      return { project: updated };
    },
    async archiveProject(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ArchiveProjectSchema.parse(req);
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const result = await db.select().from(ps).where(eq((ps as any).id, parsed.projectId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("project not found", Code.NotFound);
      await assertCan(db, { kind: "user", userId }, { type: "project", id: parsed.projectId }, "project:admin");

      await softDeleteById(db, ps, parsed.projectId);

      publishDomainEvent(nc, "domain.project.archived", { projectId: parsed.projectId });
      return { success: true };
    },
    async restoreProject(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RestoreProjectSchema.parse(req);
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const result = await db.select().from(ps).where(eq((ps as any).id, parsed.projectId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("project not found", Code.NotFound);
      await assertCan(db, { kind: "user", userId }, { type: "project", id: parsed.projectId }, "project:admin");

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
      const userId = requireUser(contextValues);
      const parsed = PurgeProjectSchema.parse(req);
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const result = await db.select().from(ps).where(eq((ps as any).id, parsed.projectId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("project not found", Code.NotFound);
      await assertCan(db, { kind: "user", userId }, { type: "project", id: parsed.projectId }, "project:admin");
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
        // M20-T04: this counts *all* rows including already-soft-deleted
        // ones, so "archive... them first" describes a state that still
        // fails the same check - archiving a task leaves its row in place.
        // The workflow that actually clears this precondition is deleting
        // (soft) and then purging each child, as M14-T03's own test
        // demonstrates.
        throw new ConnectError("project still has tasks, folders, or repository links - delete and purge each of them first", Code.FailedPrecondition);
      }

      // Project-scoped task types have no dedicated delete/archive endpoint
      // of their own, so - unlike tasks/folders/repositoryLinks above - they
      // can't be "removed first" by the caller. Force-cascade them here,
      // same as purgeOrg does for org-scoped task types, instead of leaving
      // them behind with a dangling projectId once the project is gone.
      // M20-T04: shares cascadePurge.ts's bulkPurgeTaskTypes rather than
      // re-implementing the same three deletes as a one-row-at-a-time loop -
      // this manual version had already drifted (bulk statements vs. N
      // round trips per task type) from the one purgeOrgCascade/
      // purgeProjectCascade use.
      const schema = isStandalone ? schemaSqlite : schemaMysql;
      const taskTypes = schema.taskTypes;
      const projectTaskTypes = await db.select({ id: (taskTypes as any).id }).from(taskTypes).where(eq((taskTypes as any).projectId, parsed.projectId));
      await bulkPurgeTaskTypes(db, schema, projectTaskTypes.map((t: any) => t.id));

      // M20-T03: a project-scoped grant (M10-T10) has no delete/archive
      // endpoint of its own either - revokeGrant/listGrants both resolve
      // their scope's org via getProjectOrgId, which 404s once the project
      // is gone. Left behind, the row becomes permanently unrevokable and
      // unlistable through any RPC: a stale authorization entry nothing can
      // ever reach again. Cleared here the same way project-scoped task
      // types are, just above.
      const grants = isStandalone ? schemaSqlite.grants : schemaMysql.grants;
      await db.delete(grants).where(and(eq((grants as any).scopeType, "project"), eq((grants as any).scopeId, parsed.projectId)));

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
      const principal = requirePrincipal(contextValues);
      const parsed = GetTemplateSchema.parse(req);
      const pts = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
      const result = await db.select().from(pts).where(eq((pts as any).id, parsed.id)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("template not found", Code.NotFound);
      await authorizePrincipal(db, principal, result[0].orgId, { scope: 'projects:read', permission: 'project:read' });
      return {
        template: {
          ...result[0],
          createdAt: result[0].createdAt instanceof Date ? result[0].createdAt.toISOString() : result[0].createdAt,
        },
      };
    },
    async createTemplate(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = CreateTemplateSchema.parse(req);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: parsed.orgId }, "project:write");

      if (parsed.rootTaskTypeId) {
        const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
        const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.rootTaskTypeId)).limit(1);
        if (!typeRows || typeRows.length === 0) throw new ConnectError("root task type not found", Code.NotFound);
        if (typeRows[0].orgId !== parsed.orgId) {
          throw new ConnectError("root task type belongs to a different organization", Code.InvalidArgument);
        }
        // M20-T03: a template is org-wide, so a project-scoped task type
        // accepted as its root leaves purgeProject nowhere safe to purge
        // that one project without deleting the type out from under every
        // template pointing at it - see updateTemplate's identical check.
        if (typeRows[0].projectId) {
          throw new ConnectError("root task type must be org-wide, not scoped to a project", Code.InvalidArgument);
        }
      }

      const pts = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;

      // M20-T04: two identically-named templates in one org were silently
      // allowed. The unique index backs it at the DB level; this pre-check
      // just gives the common case a clean AlreadyExists instead of a raw
      // DB error.
      const nameConflict = await db.select().from(pts).where(and(eq((pts as any).orgId, parsed.orgId), eq((pts as any).name, parsed.name))).limit(1);
      if (nameConflict.length > 0) {
        throw new ConnectError("a template with this name already exists in this organization", Code.AlreadyExists);
      }

      const newId = `pt-${crypto.randomUUID()}`;
      // M20-T02: same never-set createdAt fix as createProject above.
      const payload = {
        id: newId,
        orgId: parsed.orgId,
        name: parsed.name,
        description: parsed.description,
        rootTaskTypeId: parsed.rootTaskTypeId || null,
        createdAt: new Date(),
      };

      // The select-then-insert check above has a race window - fall back to
      // catching the DB's own unique-constraint violation for a concurrent
      // duplicate insert, so it surfaces as AlreadyExists instead of a raw
      // DB error.
      try {
        await insertRecord(db, pts, payload, isStandalone, false);
      } catch (e) {
        if (!isUniqueConstraintConflict(e)) throw e;
        throw new ConnectError("a template with this name already exists in this organization", Code.AlreadyExists);
      }

      const templateResp = { ...payload, createdAt: payload.createdAt.toISOString() };
      publishDomainEvent(nc, "domain.project_template.created", templateResp);
      return { template: templateResp };
    },
    async updateTemplate(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = UpdateTemplateSchema.parse(req);
      const pts = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
      const result = await db.select().from(pts).where(eq((pts as any).id, parsed.id)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("template not found", Code.NotFound);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: result[0].orgId }, "project:write");

      if (parsed.rootTaskTypeId) {
        const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
        const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.rootTaskTypeId)).limit(1);
        if (!typeRows || typeRows.length === 0) throw new ConnectError("root task type not found", Code.NotFound);
        if (typeRows[0].orgId !== result[0].orgId) {
          throw new ConnectError("root task type belongs to a different organization", Code.InvalidArgument);
        }
        // M20-T03: a template is org-wide by definition (it has no
        // projectId of its own), so a project-scoped task type accepted as
        // its root is a reference purgeProject cannot ever safely clear -
        // purging that one project deletes the task type out from under
        // every template pointing at it, dangling on SQLite and an FK
        // failure on MySQL. Mirrors createTemplate's identical check below.
        if (typeRows[0].projectId) {
          throw new ConnectError("root task type must be org-wide, not scoped to a project", Code.InvalidArgument);
        }
      }

      const updates: Record<string, unknown> = {};
      if (parsed.name !== undefined) updates.name = parsed.name;
      if (parsed.description !== undefined) updates.description = parsed.description;
      // "" and null both mean "clear it" - store null either way, matching
      // createTemplate's own `parsed.rootTaskTypeId || null` normalization.
      if (parsed.rootTaskTypeId !== undefined) updates.rootTaskTypeId = parsed.rootTaskTypeId || null;

      // M20-T04: same name-collision guard as createTemplate - only matters
      // when the rename actually changes the name.
      if (parsed.name !== undefined && parsed.name !== result[0].name) {
        const nameConflict = await db.select().from(pts).where(and(eq((pts as any).orgId, result[0].orgId), eq((pts as any).name, parsed.name))).limit(1);
        if (nameConflict.length > 0 && nameConflict[0].id !== parsed.id) {
          throw new ConnectError("a template with this name already exists in this organization", Code.AlreadyExists);
        }
      }

      try {
        await db.update(pts).set(updates).where(eq((pts as any).id, parsed.id));
      } catch (e) {
        if (!isUniqueConstraintConflict(e)) throw e;
        throw new ConnectError("a template with this name already exists in this organization", Code.AlreadyExists);
      }

      const updated = {
        ...result[0],
        ...updates,
        createdAt: result[0].createdAt instanceof Date ? result[0].createdAt.toISOString() : result[0].createdAt,
      };
      publishDomainEvent(nc, "domain.project_template.updated", updated);
      return { template: updated };
    },
    async listTemplates(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = ListTemplatesSchema.parse(req);
      await authorizePrincipal(db, principal, parsed.orgId, { scope: 'projects:read', permission: 'project:read' });

      const pts = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, pts, eq((pts as any).orgId, parsed.orgId), parsed.page, {
        filterColumn: (pts as any).name,
        sortableColumns: { name: (pts as any).name, createdAt: (pts as any).createdAt },
        select: {
          id: (pts as any).id,
          orgId: (pts as any).orgId,
          name: (pts as any).name,
          description: (pts as any).description,
          rootTaskTypeId: (pts as any).rootTaskTypeId,
          createdAt: (pts as any).createdAt,
        },
      });

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
