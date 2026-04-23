import { expect, test, describe } from "bun:test";
import { setupIntegrationTest } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createOrgsHandler } from "./orgs.handler";

describe("Organizations Handler Integration Logic", () => {
  test("can execute seedOrg and listOrgs flows", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);

    // Fake user for member required by seedOrg handler
    const userId = "user-1";
    try {
        await db.insert(schemaSqlite.users).values({ id: userId, email: "z" + Date.now().toString() + "@foo.com", name: "Z", createdAt: new Date() });
    } catch {}

    const req = { name: "Test Org Z", slug: "test-org-z" + Date.now().toString() };
    const res = await handler.seedOrg(req);
    
    expect(res.organization.id).toBeDefined();
    expect(res.organization.name).toBe("Test Org Z");
    expect(nc.publishedMessages.map((m: any) => m.subject)).toContain("domain.org.created");

    const lists = await handler.listOrgs({});
    expect(lists.organizations.length).toBeGreaterThan(0);

    // Test inviteUser
    const inviteRes = await handler.inviteUser({
        orgId: res.organization.id,
        email: "invited@foo.com"
    });
    expect(inviteRes.success).toBe(true);
  });
});
