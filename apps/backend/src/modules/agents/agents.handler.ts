import { z } from "zod/v4";
import { eq, and, not } from "drizzle-orm";
import { ConnectError, Code } from "@connectrpc/connect";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { requireUserId, assertOrgMember, assertOrgAdmin, assertOrgAdminOfAny } from "../../lib/authz";
import { notDeleted, softDeleteById, restoreById, executePaginatedQuery, insertRecord } from "../../db/query-builder";

// --- Zod Request Schemas ---

const CreateAgentRoleSchema = z.object({
  name: z.string().min(1, "name is required").max(256),
  systemPrompt: z.string().min(1, "systemPrompt is required").max(4096),
  capabilities: z.string().min(1, "capabilities is required").max(2048),
});

const CreateAgentSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  agentRoleId: z.string().min(1, "agentRoleId is required"),
  name: z.string().min(1, "name is required").max(256),
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
      const userId = requireUserId(contextValues);
      await assertOrgAdminOfAny(db, userId);
      const parsed = CreateAgentRoleSchema.parse(req);
      const roles = isStandalone ? schemaSqlite.agentRoles : schemaMysql.agentRoles;
      const newId = `ar-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        name: parsed.name,
        systemPrompt: parsed.systemPrompt,
        capabilities: parsed.capabilities,
      };

      await insertRecord(db, roles, payload, isStandalone);

      return { role: payload };
    },
    async listAgentRoles(req: any, { values: contextValues }: { values: any }) {
      requireUserId(contextValues);
      const roles = isStandalone ? schemaSqlite.agentRoles : schemaMysql.agentRoles;
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, roles, undefined, req?.page, (roles as any).name, { name: (roles as any).name });
      return { roles: items, page: { nextCursor, totalCount } };
    },
    async createAgent(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = CreateAgentSchema.parse(req);
      await assertOrgMember(db, userId, parsed.orgId);

      const roles = isStandalone ? schemaSqlite.agentRoles : schemaMysql.agentRoles;
      const roleRows = await db.select().from(roles).where(eq((roles as any).id, parsed.agentRoleId)).limit(1);
      if (!roleRows || roleRows.length === 0) {
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

      if (nc) nc.publish("domain.agent.created", Buffer.from(JSON.stringify(payload)));
      return { agent: payload };
    },
    async listAgents(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      if (!req.orgId) throw new ConnectError("orgId is required", Code.InvalidArgument);
      await assertOrgMember(db, userId, req.orgId);

      const agentsSchema = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const deletedFilter = req.onlyDeleted ? not(notDeleted(agentsSchema)) : notDeleted(agentsSchema);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, agentsSchema, and(eq((agentsSchema as any).orgId, req.orgId), deletedFilter), req.page, (agentsSchema as any).name, { name: (agentsSchema as any).name, createdAt: (agentsSchema as any).createdAt });
      return { agents: items, page: { nextCursor, totalCount } };
    },
    async archiveAgent(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = ArchiveAgentSchema.parse(req);
      const agentsSchema = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const result = await db.select().from(agentsSchema).where(eq((agentsSchema as any).id, parsed.agentId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("agent not found", Code.NotFound);
      await assertOrgAdmin(db, userId, result[0].orgId);

      await softDeleteById(db, agentsSchema, parsed.agentId);

      if (nc) nc.publish("domain.agent.archived", Buffer.from(JSON.stringify({ agentId: parsed.agentId })));
      return { success: true };
    },
    async restoreAgent(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = RestoreAgentSchema.parse(req);
      const agentsSchema = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const result = await db.select().from(agentsSchema).where(eq((agentsSchema as any).id, parsed.agentId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("agent not found", Code.NotFound);
      await assertOrgAdmin(db, userId, result[0].orgId);

      await restoreById(db, agentsSchema, parsed.agentId);

      if (nc) nc.publish("domain.agent.restored", Buffer.from(JSON.stringify({ agentId: parsed.agentId })));
      return { success: true };
    },
    async purgeAgent(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
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

      if (nc) nc.publish("domain.agent.purged", Buffer.from(JSON.stringify({ agentId: parsed.agentId })));
      return { success: true };
    },
  };
};
