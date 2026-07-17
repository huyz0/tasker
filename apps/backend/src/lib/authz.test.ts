import { describe, it, expect } from "bun:test";
import { eq, and } from "drizzle-orm";
import { setupIntegrationTest } from "../test/setup";
import * as schemaSqlite from "../db/schema.sqlite";
import {
  requireUserId,
  assertOrgMember,
  assertOrgAdmin,
  assertOrgOwner,
  assertOrgAdminOfAny,
  getOrgMemberRole,
  countOrgOwners,
  getProjectOrgId,
  getTaskOrgId,
  getFolderOrgId,
  getArtifactOrgId,
  getRepositoryLinkOrgId,
} from "./authz";
import { ConnectError, Code } from "@connectrpc/connect";

async function seedProjectHierarchy(db: any, opts: { projectDeleted?: boolean } = {}) {
  const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
  const orgId = "org-authz-" + suffix;
  const userId = "user-authz-" + suffix;
  const templateId = "tmpl-authz-" + suffix;
  const projectId = "proj-authz-" + suffix;
  const taskId = "tsk-authz-" + suffix;
  const folderId = "fld-authz-" + suffix;
  const artifactId = "art-authz-" + suffix;

  await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Org", slug: orgId, createdAt: new Date() });
  await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
  await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
  await db.insert(schemaSqlite.projects).values({
    id: projectId, orgId, templateId, ownerId: userId, name: "P", createdAt: new Date(),
    deletedAt: opts.projectDeleted ? new Date() : null,
  });
  await db.insert(schemaSqlite.tasks).values({ id: taskId, projectId, title: "Task", status: "todo", createdAt: new Date() });
  await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: "Folder", createdAt: new Date() });
  await db.insert(schemaSqlite.artifacts).values({ id: artifactId, folderId, name: "Artifact", createdAt: new Date() });

  return { orgId, userId, projectId, taskId, folderId, artifactId };
}

describe("requireUserId", () => {
  it("returns the userId when present in context values", () => {
    const contextValues = { get: (_key: unknown) => "user-1" };
    expect(requireUserId(contextValues)).toBe("user-1");
  });

  it("throws Unauthenticated when there is no userId in context values", () => {
    const contextValues = { get: (_key: unknown) => undefined };
    expect(() => requireUserId(contextValues)).toThrow(ConnectError);
    try {
      requireUserId(contextValues);
    } catch (e) {
      expect((e as ConnectError).code).toBe(Code.Unauthenticated);
    }
  });
});

