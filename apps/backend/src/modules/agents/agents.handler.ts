import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import { eq, and, not } from "drizzle-orm";
import { ConnectError, Code } from "@connectrpc/connect";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { requireUser, requirePrincipal, authorizePrincipal } from "../../lib/authz";
import { assertCan } from "../../lib/policy";
import { notDeleted, softDeleteById, restoreById, executePaginatedQuery, insertRecord } from "../../db/query-builder";
import { mintToken, revokeToken, parseScopes } from "../../lib/agentToken";
import { AGENT_SCOPES } from "../../lib/scopes";
import { randomUUID } from "node:crypto";

// --- Zod Request Schemas ---

// ADR-0008: 90 days by default, 365 maximum, always expiring. The maximum is
// enforced here rather than left to the caller because "no expiry" is the
// option the decision deliberately removed.
const DEFAULT_EXPIRY_DAYS = 90;
const MAX_EXPIRY_DAYS = 365;

const CreateAgentTokenSchema = z.object({
  agentId: z.string().min(1, "agentId is required"),
  name: z.string().min(1, "name is required").max(256),
  // The vocabulary is closed. An unrecognised scope is far more likely a typo
  // that would silently grant nothing than a deliberate extension, and a token
  // that appears to grant "task:read" but matches no check is worse than one
  // refused at creation.
  scopes: z.array(z.enum(AGENT_SCOPES as unknown as [string, ...string[]]))
    .min(1, "at least one scope is required"),
  expiresInDays: z.preprocess(
    (v) => (v === undefined || v === null || v === 0 ? undefined : v),
    z.number().int().positive().max(MAX_EXPIRY_DAYS, `expiresInDays cannot exceed ${MAX_EXPIRY_DAYS}`).optional(),
  ),
});

const ListAgentTokensSchema = z.object({
  agentId: z.string().min(1, "agentId is required"),
});

