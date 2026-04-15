import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";

// --- Zod Request Schemas ---

const SeedOrgSchema = z.object({
  name: z.string().min(1, "name is required").max(256),
  slug: z.string().min(1, "slug is required").max(256),
});

const InviteUserSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  email: z.string().email("valid email is required"),
});

// --- Handler Factory ---

export const createOrgsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async listOrgs(req: any) {
      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const { items, nextCursor } = await executePaginatedQuery(db, orgs, undefined, req.page);

      return {
        organizations: items.map((o: any) => ({
          ...o,
          createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
        })),
        page: { nextCursor },
      };
    },
    async seedOrg(req: unknown) {
      const parsed = SeedOrgSchema.parse(req);
      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;

      const newOrgId = `o-${crypto.randomUUID()}`;
      const orgPayload = { id: newOrgId, name: parsed.name, slug: parsed.slug };

      await insertRecord(db, orgs, orgPayload, isStandalone);
      const memberPayload = { orgId: newOrgId, userId: "user-1", role: "admin" };
      await insertRecord(db, members, memberPayload, isStandalone, "joinedAt");

      if (nc) {
        nc.publish("domain.org.created", Buffer.from(JSON.stringify(orgPayload)));
      }
      return { organization: { ...orgPayload, role: "admin" } };
    },
    async inviteUser(req: unknown) {
      const parsed = InviteUserSchema.parse(req);
      const invs = isStandalone ? schemaSqlite.invitations : schemaMysql.invitations;
      const payload = {
        id: `i-${crypto.randomUUID()}`,
        orgId: parsed.orgId,
        email: parsed.email,
        invitedBy: "user-1",
      };
      await insertRecord(db, invs, payload, isStandalone);
      return { success: true };
    },
  };
};
