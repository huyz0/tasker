import { describe, it, expect, beforeEach } from "bun:test";
import { createContextValues, Code } from "@connectrpc/connect";
import { and, eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import { currentPrincipalKey } from "../auth/session";
import { createTaskManagementHandler } from "../tasks/tasks.handler";
import { createTaskNotesHandler } from "../tasks/task_notes.handler";
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
const ago = (ms: number) => new Date(Date.now() - ms);

/**
 * M24-T05. Every fixture that produces `task_activity` rows is driven through
 * the REAL mutation handlers (create/claim/assign/unassign/status/note/
 * comment), so the rows carry exactly the columns the writers stamp - the
 * tests never invent an activity shape by hand. The only direct manipulation
 * allowed is *aging* real rows (UPDATE occurred_at) and *deleting* rows to
 * simulate pre-collection history, both of which change when/whether a real
 * event exists, not what one looks like.
 */
describe("Reports Handler - getReportExceptions", () => {
  let db: any, impl: any, ctx: any;
  let taskMgmt: any, notes: any, comments: any;
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
    notes = createTaskNotesHandler(db, null);
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

  // ── fixture helpers (all through real handlers) ─────────────────────────

  const newTask = async (title = "T"): Promise<string> =>
    (await taskMgmt.createTask({ projectId, title }, ctx)).task.id;

  const claim = (taskId: string, aId: string) => taskMgmt.claimTask({ taskId }, agentCtx(aId));

  const setStatus = (taskId: string, status: string, asCtx: any = ctx) =>
    taskMgmt.updateTaskStatus({ taskId, status }, asCtx);

  const handoff = (taskId: string, aId: string, content = "over to you") =>
    notes.createTaskNote({ taskId, content, noteType: "handoff" }, agentCtx(aId));

  /** Ages real activity rows: all of a task's, or only one kind's. */
  const ageActivity = async (taskId: string, ageMs: number, kind?: string) => {
    const where = kind
      ? and(eq(schema.taskActivity.taskId, taskId), eq(schema.taskActivity.kind, kind))
      : eq(schema.taskActivity.taskId, taskId);
    await db.update(schema.taskActivity).set({ occurredAt: ago(ageMs) }).where(where);
  };

  const backdateTask = (taskId: string, ageMs: number) =>
    db.update(schema.tasks).set({ createdAt: ago(ageMs) }).where(eq(schema.tasks.id, taskId));

  /** Simulates a purged agent: the FK-free activity text goes dangling. */
  const purgeAgent = async (aId: string) => {
    await db.delete(schema.taskAssignments).where(eq(schema.taskAssignments.agentId, aId));
    await db.delete(schema.agents).where(eq(schema.agents.id, aId));
  };

  const report = (windowDays = 7, asCtx: any = ctx, pid: string = projectId) =>
    impl.getReportExceptions({ projectId: pid, windowDays }, asCtx);

  // ── authorization & validation ──────────────────────────────────────────

  describe("authorization and validation", () => {
    it("refuses an agent principal on both methods, before anything else", async () => {
      // Minimal requests, like the sweep sends: the denial must be structural
      // (requireUser first), not dependent on a resolvable project.
      await expect(impl.getReportExceptions({}, agentCtx(agentA)))
        .rejects.toMatchObject({ code: Code.PermissionDenied });
      await expect(impl.getReportTrends({}, agentCtx(agentA)))
        .rejects.toMatchObject({ code: Code.PermissionDenied });
    });

    it("refuses a user from another organization", async () => {
      const outsider = `user-out-${crypto.randomUUID()}`;
      const otherOrg = `org-out-${crypto.randomUUID()}`;
      await db.insert(schema.organizations).values({ id: otherOrg, name: "O2", slug: otherOrg, createdAt: new Date() });
      await db.insert(schema.users).values({ id: outsider, email: `${outsider}@test.local`, createdAt: new Date() });
      await db.insert(schema.organizationMembers).values({ orgId: otherOrg, userId: outsider, role: "admin", joinedAt: new Date() });

      await expect(report(7, makeAuthContext(outsider)))
        .rejects.toMatchObject({ code: Code.PermissionDenied });
    });

    it("reports an unknown or archived project as not found", async () => {
      await expect(report(7, ctx, "proj-nonexistent")).rejects.toMatchObject({ code: Code.NotFound });

      await db.update(schema.projects).set({ deletedAt: new Date() }).where(eq(schema.projects.id, projectId));
      await expect(report(7)).rejects.toMatchObject({ code: Code.NotFound });
    });

    it("rejects a windowDays outside 7|30|90 and a missing projectId", async () => {
      await expect(report(14)).rejects.toMatchObject({ code: Code.InvalidArgument });
      // Proto3 int32 default: an omitted windowDays arrives as 0.
      await expect(report(0)).rejects.toMatchObject({ code: Code.InvalidArgument });
      await expect(impl.getReportExceptions({ projectId: "", windowDays: 7 }, ctx))
        .rejects.toMatchObject({ code: Code.InvalidArgument });
    });

    // getReportTrends' own authz/validation mirror lives in trends.test.ts
    // (M24-T06); the agent-refusal test above still covers both methods.
  });

  // ── stalled claims ──────────────────────────────────────────────────────

  describe("stalledClaims", () => {
    it("surfaces a claim silent past the threshold as never-started, with liveness", async () => {
      const lastUsed = ago(2 * HOUR);
      await db.insert(schema.apiTokens).values({
        id: `tok-${crypto.randomUUID()}`, orgId, agentId: agentA, name: "t", tokenPrefix: "tk",
        tokenHash: `h-${crypto.randomUUID()}`, scopes: "[]", createdBy: userId, createdAt: new Date(),
        expiresAt: new Date(Date.now() + DAY), lastUsedAt: lastUsed,
      });
      const t = await newTask("Silent claim");
      await claim(t, agentA);
      await ageActivity(t, 30 * HOUR);

      const res = await report();
      expect(res.stalledClaims).toHaveLength(1);
      const row = res.stalledClaims[0];
      expect(row.taskId).toBe(t);
      expect(row.agentId).toBe(agentA);
      expect(row.agentName).toBe("Scout");
      expect(row.neverStarted).toBe(true);
      expect(row.claimedAt).toBeDefined();
      // Second resolution: sqlite timestamp columns store seconds.
      expect(Math.floor(new Date(row.agentLastSeenAt).getTime() / 1000))
        .toBe(Math.floor(lastUsed.getTime() / 1000));
    });

    it("a fresh signal - even a human comment - keeps a task off the list", async () => {
      const quietButNoted = await newTask("noted");
      await claim(quietButNoted, agentA);
      await ageActivity(quietButNoted, 30 * HOUR);
      await notes.createTaskNote({ taskId: quietButNoted, content: "working" }, agentCtx(agentA));

      const humanTouched = await newTask("commented");
      await claim(humanTouched, agentA);
      await ageActivity(humanTouched, 30 * HOUR);
      await comments.createComment({ entityId: humanTouched, entityType: "task", content: "any news?" }, ctx);

      const res = await report();
      expect(res.stalledClaims).toHaveLength(0);
    });

    it("a claim that went quiet after working is stalled but not never-started", async () => {
      const t = await newTask("went quiet");
      await claim(t, agentA);
      await notes.createTaskNote({ taskId: t, content: "progress" }, agentCtx(agentA));
      await ageActivity(t, 30 * HOUR);
      await ageActivity(t, 26 * HOUR, "note");

      const res = await report();
      expect(res.stalledClaims).toHaveLength(1);
      expect(res.stalledClaims[0].neverStarted).toBe(false);
      expect(Math.abs(new Date(res.stalledClaims[0].lastSignalAt).getTime() - ago(26 * HOUR).getTime()))
        .toBeLessThan(5000);
    });

    it("excludes terminal, unassigned and human-held tasks", async () => {
      const done = await newTask("done");
      await claim(done, agentA);
      await setStatus(done, "done", agentCtx(agentA));
      await ageActivity(done, 30 * HOUR);

      const unheld = await newTask("nobody");
      await ageActivity(unheld, 30 * HOUR);

      const humanHeld = await newTask("human");
      await taskMgmt.assignTask({ taskId: humanHeld, userId }, ctx);
      await ageActivity(humanHeld, 30 * HOUR);

      const res = await report();
      expect(res.stalledClaims).toHaveLength(0);
    });

    it("a claim predating activity collection has no claimedAt, and still surfaces", async () => {
      const t = await newTask("pre-history");
      await claim(t, agentA);
      // Pre-collection history: the claim happened before task_activity
      // existed, so no row records it. Deleting the real row is how the tests
      // create that state without inventing shapes.
      await db.delete(schema.taskActivity)
        .where(and(eq(schema.taskActivity.taskId, t), eq(schema.taskActivity.kind, "claimed")));
      await ageActivity(t, 30 * HOUR);
      await backdateTask(t, 30 * HOUR);

      const res = await report();
      expect(res.stalledClaims).toHaveLength(1);
      expect(res.stalledClaims[0].claimedAt).toBeUndefined();
      expect(res.stalledClaims[0].neverStarted).toBe(true);
    });

    it("caps at 10, most-silent first", async () => {
      const ids: string[] = [];
      for (let i = 1; i <= 11; i++) {
        const t = await newTask(`stalled-${i}`);
        await claim(t, agentA);
        await ageActivity(t, (25 + i) * HOUR);
        ids.push(t);
      }

      const res = await report();
      expect(res.stalledClaims).toHaveLength(10);
      // Most silent = oldest last signal: stalled-11 (36h) ... stalled-2 (27h);
      // the freshest (stalled-1, 26h) is the one squeezed out.
      expect(res.stalledClaims.map((r: any) => r.taskId)).toEqual([...ids].reverse().slice(0, 10));
    });
  });

  // ── unclaimed ───────────────────────────────────────────────────────────

  describe("unclaimed", () => {
    it("lists never-assigned tasks oldest-waiting first, from their creation", async () => {
      const younger = await newTask("younger");
      await ageActivity(younger, 30 * HOUR);
      await backdateTask(younger, 30 * HOUR);
      const older = await newTask("older");
      await ageActivity(older, 40 * HOUR);
      await backdateTask(older, 40 * HOUR);

      const res = await report();
      expect(res.unclaimed.map((r: any) => r.taskId)).toEqual([older, younger]);
      expect(Math.abs(new Date(res.unclaimed[0].waitingSince).getTime() - ago(40 * HOUR).getTime()))
        .toBeLessThan(5000);
    });

    it("an unassigned task waits from its unassignment, not its creation", async () => {
      const t = await newTask("released");
      await claim(t, agentA);
      await taskMgmt.unassignTask({ taskId: t, agentId: agentA }, ctx);
      await ageActivity(t, 40 * HOUR);
      await backdateTask(t, 40 * HOUR);
      await ageActivity(t, 26 * HOUR, "unassigned");

      const res = await report();
      expect(res.unclaimed).toHaveLength(1);
      expect(Math.abs(new Date(res.unclaimed[0].waitingSince).getTime() - ago(26 * HOUR).getTime()))
        .toBeLessThan(5000);
    });

    it("excludes assigned, terminal and freshly-created tasks", async () => {
      const held = await newTask("held");
      await claim(held, agentA);
      await ageActivity(held, 30 * HOUR);
      await backdateTask(held, 30 * HOUR);

      const finished = await newTask("finished");
      await setStatus(finished, "done");
      await ageActivity(finished, 30 * HOUR);
      await backdateTask(finished, 30 * HOUR);

      await newTask("fresh"); // under the 24h noise threshold

      const res = await report();
      expect(res.unclaimed).toHaveLength(0);
    });
  });

  // ── regressions ─────────────────────────────────────────────────────────

  describe("regressions", () => {
    it("surfaces a terminal-to-open transition with actor and holder resolved", async () => {
      const t = await newTask("reopened");
      await claim(t, agentA);
      await setStatus(t, "done", agentCtx(agentA));
      await setStatus(t, "in-progress", ctx); // the human reopens it

      const res = await report();
      expect(res.regressions).toHaveLength(1);
      const row = res.regressions[0];
      expect(row.taskId).toBe(t);
      expect(row.fromStatus).toBe("done");
      expect(row.toStatus).toBe("in-progress");
      expect(row.actorType).toBe("user");
      expect(row.actorName).toBe("Uma");
      expect(row.holderAgentId).toBe(agentA);
      expect(row.holderAgentName).toBe("Scout");
    });

    it("ignores regressions outside the window and on archived tasks", async () => {
      const stale = await newTask("stale");
      await setStatus(stale, "done");
      await setStatus(stale, "todo");
      await ageActivity(stale, 8 * DAY); // outside a 7-day window

      const archived = await newTask("archived");
      await setStatus(archived, "done");
      await setStatus(archived, "todo");
      await db.update(schema.tasks).set({ deletedAt: new Date() }).where(eq(schema.tasks.id, archived));

      const res = await report();
      expect(res.regressions).toHaveLength(0);

      const wide = await report(30);
      expect(wide.regressions.map((r: any) => r.taskId)).toEqual([stale]);
    });

    it("renders '(deleted agent)' for a purged actor and holder", async () => {
      const t = await newTask("orphaned");
      await claim(t, agentB);
      await setStatus(t, "done", agentCtx(agentB));
      await setStatus(t, "todo", agentCtx(agentB));
      await purgeAgent(agentB);

      const res = await report();
      expect(res.regressions).toHaveLength(1);
      expect(res.regressions[0].actorName).toBe("(deleted agent)");
      expect(res.regressions[0].holderAgentName).toBe("(deleted agent)");
    });
  });

  // ── churning ────────────────────────────────────────────────────────────

  describe("churning", () => {
    it("needs at least two handoffs, names the last agent, and reads the live claim", async () => {
      const bouncing = await newTask("bouncing");
      await claim(bouncing, agentA);
      await handoff(bouncing, agentA);
      // Age A's handoff before B's exists: occurred_at has second resolution,
      // so two handoffs in the same second have no knowable order.
      await ageActivity(bouncing, 1 * HOUR, "handoff");
      await handoff(bouncing, agentB);

      const once = await newTask("only once");
      await claim(once, agentA);
      await handoff(once, agentA);

      const res = await report();
      expect(res.churning).toHaveLength(1);
      const row = res.churning[0];
      expect(row.taskId).toBe(bouncing);
      expect(Number(row.handoffCount)).toBe(2);
      expect(row.lastAgentId).toBe(agentB);
      expect(row.lastAgentName).toBe("Ranger");
      // Agents cannot self-unassign, so the claim is still held.
      expect(row.claimHeld).toBe(true);
    });

    it("claimHeld goes false once a human releases the task", async () => {
      const t = await newTask("released churn");
      await claim(t, agentA);
      await handoff(t, agentA);
      await handoff(t, agentA, "still stuck");
      await taskMgmt.unassignTask({ taskId: t, agentId: agentA }, ctx);

      const res = await report();
      expect(res.churning).toHaveLength(1);
      expect(res.churning[0].claimHeld).toBe(false);
    });
  });

  // ── fleet scorecard ─────────────────────────────────────────────────────

  describe("scorecard", () => {
    const rowFor = (res: any, id: string) => res.agentRows.find((r: any) => r.subjectId === id);

    it("attributes a completion to the assignee agent even when a user flips the status", async () => {
      const t = await newTask("agent work, human click");
      await claim(t, agentA);
      await setStatus(t, "done", ctx); // the USER performs the flip

      const res = await report();
      const a = rowFor(res, agentA);
      expect(Number(a.claimed)).toBe(1);
      expect(Number(a.completed)).toBe(1);
      // The completing actor was a human, so this was not autonomous.
      expect(Number(a.autonomousCompleted)).toBe(0);
      expect(Number(res.agentCompleted)).toBe(1);
      expect(Number(res.humanCompleted)).toBe(0);
    });

    it("counts autonomous completions only when no user touched the task since the claim", async () => {
      const solo = await newTask("autonomous");
      await claim(solo, agentA);
      await setStatus(solo, "done", agentCtx(agentA));

      const helped = await newTask("human-touched");
      await claim(helped, agentA);
      await comments.createComment({ entityId: helped, entityType: "task", content: "try X" }, ctx);
      await setStatus(helped, "done", agentCtx(agentA));
      // Spread the real rows over distinct seconds so ordering is unambiguous.
      await ageActivity(helped, 4 * HOUR, "created");
      await ageActivity(helped, 3 * HOUR, "claimed");
      await ageActivity(helped, 2 * HOUR, "comment");

      const res = await report();
      const a = rowFor(res, agentA);
      expect(Number(a.completed)).toBe(2);
      expect(Number(a.autonomousCompleted)).toBe(1);
    });

    it("counts handoffs, take-aways, open tasks and last activity", async () => {
      const t = await newTask("counted");
      await claim(t, agentA);
      await handoff(t, agentA);
      await taskMgmt.unassignTask({ taskId: t, agentId: agentA }, ctx);

      const open = await newTask("still open");
      await claim(open, agentA);

      const res = await report();
      const a = rowFor(res, agentA);
      expect(Number(a.handedOff)).toBe(1);
      expect(Number(a.takenAway)).toBe(1);
      expect(Number(a.openNow)).toBe(1);
      expect(a.lastActiveAt).toBeDefined();
      const b = rowFor(res, agentB);
      expect(Number(b.handedOff)).toBe(0);
      expect(b.lastActiveAt).toBeUndefined();
    });

    it("attributes a reopening to the agent whose completion it undid", async () => {
      const t = await newTask("undone");
      await claim(t, agentA);
      await setStatus(t, "done", agentCtx(agentA));
      await taskMgmt.unassignTask({ taskId: t, agentId: agentA }, ctx);
      await setStatus(t, "todo", ctx); // nobody holds it at reopen time

      const res = await report();
      expect(Number(rowFor(res, agentA).reopened)).toBe(1);
      expect(Number(rowFor(res, agentB).reopened)).toBe(0);
    });

    it("rolls agents up into their role, excluding purged agents from the rollup", async () => {
      const t1 = await newTask("by A");
      await claim(t1, agentA);
      await setStatus(t1, "done", agentCtx(agentA));
      const t2 = await newTask("by B");
      await claim(t2, agentB);
      await setStatus(t2, "done", agentCtx(agentB));

      const ghost = `agt-ghost-${crypto.randomUUID()}`;
      await db.insert(schema.agents).values({ id: ghost, orgId, agentRoleId: roleId, name: "Ghost", createdAt: new Date() });
      const t3 = await newTask("by ghost");
      await claim(t3, ghost);
      await setStatus(t3, "done", agentCtx(ghost));
      await purgeAgent(ghost);

      const res = await report();
      // The purged agent survives as a synthetic "(deleted agent)" agent row...
      const ghostRow = rowFor(res, ghost);
      expect(ghostRow.subjectName).toBe("(deleted agent)");
      expect(Number(ghostRow.completed)).toBe(1);
      // ...but has no role to roll up into.
      expect(res.roleRows).toHaveLength(1);
      expect(res.roleRows[0].subjectId).toBe(roleId);
      expect(res.roleRows[0].subjectName).toBe("Builder");
      expect(Number(res.roleRows[0].completed)).toBe(2);
      expect(Number(res.roleRows[0].claimed)).toBe(2);
    });

    it("splits the completion headline into window and prior window, agent vs human", async () => {
      const priorAgent = await newTask("agent, prior window");
      await claim(priorAgent, agentA);
      await setStatus(priorAgent, "done", agentCtx(agentA));
      await ageActivity(priorAgent, 10 * DAY, "status_changed"); // into [now-14d, now-7d)

      const currentHuman = await newTask("human, this window");
      await setStatus(currentHuman, "done");

      const res = await report(7);
      expect(Number(res.agentCompleted)).toBe(0);
      expect(Number(res.humanCompleted)).toBe(1);
      expect(Number(res.priorAgentCompleted)).toBe(1);
      expect(Number(res.priorHumanCompleted)).toBe(0);
    });
  });
});
