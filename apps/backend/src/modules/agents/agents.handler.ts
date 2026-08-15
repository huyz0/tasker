import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import { eq, and, not } from "drizzle-orm";
import { ConnectError, Code } from "@connectrpc/connect";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { requireUser, assertOrgMember, assertOrgWriter, assertOrgAdmin } from "../../lib/authz";
import { notDeleted, softDeleteById, restoreById, executePaginatedQuery, insertRecord } from "../../db/query-builder";

// --- Zod Request Schemas ---

const CreateAgentRoleSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  name: z.string().min(1, "name is required").max(256),
  systemPrompt: z.string().min(1, "systemPrompt is required").max(4096),
  capabilities: z.string().min(1, "capabilities is required").max(2048),
});

const UpdateAgentRoleSchema = z.object({
  id: z.string().min(1, "id is required"),
  name: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).max(256).optional()),
  systemPrompt: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).max(4096).optional()),
  capabilities: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).max(2048).optional()),
}).refine((v) => v.name !== undefined || v.systemPrompt !== undefined || v.capabilities !== undefined, {
  message: "at least one of name, systemPrompt, or capabilities must be provided",
});

const ListAgentRolesSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  page: z.any().optional(),
});

const CreateAgentSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  agentRoleId: z.string().min(1, "agentRoleId is required"),
  name: z.string().min(1, "name is required").max(256),
});

const UpdateAgentSchema = z.object({
  agentId: z.string().min(1, "agentId is required"),
  name: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).max(256).optional()),
  agentRoleId: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional()),
}).refine((v) => v.name !== undefined || v.agentRoleId !== undefined, {
  message: "at least one of name or agentRoleId must be provided",
});

const ArchiveAgentSchema = z.object({
  agentId: z.string().min(1, "agentId is required"),
});

const RestoreAgentSchema = z.object({
  agentId: z.string().min(1, "agentId is required"),
});

const PurgeAgentSchema = z.object({
  agentId: z.string().min(1, "agentId is required"),
});

// --- Handler Factory ---

