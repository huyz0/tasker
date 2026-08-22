import { describe, it, expect, beforeEach } from "bun:test";
import { createContextValues, Code } from "@connectrpc/connect";
import { and, eq, isNull, sql } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import { currentPrincipalKey } from "../auth/session";
import { createTaskManagementHandler, createTasksHandler } from "../tasks/tasks.handler";
import { createCommentsHandler } from "../comments/comments.handler";
import createReportsHandler from "./reports.handler";

function captureServiceImpl(db: any) {
  let impl: any;
  const fakeRouter = { service: (_d: any, i: any) => { impl = i; return fakeRouter; } };
  createReportsHandler(fakeRouter as any, db);
  return impl;
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Midnight UTC of today - every fixture pins rows relative to it. */
const todayStart = () => {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
};
/** Noon UTC, k days ago (+/- a few hours stays inside the same UTC day). */
const dayNoon = (k: number, hourOffset = 0) => new Date(todayStart() - k * DAY + (12 + hourOffset) * HOUR);
/** The YYYY-MM-DD bucket k days ago. */
const dstr = (k: number) => new Date(todayStart() - k * DAY).toISOString().slice(0, 10);

/**
 * M24-T06. Same harness discipline as reports.test.ts: every activity row is
 * produced by the REAL mutation handlers; the only direct writes are aging
 * (UPDATE occurred_at / created_at), deleting rows to simulate pre-collection
 * history, and one deliberately hand-inserted backfill-shaped row (that shape
 * is exactly what the T03 backfill writes outside any handler).
 */
describe("Reports Handler - getReportTrends", () => {
  let db: any, impl: any, ctx: any;
  let taskMgmt: any, taskTypesApi: any, comments: any;
  let orgId: string, projectId: string, userId: string;
  let agentA: string, agentB: string, roleId: string;

  const agentCtx = (aId: string) => {
    const values = createContextValues();
    values.set(currentPrincipalKey, {
      kind: "agent", agentId: aId, orgId, tokenId: `tok-${aId}`,
      scopes: ["tasks:read", "tasks:write", "comments:write"],
    });
    return { values } as any;
  };

  beforeEach(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    impl = captureServiceImpl(db);
    taskMgmt = createTaskManagementHandler(db, null);
    taskTypesApi = createTasksHandler(db, null);
    comments = createCommentsHandler(db, null);

    const stamp = crypto.randomUUID();
    orgId = `org-${stamp}`;
    projectId = `proj-${stamp}`;
    userId = `user-${stamp}`;
    agentA = `agt-a-${stamp}`;
    agentB = `agt-b-${stamp}`;
    roleId = `role-${stamp}`;
    const templateId = `tmpl-${stamp}`;
    const now = new Date();

    await db.insert(schema.organizations).values({ id: orgId, name: "Org", slug: orgId, createdAt: now });
    await db.insert(schema.users).values({ id: userId, email: `${userId}@test.local`, name: "Uma", createdAt: now });
    await db.insert(schema.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: now });
    await db.insert(schema.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: now });
    await db.insert(schema.projects).values({ id: projectId, orgId, templateId, name: "P", key: "P", ownerId: userId, createdAt: now });
    await db.insert(schema.agentRoles).values({ id: roleId, orgId, name: "Builder", systemPrompt: "s", capabilities: "[]", createdAt: now });
    await db.insert(schema.agents).values([
      { id: agentA, orgId, agentRoleId: roleId, name: "Scout", createdAt: now },
      { id: agentB, orgId, agentRoleId: roleId, name: "Ranger", createdAt: now },
    ]);

    ctx = makeAuthContext(userId);
  });

  // ── fixture helpers ─────────────────────────────────────────────────────

  const newTask = async (title = "T", extra: Record<string, unknown> = {}): Promise<string> =>
    (await taskMgmt.createTask({ projectId, title, ...extra }, ctx)).task.id;

  const claim = (taskId: string, aId: string) => taskMgmt.claimTask({ taskId }, agentCtx(aId));

  /** Pins a task's activity rows (optionally one kind's) to an exact instant. */
  const pinActivity = async (taskId: string, at: Date, kind?: string) => {
    const where = kind
      ? and(eq(schema.taskActivity.taskId, taskId), eq(schema.taskActivity.kind, kind))
      : eq(schema.taskActivity.taskId, taskId);
    await db.update(schema.taskActivity).set({ occurredAt: at }).where(where);
  };

  /** Pins the creation moment: the task's createdAt AND its 'created' row. */
  const pinCreated = async (taskId: string, at: Date) => {
    await db.update(schema.tasks).set({ createdAt: at }).where(eq(schema.tasks.id, taskId));
    await pinActivity(taskId, at, "created");
  };

  /** A real status change, pinned to an instant (unique per task+status). */
  const setStatusAt = async (taskId: string, status: string, at: Date, asCtx: any = ctx) => {
    await taskMgmt.updateTaskStatus({ taskId, status }, asCtx);
    await db.update(schema.taskActivity).set({ occurredAt: at }).where(and(
      eq(schema.taskActivity.taskId, taskId),
      eq(schema.taskActivity.kind, "status_changed"),
      eq(schema.taskActivity.toStatus, status),
    ));
  };

  const trends = (windowDays = 90, extra: Record<string, unknown> = {}, asCtx: any = ctx, pid: string = projectId) =>
    impl.getReportTrends({ projectId: pid, windowDays, ...extra }, asCtx);

  const band = (res: any, status: string) => res.cfdBands.find((b: any) => b.status === status);
  const countOn = (b: any, date: string): number => {
    const point = b.counts.find((c: any) => c.date === date);
    expect(point).toBeDefined();
    return Number(point.count);
  };
  const rateOn = (series: any[], date: string) => {
    const point = series.find((p: any) => p.date === date);
    expect(point).toBeDefined();
    return { rate: point.rate, sampleSize: Number(point.sampleSize) };
  };

  // ── authorization & validation (mirrors the T05 suite) ──────────────────

  describe("authorization and validation", () => {
    it("refuses an agent principal structurally, before anything else", async () => {
      await expect(impl.getReportTrends({}, agentCtx(agentA)))
        .rejects.toMatchObject({ code: Code.PermissionDenied });
    });

    it("refuses a user from another organization", async () => {
      const outsider = `user-out-${crypto.randomUUID()}`;
      const otherOrg = `org-out-${crypto.randomUUID()}`;
      await db.insert(schema.organizations).values({ id: otherOrg, name: "O2", slug: otherOrg, createdAt: new Date() });
      await db.insert(schema.users).values({ id: outsider, email: `${outsider}@test.local`, createdAt: new Date() });
      await db.insert(schema.organizationMembers).values({ orgId: otherOrg, userId: outsider, role: "admin", joinedAt: new Date() });

      await expect(trends(7, {}, makeAuthContext(outsider)))
        .rejects.toMatchObject({ code: Code.PermissionDenied });
    });

    it("reports unknown/archived projects and unknown task types as not found", async () => {
      await expect(trends(7, {}, ctx, "proj-nonexistent")).rejects.toMatchObject({ code: Code.NotFound });

      await expect(trends(7, { taskTypeId: "tt-nonexistent" })).rejects.toMatchObject({ code: Code.NotFound });

      await db.update(schema.projects).set({ deletedAt: new Date() }).where(eq(schema.projects.id, projectId));
      await expect(trends(7)).rejects.toMatchObject({ code: Code.NotFound });
    });

    it("rejects a windowDays outside 7|30|90 and a missing projectId", async () => {
      await expect(trends(14)).rejects.toMatchObject({ code: Code.InvalidArgument });
      await expect(trends(0)).rejects.toMatchObject({ code: Code.InvalidArgument });
      await expect(impl.getReportTrends({ projectId: "", windowDays: 7 }, ctx))
        .rejects.toMatchObject({ code: Code.InvalidArgument });
    });
  });

  // ── empty project ───────────────────────────────────────────────────────

  it("an empty project answers honestly: collection starts today, no series", async () => {
    const res = await trends(30);
    expect(res.collectedSince).toBe(dstr(0));
    expect(res.createdCumulative).toEqual([]);
    expect(res.completedCumulative).toEqual([]);
    expect(res.autonomyRate).toEqual([]);
    expect(res.reworkRate).toEqual([]);
    expect(res.cfdBands).toEqual([]);
    expect(res.recentCompletions).toEqual([]);
    expect(res.cfdTaskTypeId).toBe("untyped");
    expect(res.taskTypeOptions).toEqual([]);
  });

  // ── CFD ─────────────────────────────────────────────────────────────────

  describe("cfdBands", () => {
    it("balances: replayed history's final stack equals live per-status counts, archives leave the stack (exit criterion)", async () => {
      // t1: created d6 (todo) → in-progress d4 → done d2.
      const t1 = await newTask("t1");
      await pinCreated(t1, dayNoon(6));
      await setStatusAt(t1, "in-progress", dayNoon(4), agentCtx(agentA));
      await setStatusAt(t1, "done", dayNoon(2), agentCtx(agentA));
      // t2: created d5, archived d2 - must leave the stack on its archive day.
      const t2 = await newTask("t2");
      await pinCreated(t2, dayNoon(5));
      await taskMgmt.deleteTask({ taskId: t2 }, ctx);
      await pinActivity(t2, dayNoon(2), "archived");
      // t3: created d5 → done d3 → archived d2 → restored d1: leaves, re-enters.
      const t3 = await newTask("t3");
      await pinCreated(t3, dayNoon(5));
      await setStatusAt(t3, "done", dayNoon(3));
      await taskMgmt.deleteTask({ taskId: t3 }, ctx);
      await pinActivity(t3, dayNoon(2), "archived");
      await taskMgmt.restoreTask({ taskId: t3 }, ctx);
      await pinActivity(t3, dayNoon(1), "restored");
      // t4: created d3, archived, purged - purge deletes its whole history, so
      // it appears on NO day, past days included (accepted, stated in ADR-0020).
      const t4 = await newTask("t4");
      await pinCreated(t4, dayNoon(3));
      await taskMgmt.deleteTask({ taskId: t4 }, ctx);
      await taskMgmt.purgeTask({ taskId: t4 }, ctx);

      const res = await trends(90);
      expect(res.collectedSince).toBe(dstr(6));

      // The exit criterion: final-day stack == a live GROUP BY of current
      // non-deleted task statuses in the scope.
      const live = await db
        .select({ status: schema.tasks.status, n: sql<number>`count(*)` })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.projectId, projectId), isNull(schema.tasks.deletedAt)))
        .groupBy(schema.tasks.status);
      expect(live.length).toBeGreaterThan(0);
      for (const row of live) {
        expect(countOn(band(res, row.status), dstr(0))).toBe(Number(row.n));
      }
      const liveByStatus = new Map(live.map((r: any) => [r.status, Number(r.n)]));
      for (const b of res.cfdBands) {
        expect(countOn(b, dstr(0))).toBe(liveByStatus.get(b.status) ?? 0);
      }

      // The intermediate days follow the replay: d5 has all three alive...
      expect(countOn(band(res, "todo"), dstr(5))).toBe(3);
      // ...d3: t3 completed, t4's history purged away, t1 mid-flight.
      expect(countOn(band(res, "todo"), dstr(3))).toBe(1);
      expect(countOn(band(res, "in-progress"), dstr(3))).toBe(1);
      expect(countOn(band(res, "done"), dstr(3))).toBe(1);
      // ...d2, the archive day: t2 left todo, t3 left done, t1 arrived in done.
      expect(countOn(band(res, "todo"), dstr(2))).toBe(0);
      expect(countOn(band(res, "done"), dstr(2))).toBe(1);
      // ...d1: t3 restored back into done.
      expect(countOn(band(res, "done"), dstr(1))).toBe(2);

      // Untyped scope: the fixed vocabulary, in pipeline order, done terminal.
      expect(res.cfdBands.map((b: any) => b.status)).toEqual(["todo", "in-progress", "done"]);
      expect(res.cfdBands.map((b: any) => b.isTerminal)).toEqual([false, false, true]);
      expect(res.cfdTaskTypeId).toBe("untyped");
    });

    it("carries pre-window activity in as the first day's baseline", async () => {
      const t = await newTask("old");
      await pinCreated(t, dayNoon(10));

      const res = await trends(7);
      expect(res.collectedSince).toBe(dstr(10));
      const todo = band(res, "todo");
      // The axis starts at the window, not at collection start...
      expect(todo.counts[0].date).toBe(dstr(7));
      expect(todo.counts).toHaveLength(8);
      // ...and the pre-window prefix is the day-0 level, carried through
      // no-activity days to today.
      expect(Number(todo.counts[0].count)).toBe(1);
      expect(countOn(todo, dstr(0))).toBe(1);
    });

    it("a backfill-shaped created row (current status, system actor) lands in its band", async () => {
      // Exactly what the T03 backfill writes: one created row carrying the
      // task's CURRENT status, actor system, no assignee - inserted directly
      // because no handler produces it.
      const id = `tsk-backfill-${crypto.randomUUID()}`;
      await db.insert(schema.tasks).values({
        id, projectId, displayId: "P-999", title: "pre-existing", status: "in-progress", createdAt: dayNoon(3),
      });
      await db.insert(schema.taskActivity).values({
        id: `act-backfill-${crypto.randomUUID()}`, taskId: id, projectId, kind: "created",
        toStatus: "in-progress", toIsTerminal: false, actorType: "system", actorId: null, occurredAt: dayNoon(3),
      });

      const res = await trends(7);
      expect(countOn(band(res, "in-progress"), dstr(3))).toBe(1);
      expect(countOn(band(res, "in-progress"), dstr(0))).toBe(1);
      expect(countOn(band(res, "todo"), dstr(0))).toBe(0);
    });
  });

  // ── task-type scoping ───────────────────────────────────────────────────

  describe("task-type scoping", () => {
    let featureType: string, bugType: string;

    beforeEach(async () => {
      featureType = (await taskTypesApi.createTaskType({ orgId, name: "Feature" }, ctx)).taskType.id;
      for (const name of ["backlog", "doing", "shipped"]) {
        await taskTypesApi.createTaskStatus({ taskTypeId: featureType, name }, ctx);
      }
      // bugType configures no statuses: it falls back to the fixed vocabulary,
      // exactly like validateStatusForTaskType/isTerminalStatus do.
      bugType = (await taskTypesApi.createTaskType({ orgId, name: "Bug" }, ctx)).taskType.id;

      await newTask("f1", { taskTypeId: featureType, status: "backlog" });
      await newTask("f2", { taskTypeId: featureType, status: "shipped" });
      await newTask("b1", { taskTypeId: bugType });
      await newTask("u1");
      await newTask("u2", { status: "done" });
    });

    it("defaults to the most-used type, with its statuses in position order and zero bands kept", async () => {
      const res = await trends(90);
      expect(res.cfdTaskTypeId).toBe(featureType);
      // 'doing' never appears in activity but is configured: a zero band keeps
      // the chart shape stable. 'shipped' holds the max position: terminal.
      expect(res.cfdBands.map((b: any) => b.status)).toEqual(["backlog", "doing", "shipped"]);
      expect(res.cfdBands.map((b: any) => b.isTerminal)).toEqual([false, false, true]);
      expect(countOn(band(res, "backlog"), dstr(0))).toBe(1);
      expect(countOn(band(res, "doing"), dstr(0))).toBe(0);
      expect(countOn(band(res, "shipped"), dstr(0))).toBe(1);
    });

    it("scopes to an explicit type and to the untyped scope", async () => {
      const bugRes = await trends(90, { taskTypeId: bugType });
      expect(bugRes.cfdTaskTypeId).toBe(bugType);
      expect(bugRes.cfdBands.map((b: any) => b.status)).toEqual(["todo", "in-progress", "done"]);
      expect(countOn(band(bugRes, "todo"), dstr(0))).toBe(1);
      expect(countOn(band(bugRes, "done"), dstr(0))).toBe(0);

      const untypedRes = await trends(90, { taskTypeId: "untyped" });
      expect(untypedRes.cfdTaskTypeId).toBe("untyped");
      expect(countOn(band(untypedRes, "todo"), dstr(0))).toBe(1);
      expect(countOn(band(untypedRes, "done"), dstr(0))).toBe(1);
    });

    it("lists every type in use plus the untyped option, with counts", async () => {
      const res = await trends(90);
      const byId = new Map(res.taskTypeOptions.map((o: any) => [o.id, o]));
      expect(res.taskTypeOptions).toHaveLength(3);
      expect((byId.get(featureType) as any).name).toBe("Feature");
      expect(Number((byId.get(featureType) as any).taskCount)).toBe(2);
      expect(Number((byId.get(bugType) as any).taskCount)).toBe(1);
      expect((byId.get("untyped") as any).name).toBe("Untyped");
      expect(Number((byId.get("untyped") as any).taskCount)).toBe(2);
    });

    it("keeps a status that left the config: after the configured ones, never terminal", async () => {
      const f3 = await newTask("f3", { taskTypeId: featureType, status: "backlog" });
      await setStatusAt(f3, "doing", dayNoon(1));
      // The admin deletes 'backlog' from the type's config: history still
      // mentions it, so the band survives - after the configured ones.
      await db.delete(schema.taskStatuses).where(and(
        eq(schema.taskStatuses.taskTypeId, featureType), eq(schema.taskStatuses.name, "backlog"),
      ));

      const res = await trends(90);
      expect(res.cfdBands.map((b: any) => b.status)).toEqual(["doing", "shipped", "backlog"]);
      expect(band(res, "backlog").isTerminal).toBe(false);
      expect(countOn(band(res, "backlog"), dstr(0))).toBe(1); // f1 still sits there
      expect(countOn(band(res, "doing"), dstr(0))).toBe(1);
    });
  });

  // ── created vs completed ────────────────────────────────────────────────

  describe("createdCumulative / completedCumulative", () => {
    it("created spans pre-collection days from the tasks table; completed only from collection", async () => {
      // tA predates activity collection entirely: its created row is deleted
      // (the pre-collection idiom) and its createdAt backdated past the window.
      const tA = await newTask("pre-collection");
      await db.delete(schema.taskActivity).where(eq(schema.taskActivity.taskId, tA));
      await db.update(schema.tasks).set({ createdAt: dayNoon(10) }).where(eq(schema.tasks.id, tA));

      const tB = await newTask("collected");
      await pinCreated(tB, dayNoon(2));
      await claim(tB, agentA);
      await pinActivity(tB, dayNoon(2, 1), "claimed");
      await setStatusAt(tB, "done", dayNoon(1), agentCtx(agentA));

      const res = await trends(7);
      // Collection started with tB's row - tA's creation predates it.
      expect(res.collectedSince).toBe(dstr(2));

      // created: honest across the whole window (from tasks.createdAt), so
      // tA is already in the baseline the window opens with.
      expect(res.createdCumulative).toHaveLength(8);
      expect(res.createdCumulative[0].date).toBe(dstr(7));
      expect(Number(res.createdCumulative[0].count)).toBe(1);
      expect(Number(res.createdCumulative.find((c: any) => c.date === dstr(2)).count)).toBe(2);
      expect(Number(res.createdCumulative[7].count)).toBe(2);

      // completed: only what collection recorded.
      expect(res.completedCumulative).toHaveLength(8);
      expect(Number(res.completedCumulative.find((c: any) => c.date === dstr(2)).count)).toBe(0);
      expect(Number(res.completedCumulative.find((c: any) => c.date === dstr(1)).count)).toBe(1);
      expect(Number(res.completedCumulative[7].count)).toBe(1);

      // Cumulative series are monotone by construction - assert it anyway.
      for (const series of [res.createdCumulative, res.completedCumulative]) {
        for (let i = 1; i < series.length; i++) {
          expect(Number(series[i].count)).toBeGreaterThanOrEqual(Number(series[i - 1].count));
        }
      }
    });

    it("a task created directly into a terminal status counts as a completion", async () => {
      const t = await newTask("imported done", { status: "done" });

      const res = await trends(7);
      expect(Number(res.completedCumulative[res.completedCumulative.length - 1].count)).toBe(1);
      expect(res.recentCompletions).toHaveLength(1);
      expect(res.recentCompletions[0].taskId).toBe(t);
      expect(res.recentCompletions[0].byAgent).toBe(false); // created by the user, no assignee
    });

    it("recentCompletions lists newest first with assignee attribution, skipping archived tasks", async () => {
      const byAgent = await newTask("agent-held");
      await claim(byAgent, agentA);
      await pinActivity(byAgent, dayNoon(2), "created");
      await pinActivity(byAgent, dayNoon(2, 1), "claimed");
      await setStatusAt(byAgent, "done", dayNoon(1), ctx); // human clicks, agent holds

      const byHuman = await newTask("human-done");
      await pinActivity(byHuman, dayNoon(2), "created");
      await setStatusAt(byHuman, "done", dayNoon(0, -2));

      const archived = await newTask("archived-done");
      await pinActivity(archived, dayNoon(2), "created");
      await setStatusAt(archived, "done", dayNoon(1, 1));
      await taskMgmt.deleteTask({ taskId: archived }, ctx);

      const res = await trends(7);
      expect(res.recentCompletions.map((r: any) => r.taskId)).toEqual([byHuman, byAgent]);
      expect(res.recentCompletions[0].byAgent).toBe(false);
      expect(res.recentCompletions[1].byAgent).toBe(true); // assignee-at-event, not the clicker
      expect(res.recentCompletions[1].completedAt).toBe(dayNoon(1).toISOString());
    });
  });

  // ── autonomy & rework rates ─────────────────────────────────────────────

  describe("autonomyRate / reworkRate", () => {
    it("autonomy: of a day's completions, the fraction finished by an untouched agent", async () => {
      const solo = await newTask("autonomous");
      await pinCreated(solo, dayNoon(0, -4));
      await claim(solo, agentA);
      await pinActivity(solo, dayNoon(0, -3), "claimed");
      await setStatusAt(solo, "done", dayNoon(0), agentCtx(agentA));

      const helped = await newTask("human-touched");
      await pinCreated(helped, dayNoon(0, -4));
      await claim(helped, agentA);
      await pinActivity(helped, dayNoon(0, -3), "claimed");
      await comments.createComment({ entityId: helped, entityType: "task", content: "try X" }, ctx);
      await pinActivity(helped, dayNoon(0, -2), "comment");
      await setStatusAt(helped, "done", dayNoon(0, -1), agentCtx(agentA));

      const res = await trends(7);
      expect(rateOn(res.autonomyRate, dstr(0))).toEqual({ rate: 0.5, sampleSize: 2 });
      // A day with no completions is an honest zero, not a hole in the axis.
      expect(rateOn(res.autonomyRate, dstr(3))).toEqual({ rate: 0, sampleSize: 0 });
      expect(res.autonomyRate).toHaveLength(8);
    });

    it("rework: a later reopening flips the completion day's rate", async () => {
      const t = await newTask("undone later");
      await pinCreated(t, dayNoon(2));
      await claim(t, agentA);
      await pinActivity(t, dayNoon(2, 1), "claimed");
      await setStatusAt(t, "done", dayNoon(1), agentCtx(agentA));
      await setStatusAt(t, "todo", dayNoon(0), ctx); // the human reopens it today

      const res = await trends(7);
      // The rework charge lands on the COMPLETION's day, not the reopening's.
      expect(rateOn(res.reworkRate, dstr(1))).toEqual({ rate: 1, sampleSize: 1 });
      expect(rateOn(res.reworkRate, dstr(0))).toEqual({ rate: 0, sampleSize: 0 });
      // The completion itself was autonomous - the reopening came after.
      expect(rateOn(res.autonomyRate, dstr(1))).toEqual({ rate: 1, sampleSize: 1 });
      expect(res.reworkRate).toHaveLength(8);
    });
  });
});
