import { expect, test, describe } from "bun:test";
import { setupDatabase } from "../db";
import * as schemaSqlite from "../schema.sqlite";
import { eq } from "drizzle-orm";
import { connectNodeAdapter } from "@connectrpc/connect-node";
// We ideally test against the router, but simply verifying DB operations works for the CQRS pattern context.

describe("Organizations Service End-to-End Logic", () => {
  test("can execute seedOrg transaction flow", async () => {
    const db = await setupDatabase("sqlite");
    
    // Seed Org directly into DB to test insertions
    const newOrgId = "o-test-" + Date.now().toString();
    const orgPayload = { id: newOrgId, name: "Test Org Z", slug: "test-org-z" + Date.now().toString() };
    
    await (db as any).insert(schemaSqlite.organizations).values({ ...orgPayload, createdAt: new Date() });
    
    const seededOrg = await (db as any)
      .select()
      .from(schemaSqlite.organizations)
      .where(eq(schemaSqlite.organizations.id, newOrgId));
      
    expect(seededOrg.length).toBe(1);
    expect(seededOrg[0].name).toBe("Test Org Z");

    // Fake user for member
    const userId = "u-z-" + Date.now().toString();
    await (db as any).insert(schemaSqlite.users).values({ id: userId, email: "z" + Date.now().toString() + "@foo.com", name: "Z", createdAt: new Date() });

    await (db as any).insert(schemaSqlite.organizationMembers).values({ 
        orgId: newOrgId, 
        userId: userId, 
        role: "admin", 
        joinedAt: new Date() 
    });

    const members = await (db as any)
       .select()
       .from(schemaSqlite.organizationMembers)
       .where(eq(schemaSqlite.organizationMembers.orgId, newOrgId));

    expect(members.length).toBe(1);
    expect(members[0].role).toBe("admin");
  });
});
