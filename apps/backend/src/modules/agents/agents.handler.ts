import { z } from "zod/v4";
import { eq, and, not } from "drizzle-orm";
import { ConnectError, Code } from "@connectrpc/connect";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { requireUserId, assertOrgMember } from "../../lib/authz";
import { notDeleted, softDeleteById, restoreById } from "../../db/query-builder";

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

// --- Handler Factory ---

export const createAgentsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async createAgentRole(req: unknown, { values: contextValues }: { values: any }) {
      requireUserId(contextValues);
      const parsed = CreateAgentRoleSchema.parse(req);
      const roles = isStandalone ? schemaSqlite.agentRoles : schemaMysql.agentRoles;
      const newId = `ar-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        name: parsed.name,
        systemPrompt: parsed.systemPrompt,
        capabilities: parsed.capabilities,
      };

      await db.insert(roles).values(payload);

      return { role: payload };
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

      await db.insert(agents).values(payload);

      if (nc) nc.publish("domain.agent.created", Buffer.from(JSON.stringify(payload)));
      return { agent: payload };
    },
    async listAgents(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      if (!req.orgId) throw new Error("orgId is required");
      await assertOrgMember(db, userId, req.orgId);

      const agentsSchema = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const deletedFilter = req.onlyDeleted ? not(notDeleted(agentsSchema)) : notDeleted(agentsSchema);
      const result = await db.select().from(agentsSchema).where(and(eq((agentsSchema as any).orgId, req.orgId), deletedFilter));
      return { agents: result };
    },
    async archiveAgent(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = ArchiveAgentSchema.parse(req);
      const agentsSchema = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const result = await db.select().from(agentsSchema).where(eq((agentsSchema as any).id, parsed.agentId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("agent not found", Code.NotFound);
      await assertOrgMember(db, userId, result[0].orgId);

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
      await assertOrgMember(db, userId, result[0].orgId);

      await restoreById(db, agentsSchema, parsed.agentId);

      if (nc) nc.publish("domain.agent.restored", Buffer.from(JSON.stringify({ agentId: parsed.agentId })));
      return { success: true };
    },
  };
};
