import { describe, it, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createCommentsHandler } from "./comments.handler";

describe("Comments Handler", () => {
  let db: any;
  let handler: ReturnType<typeof createCommentsHandler>;
  let ctx: any;
  let userId: string;
  let taskId: string;
  let artifactId: string;
  let agentId: string;

  beforeEach(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    handler = createCommentsHandler(db, null);

    const orgId = "org-" + crypto.randomUUID();
    userId = "user-" + crypto.randomUUID();
    const templateId = "tmpl-" + crypto.randomUUID();
    const projectId = "proj-" + crypto.randomUUID();
    const folderId = "fld-" + crypto.randomUUID();
    const agentRoleId = "ar-" + crypto.randomUUID();
    taskId = "tsk-" + crypto.randomUUID();
    artifactId = "art-" + crypto.randomUUID();
    agentId = "agt-" + crypto.randomUUID();

    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Org", slug: "org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "Tmpl", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", createdAt: new Date() });
    await db.insert(schemaSqlite.tasks).values({ id: taskId, projectId, title: "Task", status: "todo", createdAt: new Date() });
    await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: "Folder", createdAt: new Date() });
    await db.insert(schemaSqlite.artifacts).values({ id: artifactId, folderId, name: "Artifact", createdAt: new Date() });
    await db.insert(schemaSqlite.agentRoles).values({ id: agentRoleId, name: "Role", systemPrompt: "p", capabilities: "{}" });
    await db.insert(schemaSqlite.agents).values({ id: agentId, orgId, agentRoleId, name: "Agent", createdAt: new Date() });

    ctx = makeAuthContext(userId);
  });

  // --- createComment happy paths ---

  it("should create comment on a task", async () => {
    const res = await handler.createComment({
      entityId: taskId,
      entityType: "task",
      content: "Looks good",
    }, ctx);
    expect(res.comment).toBeDefined();
    expect(res.comment.entityType).toBe("task");
    expect(res.comment.id).toStartWith("cmt-");
  });

  it("should create comment on an artifact", async () => {
    const res = await handler.createComment({
      entityId: artifactId,
      entityType: "artifact",
      content: "Needs revision",
    }, ctx);
    expect(res.comment).toBeDefined();
    expect(res.comment.entityType).toBe("artifact");
  });

  it("should create comment with agentId", async () => {
    const res = await handler.createComment({
      entityId: taskId,
      entityType: "task",
      agentId,
      content: "Agent feedback",
    }, ctx);
    expect(res.comment.agentId).toBe(agentId);
    expect(res.comment.userId).toBeNull();
  });

  it("should reject comment with a nonexistent agentId", async () => {
    await expect(
      handler.createComment({ entityId: taskId, entityType: "task", agentId: "agt-does-not-exist", content: "x" }, ctx)
    ).rejects.toThrow();
  });

  it("should reject comment with an agentId belonging to a different org", async () => {
    const otherOrgId = "org-other-" + crypto.randomUUID();
    const otherAgentRoleId = "ar-other-" + crypto.randomUUID();
    const otherAgentId = "agt-other-" + crypto.randomUUID();
    await db.insert(schemaSqlite.organizations).values({ id: otherOrgId, name: "Other Org", slug: "org-other-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.agentRoles).values({ id: otherAgentRoleId, name: "Other Role", systemPrompt: "p", capabilities: "{}" });
    await db.insert(schemaSqlite.agents).values({ id: otherAgentId, orgId: otherOrgId, agentRoleId: otherAgentRoleId, name: "Other Agent", createdAt: new Date() });

    await expect(
      handler.createComment({ entityId: taskId, entityType: "task", agentId: otherAgentId, content: "x" }, ctx)
    ).rejects.toThrow();
  });

  it("attributes authorship to the authenticated caller, ignoring any client-supplied userId", async () => {
    const res = await handler.createComment({
      entityId: taskId,
      entityType: "task",
      userId: "someone-else",
      content: "Human review",
    }, ctx);
    expect(res.comment.userId).toBe(userId);
    expect(res.comment.agentId).toBeNull();
  });

  // --- Zod validation rejection ---

  it("should reject comment with missing content", async () => {
    expect(
      handler.createComment({
        entityId: taskId,
        entityType: "task",
        content: "",
      }, ctx)
    ).rejects.toThrow();
  });

  it("should reject comment with invalid entityType", async () => {
    expect(
      handler.createComment({
        entityId: taskId,
        entityType: "invalid" as any,
        content: "Test",
      }, ctx)
    ).rejects.toThrow();
  });

  it("should reject comment with missing entityId", async () => {
    expect(
      handler.createComment({
        entityId: "",
        entityType: "task",
        content: "Test",
      }, ctx)
    ).rejects.toThrow();
  });

  it("should reject comment on a nonexistent entity", async () => {
    expect(
      handler.createComment({ entityId: "tsk-does-not-exist", entityType: "task", content: "x" }, ctx)
    ).rejects.toThrow();
  });

  it("should reject comment on a soft-deleted task", async () => {
    await db.update(schemaSqlite.tasks).set({ deletedAt: new Date() }).where(eq(schemaSqlite.tasks.id, taskId));
    await expect(
      handler.createComment({ entityId: taskId, entityType: "task", content: "x" }, ctx)
    ).rejects.toThrow();
  });

  it("should reject comment creation from a user outside the entity's org", async () => {
    expect(
      handler.createComment({ entityId: taskId, entityType: "task", content: "x" }, makeAuthContext("user-outsider"))
    ).rejects.toThrow();
  });

  // --- NATS event publishing ---

  it("should publish NATS event on comment creation", async () => {
    let published: { subject: string; data: string } | null = null;
    const mockNc = {
      publish: (subject: string, data: Buffer) => {
        published = { subject, data: data.toString() };
      },
    };
    const h = createCommentsHandler(db, mockNc);
    await h.createComment({
      entityId: taskId,
      entityType: "task",
      content: "Event test",
    }, ctx);
    expect(published).not.toBeNull();
    expect(published!.subject).toBe("domain.comment.created");
  });

  // --- listComments ---

  it("should list comments for an entity", async () => {
    await handler.createComment({ entityId: taskId, entityType: "task", content: "C1" }, ctx);
    await handler.createComment({ entityId: taskId, entityType: "task", content: "C2" }, ctx);
    const res = await handler.listComments({ entityId: taskId, entityType: "task" }, ctx);
    expect(res.comments).toHaveLength(2);
    expect(res.comments.map((c: any) => c.content)).toContain("C1");
  });

  it("should reject listComments with missing entityId", async () => {
    expect(handler.listComments({ entityType: "task" }, ctx)).rejects.toThrow();
  });

  it("should reject listComments from a user outside the entity's org", async () => {
    expect(handler.listComments({ entityId: taskId, entityType: "task" }, makeAuthContext("user-outsider"))).rejects.toThrow();
  });
});
