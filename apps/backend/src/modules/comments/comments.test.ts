import { describe, it, expect, beforeEach } from "bun:test";
import { setupDatabase } from "../../db/db";
import { createCommentsHandler } from "./comments.handler";

describe("Comments Handler", () => {
  process.env.STANDALONE = "true";
  let db: any;
  let handler: ReturnType<typeof createCommentsHandler>;

  beforeEach(async () => {
    db = await setupDatabase("sqlite");
    handler = createCommentsHandler(db, null);
  });

  // --- createComment happy paths ---

  it("should create comment on a task", async () => {
    const res = await handler.createComment({
      entityId: "tsk-123",
      entityType: "task",
      content: "Looks good",
    });
    expect(res.comment).toBeDefined();
    expect(res.comment.entityType).toBe("task");
    expect(res.comment.id).toStartWith("cmt-");
  });

  it("should create comment on an artifact", async () => {
    const res = await handler.createComment({
      entityId: "art-456",
      entityType: "artifact",
      content: "Needs revision",
    });
    expect(res.comment).toBeDefined();
    expect(res.comment.entityType).toBe("artifact");
  });

  it("should create comment with agentId", async () => {
    const res = await handler.createComment({
      entityId: "tsk-123",
      entityType: "task",
      agentId: "agent-1",
      content: "Agent feedback",
    });
    expect(res.comment.agentId).toBe("agent-1");
    expect(res.comment.userId).toBeNull();
  });

  it("should create comment with userId", async () => {
    const res = await handler.createComment({
      entityId: "tsk-123",
      entityType: "task",
      userId: "user-1",
      content: "Human review",
    });
    expect(res.comment.userId).toBe("user-1");
    expect(res.comment.agentId).toBeNull();
  });

  // --- Zod validation rejection ---

  it("should reject comment with missing content", async () => {
    expect(
      handler.createComment({
        entityId: "tsk-123",
        entityType: "task",
        content: "",
      })
    ).rejects.toThrow();
  });

  it("should reject comment with invalid entityType", async () => {
    expect(
      handler.createComment({
        entityId: "tsk-123",
        entityType: "invalid" as any,
        content: "Test",
      })
    ).rejects.toThrow();
  });

  it("should reject comment with missing entityId", async () => {
    expect(
      handler.createComment({
        entityId: "",
        entityType: "task",
        content: "Test",
      })
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
      entityId: "tsk-1",
      entityType: "task",
      content: "Event test",
    });
    expect(published).not.toBeNull();
    expect(published!.subject).toBe("domain.comment.created");
  });

  // --- listComments ---

  it("should list comments for an entity", async () => {
    const eId = "tsk-list-" + Date.now();
    await handler.createComment({ entityId: eId, entityType: "task", content: "C1" });
    await handler.createComment({ entityId: eId, entityType: "task", content: "C2" });
    const res = await handler.listComments({ entityId: eId, entityType: "task" });
    expect(res.comments).toHaveLength(2);
    expect(res.comments.map((c: any) => c.content)).toContain("C1");
  });

  it("should reject listComments with missing entityId", async () => {
    expect(handler.listComments({ entityType: "task" })).rejects.toThrow();
  });
});
