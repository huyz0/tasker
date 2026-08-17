import { describe, it, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createTaskNotesHandler } from "./task_notes.handler";
import { createContextValues } from "@connectrpc/connect";
import { currentPrincipalKey } from "../auth/session";

describe("Task Notes Handler", () => {
  let db: any;
  let handler: ReturnType<typeof createTaskNotesHandler>;
  let ctx: any;
  let agentCtx: any;
  let taskId: string;
  let agentId: string;
  let orgId: string;

  beforeEach(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    handler = createTaskNotesHandler(db, null);

    orgId = "org-" + crypto.randomUUID();
    const userId = "user-" + crypto.randomUUID();
    const templateId = "tmpl-" + crypto.randomUUID();
    const projectId = "proj-" + crypto.randomUUID();
    const agentRoleId = "ar-" + crypto.randomUUID();
    taskId = "tsk-" + crypto.randomUUID();
    agentId = "agt-" + crypto.randomUUID();

    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Org", slug: "org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "Tmpl", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", createdAt: new Date() });
    await db.insert(schemaSqlite.tasks).values({ id: taskId, projectId, title: "Task", status: "todo", createdAt: new Date() });
    await db.insert(schemaSqlite.agentRoles).values({ id: agentRoleId, orgId, name: "Role", systemPrompt: "p", capabilities: "{}" });
    await db.insert(schemaSqlite.agents).values({ id: agentId, orgId, agentRoleId, name: "Agent", createdAt: new Date() });

    ctx = makeAuthContext(userId);
    // A task note is authored by the authenticated agent (M04-T06), so creating
    // one needs an agent principal - the shape the interceptor builds from a
    // token. Reads and the human-rejection case still use ctx.
    agentCtx = { values: (() => {
      const v = createContextValues();
      v.set(currentPrincipalKey, { kind: "agent", agentId, orgId, tokenId: "tok-test", scopes: ["tasks:write", "comments:write"] });
      return v;
    })() } as any;
  });

  // --- createTaskNote happy paths ---

  it("should create a task note", async () => {
    const res = await handler.createTaskNote({
      taskId,
      content: "This is a detailed AI reasoning block.",
    }, agentCtx);

    expect(res.taskNote).toBeDefined();
    expect(res.taskNote.taskId).toBe(taskId);
    expect(res.taskNote.agentId).toBe(agentId);
    expect(res.taskNote.id).toStartWith("tnt-");
    // M19-T02: createdAt used to be computed and then silently dropped
    // before the response left the handler.
    expect(typeof res.taskNote.createdAt).toBe("string");
    expect(res.taskNote.createdAt.length).toBeGreaterThan(0);
  });

  // --- Zod validation rejection ---

  it("should reject task note with missing taskId", async () => {
    expect(
      handler.createTaskNote({
        taskId: "",
        agentId,
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
        agentId,
        content: "",
      }, ctx)
    ).rejects.toThrow();
  });

  it("should reject task note for a nonexistent task", async () => {
    expect(
      handler.createTaskNote({ taskId: "tsk-does-not-exist", agentId, content: "x" }, ctx)
    ).rejects.toThrow();
  });

  it("should reject task note creation from a user outside the task's org", async () => {
    expect(
      handler.createTaskNote({ taskId, agentId, content: "x" }, makeAuthContext("user-outsider"))
    ).rejects.toThrow();
  });

  it("should reject task note for a nonexistent agentId", async () => {
    expect(
      handler.createTaskNote({ taskId, agentId: "agt-does-not-exist", content: "x" }, ctx)
    ).rejects.toThrow();
  });

  it("should reject task note for an agent belonging to a different org", async () => {
    const otherOrgId = "org-other-" + crypto.randomUUID();
    const otherAgentRoleId = "ar-other-" + crypto.randomUUID();
    const otherAgentId = "agt-other-" + crypto.randomUUID();
    await db.insert(schemaSqlite.organizations).values({ id: otherOrgId, name: "Other Org", slug: "org-other-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.agentRoles).values({ id: otherAgentRoleId, orgId: otherOrgId, name: "Other Role", systemPrompt: "p", capabilities: "{}" });
    await db.insert(schemaSqlite.agents).values({ id: otherAgentId, orgId: otherOrgId, agentRoleId: otherAgentRoleId, name: "Other Agent", createdAt: new Date() });

    expect(
      handler.createTaskNote({ taskId, agentId: otherAgentId, content: "x" }, ctx)
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
      content: "Event propagation test",
    }, agentCtx);

    expect(published).not.toBeNull();
    expect(published!.subject).toBe("domain.tasknote.created");
  });

  // --- listTaskNotes ---

  it("should list task notes for a task", async () => {
    await handler.createTaskNote({ taskId, content: "N1" }, agentCtx);
    await handler.createTaskNote({ taskId, content: "N2" }, agentCtx);
    // Reading stays open to humans: a note is written by an agent and read by
    // whoever is supervising it.
    const res = await handler.listTaskNotes({ taskId }, ctx);
    expect(res.taskNotes).toHaveLength(2);
    expect(res.taskNotes.map((n: any) => n.content)).toContain("N1");
    expect(res.taskNotes.every((n: any) => typeof n.createdAt === "string" && n.createdAt.length > 0)).toBe(true);
  });

  it("should reject listTaskNotes with missing taskId", async () => {
    expect(handler.listTaskNotes({}, ctx)).rejects.toThrow();
  });

  it("should reject listTaskNotes from a user outside the task's org", async () => {
    expect(handler.listTaskNotes({ taskId }, makeAuthContext("user-outsider"))).rejects.toThrow();
  });

  // --- updateTaskNote / deleteTaskNote (M19-T01) ---
  //
  // updateTaskNote/deleteTaskNote used to check only tasknote:write - an
  // ordinary, non-admin permission - so any org member, or any other agent's
  // token, could rewrite or delete an agent's own record of its work. Mirrors
  // comments.handler.ts's author check (M04, ADR-0008), the identical bug
  // already fixed once for comments.
  describe("author-only edit/delete", () => {
    it("lets the authoring agent update its own note", async () => {
      const created = await handler.createTaskNote({ taskId, content: "original" }, agentCtx);
      const res = await handler.updateTaskNote({ taskNoteId: created.taskNote.id, content: "revised" }, agentCtx);
      expect(res.taskNote.content).toBe("revised");
      expect(typeof res.taskNote.createdAt).toBe("string");
      expect(res.taskNote.createdAt.length).toBeGreaterThan(0);

      const [row] = await db.select().from(schemaSqlite.taskNotes).where(eq(schemaSqlite.taskNotes.id, created.taskNote.id));
      expect(row.content).toBe("revised");
    });

    it("lets the authoring agent delete its own note", async () => {
      const created = await handler.createTaskNote({ taskId, content: "to delete" }, agentCtx);
      await handler.deleteTaskNote({ taskNoteId: created.taskNote.id }, agentCtx);

      const rows = await db.select().from(schemaSqlite.taskNotes).where(eq(schemaSqlite.taskNotes.id, created.taskNote.id));
      expect(rows).toHaveLength(0);
    });

    it("rejects a different agent updating or deleting the note", async () => {
      const created = await handler.createTaskNote({ taskId, content: "original" }, agentCtx);

      const otherAgentRoleId = "ar-other-" + crypto.randomUUID();
      const otherAgentId = "agt-other-" + crypto.randomUUID();
      await db.insert(schemaSqlite.agentRoles).values({ id: otherAgentRoleId, orgId, name: "Other Role", systemPrompt: "p", capabilities: "{}" });
      await db.insert(schemaSqlite.agents).values({ id: otherAgentId, orgId, agentRoleId: otherAgentRoleId, name: "Other Agent", createdAt: new Date() });
      const otherAgentCtx = { values: (() => {
        const v = createContextValues();
        v.set(currentPrincipalKey, { kind: "agent", agentId: otherAgentId, orgId, tokenId: "tok-other", scopes: ["tasks:write", "comments:write"] });
        return v;
      })() } as any;

      await expect(
        handler.updateTaskNote({ taskNoteId: created.taskNote.id, content: "hijacked" }, otherAgentCtx)
      ).rejects.toThrow(/only the note's author/);
      await expect(
        handler.deleteTaskNote({ taskNoteId: created.taskNote.id }, otherAgentCtx)
      ).rejects.toThrow(/only the note's author/);

      const [row] = await db.select().from(schemaSqlite.taskNotes).where(eq(schemaSqlite.taskNotes.id, created.taskNote.id));
      expect(row.content).toBe("original");
    });

    it("rejects a human org admin updating or deleting the note, despite holding tasknote:write", async () => {
      const created = await handler.createTaskNote({ taskId, content: "original" }, agentCtx);

      // ctx is the org admin seeded in beforeEach - admins hold tasknote:write
      // by default, which used to be sufficient on its own.
      await expect(
        handler.updateTaskNote({ taskNoteId: created.taskNote.id, content: "hijacked" }, ctx)
      ).rejects.toThrow(/only the note's author/);
      await expect(
        handler.deleteTaskNote({ taskNoteId: created.taskNote.id }, ctx)
      ).rejects.toThrow(/only the note's author/);

      const [row] = await db.select().from(schemaSqlite.taskNotes).where(eq(schemaSqlite.taskNotes.id, created.taskNote.id));
      expect(row.content).toBe("original");
    });

    it("rejects updateTaskNote/deleteTaskNote for a nonexistent note", async () => {
      await expect(handler.updateTaskNote({ taskNoteId: "tnt-does-not-exist", content: "x" }, agentCtx)).rejects.toThrow();
      await expect(handler.deleteTaskNote({ taskNoteId: "tnt-does-not-exist" }, agentCtx)).rejects.toThrow();
    });
  });
});
