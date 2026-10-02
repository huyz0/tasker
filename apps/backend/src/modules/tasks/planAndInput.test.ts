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

  function agentCtx(scopes = ["tasks:read", "tasks:write"]) {
    const v = createContextValues();
    v.set(currentPrincipalKey, { kind: "agent", agentId, orgId, tokenId: "tok-" + agentId, scopes });
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
});
