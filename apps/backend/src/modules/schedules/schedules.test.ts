import { describe, it, expect, beforeEach } from "bun:test";
import { Code, createContextValues } from "@connectrpc/connect";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { currentPrincipalKey } from "../auth/session";
import { createTaskManagementHandler } from "../tasks/tasks.handler";
import { createWorkflowsHandler } from "../workflows/workflows.handler";
import { createSchedulesHandler, createScheduleSweep } from "./schedules.handler";
import { purgeProjectCascade } from "../../lib/cascadePurge";

/** M43 (ADR-0036): schedules put work on the queue, each due slot exactly once. */
describe("recurring work (M43)", () => {
  const S = schemaSqlite;
  let db: any, nc: any, tasks: any;
  let orgId: string, adminId: string, projectId: string, stamp: string, agentId: string;
  let ctx: any;
  let now: Date;
  const clock = () => now;
  let sched: any;

  function agentCtx(scopes = ["tasks:read", "tasks:write"]) {
    const v = createContextValues();
    v.set(currentPrincipalKey, { kind: "agent", agentId, orgId, tokenId: "tok-" + agentId, scopes });
    return { values: v } as any;
  }

  beforeEach(async () => {
    ({ db, nc } = await setupIntegrationTest());
    stamp = Date.now() + "-" + Math.random().toString(36).slice(2);
    orgId = "org-sc-" + stamp;
    adminId = "user-sc-" + stamp;
    projectId = "proj-sc-" + stamp;
    agentId = "agent-sc-" + stamp;
    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "SC Org" });
    await seedProject(db, { orgId, userId: adminId, templateId: "tmpl-sc-" + stamp, projectId, name: "P" });
    await db.insert(S.agentRoles).values({ id: "role-sc-" + stamp, orgId, name: "R", systemPrompt: "p", capabilities: "[]" });
    await db.insert(S.agents).values({ id: agentId, orgId, agentRoleId: "role-sc-" + stamp, name: "Ops" });
    ctx = makeAuthContext(adminId);
    now = new Date("2026-10-02T08:30:00Z"); // a Friday
    sched = createSchedulesHandler(db, nc, clock);
    tasks = createTaskManagementHandler(db, nc);
  });

  async function expectCode(p: Promise<unknown>, code: Code, message?: RegExp) {
    const err: any = await p.then(() => null, (e) => e);
    const actual = err?.name === "ZodError" ? Code.InvalidArgument : err?.code;
    expect(actual).toBe(code);
    if (message) expect(err.message).toMatch(message);
  }

  const daily = (extra: Record<string, unknown> = {}) =>
    sched.createSchedule({ projectId, name: "Triage", cadence: "daily", hourUtc: 9, taskTitle: "Triage the inbox", taskPriority: 2, ...extra }, ctx);

  describe("CRUD and cadence", () => {
    it("creates a schedule with its next slot, reads, lists, updates and deletes it", async () => {
      const s = (await daily()).schedule;
      expect(s).toMatchObject({
        projectId, orgId, name: "Triage", cadence: "daily", hourUtc: 9, taskTitle: "Triage the inbox", taskPriority: 2,
        skipIfOpen: true, active: true, nextRunAt: "2026-10-02T09:00:00.000Z",
      });
      expect((await sched.getSchedule({ id: s.id }, agentCtx(["tasks:read"]))).schedule.name).toBe("Triage");
      expect((await sched.listSchedules({ projectId }, ctx)).schedules.map((x: any) => x.id)).toEqual([s.id]);
      expect((await sched.listSchedules({}, agentCtx(["tasks:read"]))).page.totalCount).toBe(1);

      const weekly = (await sched.updateSchedule({ id: s.id, name: "Weekly triage", cadence: "weekly", weekdays: [4, 1], hourUtc: 7, taskTitle: "Triage", active: false }, ctx)).schedule;
      expect(weekly).toMatchObject({ cadence: "weekly", weekdays: [1, 4], active: false, nextRunAt: "2026-10-05T07:00:00.000Z" });
      expect((await sched.deleteSchedule({ id: s.id }, ctx)).success).toBe(true);
      await expectCode(sched.getSchedule({ id: s.id }, ctx), Code.NotFound);
    });

    it("refuses a malformed cadence or target", async () => {
      await expectCode(daily({ cadence: "hourly" }), Code.InvalidArgument, /cadence must be one of/);
      await expectCode(daily({ cadence: "weekly" }), Code.InvalidArgument, /at least one weekday/);
      await expectCode(daily({ cadence: "weekly", weekdays: [1, 1] }), Code.InvalidArgument, /duplicate/);
      await expectCode(daily({ cadence: "weekly", weekdays: [7] }), Code.InvalidArgument);
      await expectCode(daily({ cadence: "monthly" }), Code.InvalidArgument, /dayOfMonth/);
      await expectCode(daily({ cadence: "monthly", dayOfMonth: 31 }), Code.InvalidArgument, /1-28/);
      await expectCode(daily({ hourUtc: 24 }), Code.InvalidArgument);
      await expectCode(daily({ taskTitle: "" }), Code.InvalidArgument, /exactly one/);
      await expectCode(daily({ templateId: "wft-x" }), Code.InvalidArgument, /exactly one/);
      await expectCode(daily({ taskTitle: undefined, templateId: "wft-nope" }), Code.InvalidArgument, /template not found/);
      await expectCode(daily({ projectId: "proj-nope" }), Code.NotFound);
    });

    it("is defined by people; agents may read", async () => {
      await expectCode(sched.createSchedule({ projectId, name: "X", cadence: "daily", hourUtc: 1, taskTitle: "X" }, agentCtx()), Code.PermissionDenied);
      const viewer = "viewer-sc-" + stamp;
      await db.insert(S.users).values({ id: viewer, name: "Vi", createdAt: new Date() });
      await db.insert(S.organizationMembers).values({ orgId, userId: viewer, role: "viewer", joinedAt: new Date() });
      await expectCode(sched.createSchedule({ projectId, name: "X", cadence: "daily", hourUtc: 1, taskTitle: "X" }, makeAuthContext(viewer)), Code.PermissionDenied);
      await expectCode(sched.listSchedules({ projectId }, agentCtx([])), Code.PermissionDenied);
      await expectCode(sched.listSchedules({}, ctx), Code.InvalidArgument);
    });
  });

  describe("the sweep", () => {
    it("fires a due schedule once, as its creator, and moves it to the next slot", async () => {
      const s = (await daily()).schedule;
      const sweep = createScheduleSweep(db, nc, clock);
      expect(await sweep()).toBe(0); // 08:30, not due yet
      now = new Date("2026-10-02T09:00:30Z");
      expect(await sweep()).toBe(1);
      expect(await sweep()).toBe(0); // already moved on

      const [made] = (await tasks.listTasks({ projectId }, ctx)).tasks;
      expect(made).toMatchObject({ title: "Triage the inbox — 2026-10-02", priority: 2, scheduleId: s.id, createdBy: adminId });
      const after = (await sched.getSchedule({ id: s.id }, ctx)).schedule;
      expect(after).toMatchObject({ nextRunAt: "2026-10-03T09:00:00.000Z", lastOutcome: "created", lastTaskId: made.id });
      const runs = (await sched.listScheduleRuns({ scheduleId: s.id }, ctx)).runs;
      expect(runs).toEqual([expect.objectContaining({ outcome: "created", taskId: made.id, trigger: "schedule" })]);
      expect(nc.publishedMessages.some((m: any) => m.subject === "domain.task.created")).toBe(true);
    });

    it("two racing sweeps fire a slot exactly once", async () => {
      await daily();
      now = new Date("2026-10-02T10:00:00Z");
      const a = createScheduleSweep(db, nc, clock);
      const b = createScheduleSweep(db, nc, clock);
      const fired = await Promise.all([a(), b(), a(), b()]);
      expect(fired.reduce((x, y) => x + y, 0)).toBe(1);
      expect((await tasks.listTasks({ projectId }, ctx)).page.totalCount).toBe(1);
    });

    it("skips while the last run's task is open, and runs again once it is done", async () => {
      const s = (await daily()).schedule;
      const sweep = createScheduleSweep(db, nc, clock);
      now = new Date("2026-10-02T09:00:00Z");
      await sweep();
      now = new Date("2026-10-03T09:00:00Z");
      await sweep();
      let runs = (await sched.listScheduleRuns({ scheduleId: s.id }, ctx)).runs;
      expect(runs[0]).toMatchObject({ outcome: "skipped", detail: expect.stringMatching(/previous run's task .* is still open/) });
      expect((await tasks.listTasks({ projectId }, ctx)).page.totalCount).toBe(1);

      const first = (await tasks.listTasks({ projectId }, ctx)).tasks[0];
      await tasks.updateTaskStatus({ taskId: first.id, status: "done" }, ctx);
      now = new Date("2026-10-04T09:00:00Z");
      await sweep();
      runs = (await sched.listScheduleRuns({ scheduleId: s.id }, ctx)).runs;
      expect(runs.map((r: any) => r.outcome)).toEqual(["created", "skipped", "created"]);

      // Without skipIfOpen it piles up by design.
      await sched.updateSchedule({ id: s.id, name: "Triage", cadence: "daily", hourUtc: 9, taskTitle: "Triage the inbox", skipIfOpen: false }, ctx);
      now = new Date("2026-10-05T09:00:00Z");
      await sweep();
      expect((await tasks.listTasks({ projectId }, ctx)).page.totalCount).toBe(3);
    });

    it("leaves paused schedules alone and does not replay missed slots", async () => {
      const s = (await daily()).schedule;
      const sweep = createScheduleSweep(db, nc, clock);
      await sched.updateSchedule({ id: s.id, name: "Triage", cadence: "daily", hourUtc: 9, taskTitle: "T", active: false }, ctx);
      now = new Date("2026-10-09T12:00:00Z");
      expect(await sweep()).toBe(0);
      await sched.updateSchedule({ id: s.id, name: "Triage", cadence: "daily", hourUtc: 9, taskTitle: "T", active: true }, ctx);
      // Resuming recomputes from now; a week of missed days is one run at most.
      await db.update(S.schedules).set({ nextRunAt: new Date("2026-10-03T09:00:00Z") }).where(eq(S.schedules.id, s.id));
      expect(await sweep()).toBe(1);
      expect(await sweep()).toBe(0);
      expect((await sched.getSchedule({ id: s.id }, ctx)).schedule.nextRunAt).toBe("2026-10-10T09:00:00.000Z");
    });

    it("starts a workflow when the schedule names one", async () => {
      const wf = createWorkflowsHandler(db, nc);
      const t = (await wf.createWorkflowTemplate({ orgId, name: "Weekly report", steps: [{ key: "a", title: "Collect" }, { key: "b", title: "Write", dependsOn: ["a"] }] }, ctx)).template;
      const s = (await sched.createSchedule({ projectId, name: "Report", cadence: "weekly", weekdays: [5], hourUtc: 9, templateId: t.id }, ctx)).schedule;
      now = new Date("2026-10-02T09:05:00Z");
      expect(await createScheduleSweep(db, nc, clock)()).toBe(1);
      const all = (await tasks.listTasks({ projectId }, ctx)).tasks;
      const parent = all.find((x: any) => x.scheduleId === s.id);
      expect(parent.title).toBe("Report — 2026-10-02");
      expect(all.filter((x: any) => x.parentTaskId === parent.id).map((x: any) => x.title).sort()).toEqual(["Collect", "Write"]);
    });

    it("records a failure and carries on with the other schedules", async () => {
      const broken = (await daily({ name: "Broken" })).schedule;
      const fine = (await daily({ name: "Fine", taskTitle: "Fine" })).schedule;
      // The creator lost access since: runs fail visibly instead of running as nobody.
      await db.update(S.schedules).set({ createdBy: "user-gone" }).where(eq(S.schedules.id, broken.id));
      now = new Date("2026-10-02T09:00:00Z");
      expect(await createScheduleSweep(db, nc, clock)()).toBe(2);
      expect((await sched.getSchedule({ id: broken.id }, ctx)).schedule.lastOutcome).toBe("failed");
      expect((await sched.listScheduleRuns({ scheduleId: broken.id }, ctx)).runs[0].detail).toBeTruthy();
      expect((await sched.getSchedule({ id: fine.id }, ctx)).schedule.lastOutcome).toBe("created");
    });
  });

  describe("RunSchedule", () => {
    it("fires now as the caller without moving the next slot; agents may run one", async () => {
      const s = (await daily({ skipIfOpen: false })).schedule;
      const run = (await sched.runSchedule({ id: s.id }, agentCtx())).run;
      expect(run).toMatchObject({ outcome: "created", trigger: "manual" });
      const [made] = (await tasks.listTasks({ projectId }, ctx)).tasks;
      expect(made.id).toBe(run.taskId);
      expect((await sched.getSchedule({ id: s.id }, ctx)).schedule.nextRunAt).toBe("2026-10-02T09:00:00.000Z");
      await expectCode(sched.runSchedule({ id: s.id }, agentCtx(["tasks:read"])), Code.PermissionDenied);
      await expectCode(sched.runSchedule({ id: "sch-nope" }, ctx), Code.NotFound);
    });

    it("goes with its project when the project is purged", async () => {
      const s = (await daily()).schedule;
      await sched.runSchedule({ id: s.id }, ctx);
      await purgeProjectCascade(db, projectId);
      expect(await db.select().from(S.schedules)).toHaveLength(0);
      expect(await db.select().from(S.scheduleRuns)).toHaveLength(0);
    });
  });
});
