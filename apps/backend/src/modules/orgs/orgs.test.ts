import { expect, test, describe } from "bun:test";
import { eq, and, inArray } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext, seedUser } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createOrgsHandler, INVITATION_TTL_DAYS } from "./orgs.handler";
import { Code } from "@connectrpc/connect";

describe("Organizations Handler Integration Logic", () => {
  test("can execute seedOrg and listOrgs flows", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);

    const userId = "user-1";
    await seedUser(db, userId, { name: "Z" });
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

  test("seedOrg makes the founding member an owner, not just an admin", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);
    const ownerId = "user-founder-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: ownerId, email: `${ownerId}@foo.com`, createdAt: new Date() });

    const org = await handler.seedOrg({ name: "Founded Org", slug: "founded-org-" + Date.now() }, makeAuthContext(ownerId));
    expect(org.organization.role).toBe("owner");

    const rows = await db.select().from(schemaSqlite.organizationMembers)
      .where(and(eq(schemaSqlite.organizationMembers.orgId, org.organization.id), eq(schemaSqlite.organizationMembers.userId, ownerId)));
    expect(rows[0].role).toBe("owner");
  });

  test("inviteUser stores the requested role, defaulting to member, and never allows 'owner'", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);
    const ownerId = "user-invite-role-owner-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: ownerId, email: `${ownerId}@foo.com`, createdAt: new Date() });
    const org = await handler.seedOrg({ name: "Invite Role Org", slug: "invite-role-org-" + Date.now() }, makeAuthContext(ownerId));

    await handler.inviteUser({ orgId: org.organization.id, email: "default-role@foo.com" }, makeAuthContext(ownerId));
    const defaultInv = await db.select().from(schemaSqlite.invitations)
      .where(and(eq(schemaSqlite.invitations.orgId, org.organization.id), eq(schemaSqlite.invitations.email, "default-role@foo.com")));
    expect(defaultInv[0].role).toBe("member");

    await handler.inviteUser({ orgId: org.organization.id, email: "viewer@foo.com", role: "viewer" }, makeAuthContext(ownerId));
    const viewerInv = await db.select().from(schemaSqlite.invitations)
      .where(and(eq(schemaSqlite.invitations.orgId, org.organization.id), eq(schemaSqlite.invitations.email, "viewer@foo.com")));
    expect(viewerInv[0].role).toBe("viewer");

    await expect(handler.inviteUser({ orgId: org.organization.id, email: "x@foo.com", role: "owner" }, makeAuthContext(ownerId))).rejects.toThrow();
  });

  test("removeOrgMember rejects removing the organization's last owner", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);
    const ownerId = "user-last-owner-" + Date.now();
    const otherOwnerId = "user-other-owner-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: ownerId, email: `${ownerId}@foo.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: otherOwnerId, email: `${otherOwnerId}@foo.com`, createdAt: new Date() });
    const org = await handler.seedOrg({ name: "Last Owner Org", slug: "last-owner-org-" + Date.now() }, makeAuthContext(ownerId));

    // Cannot remove the sole owner.
    await expect(handler.removeOrgMember({ orgId: org.organization.id, userId: ownerId }, makeAuthContext(otherOwnerId))).rejects.toThrow();

    await db.insert(schemaSqlite.organizationMembers).values({ orgId: org.organization.id, userId: otherOwnerId, role: "owner", joinedAt: new Date() });
    // Now that a second owner exists, the first can be removed.
    const res = await handler.removeOrgMember({ orgId: org.organization.id, userId: ownerId }, makeAuthContext(otherOwnerId));
    expect(res.success).toBe(true);
  });

  test("updateOrgMemberRole lets an admin change member/viewer roles but not touch ownership", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);
    const ownerId = "user-role-owner-" + Date.now();
    const adminId = "user-role-admin-" + Date.now();
    const memberId = "user-role-member-" + Date.now();
    for (const id of [ownerId, adminId, memberId]) {
      await db.insert(schemaSqlite.users).values({ id, email: `${id}@foo.com`, name: id, createdAt: new Date() });
    }
    const org = await handler.seedOrg({ name: "Role Org", slug: "role-org-" + Date.now() }, makeAuthContext(ownerId));
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: org.organization.id, userId: adminId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: org.organization.id, userId: memberId, role: "member", joinedAt: new Date() });

    // A non-admin/owner cannot change anyone's role.
    await expect(handler.updateOrgMemberRole({ orgId: org.organization.id, userId: memberId, role: "viewer" }, makeAuthContext(memberId))).rejects.toThrow();

    // An admin can promote/demote among admin/member/viewer.
    const viewerRes = await handler.updateOrgMemberRole({ orgId: org.organization.id, userId: memberId, role: "viewer" }, makeAuthContext(adminId));
    expect(viewerRes.member.role).toBe("viewer");

    // An admin cannot grant ownership.
    await expect(handler.updateOrgMemberRole({ orgId: org.organization.id, userId: memberId, role: "owner" }, makeAuthContext(adminId))).rejects.toThrow();

    // An admin cannot change an existing owner's role.
    await expect(handler.updateOrgMemberRole({ orgId: org.organization.id, userId: ownerId, role: "admin" }, makeAuthContext(adminId))).rejects.toThrow();

    // Changing the role of a non-member is rejected.
    await expect(handler.updateOrgMemberRole({ orgId: org.organization.id, userId: "no-such-user", role: "member" }, makeAuthContext(adminId))).rejects.toThrow();
  });

  test("updateOrgMemberRole lets an owner grant/revoke ownership, but never demotes the last owner", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);
    const ownerId = "user-grant-owner-" + Date.now();
    const memberId = "user-grant-member-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: ownerId, email: `${ownerId}@foo.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}@foo.com`, createdAt: new Date() });
    const org = await handler.seedOrg({ name: "Grant Owner Org", slug: "grant-owner-org-" + Date.now() }, makeAuthContext(ownerId));
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: org.organization.id, userId: memberId, role: "member", joinedAt: new Date() });

    // Only an owner can be demoted safely once a second owner exists.
    const grantRes = await handler.updateOrgMemberRole({ orgId: org.organization.id, userId: memberId, role: "owner" }, makeAuthContext(ownerId));
    expect(grantRes.member.role).toBe("owner");

    const demoteRes = await handler.updateOrgMemberRole({ orgId: org.organization.id, userId: ownerId, role: "admin" }, makeAuthContext(memberId));
    expect(demoteRes.member.role).toBe("admin");

    // memberId is now the sole owner - cannot be demoted.
    await expect(handler.updateOrgMemberRole({ orgId: org.organization.id, userId: memberId, role: "admin" }, makeAuthContext(memberId))).rejects.toThrow();
  });
});

