import { describe, it, expect, beforeEach } from "bun:test";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createTaskNotesHandler } from "./task_notes.handler";

describe("Task Notes Handler", () => {
  let db: any;
  let handler: ReturnType<typeof createTaskNotesHandler>;
  let ctx: any;
  let taskId: string;

  beforeEach(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    handler = createTaskNotesHandler(db, null);

    const orgId = "org-" + crypto.randomUUID();
    const userId = "user-" + crypto.randomUUID();
    const templateId = "tmpl-" + crypto.randomUUID();
    const projectId = "proj-" + crypto.randomUUID();
    taskId = "tsk-" + crypto.randomUUID();

    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Org", slug: "org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "Tmpl", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", createdAt: new Date() });
    await db.insert(schemaSqlite.tasks).values({ id: taskId, projectId, title: "Task", status: "todo", createdAt: new Date() });

    ctx = makeAuthContext(userId);
  });

  // --- createTaskNote happy paths ---

  it("should create a task note", async () => {
    const res = await handler.createTaskNote({
      taskId,
      agentId: "agent-alpha",
      content: "This is a detailed AI reasoning block.",
    }, ctx);

    expect(res.taskNote).toBeDefined();
    expect(res.taskNote.taskId).toBe(taskId);
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
      }, ctx)
    ).rejects.toThrow();
  });

  it("should reject task note with missing default agentId", async () => {
    expect(
      handler.createTaskNote({
        taskId,
        agentId: "",
        content: "Test note",
      }, ctx)
    ).rejects.toThrow();
  });

  it("should reject task note with missing content", async () => {
    expect(
      handler.createTaskNote({
        taskId,
        agentId: "agent-1",
        content: "",
      }, ctx)
    ).rejects.toThrow();
  });

  it("should reject task note for a nonexistent task", async () => {
    expect(
      handler.createTaskNote({ taskId: "tsk-does-not-exist", agentId: "agent-1", content: "x" }, ctx)
    ).rejects.toThrow();
  });

  it("should reject task note creation from a user outside the task's org", async () => {
    expect(
      handler.createTaskNote({ taskId, agentId: "agent-1", content: "x" }, makeAuthContext("user-outsider"))
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
      taskId,
      agentId: "agent-x",
      content: "Event propagation test",
    }, ctx);

    expect(published).not.toBeNull();
    expect(published!.subject).toBe("domain.tasknote.created");
  });

  // --- listTaskNotes ---

  it("should list task notes for a task", async () => {
    await handler.createTaskNote({ taskId, agentId: "a1", content: "N1" }, ctx);
    await handler.createTaskNote({ taskId, agentId: "a2", content: "N2" }, ctx);
    const res = await handler.listTaskNotes({ taskId }, ctx);
    expect(res.taskNotes).toHaveLength(2);
    expect(res.taskNotes.map((n: any) => n.content)).toContain("N1");
  });

  it("should reject listTaskNotes with missing taskId", async () => {
    expect(handler.listTaskNotes({}, ctx)).rejects.toThrow();
  });

  it("should reject listTaskNotes from a user outside the task's org", async () => {
    expect(handler.listTaskNotes({ taskId }, makeAuthContext("user-outsider"))).rejects.toThrow();
  });
});
