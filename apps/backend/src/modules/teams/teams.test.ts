import { expect, test, describe, beforeAll } from "bun:test";
import { Code } from "@connectrpc/connect";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedUser } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import { createTeamsHandler } from "./teams.handler";

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