export const createAgentsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async createAgentRole(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = CreateAgentRoleSchema.parse(req);
      // ADR-0007: a role belongs to one organization, so this is an ordinary
      // org-scoped admin check. It used to be `assertOrgAdminOfAny` - admin of
      // any organization anywhere - because the catalogue was global and there
      // was no org to scope to.
      await assertOrgAdmin(db, userId, parsed.orgId);
      const roles = isStandalone ? schemaSqlite.agentRoles : schemaMysql.agentRoles;
      const newId = `ar-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        orgId: parsed.orgId,
        name: parsed.name,
        systemPrompt: parsed.systemPrompt,
        capabilities: parsed.capabilities,
      };

      await insertRecord(db, roles, payload, isStandalone);

      return { role: payload };
    },
    async updateAgentRole(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = UpdateAgentRoleSchema.parse(req);

      const roles = isStandalone ? schemaSqlite.agentRoles : schemaMysql.agentRoles;
      const existing = await db.select().from(roles).where(eq((roles as any).id, parsed.id)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("agent role not found", Code.NotFound);
      // Scope to the role's own organization, resolved from the row - not from
      // anything the caller sent, which they could point at an org they do
      // administer to reach a role in one they do not.
      await assertOrgAdmin(db, userId, existing[0].orgId);

      const updates: Record<string, unknown> = {};
      if (parsed.name !== undefined) updates.name = parsed.name;
      if (parsed.systemPrompt !== undefined) updates.systemPrompt = parsed.systemPrompt;
      if (parsed.capabilities !== undefined) updates.capabilities = parsed.capabilities;

      await db.update(roles).set(updates).where(eq((roles as any).id, parsed.id));

      const updated = { ...existing[0], ...updates };
      publishDomainEvent(nc, "domain.agent_role.updated", updated);
      return { role: updated };
    },
    async listAgentRoles(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ListAgentRolesSchema.parse(req);
      // Reading is membership, not admin - a member picking a role for an agent
      // needs the list. Scoping it is what stops one tenant's catalogue leaking
      // into another's picker.
      await assertOrgMember(db, userId, parsed.orgId);
      const roles = isStandalone ? schemaSqlite.agentRoles : schemaMysql.agentRoles;
      const { items, nextCursor, totalCount } = await executePaginatedQuery(
        db,
        roles,
        eq((roles as any).orgId, parsed.orgId),
        parsed.page,
        (roles as any).name,
        { name: (roles as any).name },
      );
      return { roles: items, page: { nextCursor, totalCount } };
    },
    async createAgent(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = CreateAgentSchema.parse(req);
      await assertOrgWriter(db, userId, parsed.orgId);

      const roles = isStandalone ? schemaSqlite.agentRoles : schemaMysql.agentRoles;
      const roleRows = await db.select().from(roles).where(eq((roles as any).id, parsed.agentRoleId)).limit(1);
      if (!roleRows || roleRows.length === 0) {
        throw new ConnectError("agent role not found", Code.NotFound);
      }
      // NotFound rather than PermissionDenied: whether a role exists in another
      // organization is that organization's business, and answering the
      // question at all would turn this into a probe for role ids.
      if (roleRows[0].orgId !== parsed.orgId) {
        throw new ConnectError("agent role not found", Code.NotFound);
      }

      const agents = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const newId = `ag-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        orgId: parsed.orgId,
        agentRoleId: parsed.agentRoleId,
        name: parsed.name,
      };

      await insertRecord(db, agents, payload, isStandalone);

      publishDomainEvent(nc, "domain.agent.created", payload);
      return { agent: payload };
    },
    async updateAgent(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = UpdateAgentSchema.parse(req);

      const agentsSchema = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const existing = await db.select().from(agentsSchema).where(eq((agentsSchema as any).id, parsed.agentId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("agent not found", Code.NotFound);
      await assertOrgAdmin(db, userId, existing[0].orgId);

      if (parsed.agentRoleId) {
        const roles = isStandalone ? schemaSqlite.agentRoles : schemaMysql.agentRoles;
        const roleRows = await db.select().from(roles).where(eq((roles as any).id, parsed.agentRoleId)).limit(1);
        if (!roleRows || roleRows.length === 0) throw new ConnectError("agent role not found", Code.NotFound);
      }

      const updates: Record<string, unknown> = {};
      if (parsed.name !== undefined) updates.name = parsed.name;
      if (parsed.agentRoleId !== undefined) updates.agentRoleId = parsed.agentRoleId;

      await db.update(agentsSchema).set(updates).where(eq((agentsSchema as any).id, parsed.agentId));

      const updated = { ...existing[0], ...updates };
      publishDomainEvent(nc, "domain.agent.updated", updated);
      return { agent: updated };
    },
    async listAgents(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      if (!req.orgId) throw new ConnectError("orgId is required", Code.InvalidArgument);
      await assertOrgMember(db, userId, req.orgId);

      const agentsSchema = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const deletedFilter = req.onlyDeleted ? not(notDeleted(agentsSchema)) : notDeleted(agentsSchema);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, agentsSchema, and(eq((agentsSchema as any).orgId, req.orgId), deletedFilter), req.page, (agentsSchema as any).name, { name: (agentsSchema as any).name, createdAt: (agentsSchema as any).createdAt });
      return { agents: items, page: { nextCursor, totalCount } };
    },
    async archiveAgent(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ArchiveAgentSchema.parse(req);
      const agentsSchema = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const result = await db.select().from(agentsSchema).where(eq((agentsSchema as any).id, parsed.agentId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("agent not found", Code.NotFound);
      await assertOrgAdmin(db, userId, result[0].orgId);

      await softDeleteById(db, agentsSchema, parsed.agentId);

      publishDomainEvent(nc, "domain.agent.archived", { agentId: parsed.agentId });
      return { success: true };
    },
    async restoreAgent(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RestoreAgentSchema.parse(req);
      const agentsSchema = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const result = await db.select().from(agentsSchema).where(eq((agentsSchema as any).id, parsed.agentId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("agent not found", Code.NotFound);
      await assertOrgAdmin(db, userId, result[0].orgId);

      const orgsTable = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const orgRows = await db.select().from(orgsTable).where(eq((orgsTable as any).id, result[0].orgId)).limit(1);
      if (orgRows[0]?.deletedAt) {
        throw new ConnectError("cannot restore an agent into an archived organization - restore the organization first", Code.FailedPrecondition);
      }

      await restoreById(db, agentsSchema, parsed.agentId);

      publishDomainEvent(nc, "domain.agent.restored", { agentId: parsed.agentId });
      return { success: true };
    },
    async purgeAgent(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = PurgeAgentSchema.parse(req);
      const agentsSchema = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const result = await db.select().from(agentsSchema).where(eq((agentsSchema as any).id, parsed.agentId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("agent not found", Code.NotFound);
      await assertOrgAdmin(db, userId, result[0].orgId);
      if (!result[0].deletedAt) {
        throw new ConnectError("agent must be archived before it can be purged", Code.FailedPrecondition);
      }

      const taskAssignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;
      const taskNotes = isStandalone ? schemaSqlite.taskNotes : schemaMysql.taskNotes;
      const [remainingAssignments, remainingNotes] = await Promise.all([
        db.select().from(taskAssignments).where(eq((taskAssignments as any).agentId, parsed.agentId)),
        db.select().from(taskNotes).where(eq((taskNotes as any).agentId, parsed.agentId)),
      ]);
      if (remainingAssignments.length > 0 || remainingNotes.length > 0) {
        throw new ConnectError("agent still has task assignments or notes - remove them first", Code.FailedPrecondition);
      }

      const comments = isStandalone ? schemaSqlite.comments : schemaMysql.comments;
      await db.update(comments).set({ agentId: null }).where(eq((comments as any).agentId, parsed.agentId));
      await db.delete(agentsSchema).where(eq((agentsSchema as any).id, parsed.agentId));

      publishDomainEvent(nc, "domain.agent.purged", { agentId: parsed.agentId });
      return { success: true };
    },
  };
};