describe("Leaving an organization (M03-T02)", () => {
  /**
   * Removing yourself used to be rejected outright, so the only exit from an
   * organization was to ask an admin. That is a support ticket for something a
   * person should be able to do themselves, and it left no way to clean up a
   * membership created by a mistaken invitation.
   *
   * The rule is now about *target*, not role: removing someone else needs
   * admin, removing yourself needs only membership. The last-owner guard is
   * unchanged and applies to both.
   */
  const seedLeaveFixture = async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);
    const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
    const ownerId = "user-leave-owner-" + suffix;
    const memberId = "user-leave-member-" + suffix;
    const viewerId = "user-leave-viewer-" + suffix;

    for (const id of [ownerId, memberId, viewerId]) {
      await db.insert(schemaSqlite.users).values({ id, email: `${id}@foo.com`, createdAt: new Date() });
    }
    const org = await handler.seedOrg({ name: "Leave Org", slug: "leave-org-" + suffix }, makeAuthContext(ownerId));
    const orgId = org.organization.id;
    await db.insert(schemaSqlite.organizationMembers).values([
      { orgId, userId: memberId, role: "member", joinedAt: new Date() },
      { orgId, userId: viewerId, role: "viewer", joinedAt: new Date() },
    ]);
    return { db, nc, handler, orgId, ownerId, memberId, viewerId };
  };

  const membershipCount = (db: any, orgId: string, userId: string) =>
    db
      .select()
      .from(schemaSqlite.organizationMembers)
      .where(and(eq(schemaSqlite.organizationMembers.orgId, orgId), eq(schemaSqlite.organizationMembers.userId, userId)))
      .then((r: any[]) => r.length);

  test("a member can remove themselves without being an admin", async () => {
    const { db, handler, orgId, memberId } = await seedLeaveFixture();

    const res = await handler.removeOrgMember({ orgId, userId: memberId }, makeAuthContext(memberId));

    expect(res.success).toBe(true);
    expect(await membershipCount(db, orgId, memberId)).toBe(0);
  });

  test("a viewer can leave too — leaving is self-service, not a write on the org", async () => {
    const { db, handler, orgId, viewerId } = await seedLeaveFixture();

    await handler.removeOrgMember({ orgId, userId: viewerId }, makeAuthContext(viewerId));

    expect(await membershipCount(db, orgId, viewerId)).toBe(0);
  });

  test("the sole owner still cannot leave", async () => {
    const { db, handler, orgId, ownerId } = await seedLeaveFixture();

    await expect(handler.removeOrgMember({ orgId, userId: ownerId }, makeAuthContext(ownerId))).rejects.toThrow(
      /last owner/
    );
    expect(await membershipCount(db, orgId, ownerId)).toBe(1);
  });

  test("an owner can leave once a second owner exists", async () => {
    const { db, handler, orgId, ownerId, memberId } = await seedLeaveFixture();
    await handler.updateOrgMemberRole({ orgId, userId: memberId, role: "owner" }, makeAuthContext(ownerId));

    await handler.removeOrgMember({ orgId, userId: ownerId }, makeAuthContext(ownerId));

    expect(await membershipCount(db, orgId, ownerId)).toBe(0);
  });

  test("a non-admin still cannot remove somebody else", async () => {
    const { db, handler, orgId, memberId, viewerId } = await seedLeaveFixture();

    await expect(handler.removeOrgMember({ orgId, userId: viewerId }, makeAuthContext(memberId))).rejects.toThrow();
    expect(await membershipCount(db, orgId, viewerId)).toBe(1);
  });

  test("a stranger cannot leave an organization they were never in", async () => {
    const { db, handler, orgId } = await seedLeaveFixture();
    const strangerId = "user-leave-stranger-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: strangerId, email: `${strangerId}@foo.com`, createdAt: new Date() });

    await expect(handler.removeOrgMember({ orgId, userId: strangerId }, makeAuthContext(strangerId))).rejects.toThrow();
  });

  test("leaving publishes the same member_removed event as an admin removal", async () => {
    const { nc, handler, orgId, memberId } = await seedLeaveFixture();
    nc.clear();

    await handler.removeOrgMember({ orgId, userId: memberId }, makeAuthContext(memberId));

    expect(nc.publishedMessages.map((m: any) => m.subject)).toContain("domain.org.member_removed");
  });
});