describe("assertOrgMember / assertOrgAdmin / assertOrgAdminOfAny", () => {
  it("assertOrgMember passes for a member and throws PermissionDenied for a non-member", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedProjectHierarchy(db);
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "member", joinedAt: new Date() });

    await expect(assertOrgMember(db, userId, orgId)).resolves.toBeUndefined();
    await expect(assertOrgMember(db, "not-a-member", orgId)).rejects.toThrow(ConnectError);
  });

  it("assertOrgAdmin passes for an admin and throws for a non-admin member", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedProjectHierarchy(db);
    const memberUserId = userId + "-member";
    await db.insert(schemaSqlite.users).values({ id: memberUserId, email: `${memberUserId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: memberUserId, role: "member", joinedAt: new Date() });

    await expect(assertOrgAdmin(db, userId, orgId)).resolves.toBeUndefined();
    await expect(assertOrgAdmin(db, memberUserId, orgId)).rejects.toThrow(ConnectError);
  });

  it("assertOrgAdminOfAny passes for a caller who is admin of at least one org, regardless of which org is asked about", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedProjectHierarchy(db);
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });

    await expect(assertOrgAdminOfAny(db, userId)).resolves.toBeUndefined();
    await expect(assertOrgAdminOfAny(db, "user-with-no-orgs-" + Date.now())).rejects.toThrow(ConnectError);
  });

  it("assertOrgAdmin and assertOrgAdminOfAny accept 'owner' as well as 'admin' - owner is a superset", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedProjectHierarchy(db);
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "owner", joinedAt: new Date() });

    await expect(assertOrgAdmin(db, userId, orgId)).resolves.toBeUndefined();
    await expect(assertOrgAdminOfAny(db, userId)).resolves.toBeUndefined();
  });

  it("assertOrgOwner passes only for 'owner', rejecting a plain admin", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedProjectHierarchy(db);
    const adminId = userId + "-admin";
    await db.insert(schemaSqlite.users).values({ id: adminId, email: `${adminId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "owner", joinedAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: adminId, role: "admin", joinedAt: new Date() });

    await expect(assertOrgOwner(db, userId, orgId)).resolves.toBeUndefined();
    await expect(assertOrgOwner(db, adminId, orgId)).rejects.toThrow(ConnectError);
  });

  it("getOrgMemberRole returns the role for a member and null for a non-member", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedProjectHierarchy(db);
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "viewer", joinedAt: new Date() });

    expect(await getOrgMemberRole(db, userId, orgId)).toBe("viewer");
    expect(await getOrgMemberRole(db, "not-a-member", orgId)).toBeNull();
  });

  it("countOrgOwners counts only 'owner' rows for the given org", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedProjectHierarchy(db);
    const secondOwnerId = userId + "-owner2";
    await db.insert(schemaSqlite.users).values({ id: secondOwnerId, email: `${secondOwnerId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "owner", joinedAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: secondOwnerId, role: "member", joinedAt: new Date() });

    expect(await countOrgOwners(db, orgId)).toBe(1);

    await db.update(schemaSqlite.organizationMembers).set({ role: "owner" })
      .where(and(eq(schemaSqlite.organizationMembers.orgId, orgId), eq(schemaSqlite.organizationMembers.userId, secondOwnerId)));
    expect(await countOrgOwners(db, orgId)).toBe(2);
  });
});

describe("getProjectOrgId", () => {
  it("resolves the orgId for a live project", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, projectId } = await seedProjectHierarchy(db);
    expect(await getProjectOrgId(db, projectId)).toBe(orgId);
  });

  it("throws NotFound for an archived project by default", async () => {
    const { db } = await setupIntegrationTest();
    const { projectId } = await seedProjectHierarchy(db, { projectDeleted: true });
    await expect(getProjectOrgId(db, projectId)).rejects.toThrow(ConnectError);
  });

  it("resolves an archived project's orgId when includeDeleted is true", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, projectId } = await seedProjectHierarchy(db, { projectDeleted: true });
    expect(await getProjectOrgId(db, projectId, true)).toBe(orgId);
  });

  it("throws NotFound for a project id that doesn't exist", async () => {
    const { db } = await setupIntegrationTest();
    await expect(getProjectOrgId(db, "no-such-project")).rejects.toThrow(ConnectError);
  });
});

describe("getTaskOrgId propagates includeDeleted through to the project lookup", () => {
  it("resolves a task under a live project", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, taskId } = await seedProjectHierarchy(db);
    expect(await getTaskOrgId(db, taskId)).toBe(orgId);
  });

  it("throws NotFound for a task under an archived project when includeDeleted is not set", async () => {
    const { db } = await setupIntegrationTest();
    const { taskId } = await seedProjectHierarchy(db, { projectDeleted: true });
    // The task row itself is still live - only its parent project is
    // archived. Without propagation, this used to misreport "Project not
    // found" instead of the caller getting a clean, well-understood result.
    await expect(getTaskOrgId(db, taskId)).rejects.toThrow(ConnectError);
  });

  it("resolves a task under an archived project when includeDeleted is true (restoreTask/purgeTask's case)", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, taskId } = await seedProjectHierarchy(db, { projectDeleted: true });
    expect(await getTaskOrgId(db, taskId, true)).toBe(orgId);
  });
});

describe("getFolderOrgId propagates includeDeleted through to the project lookup", () => {
  it("throws NotFound for a folder under an archived project when includeDeleted is not set", async () => {
    const { db } = await setupIntegrationTest();
    const { folderId } = await seedProjectHierarchy(db, { projectDeleted: true });
    await expect(getFolderOrgId(db, folderId)).rejects.toThrow(ConnectError);
  });

  it("resolves a folder under an archived project when includeDeleted is true (restoreFolder/purgeFolder's case)", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, folderId } = await seedProjectHierarchy(db, { projectDeleted: true });
    expect(await getFolderOrgId(db, folderId, true)).toBe(orgId);
  });
});

describe("getArtifactOrgId propagates includeDeleted through the folder lookup to the project lookup", () => {
  it("throws NotFound for an artifact under an archived project when includeDeleted is not set", async () => {
    const { db } = await setupIntegrationTest();
    const { artifactId } = await seedProjectHierarchy(db, { projectDeleted: true });
    await expect(getArtifactOrgId(db, artifactId)).rejects.toThrow(ConnectError);
  });

  it("resolves an artifact under an archived project when includeDeleted is true (restoreArtifact/purgeArtifact's case)", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, artifactId } = await seedProjectHierarchy(db, { projectDeleted: true });
    expect(await getArtifactOrgId(db, artifactId, true)).toBe(orgId);
  });
});

describe("getRepositoryLinkOrgId", () => {
  it("resolves a repository link's project orgId", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, projectId } = await seedProjectHierarchy(db);
    const linkId = "repo-authz-" + Date.now();
    await db.insert(schemaSqlite.repositoryLinks).values({
      id: linkId, projectId, provider: "github", remoteName: "org/repo", accessTokenEncrypted: "enc", createdAt: new Date(),
    });
    expect(await getRepositoryLinkOrgId(db, linkId)).toBe(orgId);
  });

  it("throws NotFound for a repository link id that doesn't exist", async () => {
    const { db } = await setupIntegrationTest();
    await expect(getRepositoryLinkOrgId(db, "no-such-link")).rejects.toThrow(ConnectError);
  });
});
