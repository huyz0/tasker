import { describe, it, expect, beforeEach } from "bun:test";
import { setupDatabase } from "../../db/db";
import { createTaskNotesHandler } from "./task_notes.handler";

describe("Task Notes Handler", () => {
  process.env.STANDALONE = "true";
  let db: any;
  let handler: ReturnType<typeof createTaskNotesHandler>;

  beforeEach(async () => {
    db = await setupDatabase("sqlite");
    handler = createTaskNotesHandler(db, null);
  });

  // --- createTaskNote happy paths ---

  it("should create a task note", async () => {
    const res = await handler.createTaskNote({
      taskId: "tsk-789",
      agentId: "agent-alpha",
      content: "This is a detailed AI reasoning block.",
    });
    
    expect(res.taskNote).toBeDefined();
    expect(res.taskNote.taskId).toBe("tsk-789");
    expect(res.taskNote.agentId).toBe("agent-alpha");
    expect(res.taskNote.id).toStartWith("tnt-");
  });

  // --- Zod validation rejection ---

  it("should reject task note with missing taskId", async () => {
    expect(
      handler.createTaskNote({
        taskId: "",
        agentId: "agent-1",
        content: "Test note",
      })
    ).rejects.toThrow();
  });

  it("should reject task note with missing default agentId", async () => {
    expect(
      handler.createTaskNote({
        taskId: "tsk-1",
        agentId: "",
        content: "Test note",
      })
    ).rejects.toThrow();
  });

  it("should reject task note with missing content", async () => {
    expect(
      handler.createTaskNote({
        taskId: "tsk-1",
        agentId: "agent-1",
        content: "",
      })
    ).rejects.toThrow();
  });

  // --- NATS event publishing ---

  it("should publish NATS event on task note creation", async () => {
    let published: { subject: string; data: string } | null = null;
    const mockNc = {
      publish: (subject: string, data: Buffer) => {
        published = { subject, data: data.toString() };
      },
    };
    const h = createTaskNotesHandler(db, mockNc);
    await h.createTaskNote({
      taskId: "tsk-event-1",
      agentId: "agent-x",
      content: "Event propagation test",
    });
    
    expect(published).not.toBeNull();
    expect(published!.subject).toBe("domain.tasknote.created");
  });
});
