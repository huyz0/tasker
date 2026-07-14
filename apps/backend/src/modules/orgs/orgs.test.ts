import { expect, test, describe } from "bun:test";
import { eq, and } from "drizzle-orm";
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

    const filtered = await handler.listOrgs({ page: { filter: "Test Org Z" } }, ctx);
    expect(filtered.organizations.some((o: any) => o.id === res.organization.id)).toBe(true);

    const filteredOut = await handler.listOrgs({ page: { filter: "no-such-org-name" } }, ctx);
    expect(filteredOut.organizations.some((o: any) => o.id === res.organization.id)).toBe(false);

    await handler.seedOrg({ name: "Test Org A", slug: "test-org-a" + Date.now().toString() }, ctx);
    const sortedAsc = await handler.listOrgs({ page: { sort: "name:asc" } }, ctx);
    const namesAsc = sortedAsc.organizations.map((o: any) => o.name);
    expect(namesAsc.indexOf("Test Org A")).toBeLessThan(namesAsc.indexOf("Test Org Z"));

    const sortedDesc = await handler.listOrgs({ page: { sort: "name:desc" } }, ctx);
    const namesDesc = sortedDesc.organizations.map((o: any) => o.name);
    expect(namesDesc.indexOf("Test Org Z")).toBeLessThan(namesDesc.indexOf("Test Org A"));

    // Sort composes with cursor pagination: paging through name:asc with a
    // small limit should walk the same sorted order one page at a time.
    const page1 = await handler.listOrgs({ page: { sort: "name:asc", limit: 1 } }, ctx);
    expect(page1.organizations).toHaveLength(1);
    expect(page1.organizations[0].name).toBe(namesAsc[0]);
    expect(page1.page.nextCursor).toBeDefined();
    // totalCount reflects the whole filtered set, not just this page.
    expect(page1.page.totalCount).toBe(2);

    const page2 = await handler.listOrgs({ page: { sort: "name:asc", limit: 1, cursor: page1.page.nextCursor } }, ctx);
    expect(page2.organizations).toHaveLength(1);
    expect(page2.organizations[0].name).toBe(namesAsc[1]);
    expect(page2.organizations[0].id).not.toBe(page1.organizations[0].id);
    expect(page2.page.totalCount).toBe(2);

    // Test inviteUser
    const inviteRes = await handler.inviteUser({
        orgId: res.organization.id,
        email: "invited@foo.com"
    }, ctx);
    expect(inviteRes.success).toBe(true);

    // Inviting the same email to the same org again is idempotent, not a
    // second accumulating row.
    const dupInviteRes = await handler.inviteUser({
        orgId: res.organization.id,
        email: "invited@foo.com"
    }, ctx);
    expect(dupInviteRes.success).toBe(true);

    const invRows = await db.select().from(schemaSqlite.invitations)
      .where(and(eq(schemaSqlite.invitations.orgId, res.organization.id), eq(schemaSqlite.invitations.email, "invited@foo.com")));
    expect(invRows.length).toBe(1);
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

  test("restoreOrg rejects restoring a sub-org into an archived parent org", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);

    const adminId = "user-restore-parent-admin-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: adminId, email: `${adminId}@foo.com`, createdAt: new Date() });

    const parent = await handler.seedOrg({ name: "Restore Parent", slug: "restore-parent-" + Date.now() }, makeAuthContext(adminId));
    const child = await handler.seedOrg({
      name: "Restore Child",
      slug: "restore-child-" + Date.now(),
      parentOrgId: parent.organization.id,
    }, makeAuthContext(adminId));

    await handler.archiveOrg({ orgId: child.organization.id }, makeAuthContext(adminId));
    await handler.archiveOrg({ orgId: parent.organization.id }, makeAuthContext(adminId));

    await expect(handler.restoreOrg({ orgId: child.organization.id }, makeAuthContext(adminId))).rejects.toThrow();

    await handler.restoreOrg({ orgId: parent.organization.id }, makeAuthContext(adminId));
    const restored = await handler.restoreOrg({ orgId: child.organization.id }, makeAuthContext(adminId));
    expect(restored.success).toBe(true);
  });

  test("archiveOrg hides the org from listOrgs and restoreOrg brings it back, admin-only", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);

    const adminId = "user-archive-admin-" + Date.now();
    const memberId = "user-archive-member-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: adminId, email: `${adminId}@foo.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}@foo.com`, createdAt: new Date() });

    const org = await handler.seedOrg({ name: "Archive Me", slug: "archive-me-" + Date.now() }, makeAuthContext(adminId));
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: org.organization.id, userId: memberId, role: "member", joinedAt: new Date() });

    await expect(handler.archiveOrg({ orgId: org.organization.id }, makeAuthContext(memberId))).rejects.toThrow();

    await handler.archiveOrg({ orgId: org.organization.id }, makeAuthContext(adminId));

    const activeList = await handler.listOrgs({}, makeAuthContext(adminId));
    expect(activeList.organizations.some((o: any) => o.id === org.organization.id)).toBe(false);

    const binList = await handler.listOrgs({ onlyDeleted: true }, makeAuthContext(adminId));
    expect(binList.organizations.some((o: any) => o.id === org.organization.id)).toBe(true);

    await expect(handler.restoreOrg({ orgId: org.organization.id }, makeAuthContext(memberId))).rejects.toThrow();

    await handler.restoreOrg({ orgId: org.organization.id }, makeAuthContext(adminId));
    const restoredList = await handler.listOrgs({}, makeAuthContext(adminId));
    expect(restoredList.organizations.some((o: any) => o.id === org.organization.id)).toBe(true);

    expect(nc.publishedMessages.map((m: any) => m.subject)).toContain("domain.org.archived");
    expect(nc.publishedMessages.map((m: any) => m.subject)).toContain("domain.org.restored");
  });

  test("purgeOrg requires the org be archived and empty, admin-only", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);

    const adminId = "user-purge-org-admin-" + Date.now();
    const memberId = "user-purge-org-member-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: adminId, email: `${adminId}@foo.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}@foo.com`, createdAt: new Date() });

    const org = await handler.seedOrg({ name: "Purge Me", slug: "purge-me-" + Date.now() }, makeAuthContext(adminId));
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: org.organization.id, userId: memberId, role: "member", joinedAt: new Date() });

    // Cannot purge a live (non-archived) org.
    await expect(handler.purgeOrg({ orgId: org.organization.id }, makeAuthContext(adminId))).rejects.toThrow();

    await handler.archiveOrg({ orgId: org.organization.id }, makeAuthContext(adminId));

    // Not empty: a project still exists under it.
    const templateId = "tmpl-purge-org-" + Date.now();
    const projectId = "proj-purge-org-" + Date.now();
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId: org.organization.id, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId: org.organization.id, templateId, ownerId: adminId, name: "P", createdAt: new Date() });
    await expect(handler.purgeOrg({ orgId: org.organization.id }, makeAuthContext(adminId))).rejects.toThrow();
    await db.delete(schemaSqlite.projects).where(eq(schemaSqlite.projects.id, projectId));

    await expect(handler.purgeOrg({ orgId: org.organization.id }, makeAuthContext(memberId))).rejects.toThrow();

    // Org-scoped rows that don't gate the purge precondition, but must not
    // be left behind orphaned once the org itself is gone.
    const labelId = "lbl-purge-org-" + Date.now();
    await db.insert(schemaSqlite.labels).values({ id: labelId, orgId: org.organization.id, name: "purge-org-label", createdAt: new Date() });
    const taskTypeId = "tt-purge-org-" + Date.now();
    await db.insert(schemaSqlite.taskTypes).values({ id: taskTypeId, orgId: org.organization.id, name: "Custom Type", createdAt: new Date() });
    const statusId = "ts-purge-org-" + Date.now();
    await db.insert(schemaSqlite.taskStatuses).values({ id: statusId, taskTypeId, name: "backlog" });
    const otherStatusId = "ts-purge-org-2-" + Date.now();
    await db.insert(schemaSqlite.taskStatuses).values({ id: otherStatusId, taskTypeId, name: "shipped" });
    await db.insert(schemaSqlite.taskStatusTransitions).values({ id: "tst-purge-org-" + Date.now(), taskTypeId, fromStatusId: statusId, toStatusId: otherStatusId });

    await handler.purgeOrg({ orgId: org.organization.id }, makeAuthContext(adminId));

    const afterPurge = await db.select().from(schemaSqlite.organizations).where(eq(schemaSqlite.organizations.id, org.organization.id));
    expect(afterPurge.length).toBe(0);
    expect(nc.publishedMessages.map((m: any) => m.subject)).toContain("domain.org.purged");

    const remainingTemplates = await db.select().from(schemaSqlite.projectTemplates).where(eq(schemaSqlite.projectTemplates.id, templateId));
    expect(remainingTemplates.length).toBe(0);
    const remainingLabels = await db.select().from(schemaSqlite.labels).where(eq(schemaSqlite.labels.id, labelId));
    expect(remainingLabels.length).toBe(0);
    const remainingTaskTypes = await db.select().from(schemaSqlite.taskTypes).where(eq(schemaSqlite.taskTypes.id, taskTypeId));
    expect(remainingTaskTypes.length).toBe(0);
    const remainingStatuses = await db.select().from(schemaSqlite.taskStatuses).where(eq(schemaSqlite.taskStatuses.taskTypeId, taskTypeId));
    expect(remainingStatuses.length).toBe(0);
    const remainingTransitions = await db.select().from(schemaSqlite.taskStatusTransitions).where(eq(schemaSqlite.taskStatusTransitions.taskTypeId, taskTypeId));
    expect(remainingTransitions.length).toBe(0);
  });

  test("setOrgRetentionDays updates the org's bin retention, admin-only", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);

    const adminId = "user-retention-admin-" + Date.now();
    const memberId = "user-retention-member-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: adminId, email: `${adminId}@foo.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}@foo.com`, createdAt: new Date() });

    const org = await handler.seedOrg({ name: "Retention Org", slug: "retention-org-" + Date.now() }, makeAuthContext(adminId));
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: org.organization.id, userId: memberId, role: "member", joinedAt: new Date() });

    await expect(handler.setOrgRetentionDays({ orgId: org.organization.id, binRetentionDays: 7 }, makeAuthContext(memberId))).rejects.toThrow();
    await expect(handler.setOrgRetentionDays({ orgId: org.organization.id, binRetentionDays: 0 }, makeAuthContext(adminId))).rejects.toThrow();
    // An unbounded value would let an admin effectively disable the
    // retention sweep forever for their org.
    await expect(handler.setOrgRetentionDays({ orgId: org.organization.id, binRetentionDays: 999999 }, makeAuthContext(adminId))).rejects.toThrow();

    const res = await handler.setOrgRetentionDays({ orgId: org.organization.id, binRetentionDays: 7 }, makeAuthContext(adminId));
    expect(res.success).toBe(true);

    const rows = await db.select().from(schemaSqlite.organizations).where(eq(schemaSqlite.organizations.id, org.organization.id));
    expect(rows[0].binRetentionDays).toBe(7);
  });
});
