import { describe, it, expect, beforeEach } from "bun:test";
import { Code, createContextValues } from "@connectrpc/connect";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { currentPrincipalKey } from "../auth/session";
import { createTaskManagementHandler } from "./tasks.handler";
import { purgeTaskCascade } from "../../lib/cascadePurge";
import createReportsHandler from "../reports/reports.handler";
import { usageWindowStart } from "../reports/usage";

/** M40 (ADR-0033): agents report what their work cost; people see it by task, agent, project and day. */
describe("agent usage and cost (M40)", () => {
  const S = schemaSqlite;
  let db: any, nc: any, handler: any, reports: any;
  let orgId: string, adminId: string, projectId: string, stamp: string, agentId: string, agent2: string;
  let ctx: any;

  function agentCtx(scopes = ["tasks:read", "tasks:write"], id = agentId) {
    const v = createContextValues();
    v.set(currentPrincipalKey, { kind: "agent", agentId: id, orgId, tokenId: "tok-" + id, scopes });
    return { values: v } as any;
  }

  beforeEach(async () => {
    ({ db, nc } = await setupIntegrationTest());
    stamp = Date.now() + "-" + Math.random().toString(36).slice(2);
    orgId = "org-us-" + stamp;
    adminId = "user-us-" + stamp;
    projectId = "proj-us-" + stamp;
    agentId = "agent-us-" + stamp;
    agent2 = "agent2-us-" + stamp;
    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "US Org" });
    await seedProject(db, { orgId, userId: adminId, templateId: "tmpl-us-" + stamp, projectId, name: "Alpha" });
    await db.insert(S.agentRoles).values({ id: "role-us-" + stamp, orgId, name: "R", systemPrompt: "p", capabilities: "[]" });
    await db.insert(S.agents).values([
      { id: agentId, orgId, agentRoleId: "role-us-" + stamp, name: "Coder" },
      { id: agent2, orgId, agentRoleId: "role-us-" + stamp, name: "Reviewer" },
    ]);
    ctx = makeAuthContext(adminId);
    handler = createTaskManagementHandler(db, nc);
    const fakeRouter = { service: (_d: any, impl: any) => { reports = impl; return fakeRouter; } };
    createReportsHandler(fakeRouter as any, db);
  });

  async function task(title = "T", project = projectId) {
    return (await handler.createTask({ projectId: project, title, status: "todo" }, ctx)).task;
  }

  async function expectCode(p: Promise<unknown>, code: Code, message?: RegExp) {
    const err: any = await p.then(() => null, (e) => e);
    const actual = err?.name === "ZodError" ? Code.InvalidArgument : err?.code;
    expect(actual).toBe(code);
    if (message) expect(err.message).toMatch(message);
  }

  const report = (taskId: string, extra: Record<string, unknown> = {}, c = agentCtx()) =>
    handler.reportUsage({ taskId, modelName: "claude-x", inputTokens: 1000n, outputTokens: 200n, costMicros: 15000n, ...extra }, c);

  describe("ReportUsage", () => {
    it("records a report against the task, totals it, and announces it", async () => {
      const t = await task();
      nc.clear();
      const res = await report(t.id);
      expect(res.replayed).toBe(false);
      expect(res.record).toMatchObject({
        taskId: t.id, projectId, agentId, reportedByName: "Coder", modelName: "claude-x",
        inputTokens: 1000n, outputTokens: 200n, costMicros: 15000n,
      });
      expect(res.totals).toEqual({ inputTokens: 1000n, outputTokens: 200n, costMicros: 15000n, reports: 1n });
      expect(nc.publishedMessages.find((m: any) => m.subject === "domain.task.usage_reported").data)
        .toMatchObject({ taskId: t.id, agentId, costMicros: 15000 });

      await report(t.id, { inputTokens: 5n, outputTokens: 0n, costMicros: 1n, modelName: undefined });
      const got = (await handler.getTask({ taskId: t.id }, ctx)).task;
      expect(got.usage).toEqual({ inputTokens: 1005n, outputTokens: 200n, costMicros: 15001n, reports: 2n });
      // Lists carry no usage - it is one aggregate per task, GetTask only.
      expect((await handler.listTasks({ projectId }, ctx)).tasks[0].usage).toBeUndefined();
    });

    it("is idempotent by key on a task: a replay returns the original and records nothing", async () => {
      const t = await task();
      const first = await report(t.id, { idempotencyKey: "run-1" });
      const again = await report(t.id, { idempotencyKey: "run-1", costMicros: 999n });
      expect(again.replayed).toBe(true);
      expect(again.record.id).toBe(first.record.id);
      expect(again.record.costMicros).toBe(15000n);
      expect(again.totals.reports).toBe(1n);
      // The same key on another task is another report.
      const t2 = await task("other");
      expect((await report(t2.id, { idempotencyKey: "run-1" })).replayed).toBe(false);
      expect(await db.select().from(S.usageRecords)).toHaveLength(2);
    });

    it("refuses negative, fractional, oversized and empty reports", async () => {
      const t = await task();
      await expectCode(report(t.id, { inputTokens: -1n }), Code.InvalidArgument);
      await expectCode(report(t.id, { costMicros: 1_000_000_001n }), Code.InvalidArgument);
      await expectCode(report(t.id, { outputTokens: 1.5 }), Code.InvalidArgument);
      await expectCode(report(t.id, { inputTokens: 0n, outputTokens: 0n, costMicros: 0n }), Code.InvalidArgument);
      await expectCode(report(t.id, { modelName: "m".repeat(101) }), Code.InvalidArgument);
      // JSON callers send numbers or strings for int64.
      expect((await report(t.id, { inputTokens: "7", outputTokens: 3, costMicros: 0 })).record.inputTokens).toBe(7n);
    });

    it("needs tasks:write; a person may report too", async () => {
      const t = await task();
      await expectCode(report(t.id, {}, agentCtx(["tasks:read"])), Code.PermissionDenied);
      const byPerson = await report(t.id, {}, ctx);
      expect(byPerson.record).toMatchObject({ userId: adminId, reportedByName: expect.any(String) });
      expect(byPerson.record.agentId).toBeUndefined();
      await expectCode(report("tsk-nope"), Code.NotFound);
    });
  });

  describe("ListUsageRecords", () => {
    it("pages a task's reports, newest first, with its totals", async () => {
      const t = await task();
      await report(t.id, { costMicros: 1n });
      await report(t.id, { costMicros: 2n }, agentCtx(undefined, agent2));
      const res = await handler.listUsageRecords({ taskId: t.id }, agentCtx(["tasks:read"]));
      expect(res.records.map((r: any) => r.reportedByName).sort()).toEqual(["Coder", "Reviewer"]);
      expect(res.totals.costMicros).toBe(3n);
      expect(res.page.totalCount).toBe(2);
      await expectCode(handler.listUsageRecords({ taskId: t.id }, agentCtx([])), Code.PermissionDenied);
    });

    it("goes with the task when it is purged", async () => {
      const t = await task();
      await report(t.id);
      await purgeTaskCascade(db, t.id);
      expect(await db.select().from(S.usageRecords)).toHaveLength(0);
    });
  });

  describe("GetUsageReport", () => {
    it("totals by agent, project and day over the window, and fills empty days", async () => {
      const beta = "proj2-us-" + stamp;
      await db.insert(S.projects).values({ id: beta, orgId, templateId: "tmpl-us-" + stamp, ownerId: adminId, name: "Beta", key: "BETA", createdAt: new Date() });
      const a = await task("a");
      const b = await task("b", beta);
      await report(a.id, { costMicros: 100n });
      await report(a.id, { costMicros: 300n }, agentCtx(undefined, agent2));
      await report(b.id, { costMicros: 50n });
      await report(b.id, { costMicros: 7n }, ctx);
      // One report from before the window, which must not count.
      const old = await report(a.id, { costMicros: 100000n });
      await db.update(S.usageRecords).set({ createdAt: new Date(Date.now() - 40 * 86_400_000) }).where(eq(S.usageRecords.id, old.record.id));

      const res = await reports.getUsageReport({ orgId, days: 7 }, ctx);
      expect(res.totals).toEqual({ inputTokens: 4000n, outputTokens: 800n, costMicros: 457n, reports: 4n });
      expect(res.byAgent.map((r: any) => [r.label, r.costMicros])).toEqual([["Reviewer", 300n], ["Coder", 150n], ["People", 7n]]);
      expect(res.byAgent.find((r: any) => r.label === "People").key).toBe("");
      expect(res.byProject.map((r: any) => [r.label, r.costMicros, r.reports])).toEqual([["Alpha", 400n, 2n], ["Beta", 57n, 2n]]);
      expect(res.byDay).toHaveLength(7);
      const today = new Date().toISOString().slice(0, 10);
      expect(res.byDay[6]).toMatchObject({ key: today, costMicros: 457n, reports: 4n });
      expect(res.byDay.slice(0, 6).every((d: any) => d.costMicros === 0n)).toBe(true);
      expect(res.since).toBe(usageWindowStart(new Date(), 7).toISOString());

      const wide = await reports.getUsageReport({ orgId, days: 60 }, ctx);
      expect(wide.totals.costMicros).toBe(100457n);

      const onlyBeta = await reports.getUsageReport({ projectId: beta }, ctx);
      expect(onlyBeta.totals.costMicros).toBe(57n);
      expect(onlyBeta.byDay).toHaveLength(30);
      expect(onlyBeta.byProject.map((r: any) => r.label)).toEqual(["Beta"]);
    });

    it("is for people who can read the dashboard, over 1-365 days", async () => {
      await expectCode(reports.getUsageReport({ orgId }, agentCtx()), Code.PermissionDenied);
      const outsider = "outsider-us-" + stamp;
      await db.insert(S.users).values({ id: outsider, name: "Out", createdAt: new Date() });
      await expectCode(reports.getUsageReport({ orgId }, makeAuthContext(outsider)), Code.PermissionDenied);
      await expectCode(reports.getUsageReport({ orgId, days: 366 }, ctx), Code.InvalidArgument);
      await expectCode(reports.getUsageReport({ orgId, days: -1 }, ctx), Code.InvalidArgument);
      await expectCode(reports.getUsageReport({}, ctx), Code.InvalidArgument, /orgId or projectId/);
      await expectCode(reports.getUsageReport({ projectId: "proj-nope" }, ctx), Code.NotFound);
      await expectCode(reports.getUsageReport({ orgId: "org-other", projectId }, ctx), Code.NotFound);
      const empty = await reports.getUsageReport({ orgId, days: 1 }, ctx);
      expect(empty.totals).toEqual({ inputTokens: 0n, outputTokens: 0n, costMicros: 0n, reports: 0n });
      expect(empty.byAgent).toEqual([]);
      expect(empty.byDay).toHaveLength(1);
    });
  });

  it("usageWindowStart is the UTC day `days - 1` before today", () => {
    expect(usageWindowStart(new Date("2026-10-02T23:59:00Z"), 1).toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(usageWindowStart(new Date("2026-10-02T00:00:01Z"), 3).toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });
});
