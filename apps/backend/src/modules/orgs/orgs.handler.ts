import { z } from "zod/v4";
import { inArray, eq, and, not } from "drizzle-orm";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { insertRecord, executePaginatedQuery, notDeleted, softDeleteById, restoreById } from "../../db/query-builder";
import { requireUserId, assertOrgAdmin } from "../../lib/authz";
import { ConnectError, Code } from "@connectrpc/connect";

// --- Zod Request Schemas ---

const SeedOrgSchema = z.object({
  name: z.string().min(1, "name is required").max(256),
  slug: z.string().min(1, "slug is required").max(256),
  parentOrgId: z.string().nullable().optional(),
});

const InviteUserSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  email: z.string().email("valid email is required"),
});

const ArchiveOrgSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
});

const RestoreOrgSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
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
      const { items, nextCursor } = await executePaginatedQuery(db, orgs, and(inArray(orgs.id, memberOrgIds), deletedFilter), req.page);

      return {
        organizations: items.map((o: any) => ({
          ...o,
          createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
        })),
        page: { nextCursor },
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
      const memberPayload = { orgId: newOrgId, userId, role: "admin" };
      await insertRecord(db, members, memberPayload, isStandalone, "joinedAt");

      if (nc) {
        nc.publish("domain.org.created", Buffer.from(JSON.stringify(orgPayload)));
      }
      return { organization: { ...orgPayload, role: "admin" } };
    },
    async inviteUser(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = InviteUserSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const invs = isStandalone ? schemaSqlite.invitations : schemaMysql.invitations;
      const payload = {
        id: `i-${crypto.randomUUID()}`,
        orgId: parsed.orgId,
        email: parsed.email,
        invitedBy: userId,
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

      if (nc) nc.publish("domain.org.archived", Buffer.from(JSON.stringify({ orgId: parsed.orgId })));
      return { success: true };
    },
    async restoreOrg(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = RestoreOrgSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      await restoreById(db, orgs, parsed.orgId);

      if (nc) nc.publish("domain.org.restored", Buffer.from(JSON.stringify({ orgId: parsed.orgId })));
      return { success: true };
    },
  };
};
