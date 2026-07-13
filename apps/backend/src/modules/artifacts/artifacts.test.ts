import { describe, it, expect, beforeEach } from "bun:test";
import { eq, and } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createArtifactsHandler } from "./artifacts.handler";

describe("Artifacts Handler", () => {
  let db: any;
  let handler: ReturnType<typeof createArtifactsHandler>;
  let ctx: any;
  let projectId: string;
  let otherProjectId: string;
  let orgId: string;

  beforeEach(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    handler = createArtifactsHandler(db, null);

    orgId = "org-" + crypto.randomUUID();
    const userId = "user-" + crypto.randomUUID();
    const templateId = "tmpl-" + crypto.randomUUID();
    projectId = "proj-" + crypto.randomUUID();
    otherProjectId = "proj-" + crypto.randomUUID();

    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Org", slug: "org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "Tmpl", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", key: "PROJ", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: otherProjectId, orgId, templateId, ownerId: userId, name: "Proj2", key: "PROJ2", createdAt: new Date() });

    ctx = makeAuthContext(userId);
  });

  // --- createFolder ---

  it("should create folder with valid input", async () => {
    const res = await handler.createFolder({
      projectId,
      parentId: null,
      name: "Documents",
    }, ctx);
    expect(res.folder).toBeDefined();
    expect(res.folder.name).toBe("Documents");
    expect(res.folder.id).toStartWith("fld-");
    expect(res.folder.projectId).toBe(projectId);
  });

  it("should create nested folder with parentId", async () => {
    const parent = await handler.createFolder({
      projectId,
      parentId: null,
      name: "Root Folder",
    }, ctx);
    const child = await handler.createFolder({
      projectId,
      parentId: parent.folder.id,
      name: "Sub Folder",
    }, ctx);
    expect(child.folder.parentId).toBe(parent.folder.id);
    expect(child.folder.name).toBe("Sub Folder");
  });

  it("should reject a parentId belonging to a different project", async () => {
    const parent = await handler.createFolder({ projectId, parentId: null, name: "Root" }, ctx);
    await expect(
      handler.createFolder({ projectId: otherProjectId, parentId: parent.folder.id, name: "Cross" }, ctx)
    ).rejects.toThrow();
  });

  it("should reject createFolder with missing name", async () => {
    expect(
      handler.createFolder({ projectId, name: "" }, ctx)
    ).rejects.toThrow();
  });

  it("should reject createFolder with missing projectId", async () => {
    expect(
      handler.createFolder({ projectId: "", name: "Folder" }, ctx)
    ).rejects.toThrow();
  });

  it("should reject createFolder for a nonexistent project", async () => {
    expect(
      handler.createFolder({ projectId: "proj-does-not-exist", name: "Folder" }, ctx)
    ).rejects.toThrow();
  });

  it("should reject createFolder from a user outside the project's org", async () => {
    expect(
      handler.createFolder({ projectId, name: "Folder" }, makeAuthContext("user-outsider"))
    ).rejects.toThrow();
  });

  it("should reject createFolder for a soft-deleted project", async () => {
    await db.update(schemaSqlite.projects).set({ deletedAt: new Date() }).where(eq(schemaSqlite.projects.id, projectId));
    await expect(
      handler.createFolder({ projectId, name: "Folder" }, ctx)
    ).rejects.toThrow();
  });

  // --- createArtifact ---

  it("should create artifact with valid input", async () => {
    const folder = await handler.createFolder({
      projectId,
      parentId: null,
      name: "Artifacts Folder",
    }, ctx);
    const res = await handler.createArtifact({
      folderId: folder.folder.id,
      name: "Design Doc",
      description: "Architecture Spec",
      content: "# Spec",
    }, ctx);
    expect(res.artifact).toBeDefined();
    expect(res.artifact.name).toBe("Design Doc");
    expect(res.artifact.id).toStartWith("art-");
    expect(res.artifact.contentType).toBe("text/markdown");
  });

  it("should create an image artifact with base64 content and an explicit contentType", async () => {
    const folder = await handler.createFolder({
      projectId,
      parentId: null,
      name: "Image Artifacts Folder",
    }, ctx);
    const base64Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const res = await handler.createArtifact({
      folderId: folder.folder.id,
      name: "logo.png",
      contentType: "image/png",
      content: base64Png,
    }, ctx);
    expect(res.artifact.contentType).toBe("image/png");
    expect(res.artifact.content).toBe(base64Png);
  });

  it("should reject createArtifact with missing folderId", async () => {
    expect(
      handler.createArtifact({ folderId: "", name: "Doc" }, ctx)
    ).rejects.toThrow();
  });

  it("should reject createArtifact with missing name", async () => {
    const folder = await handler.createFolder({ projectId, name: "F" }, ctx);
    expect(
      handler.createArtifact({ folderId: folder.folder.id, name: "" }, ctx)
    ).rejects.toThrow();
  });

  it("should reject createArtifact for a nonexistent folder", async () => {
    expect(
      handler.createArtifact({ folderId: "fld-does-not-exist", name: "Doc" }, ctx)
    ).rejects.toThrow();
  });

  // --- linkTaskArtifact ---

  it("should link task and artifact in the same org", async () => {
    const task = await db.insert(schemaSqlite.tasks).values({ id: "tsk-" + crypto.randomUUID(), projectId, title: "T", status: "todo", createdAt: new Date() }).returning();
    const folder = await handler.createFolder({ projectId, name: "F" }, ctx);
    const artifact = await handler.createArtifact({ folderId: folder.folder.id, name: "A" }, ctx);

    const res = await handler.linkTaskArtifact({
      taskId: task[0].id,
      artifactId: artifact.artifact.id,
    }, ctx);
    expect(res.link).toBeDefined();
    expect(res.link.taskId).toBe(task[0].id);
    expect(res.link.id).toStartWith("tal-");
  });

  it("should reject linking a task and artifact from different orgs", async () => {
    const otherOrgId = "org-" + crypto.randomUUID();
    const otherUserId = "user-" + crypto.randomUUID();
    const otherTemplateId = "tmpl-" + crypto.randomUUID();
    const crossProjectId = "proj-" + crypto.randomUUID();
    await db.insert(schemaSqlite.organizations).values({ id: otherOrgId, name: "Other Org", slug: "other-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: otherUserId, email: `${otherUserId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: otherOrgId, userId: otherUserId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: otherTemplateId, orgId: otherOrgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: crossProjectId, orgId: otherOrgId, templateId: otherTemplateId, ownerId: otherUserId, name: "P", createdAt: new Date() });

    const task = await db.insert(schemaSqlite.tasks).values({ id: "tsk-" + crypto.randomUUID(), projectId, title: "T", status: "todo", createdAt: new Date() }).returning();
    const otherFolder = await handler.createFolder({ projectId: crossProjectId, name: "F" }, makeAuthContext(otherUserId));
    const otherArtifact = await handler.createArtifact({ folderId: otherFolder.folder.id, name: "A" }, makeAuthContext(otherUserId));

    await expect(
      handler.linkTaskArtifact({ taskId: task[0].id, artifactId: otherArtifact.artifact.id }, ctx)
    ).rejects.toThrow();
  });

  it("should reject linkTaskArtifact with missing taskId", async () => {
    expect(
      handler.linkTaskArtifact({ taskId: "", artifactId: "art-123" }, ctx)
    ).rejects.toThrow();
  });

  it("should reject linkTaskArtifact with missing artifactId", async () => {
    expect(
      handler.linkTaskArtifact({ taskId: "tsk-123", artifactId: "" }, ctx)
    ).rejects.toThrow();
  });

  // --- NATS event publishing ---

  it("should publish NATS event on folder creation", async () => {
    let published: { subject: string; data: string } | null = null;
    const mockNc = {
      publish: (subject: string, data: Buffer) => {
        published = { subject, data: data.toString() };
      },
    };
    const h = createArtifactsHandler(db, mockNc);
    await h.createFolder({ projectId, name: "Test" }, ctx);
    expect(published).not.toBeNull();
    expect(published!.subject).toBe("domain.folder.created");
  });

  it("should publish NATS event on artifact creation", async () => {
    let published: { subject: string; data: string } | null = null;
    const mockNc = {
      publish: (subject: string, data: Buffer) => {
        published = { subject, data: data.toString() };
      },
    };
    const h = createArtifactsHandler(db, mockNc);
    const folder = await h.createFolder({ projectId, name: "F" }, ctx);
    await h.createArtifact({ folderId: folder.folder.id, name: "A" }, ctx);
    expect(published!.subject).toBe("domain.artifact.created");
  });

  // --- listFolders ---

  it("should list folders for a project", async () => {
    await handler.createFolder({ projectId, name: "Folder 1" }, ctx);
    await handler.createFolder({ projectId, name: "Folder 2" }, ctx);
    const res = await handler.listFolders({ projectId }, ctx);
    expect(res.folders).toHaveLength(2);
    expect(res.folders.map((f: any) => f.name)).toContain("Folder 1");
  });

  it("should filter and sort folders by name", async () => {
    await handler.createFolder({ projectId, name: "Zebra Folder" }, ctx);
    await handler.createFolder({ projectId, name: "Alpha Folder" }, ctx);

    const filtered = await handler.listFolders({ projectId, page: { filter: "Zebra" } }, ctx);
    expect(filtered.folders.every((f: any) => f.name.includes("Zebra"))).toBe(true);
    expect(filtered.folders.length).toBeGreaterThan(0);

    const sorted = await handler.listFolders({ projectId, page: { sort: "name:asc" } }, ctx);
    const names = sorted.folders.map((f: any) => f.name);
    expect(names.indexOf("Alpha Folder")).toBeLessThan(names.indexOf("Zebra Folder"));
  });

  it("should reject listFolders with missing projectId", async () => {
    expect(handler.listFolders({}, ctx)).rejects.toThrow();
  });

  it("should reject listFolders from a user outside the project's org", async () => {
    expect(handler.listFolders({ projectId }, makeAuthContext("user-outsider"))).rejects.toThrow();
  });

  // --- listArtifacts ---

  it("should list artifacts for a folder", async () => {
    const fld = await handler.createFolder({ projectId, name: "Fld" }, ctx);
    const fId = fld.folder.id;
    await handler.createArtifact({ folderId: fId, name: "Art 1" }, ctx);
    await handler.createArtifact({ folderId: fId, name: "Art 2" }, ctx);
    const res = await handler.listArtifacts({ folderId: fId }, ctx);
    expect(res.artifacts).toHaveLength(2);
    expect(res.artifacts.map((a: any) => a.name)).toContain("Art 1");
  });

  it("should filter and sort artifacts by name", async () => {
    const fld = await handler.createFolder({ projectId, name: "Sortable Fld" }, ctx);
    const fId = fld.folder.id;
    await handler.createArtifact({ folderId: fId, name: "Zebra Art" }, ctx);
    await handler.createArtifact({ folderId: fId, name: "Alpha Art" }, ctx);

    const filtered = await handler.listArtifacts({ folderId: fId, page: { filter: "Zebra" } }, ctx);
    expect(filtered.artifacts.every((a: any) => a.name.includes("Zebra"))).toBe(true);
    expect(filtered.artifacts.length).toBeGreaterThan(0);

    const sorted = await handler.listArtifacts({ folderId: fId, page: { sort: "name:asc" } }, ctx);
    const names = sorted.artifacts.map((a: any) => a.name);
    expect(names.indexOf("Alpha Art")).toBeLessThan(names.indexOf("Zebra Art"));
  });

  it("should reject listArtifacts with missing folderId", async () => {
    expect(handler.listArtifacts({}, ctx)).rejects.toThrow();
  });

  // --- archive/restore ---

  it("should archive and restore a folder, hiding/showing it in listFolders", async () => {
    const folder = await handler.createFolder({ projectId, name: "Archivable" }, ctx);

    await handler.archiveFolder({ folderId: folder.folder.id }, ctx);
    const afterArchive = await handler.listFolders({ projectId }, ctx);
    expect(afterArchive.folders.some((f: any) => f.id === folder.folder.id)).toBe(false);

    const binList = await handler.listFolders({ projectId, onlyDeleted: true }, ctx);
    expect(binList.folders.some((f: any) => f.id === folder.folder.id)).toBe(true);

    await handler.restoreFolder({ folderId: folder.folder.id }, ctx);
    const afterRestore = await handler.listFolders({ projectId }, ctx);
    expect(afterRestore.folders.some((f: any) => f.id === folder.folder.id)).toBe(true);
  });

  it("should reject archiveFolder/restoreFolder from a user outside the project's org", async () => {
    const folder = await handler.createFolder({ projectId, name: "Guarded" }, ctx);
    await expect(handler.archiveFolder({ folderId: folder.folder.id }, makeAuthContext("user-outsider"))).rejects.toThrow();
    await expect(handler.restoreFolder({ folderId: folder.folder.id }, makeAuthContext("user-outsider"))).rejects.toThrow();
  });

  it("should reject archiveFolder/restoreFolder from a non-admin org member", async () => {
    const folder = await handler.createFolder({ projectId, name: "Admin Only" }, ctx);
    const memberId = "user-member-" + crypto.randomUUID();
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: memberId, role: "member", joinedAt: new Date() });
    const memberCtx = makeAuthContext(memberId);
    await expect(handler.archiveFolder({ folderId: folder.folder.id }, memberCtx)).rejects.toThrow();
    await expect(handler.restoreFolder({ folderId: folder.folder.id }, memberCtx)).rejects.toThrow();
  });

  it("should archive and restore an artifact, hiding/showing it in listArtifacts", async () => {
    const folder = await handler.createFolder({ projectId, name: "Fld" }, ctx);
    const artifact = await handler.createArtifact({ folderId: folder.folder.id, name: "Archivable Art" }, ctx);

    await handler.archiveArtifact({ artifactId: artifact.artifact.id }, ctx);
    const afterArchive = await handler.listArtifacts({ folderId: folder.folder.id }, ctx);
    expect(afterArchive.artifacts.some((a: any) => a.id === artifact.artifact.id)).toBe(false);

    const binList = await handler.listArtifacts({ folderId: folder.folder.id, onlyDeleted: true }, ctx);
    expect(binList.artifacts.some((a: any) => a.id === artifact.artifact.id)).toBe(true);

    await handler.restoreArtifact({ artifactId: artifact.artifact.id }, ctx);
    const afterRestore = await handler.listArtifacts({ folderId: folder.folder.id }, ctx);
    expect(afterRestore.artifacts.some((a: any) => a.id === artifact.artifact.id)).toBe(true);
  });

  it("should reject archiveArtifact/restoreArtifact from a user outside the project's org", async () => {
    const folder = await handler.createFolder({ projectId, name: "Fld" }, ctx);
    const artifact = await handler.createArtifact({ folderId: folder.folder.id, name: "Guarded Art" }, ctx);
    await expect(handler.archiveArtifact({ artifactId: artifact.artifact.id }, makeAuthContext("user-outsider"))).rejects.toThrow();
    await expect(handler.restoreArtifact({ artifactId: artifact.artifact.id }, makeAuthContext("user-outsider"))).rejects.toThrow();
  });

  it("should reject archiveArtifact/restoreArtifact from a non-admin org member", async () => {
    const folder = await handler.createFolder({ projectId, name: "Fld" }, ctx);
    const artifact = await handler.createArtifact({ folderId: folder.folder.id, name: "Admin Only Art" }, ctx);
    const memberId = "user-member-art-" + crypto.randomUUID();
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: memberId, role: "member", joinedAt: new Date() });
    const memberCtx = makeAuthContext(memberId);
    await expect(handler.archiveArtifact({ artifactId: artifact.artifact.id }, memberCtx)).rejects.toThrow();
    await expect(handler.restoreArtifact({ artifactId: artifact.artifact.id }, memberCtx)).rejects.toThrow();
  });

  // --- purge ---

  it("should require an artifact be archived and unlinked before it can be purged", async () => {
    const folder = await handler.createFolder({ projectId, name: "Fld" }, ctx);
    const artifact = await handler.createArtifact({ folderId: folder.folder.id, name: "Purgeable" }, ctx);

    await expect(handler.purgeArtifact({ artifactId: artifact.artifact.id }, ctx)).rejects.toThrow();

    await handler.archiveArtifact({ artifactId: artifact.artifact.id }, ctx);

    const task = await db.insert(schemaSqlite.tasks).values({ id: "tsk-" + crypto.randomUUID(), projectId, title: "T", status: "todo", createdAt: new Date() }).returning();
    await handler.linkTaskArtifact({ taskId: task[0].id, artifactId: artifact.artifact.id }, ctx);
    await expect(handler.purgeArtifact({ artifactId: artifact.artifact.id }, ctx)).rejects.toThrow();

    await db.delete(schemaSqlite.taskArtifactLinks).where(eq(schemaSqlite.taskArtifactLinks.artifactId, artifact.artifact.id));

    const labelId = "lbl-purge-art-" + crypto.randomUUID();
    await db.insert(schemaSqlite.labels).values({ id: labelId, orgId, name: "purge-art-label", createdAt: new Date() });
    await db.insert(schemaSqlite.entityLabels).values({ id: "el-purge-art-" + crypto.randomUUID(), entityId: artifact.artifact.id, entityType: "artifact", labelId, createdAt: new Date() });

    const memberId = "user-member-purge-art-" + crypto.randomUUID();
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: memberId, role: "member", joinedAt: new Date() });
    await expect(handler.purgeArtifact({ artifactId: artifact.artifact.id }, makeAuthContext(memberId))).rejects.toThrow();

    await handler.purgeArtifact({ artifactId: artifact.artifact.id }, ctx);

    const remaining = await db.select().from(schemaSqlite.artifacts).where(eq(schemaSqlite.artifacts.id, artifact.artifact.id));
    expect(remaining.length).toBe(0);

    const remainingEntityLabels = await db.select().from(schemaSqlite.entityLabels).where(and(eq(schemaSqlite.entityLabels.entityId, artifact.artifact.id), eq(schemaSqlite.entityLabels.entityType, "artifact")));
    expect(remainingEntityLabels.length).toBe(0);
  });

  it("should require a folder be archived and empty before it can be purged", async () => {
    const folder = await handler.createFolder({ projectId, name: "Fld" }, ctx);

    await expect(handler.purgeFolder({ folderId: folder.folder.id }, ctx)).rejects.toThrow();

    await handler.archiveFolder({ folderId: folder.folder.id }, ctx);

    const artifact = await handler.createArtifact({ folderId: folder.folder.id, name: "Blocking Art" }, ctx);
    await expect(handler.purgeFolder({ folderId: folder.folder.id }, ctx)).rejects.toThrow();

    await db.delete(schemaSqlite.artifacts).where(eq(schemaSqlite.artifacts.id, artifact.artifact.id));

    const memberId = "user-member-purge-fld-" + crypto.randomUUID();
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: memberId, role: "member", joinedAt: new Date() });
    await expect(handler.purgeFolder({ folderId: folder.folder.id }, makeAuthContext(memberId))).rejects.toThrow();

    await handler.purgeFolder({ folderId: folder.folder.id }, ctx);

    const remaining = await db.select().from(schemaSqlite.folders).where(eq(schemaSqlite.folders.id, folder.folder.id));
    expect(remaining.length).toBe(0);
  });
});
