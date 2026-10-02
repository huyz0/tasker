import { describe, it, expect, beforeEach } from "bun:test";
import { Code, createContextValues } from "@connectrpc/connect";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { currentPrincipalKey } from "../auth/session";
import { createTaskManagementHandler } from "./tasks.handler";
import { createTaskNotesHandler } from "./task_notes.handler";
import { DIGEST_CAPS } from "./digest";

/** M41 (ADR-0034): a summary written once, and a bounded digest assembled at read time. */
describe("task summaries and digests (M41)", () => {
  const S = schemaSqlite;
  let db: any, nc: any, handler: any, notes: any;
  let orgId: string, adminId: string, projectId: string, stamp: string, agentId: string;
  let ctx: any;

  function agentCtx(scopes = ["tasks:read", "tasks:write"]) {
    const v = createContextValues();
    v.set(currentPrincipalKey, { kind: "agent", agentId, orgId, tokenId: "tok-" + agentId, scopes });
    return { values: v } as any;
  }

  beforeEach(async () => {
    ({ db, nc } = await setupIntegrationTest());
    stamp = Date.now() + "-" + Math.random().toString(36).slice(2);
    orgId = "org-dg-" + stamp;
    adminId = "user-dg-" + stamp;
    projectId = "proj-dg-" + stamp;
    agentId = "agent-dg-" + stamp;
    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "DG Org" });
    await seedProject(db, { orgId, userId: adminId, templateId: "tmpl-dg-" + stamp, projectId, name: "P" });
    await db.insert(S.agentRoles).values({ id: "role-dg-" + stamp, orgId, name: "R", systemPrompt: "p", capabilities: "[]" });
    await db.insert(S.agents).values({ id: agentId, orgId, agentRoleId: "role-dg-" + stamp, name: "Closer" });
    ctx = makeAuthContext(adminId);
    handler = createTaskManagementHandler(db, nc);
    notes = createTaskNotesHandler(db, nc);
  });

  async function task(title = "T", status = "todo") {
    return (await handler.createTask({ projectId, title, status }, ctx)).task;
  }

  async function expectCode(p: Promise<unknown>, code: Code, message?: RegExp) {
    const err: any = await p.then(() => null, (e) => e);
    const actual = err?.name === "ZodError" ? Code.InvalidArgument : err?.code;
    expect(actual).toBe(code);
    if (message) expect(err.message).toMatch(message);
  }

  describe("SetTaskSummary", () => {
    it("records who wrote it, shows it on GetTask only, replaces it whole and clears it", async () => {
      const t = await task();
      nc.clear();
      const res = await handler.setTaskSummary({ taskId: t.id, text: "  Shipped behind a flag. Gotcha: the index.  " }, agentCtx());
      expect(res.summary).toMatchObject({ text: "Shipped behind a flag. Gotcha: the index.", authorName: "Closer", agentId });
      expect(res.summary.updatedAt).toBeTruthy();
      expect(nc.publishedMessages.find((m: any) => m.subject === "domain.task.summary_updated").data)
        .toMatchObject({ taskId: t.id, cleared: false });
      expect((await handler.getTask({ taskId: t.id }, ctx)).task.summary.text).toBe("Shipped behind a flag. Gotcha: the index.");
      const listed = (await handler.listTasks({ projectId }, ctx)).tasks[0];
      expect(listed.summary).toBeUndefined();

      const byPerson = await handler.setTaskSummary({ taskId: t.id, text: "Rewritten." }, ctx);
      expect(byPerson.summary).toMatchObject({ text: "Rewritten.", userId: adminId });
      expect(byPerson.summary.agentId).toBeUndefined();

      expect(await handler.setTaskSummary({ taskId: t.id, text: "" }, agentCtx())).toEqual({});
      expect((await handler.getTask({ taskId: t.id }, ctx)).task.summary).toBeUndefined();
    });

    it("is bounded and needs tasks:write", async () => {
      const t = await task();
      expect((await handler.setTaskSummary({ taskId: t.id, text: "x".repeat(DIGEST_CAPS.summary) }, ctx)).summary.text).toHaveLength(4000);
      await expectCode(handler.setTaskSummary({ taskId: t.id, text: "x".repeat(4001) }, ctx), Code.InvalidArgument);
      await expectCode(handler.setTaskSummary({ taskId: t.id, text: "x" }, agentCtx(["tasks:read"])), Code.PermissionDenied);
      await expectCode(handler.setTaskSummary({ taskId: "tsk-nope", text: "x" }, ctx), Code.NotFound);
    });
  });

  describe("GetTaskDigest", () => {
    it("assembles the task, its handoff, answered questions, relations, usage and when it finished", async () => {
      const origin = await task("Origin");
      const t = (await handler.createTask({ projectId, title: "Work", status: "todo", discoveredFromTaskId: origin.id }, ctx)).task;
      const blocker = await task("Blocker");
      await handler.addTaskLink({ taskId: t.id, linkedTaskId: blocker.id, kind: "blocked_by" }, ctx);
      await handler.setTaskPlan({ taskId: t.id, steps: [{ title: "Do it", status: "done" }] }, agentCtx());
      await notes.createTaskNote({ taskId: t.id, content: "Left off at the migration", noteType: "handoff" }, agentCtx(["tasks:read", "tasks:write", "comments:write"]));
      const q = (await handler.requestInput({ taskId: t.id, question: "Flag?" }, agentCtx())).inputRequest;
      await handler.answerInputRequest({ id: q.id, answer: "yes" }, ctx);
      await handler.requestInput({ taskId: t.id, question: "Still open?" }, agentCtx());
      await handler.reportUsage({ taskId: t.id, inputTokens: 10n, outputTokens: 0n, costMicros: 5n }, agentCtx());
      await handler.updateTaskStatus({ taskId: t.id, status: "done" }, ctx);
      await handler.setTaskSummary({ taskId: t.id, text: "Done; see the flag." }, agentCtx());

      const { digest } = await handler.getTaskDigest({ taskId: t.id }, agentCtx(["tasks:read"]));
      expect(digest.task).toMatchObject({ id: t.id, status: "done", openInputRequestCount: 1, plan: [{ title: "Do it", status: "done" }] });
      expect(digest.task.summary.text).toBe("Done; see the flag.");
      expect(digest.task.usage.costMicros).toBe(5n);
      expect(digest.latestHandoffNote.content).toBe("Left off at the migration");
      expect(digest.answeredQuestions.map((r: any) => [r.question, r.answer])).toEqual([["Flag?", "yes"]]);
      expect(digest.relations.discoveredFrom.id).toBe(origin.id);
      expect(digest.relations.blockedBy.map((r: any) => r.id)).toEqual([blocker.id]);
      expect(Date.parse(digest.finishedAt)).toBeGreaterThan(Date.now() - 60_000);
      expect(digest.truncated).toBe(false);
      await expectCode(handler.getTaskDigest({ taskId: t.id }, agentCtx([])), Code.PermissionDenied);
    });

    it("caps answered questions and relations, says so, and costs the same queries for a big task as a small one", async () => {
      const small = await task("small");
      const big = await task("big");
      for (let i = 0; i < DIGEST_CAPS.answeredQuestions + 2; i++) {
        const q = (await handler.requestInput({ taskId: big.id, question: `Q${i}?` }, agentCtx())).inputRequest;
        await handler.answerInputRequest({ id: q.id, answer: "a" }, ctx);
      }
      const children = Array.from({ length: DIGEST_CAPS.relations + 3 }, (_, i) => ({
        id: `child-${i}-${stamp}`, projectId, title: `c${i}`, status: "todo", parentTaskId: big.id, createdAt: new Date(),
      }));
      await db.insert(S.tasks).values(children);

      let queries = 0;
      const counting = new Proxy(db, { get(target, prop) { if (prop === "select") queries++; return (target as any)[prop]; } });
      const countingHandler = createTaskManagementHandler(counting, nc);
      const smallDigest = (await countingHandler.getTaskDigest({ taskId: small.id }, ctx)).digest;
      const smallQueries = queries;
      queries = 0;
      const bigDigest = (await countingHandler.getTaskDigest({ taskId: big.id }, ctx)).digest;
      expect(smallDigest.truncated).toBe(false);
      expect(bigDigest.truncated).toBe(true);
      expect(bigDigest.answeredQuestions).toHaveLength(DIGEST_CAPS.answeredQuestions);
      expect(bigDigest.relations.children).toHaveLength(DIGEST_CAPS.relations);
      // The big task resolves names and refs the small one has none of, but in
      // batches - never a query per question or relation.
      expect(queries).toBeLessThanOrEqual(smallQueries + 4);
    });
  });

  describe("ListCompactionCandidates", () => {
    async function finish(title: string, daysAgo: number) {
      const t = await task(title);
      await handler.updateTaskStatus({ taskId: t.id, status: "done" }, ctx);
      await db.update(S.taskActivity).set({ occurredAt: new Date(Date.now() - daysAgo * 86_400_000) }).where(eq(S.taskActivity.taskId, t.id));
      return t;
    }

    it("lists finished, unsummarized tasks past the cutoff, oldest first", async () => {
      const old = await finish("old", 90);
      const older = await finish("older", 120);
      const recent = await finish("recent", 5);
      const summarized = await finish("summarized", 100);
      await handler.setTaskSummary({ taskId: summarized.id, text: "Covered." }, ctx);
      await task("open"); // not finished
      // Created done long ago with no move recorded: falls back to its creation time.
      const legacy = (await handler.createTask({ projectId, title: "legacy", status: "done" }, ctx)).task;
      await db.update(S.tasks).set({ createdAt: new Date(Date.now() - 200 * 86_400_000) }).where(eq(S.tasks.id, legacy.id));
      await db.delete(S.taskActivity).where(eq(S.taskActivity.taskId, legacy.id));

      const res = await handler.listCompactionCandidates({ projectId }, agentCtx(["tasks:read"]));
      expect(res.candidates.map((c: any) => c.title)).toEqual(["legacy", "older", "old"]);
      expect(res.totalCount).toBe(3);
      expect(res.candidates[1]).toMatchObject({ taskId: older.id, displayId: older.displayId, status: "done" });
      expect(Date.parse(res.candidates[2].finishedAt)).toBeLessThan(Date.now() - 89 * 86_400_000);

      const limited = await handler.listCompactionCandidates({ projectId, limit: 1 }, ctx);
      expect(limited.candidates.map((c: any) => c.title)).toEqual(["legacy"]);
      expect(limited.totalCount).toBe(3);
      const everything = await handler.listCompactionCandidates({ projectId, olderThanDays: 0 }, ctx);
      expect(everything.candidates.map((c: any) => c.taskId)).toContain(recent.id);
      expect(everything.candidates.map((c: any) => c.taskId)).not.toContain(summarized.id);

      await handler.setTaskSummary({ taskId: old.id, text: "Summarized now." }, agentCtx());
      expect((await handler.listCompactionCandidates({ projectId }, ctx)).totalCount).toBe(2);
    });

    it("validates its window and needs tasks:read on the project", async () => {
      await expectCode(handler.listCompactionCandidates({ projectId, olderThanDays: -1 }, ctx), Code.InvalidArgument);
      await expectCode(handler.listCompactionCandidates({ projectId, limit: 101 }, ctx), Code.InvalidArgument);
      await expectCode(handler.listCompactionCandidates({ projectId: "proj-nope" }, ctx), Code.NotFound);
      await expectCode(handler.listCompactionCandidates({ projectId }, agentCtx([])), Code.PermissionDenied);
    });
  });
});
