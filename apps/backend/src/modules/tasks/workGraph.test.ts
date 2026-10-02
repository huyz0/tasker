import { describe, it, expect, beforeEach } from "bun:test";
import { Code, createContextValues } from "@connectrpc/connect";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { currentPrincipalKey } from "../auth/session";
import { createTaskManagementHandler } from "./tasks.handler";

/**
 * M35 (ADR-0028) - the work graph: priority, blockers, parents, origins, and
 * what they mean for the work an agent is handed.
 */
describe("work graph (M35)", () => {
  let db: any, nc: any, handler: any;
  let orgId: string, adminId: string, projectId: string, stamp: string;
  let ctx: any;

  function agentCtx(agentId = "agent-wg-" + stamp, scopes = ["tasks:read", "tasks:write"]) {
    const v = createContextValues();
    v.set(currentPrincipalKey, { kind: "agent", agentId, orgId, tokenId: "tok-" + agentId, scopes });
    return { values: v } as any;
  }

  beforeEach(async () => {
    ({ db, nc } = await setupIntegrationTest());
    stamp = Date.now() + "-" + Math.random().toString(36).slice(2);
    orgId = "org-wg-" + stamp;
    adminId = "user-wg-" + stamp;
    projectId = "proj-wg-" + stamp;
    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "WG Org" });
    await seedProject(db, { orgId, userId: adminId, templateId: "tmpl-wg-" + stamp, projectId, name: "P" });
    await db.insert(schemaSqlite.agentRoles).values({ id: "role-wg-" + stamp, orgId, name: "R", systemPrompt: "p", capabilities: "[]" });
    for (const i of ["", "-2"]) {
      await db.insert(schemaSqlite.agents).values({ id: "agent-wg-" + stamp + i, orgId, agentRoleId: "role-wg-" + stamp, name: "A" + i });
    }
    ctx = makeAuthContext(adminId);
    handler = createTaskManagementHandler(db, nc);
  });

  async function task(title: string, extra: Record<string, unknown> = {}) {
    return (await handler.createTask({ projectId, title, status: "todo", description: "", ...extra }, ctx)).task;
  }

  async function expectCode(p: Promise<unknown>, code: Code, message?: RegExp) {
    const err: any = await p.then(() => null, (e) => e);
    expect(err?.code).toBe(code);
    if (message) expect(err.message).toMatch(message);
  }

  describe("priority (M35-T02)", () => {
    it("defaults to none, is set on create and update, and is returned everywhere", async () => {
      const plain = await task("plain");
      expect(plain.priority).toBe(0);
      const urgent = await task("urgent", { priority: 1 });
      expect(urgent.priority).toBe(1);

      const updated = (await handler.updateTask({ taskId: plain.id, priority: 3 }, ctx)).task;
      expect(updated.priority).toBe(3);
      expect((await handler.getTask({ taskId: plain.id }, ctx)).task.priority).toBe(3);
      // 0 is a real value on update (proto3 optional), not "unset".
      expect((await handler.updateTask({ taskId: plain.id, priority: 0 }, ctx)).task.priority).toBe(0);
      expect((await handler.updateTask({ taskId: plain.id, title: "renamed" }, ctx)).task.priority).toBe(0);
    });

    it("refuses a priority outside 0-4", async () => {
      await expectCode(handler.createTask({ projectId, title: "x", status: "todo", description: "", priority: 5 }, ctx).catch((e: any) => { throw toConnect(e); }), Code.InvalidArgument);
    });

    it("filters by priority and sorts most important first, none last, across pages", async () => {
      const made: Record<string, number> = {};
      for (const [title, p] of [["n", 0], ["m", 3], ["u1", 1], ["l", 4], ["h", 2], ["u2", 1]] as const) {
        made[(await task(title, { priority: p })).id] = p;
      }
      const urgent = await handler.listTasks({ projectId, priority: 1 }, ctx);
      expect(urgent.tasks.map((t: any) => t.title).sort()).toEqual(["u1", "u2"]);
      expect(urgent.page.totalCount).toBe(2);

      const seen: number[] = [];
      let cursor: string | undefined;
      do {
        const res = await handler.listTasks({ projectId, page: { limit: 2, sort: "priority:asc", cursor } }, ctx);
        for (const t of res.tasks) {
          expect(t).not.toHaveProperty("priorityRank");
          seen.push(t.priority);
        }
        cursor = res.page.nextCursor;
      } while (cursor);
      expect(seen).toEqual([1, 1, 2, 3, 4, 0]);
    });
  });
});

/** Zod errors reach callers through an interceptor; handlers called directly throw them raw. */
function toConnect(e: any) {
  return e?.name === "ZodError" ? Object.assign(new Error(e.message), { code: Code.InvalidArgument }) : e;
}
