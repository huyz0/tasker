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

  describe("links and parents (M35-T03)", () => {
    const link = (taskId: string, linkedTaskId: string, kind = "blocked_by", c = ctx) =>
      handler.addTaskLink({ taskId, linkedTaskId, kind }, c);

    it("records blockers and origins, both directions, idempotently", async () => {
      const a = await task("a");
      const b = await task("b", { status: "done" });
      const origin = await task("origin");
      await link(a.id, b.id);
      await link(a.id, b.id); // idempotent
      await link(a.id, origin.id, "discovered_from");

      const forA = await handler.listTaskLinks({ taskId: a.id }, ctx);
      expect(forA.blockedBy.map((r: any) => [r.id, r.displayId, r.terminal])).toEqual([[b.id, b.displayId, true]]);
      expect(forA.discoveredFrom.id).toBe(origin.id);
      expect(forA.blocks).toEqual([]);
      const forB = await handler.listTaskLinks({ taskId: b.id }, ctx);
      expect(forB.blocks.map((r: any) => r.id)).toEqual([a.id]);
      expect((await handler.listTaskLinks({ taskId: origin.id }, ctx)).discovered.map((r: any) => r.id)).toEqual([a.id]);

      await handler.removeTaskLink({ taskId: a.id, linkedTaskId: b.id, kind: "blocked_by" }, ctx);
      await handler.removeTaskLink({ taskId: a.id, linkedTaskId: b.id, kind: "blocked_by" }, ctx); // idempotent
      expect((await handler.listTaskLinks({ taskId: a.id }, ctx)).blockedBy).toEqual([]);
    });

    it("refuses self links, other organizations, missing tasks, cycles and a second origin", async () => {
      const [a, b, c, d] = [await task("a"), await task("b"), await task("c"), await task("d")];
      await expectCode(link(a.id, a.id), Code.InvalidArgument, /itself/);
      await expectCode(link(a.id, "tsk-missing"), Code.InvalidArgument, /not found/);

      const otherOrg = "org-wg2-" + stamp;
      await seedOrgWithAdmin(db, { orgId: otherOrg, userId: "user-wg2-" + stamp, name: "Other" });
      await seedProject(db, { orgId: otherOrg, userId: "user-wg2-" + stamp, templateId: "tmpl-wg2-" + stamp, projectId: "proj-wg2-" + stamp, name: "Q" });
      const foreign = (await handler.createTask({ projectId: "proj-wg2-" + stamp, title: "f", status: "todo", description: "" }, makeAuthContext("user-wg2-" + stamp))).task;
      await expectCode(link(a.id, foreign.id), Code.InvalidArgument, /different organization/);

      // a <- b <- c: c blocking a would close the loop.
      await link(a.id, b.id);
      await link(b.id, c.id);
      await expectCode(link(c.id, a.id), Code.InvalidArgument, /block each other/);
      // An origin is not a dependency: no cycle rule, but only one per task.
      await link(c.id, a.id, "discovered_from");
      await expectCode(link(c.id, d.id, "discovered_from"), Code.FailedPrecondition, /already records/);
    });

    it("nests tasks within a project and refuses loops and other projects", async () => {
      const epic = await task("epic");
      const child = await task("child", { parentTaskId: epic.id });
      expect(child.parentTaskId).toBe(epic.id);
      const grandchild = await task("grandchild");
      await handler.updateTask({ taskId: grandchild.id, parentTaskId: child.id }, ctx);

      const forEpic = await handler.listTaskLinks({ taskId: epic.id }, ctx);
      expect(forEpic.children.map((r: any) => r.id)).toEqual([child.id]);
      expect((await handler.listTaskLinks({ taskId: child.id }, ctx)).parent.id).toBe(epic.id);

      await expectCode(handler.updateTask({ taskId: epic.id, parentTaskId: grandchild.id }, ctx), Code.InvalidArgument, /own subtasks/);
      await expectCode(handler.updateTask({ taskId: epic.id, parentTaskId: epic.id }, ctx), Code.InvalidArgument, /own parent/);

      const otherProject = "proj-wg3-" + stamp;
      await db.insert(schemaSqlite.projects).values({ id: otherProject, orgId, templateId: "tmpl-wg-" + stamp, ownerId: adminId, name: "P3", key: "PTHREE", createdAt: new Date() });
      const elsewhere = (await handler.createTask({ projectId: otherProject, title: "e", status: "todo", description: "" }, ctx)).task;
      await expectCode(handler.updateTask({ taskId: elsewhere.id, parentTaskId: epic.id }, ctx), Code.InvalidArgument, /different project/);

      // "" clears; unset leaves it.
      expect((await handler.updateTask({ taskId: child.id, title: "renamed" }, ctx)).task.parentTaskId).toBe(epic.id);
      expect((await handler.updateTask({ taskId: child.id, parentTaskId: "" }, ctx)).task.parentTaskId).toBeUndefined();
    });

    it("creates a task with its blockers and origin, or not at all", async () => {
      const blocker = await task("blocker");
      const origin = await task("origin");
      const created = await task("follow-up", { blockedBy: [blocker.id, blocker.id], discoveredFromTaskId: origin.id });
      expect(created.blockedByOpenCount).toBe(1);
      const links = await handler.listTaskLinks({ taskId: created.id }, ctx);
      expect(links.blockedBy.map((r: any) => r.id)).toEqual([blocker.id]);
      expect(links.discoveredFrom.id).toBe(origin.id);

      const before = (await handler.listTasks({ projectId }, ctx)).page.totalCount;
      await expectCode(task("bad", { blockedBy: [blocker.id, "tsk-missing"] }), Code.InvalidArgument);
      expect((await handler.listTasks({ projectId }, ctx)).page.totalCount).toBe(before);
    });

    it("lets an agent link work it breaks down, and purge removes a task's links", async () => {
      const [a, b] = [await task("a"), await task("b")];
      const child = await task("child", { parentTaskId: a.id });
      await link(b.id, a.id, "blocked_by", agentCtx());
      expect((await handler.listTaskLinks({ taskId: b.id }, agentCtx(undefined, ["tasks:read"]))).blockedBy).toHaveLength(1);
      await expectCode(link(a.id, b.id, "discovered_from", agentCtx(undefined, ["tasks:read"])), Code.PermissionDenied);

      await handler.deleteTask({ taskId: a.id }, ctx);
      await handler.purgeTask({ taskId: a.id }, ctx);
      expect((await handler.listTaskLinks({ taskId: b.id }, ctx)).blockedBy).toEqual([]);
      expect((await handler.getTask({ taskId: child.id }, ctx)).task.parentTaskId).toBeUndefined();
      expect(await db.select().from(schemaSqlite.taskLinks)).toEqual([]);
    });
  });
});

/** Zod errors reach callers through an interceptor; handlers called directly throw them raw. */
function toConnect(e: any) {
  return e?.name === "ZodError" ? Object.assign(new Error(e.message), { code: Code.InvalidArgument }) : e;
}