describe("purgeOrg atomicity (M03-T03)", () => {
  /**
   * purgeOrg deletes from seven tables. Without a transaction those are seven
   * independent statements, so a failure partway through - a constraint, a
   * dropped connection, a MySQL deadlock - leaves the organization's templates
   * and labels gone while the org row, its members and its invitations remain.
   * The org is then un-purgeable by the same code path and invisible to nobody:
   * it is simply corrupt.
   *
   * The failure is injected rather than waited for, at the delete that removes
   * members - late enough that earlier deletes have already run, which is what
   * makes the partial state observable.
   */
  const failOnNthDelete = (db: any, n: number) => {
    let calls = 0;
    const wrap = (target: any) =>
      new Proxy(target, {
        get(t, prop, recv) {
          if (prop === "delete") {
            return (table: any) => {
              calls += 1;
              if (calls === n) throw new Error("injected mid-purge failure");
              return t.delete(table);
            };
          }
          if (prop === "transaction") {
            return (cb: any) => t.transaction((tx: any) => cb(wrap(tx)));
          }
          return Reflect.get(t, prop, recv);
        },
      });
    return wrap(db);
  };

  const seedPurgeableOrg = async () => {
    const { db, nc } = await setupIntegrationTest();
    const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
    const adminId = "user-purge-" + suffix;
    const orgId = "org-purge-" + suffix;

    await db.insert(schemaSqlite.users).values({ id: adminId, email: `${adminId}@foo.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({
      id: orgId, name: "Purge Me", slug: orgId, createdAt: new Date(), deletedAt: new Date(),
    });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: adminId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: "tmpl-" + suffix, orgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.labels).values({ id: "lbl-" + suffix, orgId, name: "L", createdAt: new Date() });
    await db.insert(schemaSqlite.taskTypes).values({ id: "tt-" + suffix, orgId, name: "TT", createdAt: new Date() });

    return { db, nc, orgId, adminId };
  };

  const countsFor = async (db: any, orgId: string) => {
    const rows = await Promise.all([
      db.select().from(schemaSqlite.organizations).where(eq(schemaSqlite.organizations.id, orgId)),
      db.select().from(schemaSqlite.organizationMembers).where(eq(schemaSqlite.organizationMembers.orgId, orgId)),
      db.select().from(schemaSqlite.projectTemplates).where(eq(schemaSqlite.projectTemplates.orgId, orgId)),
      db.select().from(schemaSqlite.labels).where(eq(schemaSqlite.labels.orgId, orgId)),
      db.select().from(schemaSqlite.taskTypes).where(eq(schemaSqlite.taskTypes.orgId, orgId)),
    ]);
    return { orgs: rows[0].length, members: rows[1].length, templates: rows[2].length, labels: rows[3].length, taskTypes: rows[4].length };
  };

  test("a purge that fails partway leaves the organization exactly as it was", async () => {
    const { db, nc, orgId, adminId } = await seedPurgeableOrg();
    const before = await countsFor(db, orgId);
    expect(before).toEqual({ orgs: 1, members: 1, templates: 1, labels: 1, taskTypes: 1 });

    // The 4th delete is the members delete: templates, labels and the task
    // type's transitions/statuses have already gone by then.
    const handler = createOrgsHandler(failOnNthDelete(db, 4), nc);
    await expect(handler.purgeOrg({ orgId }, makeAuthContext(adminId))).rejects.toThrow(/injected mid-purge failure/);

    expect(await countsFor(db, orgId)).toEqual(before);
  });

  test("a purge that succeeds still removes everything", async () => {
    const { db, nc, orgId, adminId } = await seedPurgeableOrg();
    const handler = createOrgsHandler(db, nc);

    const res = await handler.purgeOrg({ orgId }, makeAuthContext(adminId));

    expect(res.success).toBe(true);
    expect(await countsFor(db, orgId)).toEqual({ orgs: 0, members: 0, templates: 0, labels: 0, taskTypes: 0 });
  });

  test("a failed purge publishes no purged event", async () => {
    const { db, nc, orgId, adminId } = await seedPurgeableOrg();
    nc.clear();
    const handler = createOrgsHandler(failOnNthDelete(db, 4), nc);

    await expect(handler.purgeOrg({ orgId }, makeAuthContext(adminId))).rejects.toThrow();

    expect(nc.publishedMessages.map((m: any) => m.subject)).not.toContain("domain.org.purged");
  });
});

describe("Owned-project reassignment guard (M03-T04)", () => {
  /**
   * Removing a member deleted their membership and nothing else, so any project
   * they owned kept an ownerId pointing at somebody who is no longer in the
   * organization. The row still satisfies its foreign key - the user exists,
   * they are simply not a member - so nothing surfaced it. The project then has
   * an owner who cannot be assigned work and does not appear in the member
   * list.
   *
   * The guard covers both exits from an organization. M03-T02 made leaving
   * self-service, which would otherwise have been a second, unguarded way to
   * strand a project.
   */
  const seedOwnerFixture = async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);
    const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
    const adminId = "user-own-admin-" + suffix;
    const ownerId = "user-own-member-" + suffix;
    const orgId = "org-own-" + suffix;

    for (const id of [adminId, ownerId]) {
      await db.insert(schemaSqlite.users).values({ id, email: `${id}@foo.com`, createdAt: new Date() });
    }
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Own Org", slug: orgId, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values([
      { orgId, userId: adminId, role: "admin", joinedAt: new Date() },
      { orgId, userId: ownerId, role: "member", joinedAt: new Date() },
    ]);
    await db.insert(schemaSqlite.projectTemplates).values({ id: "tmpl-" + suffix, orgId, name: "T", createdAt: new Date() });
    const projectIds = ["proj-a-" + suffix, "proj-b-" + suffix];
    // Distinct keys: (orgId, key) is unique, and both would otherwise take the
    // column default and collide.
    for (const [i, id] of projectIds.entries()) {
      await db.insert(schemaSqlite.projects).values({
        id, orgId, templateId: "tmpl-" + suffix, ownerId, name: "P " + id, key: `K${i}`, createdAt: new Date(),
      });
    }
    return { db, nc, handler, orgId, adminId, ownerId, projectIds };
  };

  const stillAMember = (db: any, orgId: string, userId: string) =>
    db
      .select()
      .from(schemaSqlite.organizationMembers)
      .where(and(eq(schemaSqlite.organizationMembers.orgId, orgId), eq(schemaSqlite.organizationMembers.userId, userId)))
      .then((r: any[]) => r.length === 1);

  test("an admin cannot remove a member who still owns projects", async () => {
    const { db, handler, orgId, adminId, ownerId } = await seedOwnerFixture();

    await expect(handler.removeOrgMember({ orgId, userId: ownerId }, makeAuthContext(adminId))).rejects.toThrow(
      /owns .* project/i
    );
    expect(await stillAMember(db, orgId, ownerId)).toBe(true);
  });

  test("the refusal names the blocking projects, so the caller can act on it", async () => {
    const { handler, orgId, adminId, ownerId, projectIds } = await seedOwnerFixture();

    let err: any;
    try {
      await handler.removeOrgMember({ orgId, userId: ownerId }, makeAuthContext(adminId));
    } catch (e) {
      err = e;
    }

    expect(err.code).toBe(Code.FailedPrecondition);
    // An error that says "reassign their projects" without saying which ones
    // makes the caller hunt for them; the ids are the actionable part.
    for (const id of projectIds) expect(err.message).toContain(id);
  });

  test("a member cannot leave while still owning projects — the T02 path is guarded too", async () => {
    const { db, handler, orgId, ownerId } = await seedOwnerFixture();

    await expect(handler.removeOrgMember({ orgId, userId: ownerId }, makeAuthContext(ownerId))).rejects.toThrow(
      /owns .* project/i
    );
    expect(await stillAMember(db, orgId, ownerId)).toBe(true);
  });

  test("removal succeeds once the projects are reassigned", async () => {
    const { db, handler, orgId, adminId, ownerId, projectIds } = await seedOwnerFixture();
    await db.update(schemaSqlite.projects).set({ ownerId: adminId }).where(eq(schemaSqlite.projects.ownerId, ownerId));

    await handler.removeOrgMember({ orgId, userId: ownerId }, makeAuthContext(adminId));

    expect(await stillAMember(db, orgId, ownerId)).toBe(false);
    for (const id of projectIds) {
      const [row] = await db.select().from(schemaSqlite.projects).where(eq(schemaSqlite.projects.id, id));
      expect(row.ownerId).toBe(adminId);
    }
  });

  test("an archived project still blocks removal — a binned project can be restored", async () => {
    const { db, handler, orgId, adminId, ownerId, projectIds } = await seedOwnerFixture();
    await db.update(schemaSqlite.projects).set({ deletedAt: new Date() }).where(eq(schemaSqlite.projects.id, projectIds[0]!));
    await db.update(schemaSqlite.projects).set({ ownerId: adminId }).where(eq(schemaSqlite.projects.id, projectIds[1]!));

    await expect(handler.removeOrgMember({ orgId, userId: ownerId }, makeAuthContext(adminId))).rejects.toThrow(
      /owns .* project/i
    );
    expect(await stillAMember(db, orgId, ownerId)).toBe(true);
  });

  test("a member owning nothing is still removable", async () => {
    const { db, handler, orgId, adminId, ownerId, projectIds } = await seedOwnerFixture();
    await db.delete(schemaSqlite.projects).where(inArray(schemaSqlite.projects.id, projectIds));

    await handler.removeOrgMember({ orgId, userId: ownerId }, makeAuthContext(adminId));

    expect(await stillAMember(db, orgId, ownerId)).toBe(false);
  });
});

describe("listOrgMembers at scale (M03-T06)", () => {
  /**
   * The old implementation selected every membership row and then fetched the
   * users with `inArray(users.id, userIds)`, binding one SQL parameter per
   * member. SQLite's default parameter ceiling is 32,766, so an organization
   * past roughly that size did not return a slow answer - it threw. Below the
   * ceiling it still shipped the entire organization in one response.
   */
  const seedMembers = async (count: number) => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);
    const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
    const orgId = "org-scale-" + suffix;
    const adminId = "user-scale-admin-" + suffix;

    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Scale Org", slug: orgId, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: adminId, email: `${adminId}@t.local`, name: "Admin", createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: adminId, role: "admin", joinedAt: new Date() });

    // Batched: one insert per row is minutes at this size, and a single
    // 100k-row statement exceeds the very parameter limit this task is about.
    const BATCH = 500;
    for (let start = 0; start < count; start += BATCH) {
      const size = Math.min(BATCH, count - start);
      const users = Array.from({ length: size }, (_, i) => {
        const n = start + i;
        return {
          id: `u-${suffix}-${n}`,
          email: `member${n}@t.local`,
          name: `Member ${String(n).padStart(6, "0")}`,
          createdAt: new Date(),
        };
      });
      await db.insert(schemaSqlite.users).values(users);
      await db.insert(schemaSqlite.organizationMembers).values(
        users.map((u) => ({ orgId, userId: u.id, role: "member", joinedAt: new Date() })),
      );
    }
    return { db, handler, orgId, adminId, ctx: makeAuthContext(adminId) };
  };

  test("returns a bounded page, not the whole organization", async () => {
    const { handler, orgId, ctx } = await seedMembers(250);

    const res = await handler.listOrgMembers({ orgId }, ctx);

    expect(res.members.length).toBe(50); // the server's default page size
    expect(res.page.totalCount).toBe(251); // 250 members + the admin
    expect(res.page.nextCursor).toBeDefined();
  });

  test("searches name and email server-side, not just one of them", async () => {
    const { handler, orgId, ctx } = await seedMembers(60);

    const byName = await handler.listOrgMembers({ orgId, page: { filter: "Member 000042" } }, ctx);
    expect(byName.members.map((m: any) => m.name)).toEqual(["Member 000042"]);

    const byEmail = await handler.listOrgMembers({ orgId, page: { filter: "member17@" } }, ctx);
    expect(byEmail.members.map((m: any) => m.email)).toEqual(["member17@t.local"]);

    // totalCount describes the filtered set, or the caller cannot tell whether
    // their search matched one person or a thousand.
    expect(byName.page.totalCount).toBe(1);
  });

  test("sorts by a joined column", async () => {
    const { handler, orgId, ctx } = await seedMembers(5);

    const asc = await handler.listOrgMembers({ orgId, page: { sort: "name:asc", limit: 3 } }, ctx);
    const names = asc.members.map((m: any) => m.name);

    expect(names).toEqual([...names].sort());
  });

  test("paging visits every member exactly once", async () => {
    const { handler, orgId, ctx } = await seedMembers(120);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 50; guard++) {
      const page: any = await handler.listOrgMembers({ orgId, page: { limit: 25, sort: "name:asc", cursor } }, ctx);
      seen.push(...page.members.map((m: any) => m.userId));
      cursor = page.page.nextCursor;
      if (!cursor) break;
    }

    expect(seen.length).toBe(121);
    expect(new Set(seen).size).toBe(121);
  });
});

describe("listOrgMembers role facet (M03-T08)", () => {
  const seedMixedRoles = async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);
    const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
    const orgId = "org-facet-" + suffix;
    const rows = [
      { id: "owner-" + suffix, role: "owner", name: "Olive" },
      { id: "admin1-" + suffix, role: "admin", name: "Adam" },
      { id: "admin2-" + suffix, role: "admin", name: "Ada" },
      { id: "member-" + suffix, role: "member", name: "Mel" },
      { id: "viewer-" + suffix, role: "viewer", name: "Vic" },
    ];
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Facet Org", slug: orgId, createdAt: new Date() });
    for (const r of rows) {
      await db.insert(schemaSqlite.users).values({ id: r.id, email: `${r.id}@t.local`, name: r.name, createdAt: new Date() });
      await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: r.id, role: r.role, joinedAt: new Date() });
    }
    return { handler, orgId, ctx: makeAuthContext(rows[0]!.id) };
  };

  test("filters to a single role, and counts only that role", async () => {
    const { handler, orgId, ctx } = await seedMixedRoles();

    const admins = await handler.listOrgMembers({ orgId, role: "admin" }, ctx);

    expect(admins.members.map((m: any) => m.name).sort()).toEqual(["Ada", "Adam"]);
    // The count has to follow the facet, or "Showing 2 of 5" tells the user
    // their filter did not work.
    expect(admins.page.totalCount).toBe(2);
  });

  test("an empty role means no facet, not a member with no role", async () => {
    const { handler, orgId, ctx } = await seedMixedRoles();

    const all = await handler.listOrgMembers({ orgId, role: "" }, ctx);

    expect(all.members.length).toBe(5);
    expect(all.page.totalCount).toBe(5);
  });

  test("the facet composes with search rather than replacing it", async () => {
    const { handler, orgId, ctx } = await seedMixedRoles();

    // "Ada" is a substring of "Adam", so both admins match the search - which
    // is the point: the facet narrows to admins, the search narrows within
    // them, and neither replaces the other.
    const both = await handler.listOrgMembers({ orgId, role: "admin", page: { filter: "Ada" } }, ctx);
    expect(both.members.map((m: any) => m.name).sort()).toEqual(["Ada", "Adam"]);
    expect(both.page.totalCount).toBe(2);

    // Same search without the facet would also match nobody else here, so
    // prove the facet does work by searching a name that is not an admin.
    const nonAdmin = await handler.listOrgMembers({ orgId, role: "admin", page: { filter: "Vic" } }, ctx);
    expect(nonAdmin.members).toEqual([]);
    expect(nonAdmin.page.totalCount).toBe(0);

    const withoutFacet = await handler.listOrgMembers({ orgId, page: { filter: "Vic" } }, ctx);
    expect(withoutFacet.members.map((m: any) => m.name)).toEqual(["Vic"]);
  });

  test("rejects a role that is not a real role", async () => {
    const { handler, orgId, ctx } = await seedMixedRoles();

    await expect(handler.listOrgMembers({ orgId, role: "superuser" }, ctx)).rejects.toThrow();
  });
});

describe("listOrgs never drops a sub-organization (M03-T09)", () => {
  /**
   * The client nests by parentOrgId. A child whose parent landed on a different
   * page had nothing to hang off, so it was present in the response and never
   * drawn - the sub-organization simply vanished from the tree. Paging by one
   * makes that certain rather than occasional.
   */
  const seedHierarchy = async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);
    const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
    const userId = "user-tree-" + suffix;
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@t.local`, createdAt: new Date() });

    // Names chosen so name:asc puts the children before their parents, which
    // is the ordering that separates them across pages.
    const rows = [
      { id: "parent-a-" + suffix, name: "Zeta Parent", parentOrgId: null },
      { id: "parent-b-" + suffix, name: "Yankee Parent", parentOrgId: null },
      { id: "child-a-" + suffix, name: "Alpha Child", parentOrgId: "parent-a-" + suffix },
      { id: "child-b-" + suffix, name: "Bravo Child", parentOrgId: "parent-b-" + suffix },
    ];
    for (const r of rows) {
      await db.insert(schemaSqlite.organizations).values({ id: r.id, name: r.name, slug: r.id, parentOrgId: r.parentOrgId, createdAt: new Date() });
      await db.insert(schemaSqlite.organizationMembers).values({ orgId: r.id, userId, role: "admin", joinedAt: new Date() });
    }
    return { db, handler, userId, ctx: makeAuthContext(userId), rows, suffix };
  };

  test("with limit=1, every organization still resolves to its correct depth", async () => {
    const { handler: h, ctx: c, rows } = await seedHierarchy();

    let cursor: string | undefined;
    const drawn = new Map<string, number>(); // org id -> depth it could be drawn at
    for (let guard = 0; guard < 20; guard++) {
      const page: any = await h.listOrgs({ page: { limit: 1, sort: "name:asc", cursor } }, c);
      // Exactly what the client can see on this page: the page plus ancestors.
      const visible = new Map<string, any>();
      for (const o of [...page.organizations, ...page.ancestors]) visible.set(o.id, o);

      for (const o of page.organizations) {
        // Depth is resolvable only if every ancestor up the chain is present.
        let depth = 0;
        let node = o;
        while (node.parentOrgId) {
          const parent = visible.get(node.parentOrgId);
          expect(parent, `org ${node.id} has no resolvable parent on its page`).toBeDefined();
          depth += 1;
          node = parent;
        }
        drawn.set(o.id, depth);
      }
      cursor = page.page.nextCursor;
      if (!cursor) break;
    }

    expect(drawn.size).toBe(rows.length);
    expect(drawn.get(rows[2]!.id)).toBe(1); // Alpha Child under Zeta Parent
    expect(drawn.get(rows[3]!.id)).toBe(1); // Bravo Child under Yankee Parent
    expect(drawn.get(rows[0]!.id)).toBe(0);
  });

  test("ancestors are omitted when the parent is already on the page", async () => {
    const { handler, ctx } = await seedHierarchy();

    const page: any = await handler.listOrgs({ page: { limit: 100 } }, ctx);

    expect(page.organizations.length).toBe(4);
    expect(page.ancestors).toEqual([]);
  });

  test("a parent the caller is not a member of is not disclosed as an ancestor", async () => {
    const { db, handler, suffix } = await seedHierarchy();
    const outsiderId = "user-outsider-" + suffix;
    const hiddenParentId = "parent-hidden-" + suffix;
    const childId = "child-hidden-" + suffix;

    await db.insert(schemaSqlite.users).values({ id: outsiderId, email: `${outsiderId}@t.local`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: hiddenParentId, name: "Secret Holdings", slug: hiddenParentId, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: childId, name: "Visible Child", slug: childId, parentOrgId: hiddenParentId, createdAt: new Date() });
    // Member of the child only.
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: childId, userId: outsiderId, role: "member", joinedAt: new Date() });

    const page: any = await handler.listOrgs({}, makeAuthContext(outsiderId));

    expect(page.organizations.map((o: any) => o.id)).toEqual([childId]);
    // The fix must not become a way to read the name of an organization you
    // were never added to.
    expect(page.ancestors).toEqual([]);
  });
});

