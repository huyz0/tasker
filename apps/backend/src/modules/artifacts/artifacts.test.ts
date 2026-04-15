import { describe, it, expect, beforeEach } from "bun:test";
import { setupDatabase } from "../../db/db";
import { createArtifactsHandler } from "./artifacts.handler";

describe("Artifacts Handler", () => {
  process.env.STANDALONE = "true";
  let db: any;
  let handler: ReturnType<typeof createArtifactsHandler>;

  beforeEach(async () => {
    db = await setupDatabase("sqlite");
    handler = createArtifactsHandler(db, null);
  });

  // --- createFolder ---

  it("should create folder with valid input", async () => {
    const res = await handler.createFolder({
      projectId: "proj-123",
      parentId: null,
      name: "Documents",
    });
    expect(res.folder).toBeDefined();
    expect(res.folder.name).toBe("Documents");
    expect(res.folder.id).toStartWith("fld-");
    expect(res.folder.projectId).toBe("proj-123");
  });

  it("should create nested folder with parentId", async () => {
    const parent = await handler.createFolder({
      projectId: "proj-123",
      parentId: null,
      name: "Root Folder",
    });
    const child = await handler.createFolder({
      projectId: "proj-123",
      parentId: parent.folder.id,
      name: "Sub Folder",
    });
    expect(child.folder.parentId).toBe(parent.folder.id);
    expect(child.folder.name).toBe("Sub Folder");
  });

  it("should reject createFolder with missing name", async () => {
    expect(
      handler.createFolder({ projectId: "proj-123", name: "" })
    ).rejects.toThrow();
  });

  it("should reject createFolder with missing projectId", async () => {
    expect(
      handler.createFolder({ projectId: "", name: "Folder" })
    ).rejects.toThrow();
  });

  // --- createArtifact ---

  it("should create artifact with valid input", async () => {
    const folder = await handler.createFolder({
      projectId: "proj-123",
      parentId: null,
      name: "Artifacts Folder",
    });
    const res = await handler.createArtifact({
      folderId: folder.folder.id,
      name: "Design Doc",
      description: "Architecture Spec",
      content: "# Spec",
    });
    expect(res.artifact).toBeDefined();
    expect(res.artifact.name).toBe("Design Doc");
    expect(res.artifact.id).toStartWith("art-");
  });

  it("should reject createArtifact with missing folderId", async () => {
    expect(
      handler.createArtifact({ folderId: "", name: "Doc" })
    ).rejects.toThrow();
  });

  it("should reject createArtifact with missing name", async () => {
    expect(
      handler.createArtifact({ folderId: "fld-123", name: "" })
    ).rejects.toThrow();
  });

  // --- linkTaskArtifact ---

  it("should link task and artifact", async () => {
    const res = await handler.linkTaskArtifact({
      taskId: "tsk-123",
      artifactId: "art-123",
    });
    expect(res.link).toBeDefined();
    expect(res.link.taskId).toBe("tsk-123");
    expect(res.link.id).toStartWith("tal-");
  });

  it("should reject linkTaskArtifact with missing taskId", async () => {
    expect(
      handler.linkTaskArtifact({ taskId: "", artifactId: "art-123" })
    ).rejects.toThrow();
  });

  it("should reject linkTaskArtifact with missing artifactId", async () => {
    expect(
      handler.linkTaskArtifact({ taskId: "tsk-123", artifactId: "" })
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
    await h.createFolder({ projectId: "proj-1", name: "Test" });
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
    const folder = await h.createFolder({ projectId: "proj-1", name: "F" });
    await h.createArtifact({ folderId: folder.folder.id, name: "A" });
    expect(published!.subject).toBe("domain.artifact.created");
  });

  // --- listFolders ---

  it("should list folders for a project", async () => {
    const pId = "proj-list-" + Date.now();
    await handler.createFolder({ projectId: pId, name: "Folder 1" });
    await handler.createFolder({ projectId: pId, name: "Folder 2" });
    const res = await handler.listFolders({ projectId: pId });
    expect(res.folders).toHaveLength(2);
    expect(res.folders.map((f: any) => f.name)).toContain("Folder 1");
  });

  it("should reject listFolders with missing projectId", async () => {
    expect(handler.listFolders({})).rejects.toThrow();
  });

  // --- listArtifacts ---

  it("should list artifacts for a folder", async () => {
    const fld = await handler.createFolder({ projectId: "pro", name: "Fld" });
    const fId = fld.folder.id;
    await handler.createArtifact({ folderId: fId, name: "Art 1" });
    await handler.createArtifact({ folderId: fId, name: "Art 2" });
    const res = await handler.listArtifacts({ folderId: fId });
    expect(res.artifacts).toHaveLength(2);
    expect(res.artifacts.map((a: any) => a.name)).toContain("Art 1");
  });

  it("should reject listArtifacts with missing folderId", async () => {
    expect(handler.listArtifacts({})).rejects.toThrow();
  });
});
