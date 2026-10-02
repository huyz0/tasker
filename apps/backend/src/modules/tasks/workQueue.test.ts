import { describe, it, expect, beforeEach } from "bun:test";
import { Code, createContextValues } from "@connectrpc/connect";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { currentPrincipalKey } from "../auth/session";
import { createTaskManagementHandler } from "./tasks.handler";

/**
 * M33 - the agent work queue: take the next task in one call, give back what
 * you claimed, see what you hold. ADR-0027 for the release rule.
 */
describe("agent work queue (M33)", () => {
  let db: any, nc: any, handler: any;
  let orgId: string, adminId: string, projectId: string, otherProjectId: string;
  let ctx: any;
  const agentIds: string[] = [];

  function agentCtx(agentId: string, scopes = ["tasks:read", "tasks:write", "comments:write"]) {
    const v = createContextValues();
    v.set(currentPrincipalKey, { kind: "agent", agentId, orgId, tokenId: "tok-" + agentId, scopes });
    return { values: v } as any;
  }

  beforeEach(async () => {
    ({ db, nc } = await setupIntegrationTest());
    const stamp = Date.now() + "-" + Math.random().toString(36).slice(2);
    orgId = "org-wq-" + stamp;
    adminId = "user-wq-" + stamp;
    projectId = "proj-wq-" + stamp;
    otherProjectId = "proj-wq2-" + stamp;
    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "WQ Org" });
    await seedProject(db, { orgId, userId: adminId, templateId: "tmpl-wq-" + stamp, projectId, name: "P" });
    await db.insert(schemaSqlite.projects).values({ id: otherProjectId, orgId, templateId: "tmpl-wq-" + stamp, ownerId: adminId, name: "P2", key: "PTWO", createdAt: new Date() });
    await db.insert(schemaSqlite.agentRoles).values({ id: "role-wq-" + stamp, orgId, name: "R", systemPrompt: "p", capabilities: "[]" });
    agentIds.length = 0;
    for (let i = 0; i < 6; i++) {
      const id = `agent-wq-${i}-${stamp}`;
      agentIds.push(id);
      await db.insert(schemaSqlite.agents).values({ id, orgId, agentRoleId: "role-wq-" + stamp, name: `Agent ${i}` });
    }
    ctx = makeAuthContext(adminId);
    handler = createTaskManagementHandler(db, nc);
  });

  async function task(title: string, extra: Record<string, unknown> = {}) {
    return (await handler.createTask({ projectId, title, status: "todo", description: "", ...extra }, ctx)).task;
  }

  describe("ClaimNextTask (M33-T02)", () => {
    it("gives N concurrent claimers N distinct tasks, then nothing", async () => {
      for (let i = 0; i < 5; i++) await task(`T${i}`);
      const results = await Promise.all(agentIds.slice(0, 5).map((a) => handler.claimNextTask({ projectId }, agentCtx(a))));
      const ids = results.map((r: any) => r.task?.id);
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(5);

      const empty = await handler.claimNextTask({ projectId }, agentCtx(agentIds[5]!));
      expect(empty.task).toBeUndefined();
    });

    it("takes the oldest open task, skipping held and finished ones", async () => {
      const held = await task("held");
      await task("finished", { status: "done" });
      const open = await task("open");
      await handler.claimTask({ taskId: held.id }, agentCtx(agentIds[0]!));

      const res = await handler.claimNextTask({ projectId }, agentCtx(agentIds[1]!));
      expect(res.task.id).toBe(open.id);
      const rows = await db.select().from(schemaSqlite.taskAssignments).where(eq(schemaSqlite.taskAssignments.taskId, open.id));
      expect(rows[0].agentId).toBe(agentIds[1]);
      expect(rows[0].source).toBe("claim");
    });

    it("filters by task type", async () => {
      await db.insert(schemaSqlite.taskTypes).values({ id: "tt-wq", orgId, name: "Bug", createdAt: new Date() });
      await task("plain");
      const bug = await task("bug", { taskTypeId: "tt-wq" });
      const res = await handler.claimNextTask({ projectId, taskTypeId: "tt-wq" }, agentCtx(agentIds[0]!));
      expect(res.task.id).toBe(bug.id);
    });

    it("needs tasks:write", async () => {
      await task("T");
      await expect(handler.claimNextTask({ projectId }, agentCtx(agentIds[0]!, ["tasks:read"])))
        .rejects.toMatchObject({ code: Code.PermissionDenied });
    });

    it("replays an idempotent retry instead of claiming a second task", async () => {
      await task("A");
      await task("B");
      const first = await handler.claimNextTask({ projectId, idempotencyKey: "k" }, agentCtx(agentIds[0]!));
      const again = await handler.claimNextTask({ projectId, idempotencyKey: "k" }, agentCtx(agentIds[0]!));
      expect(again.task.id).toBe(first.task.id);
    });
  });

  describe("ReleaseTask (M33-T03, ADR-0027)", () => {
    it("gives back the caller's own claim, so the next agent can take it", async () => {
      const t = await task("T");
      await handler.claimTask({ taskId: t.id }, agentCtx(agentIds[0]!));
      const res = await handler.releaseTask({ taskId: t.id }, agentCtx(agentIds[0]!));
      expect(res.success).toBe(true);

      const next = await handler.claimNextTask({ projectId }, agentCtx(agentIds[1]!));
      expect(next.task.id).toBe(t.id);
    });

    it("records a handoff note first, and the next claimant receives it", async () => {
      const t = await task("T");
      await handler.claimTask({ taskId: t.id }, agentCtx(agentIds[0]!));
      const res = await handler.releaseTask({ taskId: t.id, handoffNote: "Tried X. Blocked on Y. Next: Z." }, agentCtx(agentIds[0]!));
      expect(res.handoffNote.noteType).toBe("handoff");
      expect(res.handoffNote.content).toBe("Tried X. Blocked on Y. Next: Z.");

      const next = await handler.claimTask({ taskId: t.id }, agentCtx(agentIds[1]!));
      expect(next.latestHandoffNote.content).toBe("Tried X. Blocked on Y. Next: Z.");
    });

    it("refuses to release an assignment a person made", async () => {
      const t = await task("T");
      await handler.assignTask({ taskId: t.id, agentId: agentIds[0] }, ctx);
      await expect(handler.releaseTask({ taskId: t.id }, agentCtx(agentIds[0]!)))
        .rejects.toMatchObject({ code: Code.PermissionDenied });
      const rows = await db.select().from(schemaSqlite.taskAssignments).where(eq(schemaSqlite.taskAssignments.taskId, t.id));
      expect(rows).toHaveLength(1);
    });

    it("refuses to release someone else's claim, and says so", async () => {
      const t = await task("T");
      await handler.claimTask({ taskId: t.id }, agentCtx(agentIds[0]!));
      await expect(handler.releaseTask({ taskId: t.id }, agentCtx(agentIds[1]!)))
        .rejects.toMatchObject({ code: Code.FailedPrecondition });
    });

    it("lets a person release a claim they took themselves", async () => {
      const t = await task("T");
      await handler.claimTask({ taskId: t.id }, ctx);
      expect((await handler.releaseTask({ taskId: t.id }, ctx)).success).toBe(true);
    });

    it("needs comments:write to leave a handoff note, before anything is released", async () => {
      const t = await task("T");
      await handler.claimTask({ taskId: t.id }, agentCtx(agentIds[0]!));
      await expect(handler.releaseTask({ taskId: t.id, handoffNote: "n" }, agentCtx(agentIds[0]!, ["tasks:read", "tasks:write"])))
        .rejects.toMatchObject({ code: Code.PermissionDenied });
      const rows = await db.select().from(schemaSqlite.taskAssignments).where(eq(schemaSqlite.taskAssignments.taskId, t.id));
      expect(rows).toHaveLength(1);
    });
  });
});
