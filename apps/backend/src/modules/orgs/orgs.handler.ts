import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import { inArray, eq, and, not } from "drizzle-orm";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { insertRecord, executePaginatedQuery, notDeleted, softDeleteById, restoreById } from "../../db/query-builder";
import { requireUserId, assertOrgAdmin, assertOrgMember, getOrgMemberRole, countOrgOwners } from "../../lib/authz";
import { ConnectError, Code } from "@connectrpc/connect";

// --- Zod Request Schemas ---

// Ownership isn't handed out through an invite - only an existing owner can
// grant it via updateOrgMemberRole - so 'owner' is deliberately excluded here.
const InvitableRole = z.enum(['admin', 'member', 'viewer']);
const OrgRole = z.enum(['owner', 'admin', 'member', 'viewer']);

const SeedOrgSchema = z.object({
  name: z.string().min(1, "name is required").max(256),
  slug: z.string().min(1, "slug is required").max(256),
  parentOrgId: z.string().nullable().optional(),
});

const InviteUserSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  email: z.string().email("valid email is required"),
  role: InvitableRole.default('member'),
});

const ArchiveOrgSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
});

const RestoreOrgSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
});

const PurgeOrgSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
});

const SetOrgRetentionDaysSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  binRetentionDays: z.number().int().min(1, "binRetentionDays must be at least 1").max(3650, "binRetentionDays must be at most 3650 (10 years)"),
});

const UpdateOrgSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  name: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).max(256).optional()),
  slug: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).max(256).optional()),
}).refine((v) => v.name !== undefined || v.slug !== undefined, {
  message: "at least one of name or slug must be provided",
});

const ListOrgMembersSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
});

const RemoveOrgMemberSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  userId: z.string().min(1, "userId is required"),
});

const UpdateOrgMemberRoleSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  userId: z.string().min(1, "userId is required"),
  role: OrgRole,
});

// --- Handler Factory ---

