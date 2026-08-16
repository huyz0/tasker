import { expect, test, describe, beforeAll } from "bun:test";
import { Code } from "@connectrpc/connect";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedUser } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import { createTeamsHandler } from "./teams.handler";
import { can } from "../../lib/policy";

describe("Teams Handler Integration Logic", () => {
  let db: any;
  let handler: any;
  let ctx: any;
  let orgId: string;
  let userId: string;

  beforeAll(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    handler = createTeamsHandler(db, setup.nc);
    orgId = "org-teams-test";
    userId = "user-teams-admin";
    ctx = makeAuthContext(userId);
    await seedOrgWithAdmin(db, { orgId, userId });
  });

  test("createTeam creates a team scoped to the org", async () => {
    const res: any = await handler.createTeam({ orgId, name: "Platform" }, ctx);
    expect(res.team.orgId).toBe(orgId);
    expect(res.team.name).toBe("Platform");
    expect(res.team.deletedAt).toBeFalsy();
  });

  test("updateTeam renames an existing team", async () => {
    const created: any = await handler.createTeam({ orgId, name: "Old Name" }, ctx);
    const res: any = await handler.updateTeam({ teamId: created.team.id, name: "New Name" }, ctx);
    expect(res.team.name).toBe("New Name");
  });

  test("updateTeam on a nonexistent team throws NotFound", async () => {
    await expect(handler.updateTeam({ teamId: "team-nope", name: "X" }, ctx)).rejects.toMatchObject({ code: Code.NotFound });
  });

  test("archiveTeam then restoreTeam round-trips", async () => {
    const created: any = await handler.createTeam({ orgId, name: "Archivable" }, ctx);
    await handler.archiveTeam({ teamId: created.team.id }, ctx);

    const afterArchive: any = await handler.listTeams({ orgId, onlyDeleted: true }, ctx);
    expect(afterArchive.teams.some((t: any) => t.id === created.team.id)).toBe(true);

    const afterActive: any = await handler.listTeams({ orgId }, ctx);
    expect(afterActive.teams.some((t: any) => t.id === created.team.id)).toBe(false);

    await handler.restoreTeam({ teamId: created.team.id }, ctx);
    const afterRestore: any = await handler.listTeams({ orgId }, ctx);
    expect(afterRestore.teams.some((t: any) => t.id === created.team.id)).toBe(true);
  });

  test("restoreTeam refuses to restore into an archived organization", async () => {
    const archivedOrgId = "org-teams-archived";
    const archivedOrgUserId = "user-teams-archived-admin";
    await seedOrgWithAdmin(db, { orgId: archivedOrgId, userId: archivedOrgUserId });
    const created: any = await handler.createTeam({ orgId: archivedOrgId, name: "Doomed" }, makeAuthContext(archivedOrgUserId));
    await handler.archiveTeam({ teamId: created.team.id }, makeAuthContext(archivedOrgUserId));
    await db.update(schema.organizations).set({ deletedAt: new Date() }).where(eq(schema.organizations.id, archivedOrgId));

    await expect(handler.restoreTeam({ teamId: created.team.id }, makeAuthContext(archivedOrgUserId)))
      .rejects.toMatchObject({ code: Code.FailedPrecondition });
  });

  test("listTeams does not leak a team from a different organization", async () => {
    const otherOrgId = "org-teams-other";
    const otherUserId = "user-teams-other-admin";
    await seedOrgWithAdmin(db, { orgId: otherOrgId, userId: otherUserId });
    await handler.createTeam({ orgId: otherOrgId, name: "Not Mine" }, makeAuthContext(otherUserId));

    const res: any = await handler.listTeams({ orgId }, ctx);
    expect(res.teams.every((t: any) => t.orgId === orgId)).toBe(true);
  });

  test("addTeamMember refuses a user that does not exist", async () => {
    const created: any = await handler.createTeam({ orgId, name: "Roster" }, ctx);
    await expect(handler.addTeamMember({ teamId: created.team.id, userId: "user-ghost" }, ctx))
      .rejects.toMatchObject({ code: Code.NotFound });
  });

  test("addTeamMember is idempotent - adding the same member twice succeeds once", async () => {
    const created: any = await handler.createTeam({ orgId, name: "Roster 2" }, ctx);
    await seedUser(db, "user-teams-member-1");
    await handler.addTeamMember({ teamId: created.team.id, userId: "user-teams-member-1" }, ctx);
    await expect(handler.addTeamMember({ teamId: created.team.id, userId: "user-teams-member-1" }, ctx)).resolves.toEqual({ success: true });

    const members: any = await handler.listTeamMembers({ teamId: created.team.id }, ctx);
    expect(members.members).toHaveLength(1);
  });

  test("removeTeamMember is idempotent - removing someone not on the team is still success", async () => {
    const created: any = await handler.createTeam({ orgId, name: "Roster 3" }, ctx);
    await expect(handler.removeTeamMember({ teamId: created.team.id, userId: "user-never-added" }, ctx)).resolves.toEqual({ success: true });
  });

  test("removeTeamMember actually removes the roster entry", async () => {
    const created: any = await handler.createTeam({ orgId, name: "Roster 4" }, ctx);
    await seedUser(db, "user-teams-member-2");
    await handler.addTeamMember({ teamId: created.team.id, userId: "user-teams-member-2" }, ctx);
    await handler.removeTeamMember({ teamId: created.team.id, userId: "user-teams-member-2" }, ctx);

    const members: any = await handler.listTeamMembers({ teamId: created.team.id }, ctx);
    expect(members.members).toHaveLength(0);
  });

  // The milestone's own verify line for M10-T07: "a team of 100 members
  // pages correctly."
  test("a team of 100 members pages correctly", async () => {
    const created: any = await handler.createTeam({ orgId, name: "Big Team" }, ctx);
    for (let i = 0; i < 100; i++) {
      const memberId = `user-teams-bulk-${i}`;
      await seedUser(db, memberId);
      await handler.addTeamMember({ teamId: created.team.id, userId: memberId }, ctx);
    }

    const firstPage: any = await handler.listTeamMembers({ teamId: created.team.id, page: { limit: 40 } }, ctx);
    expect(firstPage.members).toHaveLength(40);
    expect(firstPage.page.totalCount).toBe(100);
    expect(firstPage.page.nextCursor).toBeTruthy();

    const secondPage: any = await handler.listTeamMembers(
      { teamId: created.team.id, page: { limit: 40, cursor: firstPage.page.nextCursor } }, ctx,
    );
    expect(secondPage.members).toHaveLength(40);

    const thirdPage: any = await handler.listTeamMembers(
      { teamId: created.team.id, page: { limit: 40, cursor: secondPage.page.nextCursor } }, ctx,
    );
    expect(thirdPage.members).toHaveLength(20);
    expect(thirdPage.page.nextCursor).toBeFalsy();

    // No member id repeated across pages, and every one of the 100 seeded
    // ids is accounted for exactly once.
    const seenIds = [...firstPage.members, ...secondPage.members, ...thirdPage.members].map((m: any) => m.userId);
    expect(new Set(seenIds).size).toBe(100);
  });

  test("listTeamMembers on a nonexistent team throws NotFound", async () => {
    await expect(handler.listTeamMembers({ teamId: "team-nope" }, ctx)).rejects.toMatchObject({ code: Code.NotFound });
  });
});

