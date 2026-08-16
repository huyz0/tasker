import { expect, test, describe, beforeAll } from "bun:test";
import { Code } from "@connectrpc/connect";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedUser } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import { createRolesHandler } from "./roles.handler";
import { createTeamsHandler } from "../teams/teams.handler";
import { createProjectsHandler, createProjectTemplatesHandler } from "../projects/projects.handler";

describe("Roles Handler Integration Logic", () => {
  let db: any;
  let handler: any;
  let ctx: any;
  let orgId: string;
  let adminId: string;

  beforeAll(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    handler = createRolesHandler(db, setup.nc);
    orgId = "org-roles-test";
    adminId = "user-roles-admin";
    ctx = makeAuthContext(adminId);
    await seedOrgWithAdmin(db, { orgId, userId: adminId });
  });

  test("listPermissions returns the full 32-key vocabulary", async () => {
    const res: any = await handler.listPermissions({ orgId }, ctx);
    expect(res.permissions).toHaveLength(32);
    expect(res.permissions.map((p: any) => p.key)).toContain("task:write");
    expect(res.permissions.every((p: any) => p.description.length > 0)).toBe(true);
  });

  test("listPermissions denies an outsider", async () => {
    await seedUser(db, "user-roles-outsider");
    await expect(handler.listPermissions({ orgId }, makeAuthContext("user-roles-outsider")))
      .rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  test("listRoles returns the four system roles plus this org's custom ones", async () => {
    const created: any = await handler.createRole({ orgId, name: "QA Lead", permissionKeys: ["task:write", "artifact:read"] }, ctx);
    const res: any = await handler.listRoles({ orgId }, ctx);

    const names = res.roles.map((r: any) => r.name);
    expect(names).toContain("owner");
    expect(names).toContain("admin");
    expect(names).toContain("member");
    expect(names).toContain("viewer");
    expect(names).toContain("QA Lead");

    const systemOwner = res.roles.find((r: any) => r.name === "owner");
    expect(systemOwner.isSystem).toBe(true);
    expect(systemOwner.orgId).toBe("");

    const custom = res.roles.find((r: any) => r.id === created.role.id);
    expect(custom.isSystem).toBe(false);
    expect(custom.orgId).toBe(orgId);
    expect(custom.permissionKeys.sort()).toEqual(["artifact:read", "task:write"]);
  });

  test("listRoles does not leak another org's custom role", async () => {
    const otherOrgId = "org-roles-other";
    const otherAdminId = "user-roles-other-admin";
    await seedOrgWithAdmin(db, { orgId: otherOrgId, userId: otherAdminId });
    await handler.createRole({ orgId: otherOrgId, name: "Not Mine", permissionKeys: [] }, makeAuthContext(otherAdminId));

    const res: any = await handler.listRoles({ orgId }, ctx);
    expect(res.roles.some((r: any) => r.name === "Not Mine")).toBe(false);
  });

  test("createRole rejects an unknown permission key", async () => {
    await expect(handler.createRole({ orgId, name: "Bad Role", permissionKeys: ["not:a:real:permission"] }, ctx))
      .rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  test("createRole denies a member without role:manage", async () => {
    const memberId = "user-roles-member";
    await seedUser(db, memberId);
    await db.insert(schema.organizationMembers).values({ orgId, userId: memberId, role: "member", joinedAt: new Date() });
    await expect(handler.createRole({ orgId, name: "Should Fail", permissionKeys: [] }, makeAuthContext(memberId)))
      .rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  test("updateRole renames and replaces the permission set", async () => {
    const created: any = await handler.createRole({ orgId, name: "Editable", permissionKeys: ["task:read"] }, ctx);
    const updated: any = await handler.updateRole({ roleId: created.role.id, name: "Renamed", permissionKeys: ["task:read", "task:write"] }, ctx);

    expect(updated.role.name).toBe("Renamed");
    expect(updated.role.permissionKeys.sort()).toEqual(["task:read", "task:write"]);
  });

  test("updateRole with only a name leaves permissionKeys untouched", async () => {
    const created: any = await handler.createRole({ orgId, name: "Name Only", permissionKeys: ["org:read"] }, ctx);
    const updated: any = await handler.updateRole({ roleId: created.role.id, name: "Name Only Renamed" }, ctx);

    expect(updated.role.name).toBe("Name Only Renamed");
    expect(updated.role.permissionKeys).toEqual(["org:read"]);
  });

  test("updateRole rejects an unknown permission key", async () => {
    const created: any = await handler.createRole({ orgId, name: "Update Bad Perm", permissionKeys: [] }, ctx);
    await expect(handler.updateRole({ roleId: created.role.id, permissionKeys: ["not:a:real:permission"] }, ctx))
      .rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  test("updateRole refuses to touch a system role", async () => {
    const res: any = await handler.listRoles({ orgId }, ctx);
    const owner = res.roles.find((r: any) => r.name === "owner");
    await expect(handler.updateRole({ roleId: owner.id, name: "Hacked" }, ctx))
      .rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  test("deleteRole refuses to delete a system role", async () => {
    const res: any = await handler.listRoles({ orgId }, ctx);
    const viewer = res.roles.find((r: any) => r.name === "viewer");
    await expect(handler.deleteRole({ roleId: viewer.id }, ctx)).rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  test("deleteRole refuses while a grant still references the role, then succeeds once revoked", async () => {
    const created: any = await handler.createRole({ orgId, name: "In Use", permissionKeys: [] }, ctx);
    const grant: any = await handler.grantRole({
      subjectType: "user", subjectId: adminId, scopeType: "organization", scopeId: orgId, roleId: created.role.id,
    }, ctx);

    await expect(handler.deleteRole({ roleId: created.role.id }, ctx)).rejects.toMatchObject({ code: Code.FailedPrecondition });

    await handler.revokeGrant({ grantId: grant.grant.id }, ctx);
    await expect(handler.deleteRole({ roleId: created.role.id }, ctx)).resolves.toEqual({ success: true });
  });

  test("grantRole grants a role to a user at organization scope, and is idempotent", async () => {
    const scopedUserId = "user-roles-grant-target";
    await seedUser(db, scopedUserId);
    const first: any = await handler.grantRole({
      subjectType: "user", subjectId: scopedUserId, scopeType: "organization", scopeId: orgId, roleId: "role-viewer",
    }, ctx);
    expect(first.grant.roleName).toBe("viewer");

    const second: any = await handler.grantRole({
      subjectType: "user", subjectId: scopedUserId, scopeType: "organization", scopeId: orgId, roleId: "role-viewer",
    }, ctx);
    expect(second.grant.id).toBe(first.grant.id);

    const listed: any = await handler.listGrants({ scopeType: "organization", scopeId: orgId }, ctx);
    expect(listed.grants.filter((g: any) => g.id === first.grant.id)).toHaveLength(1);
  });

  test("grantRole resolves the owning org through a team scope", async () => {
    const teamsHandler = createTeamsHandler(db, null);
    const team: any = await teamsHandler.createTeam({ orgId, name: "Grant Team" }, ctx);

    const granted: any = await handler.grantRole({
      subjectType: "user", subjectId: adminId, scopeType: "team", scopeId: team.team.id, roleId: "role-admin",
    }, ctx);
    expect(granted.grant.scopeType).toBe("team");

    const listed: any = await handler.listGrants({ scopeType: "team", scopeId: team.team.id }, ctx);
    expect(listed.grants.some((g: any) => g.id === granted.grant.id)).toBe(true);
  });

  test("grantRole resolves the owning org through a project scope", async () => {
    const ptHandler = createProjectTemplatesHandler(db, null);
    const pHandler = createProjectsHandler(db, null);
    const tpl: any = await ptHandler.createTemplate({ orgId, name: "Grant Tpl" }, ctx);
    const project: any = await pHandler.createProject({ orgId, templateId: tpl.template.id, name: "Grant Project", ownerId: adminId }, ctx);

    const granted: any = await handler.grantRole({
      subjectType: "user", subjectId: adminId, scopeType: "project", scopeId: project.project.id, roleId: "role-admin",
    }, ctx);
    expect(granted.grant.scopeType).toBe("project");
  });

  test("grantRole rejects a nonexistent team subject", async () => {
    await expect(handler.grantRole({
      subjectType: "team", subjectId: "team-does-not-exist", scopeType: "organization", scopeId: orgId, roleId: "role-viewer",
    }, ctx)).rejects.toMatchObject({ code: Code.NotFound });
  });

  test("grantRole accepts a real team as the subject", async () => {
    const teamsHandler = createTeamsHandler(db, null);
    const team: any = await teamsHandler.createTeam({ orgId, name: "Grantable Team" }, ctx);

    const granted: any = await handler.grantRole({
      subjectType: "team", subjectId: team.team.id, scopeType: "organization", scopeId: orgId, roleId: "role-viewer",
    }, ctx);
    expect(granted.grant.subjectType).toBe("team");
    expect(granted.grant.subjectId).toBe(team.team.id);
  });

  test("grantRole rejects a custom role from a different organization", async () => {
    const otherOrgId = "org-roles-cross";
    const otherAdminId = "user-roles-cross-admin";
    await seedOrgWithAdmin(db, { orgId: otherOrgId, userId: otherAdminId });
    const otherRole: any = await handler.createRole({ orgId: otherOrgId, name: "Foreign Role", permissionKeys: [] }, makeAuthContext(otherAdminId));

    await expect(handler.grantRole({
      subjectType: "user", subjectId: adminId, scopeType: "organization", scopeId: orgId, roleId: otherRole.role.id,
    }, ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  test("grantRole rejects a nonexistent subject", async () => {
    await expect(handler.grantRole({
      subjectType: "user", subjectId: "user-does-not-exist", scopeType: "organization", scopeId: orgId, roleId: "role-viewer",
    }, ctx)).rejects.toMatchObject({ code: Code.NotFound });
  });

  test("revokeGrant removes the grant, authorized against its own scope's org", async () => {
    const scopedUserId = "user-roles-revoke-target";
    await seedUser(db, scopedUserId);
    const granted: any = await handler.grantRole({
      subjectType: "user", subjectId: scopedUserId, scopeType: "organization", scopeId: orgId, roleId: "role-member",
    }, ctx);

    await handler.revokeGrant({ grantId: granted.grant.id }, ctx);

    const listed: any = await handler.listGrants({ scopeType: "organization", scopeId: orgId }, ctx);
    expect(listed.grants.some((g: any) => g.id === granted.grant.id)).toBe(false);
  });

  test("listGrants denies a plain member (org:admin required)", async () => {
    const memberId = "user-roles-list-member";
    await seedUser(db, memberId);
    await db.insert(schema.organizationMembers).values({ orgId, userId: memberId, role: "member", joinedAt: new Date() });
    await expect(handler.listGrants({ scopeType: "organization", scopeId: orgId }, makeAuthContext(memberId)))
      .rejects.toMatchObject({ code: Code.PermissionDenied });
  });
});