describe("Invitation expiry (M03-T11)", () => {
  const seedOrgForInvite = async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);
    const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
    const orgId = "org-inv-" + suffix;
    const adminId = "user-inv-" + suffix;
    await db.insert(schemaSqlite.users).values({ id: adminId, email: `${adminId}@t.local`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Inv Org", slug: orgId, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: adminId, role: "admin", joinedAt: new Date() });
    return { db, handler, orgId, adminId, ctx: makeAuthContext(adminId) };
  };

  const inviteRow = (db: any, orgId: string) =>
    db.select().from(schemaSqlite.invitations).where(eq(schemaSqlite.invitations.orgId, orgId)).then((r: any[]) => r[0]);

  test("a new invitation is given an expiry", async () => {
    const { db, handler, orgId, ctx } = await seedOrgForInvite();

    await handler.inviteUser({ orgId, email: "new@t.local" }, ctx);

    const row = await inviteRow(db, orgId);
    expect(row.expiresAt).toBeDefined();
    // Asserted against the constant rather than a literal, so changing the
    // window is one edit rather than two that can disagree.
    const days = (new Date(row.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(INVITATION_TTL_DAYS - 1);
    expect(days).toBeLessThanOrEqual(INVITATION_TTL_DAYS);
  });

  test("re-inviting a live invitation stays idempotent and does not extend it", async () => {
    const { db, handler, orgId, ctx } = await seedOrgForInvite();
    await handler.inviteUser({ orgId, email: "dup@t.local" }, ctx);
    const first = await inviteRow(db, orgId);

    await handler.inviteUser({ orgId, email: "dup@t.local" }, ctx);

    const rows = await db.select().from(schemaSqlite.invitations).where(eq(schemaSqlite.invitations.orgId, orgId));
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].expiresAt).getTime()).toBe(new Date(first.expiresAt).getTime());
  });

  test("re-inviting an expired invitation renews it", async () => {
    const { db, handler, orgId, ctx } = await seedOrgForInvite();
    await handler.inviteUser({ orgId, email: "lapsed@t.local", role: "viewer" }, ctx);
    await db.update(schemaSqlite.invitations)
      .set({ expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })
      .where(eq(schemaSqlite.invitations.orgId, orgId));

    // Without this, a lapsed invitation is permanently un-reissuable: the
    // duplicate check short-circuits and the admin's only remedy is deleting a
    // row they cannot see.
    await handler.inviteUser({ orgId, email: "lapsed@t.local", role: "admin" }, ctx);

    const row = await inviteRow(db, orgId);
    expect(new Date(row.expiresAt).getTime()).toBeGreaterThan(Date.now());
    // Re-inviting with a different role is the obvious way to change one's mind.
    expect(row.role).toBe("admin");
  });
});

