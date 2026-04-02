import { OrgService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";

export const createOrgsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async listOrgs(req: any) {
      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const result = await db.select().from(orgs);
      return { organizations: result.map((o: any) => ({ ...o, createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt })) };
    },
    async seedOrg(req: any) {
      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
      
      const newOrgId = "o-" + Date.now().toString();
      const orgPayload = { id: newOrgId, name: req.name, slug: req.slug };
      
      if (isStandalone) {
           await db.insert(orgs).values({ ...orgPayload, createdAt: new Date() });
           await db.insert(members).values({ orgId: newOrgId, userId: "user-1", role: "admin", joinedAt: new Date() });
      } else {
           await db.insert(orgs).values(orgPayload);
           await db.insert(members).values({ orgId: newOrgId, userId: "user-1", role: "admin" });
      }

      if (nc) {
         nc.publish("domain.org.created", Buffer.from(JSON.stringify(orgPayload)));
      }
      return { organization: { ...orgPayload, role: "admin" } };
    },
    async inviteUser(req: any) {
      const invs = isStandalone ? schemaSqlite.invitations : schemaMysql.invitations;
      const payload = {
         id: "i-" + Date.now().toString(),
         orgId: req.orgId,
         email: req.email,
         invitedBy: "user-1"
      };
      if (isStandalone) {
         await db.insert(invs).values({ ...payload, createdAt: new Date() });
      } else {
         await db.insert(invs).values(payload);
      }
      return { success: true };
    }
  };
};
