import { describe, it, expect, beforeEach } from "bun:test";
import { Code, createContextValues } from "@connectrpc/connect";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { currentPrincipalKey } from "../auth/session";
import { createTaskManagementHandler } from "./tasks.handler";

/** M38 (ADR-0031): an agent's plan, and the questions it asks a person. */
describe("plans and input requests (M38)", () => {
  let db: any, nc: any, handler: any;
  let orgId: string, adminId: string, projectId: string, stamp: string, agentId: string;
  let ctx: any;

  function agentCtx(scopes = ["tasks:read", "tasks:write"], id = agentId) {
    const v = createContextValues();
    v.set(currentPrincipalKey, { kind: "agent", agentId: id, orgId, tokenId: "tok-" + id, scopes });
    return { values: v } as any;
  }

  beforeEach(async () => {
    ({ db, nc } = await setupIntegrationTest());
    stamp = Date.now() + "-" + Math.random().toString(36).slice(2);
    orgId = "org-pi-" + stamp;
    adminId = "user-pi-" + stamp;
    projectId = "proj-pi-" + stamp;
    agentId = "agent-pi-" + stamp;
    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "PI Org" });
    await seedProject(db, { orgId, userId: adminId, templateId: "tmpl-pi-" + stamp, projectId, name: "P" });
    await db.insert(schemaSqlite.agentRoles).values({ id: "role-pi-" + stamp, orgId, name: "R", systemPrompt: "p", capabilities: "[]" });
    await db.insert(schemaSqlite.agents).values({ id: agentId, orgId, agentRoleId: "role-pi-" + stamp, name: "Planner" });
    ctx = makeAuthContext(adminId);
    handler = createTaskManagementHandler(db, nc);
  });

  async function task(title = "T") {
    return (await handler.createTask({ projectId, title, status: "todo", description: "" }, ctx)).task;
  }

  async function expectCode(p: Promise<unknown>, code: Code, message?: RegExp) {
    const err: any = await p.then(() => null, (e) => e);
    const actual = err?.name === "ZodError" ? Code.InvalidArgument : err?.code;
    expect(actual).toBe(code);
    if (message) expect(err.message).toMatch(message);
  }

  describe("SetTaskPlan (M38-T02)", () => {
    it("replaces the plan whole, returns it on GetTask but not in lists, and clears it with an empty list", async () => {
      const t = await task();
      expect((await handler.getTask({ taskId: t.id }, ctx)).task.plan).toEqual([]);
      const steps = [{ title: "  Read the schema ", status: "done" }, { title: "Write the migration", status: "in_progress" }, { title: "Backfill", status: "pending" }];
      expect((await handler.setTaskPlan({ taskId: t.id, steps }, agentCtx())).plan).toEqual([
        { title: "Read the schema", status: "done" }, { title: "Write the migration", status: "in_progress" }, { title: "Backfill", status: "pending" },
      ]);
      expect((await handler.getTask({ taskId: t.id }, ctx)).task.plan.map((s: any) => s.status)).toEqual(["done", "in_progress", "pending"]);
      expect((await handler.listTasks({ projectId }, ctx)).tasks[0].plan).toEqual([]);

      await handler.setTaskPlan({ taskId: t.id, steps: [{ title: "Only this", status: "skipped" }] }, agentCtx());
      expect((await handler.getTask({ taskId: t.id }, ctx)).task.plan).toEqual([{ title: "Only this", status: "skipped" }]);
      await handler.setTaskPlan({ taskId: t.id, steps: [] }, agentCtx());
      expect((await handler.getTask({ taskId: t.id }, ctx)).task.plan).toEqual([]);
    });

    it("bounds the plan and its steps", async () => {
      const t = await task();
      await expectCode(handler.setTaskPlan({ taskId: t.id, steps: Array.from({ length: 51 }, (_, i) => ({ title: `s${i}`, status: "pending" })) }, ctx), Code.InvalidArgument);
      await expectCode(handler.setTaskPlan({ taskId: t.id, steps: [{ title: "x".repeat(501), status: "pending" }] }, ctx), Code.InvalidArgument);
      await expectCode(handler.setTaskPlan({ taskId: t.id, steps: [{ title: " ", status: "pending" }] }, ctx), Code.InvalidArgument);
      await expectCode(handler.setTaskPlan({ taskId: t.id, steps: [{ title: "a", status: "blocked" }] }, ctx), Code.InvalidArgument);
    });

    it("needs tasks:write, and announces the update", async () => {
      const t = await task();
      await expectCode(handler.setTaskPlan({ taskId: t.id, steps: [] }, agentCtx(["tasks:read"])), Code.PermissionDenied);
      nc.clear();
      await handler.setTaskPlan({ taskId: t.id, steps: [{ title: "a", status: "done" }, { title: "b", status: "pending" }] }, agentCtx());
      const event = nc.publishedMessages.find((m: any) => m.subject === "domain.task.plan_updated");
      expect(event.data).toMatchObject({ taskId: t.id, steps: 2, done: 1 });
    });
  });

  describe("input requests (M38-T03)", () => {
    const S = schemaSqlite;
    const ask = (taskId: string, extra: Record<string, unknown> = {}, c = agentCtx()) =>
      handler.requestInput({ taskId, question: "Ship behind a flag or straight to main?", options: ["flag", "main"], ...extra }, c);

    it("an agent asks; the task shows it is waiting; a person answers; the asker is told", async () => {
      const t = await task("Migrate");
      nc.clear();
      const asked = (await ask(t.id)).inputRequest;
      expect(asked).toMatchObject({ taskId: t.id, taskDisplayId: t.displayId, taskTitle: "Migrate", status: "open", options: ["flag", "main"], askedByAgentId: agentId, askedByName: "Planner" });
      expect(nc.publishedMessages.find((m: any) => m.subject === "domain.task.input_requested").data).toMatchObject({ inputRequestId: asked.id, taskId: t.id });
      expect((await handler.getTask({ taskId: t.id }, ctx)).task.openInputRequestCount).toBe(1);
      expect((await handler.listTasks({ projectId }, ctx)).tasks[0].openInputRequestCount).toBe(1);

      const answered = (await handler.answerInputRequest({ id: asked.id, answer: " flag " }, ctx)).inputRequest;
      expect(answered).toMatchObject({ status: "answered", answer: "flag", answeredByUserId: adminId });
      expect(answered.answeredAt).toBeDefined();
      expect(nc.publishedMessages.find((m: any) => m.subject === "domain.task.input_answered").data).toMatchObject({ inputRequestId: asked.id, answer: "flag", askedByAgentId: agentId });
      expect((await handler.getInputRequest({ id: asked.id }, agentCtx(["tasks:read"]))).inputRequest.answer).toBe("flag");
      expect((await handler.getTask({ taskId: t.id }, ctx)).task.openInputRequestCount).toBe(0);
      await expectCode(handler.answerInputRequest({ id: asked.id, answer: "main" }, ctx), Code.FailedPrecondition, /already answered/);
    });

    it("notifies the task's reviewers, or else the organization's admins", async () => {
      const t = await task();
      await ask(t.id);
      let notes = await db.select().from(S.notifications);
      expect(notes.map((n: any) => [n.userId, n.type])).toEqual([[adminId, "task.input_requested"]]);
      expect(notes[0].title).toBe(`Planner asks on ${t.displayId}`);
      expect(notes[0].targetPath).toContain(`/tasks/${t.id}`);

      const reviewer = "reviewer-pi-" + stamp;
      await db.insert(S.users).values({ id: reviewer, name: "Rae", createdAt: new Date() });
      await db.insert(S.organizationMembers).values({ orgId, userId: reviewer, role: "member", joinedAt: new Date() });
      const reviewed = await task("reviewed");
      await handler.addTaskReviewer({ taskId: reviewed.id, userId: reviewer }, ctx);
      await db.delete(S.notifications);
      await ask(reviewed.id);
      notes = await db.select().from(S.notifications);
      expect(notes.map((n: any) => n.userId)).toEqual([reviewer]);
    });

    it("only a person answers, and of two racing answers exactly one wins", async () => {
      const t = await task();
      const asked = (await ask(t.id)).inputRequest;
      await expectCode(handler.answerInputRequest({ id: asked.id, answer: "main" }, agentCtx()), Code.PermissionDenied);
      const results = await Promise.allSettled([
        handler.answerInputRequest({ id: asked.id, answer: "flag" }, ctx),
        handler.answerInputRequest({ id: asked.id, answer: "main" }, ctx),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    });

    it("the asker or an admin cancels; nobody else; and a closed question stays closed", async () => {
      const t = await task();
      const first = (await ask(t.id)).inputRequest;
      const other = "agent-pi2-" + stamp;
      await db.insert(S.agents).values({ id: other, orgId, agentRoleId: "role-pi-" + stamp, name: "Other" });
      await expectCode(handler.cancelInputRequest({ id: first.id }, agentCtx(undefined, other)), Code.PermissionDenied);
      expect((await handler.cancelInputRequest({ id: first.id }, agentCtx())).inputRequest.status).toBe("cancelled");
      await expectCode(handler.answerInputRequest({ id: first.id, answer: "x" }, ctx), Code.FailedPrecondition, /already cancelled/);

      const second = (await ask(t.id)).inputRequest;
      expect((await handler.cancelInputRequest({ id: second.id }, ctx)).inputRequest.status).toBe("cancelled");
      await expectCode(handler.cancelInputRequest({ id: second.id }, ctx), Code.FailedPrecondition);
    });

    it("lists the organization's open queue, one task's history, and every status on request", async () => {
      const [a, b] = [await task("a"), await task("b")];
      const qa = (await ask(a.id, { question: "A?" })).inputRequest;
      await ask(b.id, { question: "B?" });
      await handler.answerInputRequest({ id: qa.id, answer: "yes" }, ctx);

      const open = await handler.listInputRequests({}, agentCtx(["tasks:read"]));
      expect(open.inputRequests.map((r: any) => r.question)).toEqual(["B?"]);
      expect((await handler.listInputRequests({ orgId, status: "all" }, ctx)).page.totalCount).toBe(2);
      expect((await handler.listInputRequests({ taskId: a.id, status: "answered" }, ctx)).inputRequests.map((r: any) => r.answer)).toEqual(["yes"]);
      await expectCode(handler.listInputRequests({}, ctx), Code.InvalidArgument, /orgId or taskId/);
    });

    it("validates the question and needs tasks:write to ask", async () => {
      const t = await task();
      await expectCode(ask(t.id, { question: "  " }), Code.InvalidArgument);
      await expectCode(ask(t.id, { options: Array.from({ length: 11 }, (_, i) => `o${i}`) }), Code.InvalidArgument);
      await expectCode(ask(t.id, {}, agentCtx(["tasks:read"])), Code.PermissionDenied);
      await expectCode(handler.getInputRequest({ id: "ir-missing" }, ctx), Code.NotFound);
    });

    it("purging a task removes its questions", async () => {
      const t = await task();
      await ask(t.id);
      await handler.deleteTask({ taskId: t.id }, ctx);
      await handler.purgeTask({ taskId: t.id }, ctx);
      expect(await db.select().from(S.inputRequests)).toEqual([]);
    });
  });
});