describe("List and revoke invitations (M03-T12)", () => {
  const seedInviteFixture = async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createOrgsHandler(db, nc);
    const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
    const orgId = "org-rv-" + suffix;
    const otherOrgId = "org-rv-other-" + suffix;
    const adminId = "user-rv-admin-" + suffix;
    const memberId = "user-rv-member-" + suffix;
    const otherAdminId = "user-rv-other-" + suffix;

    for (const [oid, uid] of [[orgId, adminId], [otherOrgId, otherAdminId]] as const) {
      await db.insert(schemaSqlite.organizations).values({ id: oid, name: oid, slug: oid, createdAt: new Date() });
      await db.insert(schemaSqlite.users).values({ id: uid, email: `${uid}@t.local`, createdAt: new Date() });
      await db.insert(schemaSqlite.organizationMembers).values({ orgId: oid, userId: uid, role: "admin", joinedAt: new Date() });
    }
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}@t.local`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: memberId, role: "member", joinedAt: new Date() });

    return { db, handler, orgId, otherOrgId, adminId, memberId, otherAdminId, ctx: makeAuthContext(adminId) };
  };

  test("an invitation can be listed, then revoked, and no longer applies", async () => {
    const { db, handler, orgId, ctx } = await seedInviteFixture();
    await handler.inviteUser({ orgId, email: "wanted@t.local", role: "viewer" }, ctx);

    const listed = await handler.listInvitations({ orgId }, ctx);
    expect(listed.invitations.map((i: any) => i.email)).toEqual(["wanted@t.local"]);
    expect(listed.invitations[0].role).toBe("viewer");
    expect(listed.invitations[0].expired).toBe(false);

    await handler.revokeInvitation({ invitationId: listed.invitations[0].id }, ctx);

    const after = await handler.listInvitations({ orgId }, ctx);
    expect(after.invitations).toEqual([]);
    // The verify line's "no longer applies": the row is gone, so a login for
    // that address has nothing to redeem.
    const rows = await db.select().from(schemaSqlite.invitations).where(eq(schemaSqlite.invitations.orgId, orgId));
    expect(rows).toHaveLength(0);
  });

  test("the list marks a lapsed invitation as expired", async () => {
    const { db, handler, orgId, ctx } = await seedInviteFixture();
    await handler.inviteUser({ orgId, email: "lapsed@t.local" }, ctx);
    await db.update(schemaSqlite.invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schemaSqlite.invitations.orgId, orgId));

    const listed = await handler.listInvitations({ orgId }, ctx);

    // Computed server-side. Three clients comparing dates in three timezones
    // will eventually disagree about whether an invite has lapsed.
    expect(listed.invitations[0].expired).toBe(true);
    expect(listed.invitations[0].expiresAt).toBeDefined();
  });

  test("a plain member cannot list invitations", async () => {
    const { handler, orgId, memberId } = await seedInviteFixture();

    await expect(handler.listInvitations({ orgId }, makeAuthContext(memberId))).rejects.toThrow();
  });

  test("an admin of another organization cannot revoke this one's invitation", async () => {
    const { db, handler, orgId, otherAdminId, ctx } = await seedInviteFixture();
    await handler.inviteUser({ orgId, email: "target@t.local" }, ctx);
    const [invite] = await db.select().from(schemaSqlite.invitations).where(eq(schemaSqlite.invitations.orgId, orgId));

    await expect(
      handler.revokeInvitation({ invitationId: invite.id }, makeAuthContext(otherAdminId)),
    ).rejects.toThrow();

    const rows = await db.select().from(schemaSqlite.invitations).where(eq(schemaSqlite.invitations.id, invite.id));
    expect(rows).toHaveLength(1);
  });

  test("revoking an invitation that does not exist is NotFound", async () => {
    const { handler, ctx } = await seedInviteFixture();

    await expect(handler.revokeInvitation({ invitationId: "nope" }, ctx)).rejects.toThrow(/not found/i);
  });

  test("the list is scoped to one organization", async () => {
    const { handler, orgId, otherOrgId, otherAdminId, ctx } = await seedInviteFixture();
    await handler.inviteUser({ orgId, email: "mine@t.local" }, ctx);
    await handler.inviteUser({ orgId: otherOrgId, email: "theirs@t.local" }, makeAuthContext(otherAdminId));

    const listed = await handler.listInvitations({ orgId }, ctx);

    expect(listed.invitations.map((i: any) => i.email)).toEqual(["mine@t.local"]);
    expect(listed.page.totalCount).toBe(1);
  });
});