export const createOrgsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async listOrgs(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;

      const memberRows = await db.select().from(members).where(inArray(members.userId, [userId]));
      const memberOrgIds = memberRows.map((m: any) => m.orgId);
      if (memberOrgIds.length === 0) {
        return { organizations: [], page: {} };
      }

      const deletedFilter = req.onlyDeleted ? not(notDeleted(orgs)) : notDeleted(orgs);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, orgs, and(inArray(orgs.id, memberOrgIds), deletedFilter), req.page, (orgs as any).name, { name: (orgs as any).name, createdAt: (orgs as any).createdAt });

      return {
        organizations: items.map((o: any) => ({
          ...o,
          createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
    async seedOrg(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = SeedOrgSchema.parse(req);
      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;

      if (parsed.parentOrgId) {
        const parentRows = await db.select().from(orgs).where(eq((orgs as any).id, parsed.parentOrgId)).limit(1);
        if (!parentRows || parentRows.length === 0) {
          throw new ConnectError("parent organization not found", Code.NotFound);
        }
        if (parentRows[0].parentOrgId) {
          throw new ConnectError("nested sub-organizations are not supported yet", Code.InvalidArgument);
        }
        await assertOrgAdmin(db, userId, parsed.parentOrgId);
      }

      const newOrgId = `o-${crypto.randomUUID()}`;
      const orgPayload = { id: newOrgId, name: parsed.name, slug: parsed.slug, parentOrgId: parsed.parentOrgId || null };

      await insertRecord(db, orgs, orgPayload, isStandalone);
      // The founding member becomes owner (not just admin) - every org must
      // always have at least one owner, and there's no simpler moment to
      // guarantee that than at creation.
      const memberPayload = { orgId: newOrgId, userId, role: "owner" };
      await insertRecord(db, members, memberPayload, isStandalone, "joinedAt");

      publishDomainEvent(nc, "domain.org.created", orgPayload);
      return { organization: { ...orgPayload, role: "owner" } };
    },
    async updateOrg(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = UpdateOrgSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const existing = await db.select().from(orgs).where(eq((orgs as any).id, parsed.orgId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("organization not found", Code.NotFound);

      const updates: Record<string, unknown> = {};
      if (parsed.name !== undefined) updates.name = parsed.name;
      if (parsed.slug !== undefined) updates.slug = parsed.slug;

      try {
        await db.update(orgs).set(updates).where(eq((orgs as any).id, parsed.orgId));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("UNIQUE constraint failed") || msg.includes("Duplicate entry")) {
          throw new ConnectError("an organization with this slug already exists", Code.AlreadyExists);
        }
        throw err;
      }

      const updated = { ...existing[0], ...updates };
      publishDomainEvent(nc, "domain.org.updated", updated);
      return { organization: updated };
    },
    async listOrgMembers(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = ListOrgMembersSchema.parse(req);
      await assertOrgMember(db, userId, parsed.orgId);

      const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
      const users = isStandalone ? schemaSqlite.users : schemaMysql.users;

      const memberRows = await db.select().from(members).where(eq((members as any).orgId, parsed.orgId));
      const userIds = memberRows.map((m: any) => m.userId);
      const userRows = userIds.length
        ? await db.select().from(users).where(inArray((users as any).id, userIds))
        : [];
      const userById = new Map<string, any>(userRows.map((u: any) => [u.id, u]));

      return {
        members: memberRows.map((m: any) => ({
          userId: m.userId,
          email: userById.get(m.userId)?.email ?? "",
          name: userById.get(m.userId)?.name ?? "",
          role: m.role,
        })),
        page: {},
      };
    },
    async removeOrgMember(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = RemoveOrgMemberSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      if (parsed.userId === userId) {
        throw new ConnectError("cannot remove yourself from the organization", Code.InvalidArgument);
      }

      const targetRole = await getOrgMemberRole(db, parsed.userId, parsed.orgId);
      if (targetRole === "owner" && (await countOrgOwners(db, parsed.orgId)) <= 1) {
        throw new ConnectError("cannot remove the organization's last owner", Code.FailedPrecondition);
      }

      const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
      await db.delete(members).where(and(eq((members as any).orgId, parsed.orgId), eq((members as any).userId, parsed.userId)));

      publishDomainEvent(nc, "domain.org.member_removed", { orgId: parsed.orgId, userId: parsed.userId });
      return { success: true };
    },
    async updateOrgMemberRole(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = UpdateOrgMemberRoleSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const actorRole = await getOrgMemberRole(db, userId, parsed.orgId);
      const targetRole = await getOrgMemberRole(db, parsed.userId, parsed.orgId);
      if (!targetRole) {
        throw new ConnectError("user is not a member of this organization", Code.NotFound);
      }

      // Only an owner can grant ownership or touch another owner's role -
      // a plain admin can manage admin/member/viewer but not the owner tier.
      if (actorRole !== "owner" && (parsed.role === "owner" || targetRole === "owner")) {
        throw new ConnectError("owner role required to change an owner's role or grant ownership", Code.PermissionDenied);
      }

      if (targetRole === "owner" && parsed.role !== "owner" && (await countOrgOwners(db, parsed.orgId)) <= 1) {
        throw new ConnectError("cannot demote the organization's last owner", Code.FailedPrecondition);
      }

      const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
      const users = isStandalone ? schemaSqlite.users : schemaMysql.users;
      await db.update(members).set({ role: parsed.role }).where(and(eq((members as any).orgId, parsed.orgId), eq((members as any).userId, parsed.userId)));

      const userRows = await db.select().from(users).where(eq((users as any).id, parsed.userId)).limit(1);
      publishDomainEvent(nc, "domain.org.member_role_updated", { orgId: parsed.orgId, userId: parsed.userId, role: parsed.role });
      return {
        member: {
          userId: parsed.userId,
          email: userRows[0]?.email ?? "",
          name: userRows[0]?.name ?? "",
          role: parsed.role,
        },
      };
    },
    async inviteUser(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = InviteUserSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const invs = isStandalone ? schemaSqlite.invitations : schemaMysql.invitations;
      const existing = await db.select().from(invs)
        .where(and(eq((invs as any).orgId, parsed.orgId), eq((invs as any).email, parsed.email)))
        .limit(1);
      if (existing.length > 0) return { success: true };

      const payload = {
        id: `i-${crypto.randomUUID()}`,
        orgId: parsed.orgId,
        email: parsed.email,
        invitedBy: userId,
        role: parsed.role,
      };
      await insertRecord(db, invs, payload, isStandalone);
      return { success: true };
    },
    async archiveOrg(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = ArchiveOrgSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      await softDeleteById(db, orgs, parsed.orgId);

      publishDomainEvent(nc, "domain.org.archived", { orgId: parsed.orgId });
      return { success: true };
    },
    async restoreOrg(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = RestoreOrgSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const orgRows = await db.select().from(orgs).where(eq((orgs as any).id, parsed.orgId)).limit(1);
      const parentOrgId = orgRows[0]?.parentOrgId;
      if (parentOrgId) {
        const parentRows = await db.select().from(orgs).where(eq((orgs as any).id, parentOrgId)).limit(1);
        if (parentRows[0]?.deletedAt) {
          throw new ConnectError("cannot restore a sub-organization into an archived parent organization - restore the parent first", Code.FailedPrecondition);
        }
      }

      await restoreById(db, orgs, parsed.orgId);

      publishDomainEvent(nc, "domain.org.restored", { orgId: parsed.orgId });
      return { success: true };
    },
    async purgeOrg(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = PurgeOrgSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const existing = await db.select().from(orgs).where(eq((orgs as any).id, parsed.orgId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("organization not found", Code.NotFound);
      if (!existing[0].deletedAt) {
        throw new ConnectError("organization must be archived before it can be purged", Code.FailedPrecondition);
      }

      const projects = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const agents = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const childOrgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;

      const [remainingProjects, remainingAgents, remainingChildOrgs] = await Promise.all([
        db.select().from(projects).where(eq((projects as any).orgId, parsed.orgId)),
        db.select().from(agents).where(eq((agents as any).orgId, parsed.orgId)),
        db.select().from(childOrgs).where(eq((childOrgs as any).parentOrgId, parsed.orgId)),
      ]);
      if (remainingProjects.length > 0 || remainingAgents.length > 0 || remainingChildOrgs.length > 0) {
        throw new ConnectError("organization still has projects, agents, or sub-organizations - archive or move them first", Code.FailedPrecondition);
      }

      const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
      const invitations = isStandalone ? schemaSqlite.invitations : schemaMysql.invitations;
      const taskTypes = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const taskStatuses = isStandalone ? schemaSqlite.taskStatuses : schemaMysql.taskStatuses;
      const taskStatusTransitions = isStandalone ? schemaSqlite.taskStatusTransitions : schemaMysql.taskStatusTransitions;
      const projectTemplates = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
      const labels = isStandalone ? schemaSqlite.labels : schemaMysql.labels;

      // projectTemplates.rootTaskTypeId references taskTypes, so it must be
      // cleared before the taskTypes rows it points to are deleted below.
      await db.delete(projectTemplates).where(eq((projectTemplates as any).orgId, parsed.orgId));
      await db.delete(labels).where(eq((labels as any).orgId, parsed.orgId));

      const orgTaskTypes = await db.select().from(taskTypes).where(eq((taskTypes as any).orgId, parsed.orgId));
      for (const taskType of orgTaskTypes) {
        await db.delete(taskStatusTransitions).where(eq((taskStatusTransitions as any).taskTypeId, taskType.id));
        await db.delete(taskStatuses).where(eq((taskStatuses as any).taskTypeId, taskType.id));
        await db.delete(taskTypes).where(eq((taskTypes as any).id, taskType.id));
      }
      await db.delete(members).where(eq((members as any).orgId, parsed.orgId));
      await db.delete(invitations).where(eq((invitations as any).orgId, parsed.orgId));
      await db.delete(orgs).where(eq((orgs as any).id, parsed.orgId));

      publishDomainEvent(nc, "domain.org.purged", { orgId: parsed.orgId });
      return { success: true };
    },
    async setOrgRetentionDays(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = SetOrgRetentionDaysSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      await db.update(orgs).set({ binRetentionDays: parsed.binRetentionDays }).where(eq((orgs as any).id, parsed.orgId));

      return { success: true };
    },
  };
};