const RevokeAgentTokenSchema = z.object({
  tokenId: z.string().min(1, "tokenId is required"),
});

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

  const apiTokensTable = () => (isStandalone ? schemaSqlite.apiTokens : schemaMysql.apiTokens);

  /** Loads a live agent or throws NotFound. Token operations all start here. */
  const loadAgent = async (agentId: string) => {
    const agents = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
    const rows = await db.select().from(agents).where(eq((agents as any).id, agentId)).limit(1);
    if (!rows || rows.length === 0) throw new ConnectError("agent not found", Code.NotFound);
    return rows[0];
  };

  /**
   * Shapes a token row for the wire. There is no tokenHash field on the wire
   * message at all, so a hash cannot leak by being forgotten here - the
   * contract is the guard, not this function's diligence.
   */
  const toWireToken = (row: any, now: Date) => ({
    id: row.id,
    agentId: row.agentId,
    orgId: row.orgId,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scopes: parseScopes(row.scopes),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : "",
    expiresAt: new Date(row.expiresAt).toISOString(),
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : "",
    revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : "",
    // Computed here rather than by each client, whose clock and timezone are
    // not this server's.
    expired: new Date(row.expiresAt).getTime() <= now.getTime(),
  });

  return {
    async createAgentRole(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = CreateAgentRoleSchema.parse(req);
      // ADR-0007: a role belongs to one organization, so this is an ordinary
      // org-scoped admin check. It used to be `assertOrgAdminOfAny` - admin of
      // any organization anywhere - because the catalogue was global and there
      // was no org to scope to.
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: parsed.orgId }, "agent:admin");
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
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: existing[0].orgId }, "agent:admin");

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
      const principal = requirePrincipal(contextValues);
      const parsed = ListAgentRolesSchema.parse(req);
      // Reading is membership, not admin - a member picking a role for an agent
      // needs the list. Scoping it is what stops one tenant's catalogue leaking
      // into another's picker.
      await authorizePrincipal(db, principal, parsed.orgId, { scope: 'agents:read', permission: 'agent:read' });
      const roles = isStandalone ? schemaSqlite.agentRoles : schemaMysql.agentRoles;
      const { items, nextCursor, totalCount } = await executePaginatedQuery(
        db,
        roles,
        eq((roles as any).orgId, parsed.orgId),
        parsed.page,
        {
          filterColumn: (roles as any).name,
          sortableColumns: { name: (roles as any).name },
          // systemPrompt and capabilities are the role's definition, and the
          // roles editor renders both — this list IS the editor's data source.
          select: {
            id: (roles as any).id,
            orgId: (roles as any).orgId,
            name: (roles as any).name,
            systemPrompt: (roles as any).systemPrompt,
            capabilities: (roles as any).capabilities,
            createdAt: (roles as any).createdAt,
          },
        },
      );
      return { roles: items, page: { nextCursor, totalCount } };
    },
    async createAgent(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = CreateAgentSchema.parse(req);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: parsed.orgId }, "agent:write");

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
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: existing[0].orgId }, "agent:admin");

      if (parsed.agentRoleId) {
        const roles = isStandalone ? schemaSqlite.agentRoles : schemaMysql.agentRoles;
        const roleRows = await db.select().from(roles).where(eq((roles as any).id, parsed.agentRoleId)).limit(1);
        if (!roleRows || roleRows.length === 0) throw new ConnectError("agent role not found", Code.NotFound);
        // M17-T01: createAgent already made this check; updateAgent never did,
        // which let an agent be re-pointed at a role belonging to a different
        // organization - the exact cross-tenant scenario ADR-0007 exists to
        // close, just reachable from the update path instead of create.
        // NotFound rather than PermissionDenied, same reasoning as createAgent:
        // whether a role id exists in another organization is that
        // organization's business, and a distinct error here would turn this
        // into a probe for foreign role ids.
        if (roleRows[0].orgId !== existing[0].orgId) throw new ConnectError("agent role not found", Code.NotFound);
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
      const principal = requirePrincipal(contextValues);
      if (!req.orgId) throw new ConnectError("orgId is required", Code.InvalidArgument);
      await authorizePrincipal(db, principal, req.orgId, { scope: 'agents:read', permission: 'agent:read' });

      const agentsSchema = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const deletedFilter = req.onlyDeleted ? not(notDeleted(agentsSchema)) : notDeleted(agentsSchema);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, agentsSchema, and(eq((agentsSchema as any).orgId, req.orgId), deletedFilter), req.page, {
        filterColumn: (agentsSchema as any).name,
        sortableColumns: { name: (agentsSchema as any).name, createdAt: (agentsSchema as any).createdAt },
        select: {
          id: (agentsSchema as any).id,
          orgId: (agentsSchema as any).orgId,
          agentRoleId: (agentsSchema as any).agentRoleId,
          name: (agentsSchema as any).name,
          createdAt: (agentsSchema as any).createdAt,
          deletedAt: (agentsSchema as any).deletedAt,
        },
      });
      return { agents: items, page: { nextCursor, totalCount } };
    },
    async archiveAgent(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ArchiveAgentSchema.parse(req);
      const agentsSchema = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const result = await db.select().from(agentsSchema).where(eq((agentsSchema as any).id, parsed.agentId)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("agent not found", Code.NotFound);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: result[0].orgId }, "agent:admin");

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
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: result[0].orgId }, "agent:admin");

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
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: result[0].orgId }, "agent:admin");
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

      // Delete the agent's credentials before the agent itself. Without this
      // the token rows are orphaned, and resolveAgentToken LEFT JOINs agents to
      // check deletedAt - with the agent row gone that join yields NULL, the
      // deleted-agent check does not fire, and the token keeps authenticating
      // as an agent that no longer exists anywhere in the product. Found by the
      // M04-T12 security review; see token-purge.test.ts.
      await db.delete(apiTokensTable()).where(eq((apiTokensTable() as any).agentId, parsed.agentId));

      await db.delete(agentsSchema).where(eq((agentsSchema as any).id, parsed.agentId));

      publishDomainEvent(nc, "domain.agent.purged", { agentId: parsed.agentId });
      return { success: true };
    },

    async createAgentToken(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = CreateAgentTokenSchema.parse(req);
      const agent = await loadAgent(parsed.agentId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: agent.orgId }, "agent:admin");

      const minted = mintToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (parsed.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 86400000);
      const row = {
        id: randomUUID(),
        orgId: agent.orgId,
        agentId: agent.id,
        name: parsed.name,
        tokenPrefix: minted.tokenPrefix,
        tokenHash: minted.tokenHash,
        scopes: JSON.stringify(parsed.scopes),
        createdBy: userId,
        createdAt: now,
        expiresAt,
        lastUsedAt: null,
        revokedAt: null,
      };
      await db.insert(apiTokensTable()).values(row);

      publishDomainEvent(nc, "domain.agent.token_created", {
        tokenId: row.id, agentId: agent.id, orgId: agent.orgId, scopes: parsed.scopes,
      });

      // The only time the plaintext leaves this process. It is not stored and
      // cannot be recovered - re-showing it later would require keeping it.
      return { token: toWireToken(row, now), plaintext: minted.plaintext };
    },

    async listAgentTokens(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ListAgentTokensSchema.parse(req);
      const agent = await loadAgent(parsed.agentId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: agent.orgId }, "agent:admin");

      const tokens = apiTokensTable();
      const rows = await db.select().from(tokens).where(eq((tokens as any).agentId, agent.id));
      const now = new Date();
      // Revoked tokens stay in the list. A credential that existed and was
      // turned off is history an operator needs; removing the row would make
      // "was this ever issued?" unanswerable.
      return { tokens: rows.map((r: any) => toWireToken(r, now)) };
    },

    async revokeAgentToken(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RevokeAgentTokenSchema.parse(req);

      const tokens = apiTokensTable();
      const rows = await db.select().from(tokens).where(eq((tokens as any).id, parsed.tokenId)).limit(1);
      if (!rows || rows.length === 0) throw new ConnectError("token not found", Code.NotFound);

      // Scoped from the token's own row, never from anything the caller sent.
      // Trusting a request-supplied org here would let an admin of any
      // organization revoke another's credential by naming its id.
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: rows[0].orgId }, "agent:admin");
      await revokeToken(db, parsed.tokenId);

      publishDomainEvent(nc, "domain.agent.token_revoked", {
        tokenId: parsed.tokenId, agentId: rows[0].agentId, orgId: rows[0].orgId,
      });
      return { success: true };
    },
  };
};
