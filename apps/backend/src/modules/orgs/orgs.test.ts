import { expect, test, describe } from "bun:test";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createOrgsHandler } from "./orgs.handler";

describe("Organizations Handler Integration Logic", () => {
  test("can execute seedOrg and listOrgs flows", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);

    const userId = "user-1";
    try {
        await db.insert(schemaSqlite.users).values({ id: userId, email: "z" + Date.now().toString() + "@foo.com", name: "Z", createdAt: new Date() });
    } catch {}
    const ctx = makeAuthContext(userId);

    const req = { name: "Test Org Z", slug: "test-org-z" + Date.now().toString() };
    const res = await handler.seedOrg(req, ctx);

    expect(res.organization.id).toBeDefined();
    expect(res.organization.name).toBe("Test Org Z");
    expect(nc.publishedMessages.map((m: any) => m.subject)).toContain("domain.org.created");

    const lists = await handler.listOrgs({}, ctx);
    expect(lists.organizations.length).toBeGreaterThan(0);

    // Test inviteUser
    const inviteRes = await handler.inviteUser({
        orgId: res.organization.id,
        email: "invited@foo.com"
    }, ctx);
    expect(inviteRes.success).toBe(true);
  });

  test("rejects requests with no authenticated user", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);
    const anonCtx = makeAuthContext(null);

    await expect(handler.listOrgs({}, anonCtx)).rejects.toThrow();
    await expect(handler.seedOrg({ name: "X", slug: "x-" + Date.now() }, anonCtx)).rejects.toThrow();
  });

  test("rejects inviteUser from a non-member and a non-admin member", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);

    const adminId = "user-admin";
    const memberId = "user-member";
    const outsiderId = "user-outsider";
    for (const id of [adminId, memberId, outsiderId]) {
      await db.insert(schemaSqlite.users).values({ id, email: `${id}-${Date.now()}@foo.com`, name: id, createdAt: new Date() });
    }

    const org = await handler.seedOrg({ name: "Org", slug: "org-" + Date.now() }, makeAuthContext(adminId));
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: org.organization.id, userId: memberId, role: "member", joinedAt: new Date() });

    await expect(handler.inviteUser({ orgId: org.organization.id, email: "a@b.com" }, makeAuthContext(outsiderId))).rejects.toThrow();
    await expect(handler.inviteUser({ orgId: org.organization.id, email: "a@b.com" }, makeAuthContext(memberId))).rejects.toThrow();

    const res = await handler.inviteUser({ orgId: org.organization.id, email: "a@b.com" }, makeAuthContext(adminId));
    expect(res.success).toBe(true);
  });

  test("seedOrg supports creating a child org under a parent, with depth-1 and admin enforcement", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);

    const adminId = "user-parent-admin";
    const memberId = "user-parent-member";
    await db.insert(schemaSqlite.users).values({ id: adminId, email: `${adminId}-${Date.now()}@foo.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}-${Date.now()}@foo.com`, createdAt: new Date() });

    const parent = await handler.seedOrg({ name: "Parent", slug: "parent-" + Date.now() }, makeAuthContext(adminId));
    expect(parent.organization.parentOrgId).toBeFalsy();

    const child = await handler.seedOrg({
      name: "Child",
      slug: "child-" + Date.now(),
      parentOrgId: parent.organization.id,
    }, makeAuthContext(adminId));
    expect(child.organization.parentOrgId).toBe(parent.organization.id);

    // A non-admin member of the parent cannot attach a new child org under it.
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: parent.organization.id, userId: memberId, role: "member", joinedAt: new Date() });
    await expect(handler.seedOrg({
      name: "Another Child",
      slug: "another-child-" + Date.now(),
      parentOrgId: parent.organization.id,
    }, makeAuthContext(memberId))).rejects.toThrow();

    // A grandchild (nesting under an org that already has a parent) is rejected.
    await expect(handler.seedOrg({
      name: "Grandchild",
      slug: "grandchild-" + Date.now(),
      parentOrgId: child.organization.id,
    }, makeAuthContext(adminId))).rejects.toThrow();

    // A parentOrgId that doesn't exist is rejected.
    await expect(handler.seedOrg({
      name: "Orphan",
      slug: "orphan-" + Date.now(),
      parentOrgId: "org-does-not-exist",
    }, makeAuthContext(adminId))).rejects.toThrow();
  });
});
