import { describe, it, expect, beforeEach } from "bun:test";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createArtifactsHandler } from "./artifacts.handler";

describe("Artifacts Handler", () => {
  let db: any;
  let handler: ReturnType<typeof createArtifactsHandler>;
  let ctx: any;
  let projectId: string;
  let otherProjectId: string;

  beforeEach(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    handler = createArtifactsHandler(db, null);

    const orgId = "org-" + crypto.randomUUID();
    const userId = "user-" + crypto.randomUUID();
    const templateId = "tmpl-" + crypto.randomUUID();
    projectId = "proj-" + crypto.randomUUID();
    otherProjectId = "proj-" + crypto.randomUUID();

    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Org", slug: "org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "Tmpl", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: otherProjectId, orgId, templateId, ownerId: userId, name: "Proj2", createdAt: new Date() });

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

  it("should reject listArtifacts with missing folderId", async () => {
    expect(handler.listArtifacts({}, ctx)).rejects.toThrow();
  });
});
