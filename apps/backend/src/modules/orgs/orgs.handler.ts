import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { decodeCursor, encodeCursor, buildCursorPaginationWhere, buildPaginationOrderBy } from "../../db/query-builder";

// --- Zod Request Schemas ---

const SeedOrgSchema = z.object({
  name: z.string().min(1, "name is required").max(256),
  slug: z.string().min(1, "slug is required").max(256),
});

const InviteUserSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  email: z.string().email("valid email is required"),
});

// --- Dual-mode Insert Helper ---

const insertRecord = async (
  db: any,
  table: any,
  payload: Record<string, unknown>,
  isStandalone: boolean,
  timestampField: "createdAt" | "joinedAt" | null = "createdAt"
) => {
  if (isStandalone && timestampField) {
    await db.insert(table).values({ ...payload, [timestampField]: new Date() });
  } else {
    await db.insert(table).values(payload);
  }
};

// --- Handler Factory ---

export const createOrgsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async listOrgs(req: any) {
      const page = req.page || {};
      const limit = Math.min(page.limit || 50, 100);
      const cursorData = decodeCursor(page.cursor);

      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      let query = db.select().from(orgs).limit(limit) as any;
      query = query.orderBy(...buildPaginationOrderBy(orgs.createdAt as any, orgs.id as any));

      const whereClause = buildCursorPaginationWhere(cursorData, orgs.createdAt as any, orgs.id as any);
      if (whereClause) {
        query = query.where(whereClause);
      }

      const result = await query;
      const lastItem = result[result.length - 1];
      const nextCursor = lastItem && result.length === limit ? encodeCursor((lastItem.createdAt instanceof Date ? lastItem.createdAt : new Date(lastItem.createdAt)).getTime(), lastItem.id) : undefined;

      return {
        organizations: result.map((o: any) => ({
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