// M10-T08 (ADR-0013 §3, step 2). Team-derived grant resolution was already
// built and unit-tested against synthetic fixtures in policy.test.ts back
// in T04 - this proves the same guarantee end-to-end through the real
// createTeam/addTeamMember/removeTeamMember RPCs teams.handler.ts (T07)
// actually exposes, not a direct schema.teams/schema.teamMembers insert.
// The one piece still seeded directly is the grant itself: nothing in the
// product can create a `grants` row through an RPC yet (T07's own PROGRESS
// note names this gap explicitly, left for T11's Role management UI).
describe("Team-derived grants (M10-T08)", () => {
  test("adding someone to a team via the real RPC confers the team's granted access, and removing them via the real RPC revokes it", async () => {
    const setup = await setupIntegrationTest();
    const { db, nc } = setup;
    const handler = createTeamsHandler(db, nc);

    const orgId = "org-t08";
    const adminId = "user-t08-admin";
    const memberId = "user-t08-member";
    await seedOrgWithAdmin(db, { orgId, userId: adminId });
    await seedUser(db, memberId);

    const memberPrincipal = { kind: "user" as const, userId: memberId };
    const orgScope = { type: "organization" as const, id: orgId };

    // Before joining the team: the org's own organization_members fallback
    // never granted this user anything (they were never added as a plain
    // org member either), so they hold nothing.
    expect(await can(db, memberPrincipal, orgScope, "task:write")).toBe(false);

    const adminCtx = makeAuthContext(adminId);
    const created: any = await handler.createTeam({ orgId, name: "Derived Access Team" }, adminCtx);
    const teamId = created.team.id;

    // The one piece with no RPC yet (see this file's header note) - grant
    // role-member to the team directly at organization scope.
    await db.insert(schema.grants).values({
      id: "grant-t08", subjectType: "team", subjectId: teamId,
      scopeType: "organization", scopeId: orgId, roleId: "role-member", createdAt: new Date(),
    });

    // Still nothing before joining - a grant on a team confers nothing to
    // someone not yet on it.
    expect(await can(db, memberPrincipal, orgScope, "task:write")).toBe(false);

    await handler.addTeamMember({ teamId, userId: memberId }, adminCtx);
    expect(await can(db, memberPrincipal, orgScope, "task:write")).toBe(true);
    // role-member's reads too, not just the one permission checked above.
    expect(await can(db, memberPrincipal, orgScope, "task:read")).toBe(true);
    // role-member does not hold org:admin - the team's grant is real and
    // specific, not a stand-in for "this user can do anything now".
    expect(await can(db, memberPrincipal, orgScope, "org:admin")).toBe(false);

    await handler.removeTeamMember({ teamId, userId: memberId }, adminCtx);
    expect(await can(db, memberPrincipal, orgScope, "task:write")).toBe(false);
  });
});
