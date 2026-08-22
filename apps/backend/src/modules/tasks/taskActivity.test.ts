import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { createContextValues } from "@connectrpc/connect";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createTaskManagementHandler } from "./tasks.handler";
import { createTaskNotesHandler } from "./task_notes.handler";
import { createCommentsHandler } from "../comments/comments.handler";
import { currentPrincipalKey } from "../auth/session";
import { purgeTaskCascade, purgeProjectCascade } from "../../lib/cascadePurge";
import { logger } from "../../lib/logger";

/**
 * M24-T04 (ADR-0020): every task-mutation site writes one task_activity row
 * synchronously after its own success/CAS check. These tests assert exactly
 * one row per event with the correct kind/from/to/terminality/actor/assignee,
 * plus the negative paths (replays, lost races, no-ops) that must write
 * nothing, and purge integration leaving zero rows behind.
 */
describe("task activity writes (M24-T04)", () => {
  let db: any;
  let handler: ReturnType<typeof createTaskManagementHandler>;
  let notesHandler: ReturnType<typeof createTaskNotesHandler>;
  let commentsHandler: ReturnType<typeof createCommentsHandler>;
  let ctx: any;
  let agentCtx: any;
  let orgId: string;
  let userId: string;
  let projectId: string;
  let agentId: string;

  const makeAgentCtx = (id: string) => ({
    values: (() => {
      const v = createContextValues();
      v.set(currentPrincipalKey, { kind: "agent", agentId: id, orgId, tokenId: "tok-test", scopes: ["tasks:write", "comments:write"] });
      return v;
    })(),
  }) as any;

  const activityFor = async (taskId: string) =>
    db.select().from(schemaSqlite.taskActivity).where(eq(schemaSqlite.taskActivity.taskId, taskId));

  const createTask = async (overrides: Record<string, any> = {}, callerCtx: any = ctx) => {
    const resp = await handler.createTask({ projectId, title: "T", ...overrides }, callerCtx);
    return resp.task;
  };

  beforeEach(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    handler = createTaskManagementHandler(db, setup.nc);
    notesHandler = createTaskNotesHandler(db, setup.nc);
    commentsHandler = createCommentsHandler(db, setup.nc);

    orgId = "org-" + crypto.randomUUID();
    userId = "user-" + crypto.randomUUID();
    projectId = "proj-" + crypto.randomUUID();
    agentId = "agt-" + crypto.randomUUID();
    const agentRoleId = "ar-" + crypto.randomUUID();

    await seedOrgWithAdmin(db, { orgId, userId });
    await seedProject(db, { orgId, userId, templateId: "tmpl-" + crypto.randomUUID(), projectId });
    await db.insert(schemaSqlite.agentRoles).values({ id: agentRoleId, orgId, name: "Role", systemPrompt: "p", capabilities: "{}" });
    await db.insert(schemaSqlite.agents).values({ id: agentId, orgId, agentRoleId, name: "Agent", createdAt: new Date() });

    ctx = makeAuthContext(userId);
    agentCtx = makeAgentCtx(agentId);
  });

  // --- createTask ---

  it("createTask records one 'created' row with the persisted status, user actor, no assignee", async () => {
    const task = await createTask({ status: "todo" });

    const rows = await activityFor(task.id);
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      taskId: task.id,
      projectId,
      kind: "created",
      fromStatus: null,
      toStatus: "todo",
      fromIsTerminal: false,
      toIsTerminal: false,
      actorType: "user",
      actorId: userId,
      assigneeAgentId: null,
      assigneeUserId: null,
    });
    expect(rows[0].occurredAt).toBeInstanceOf(Date);
  });

  it("createTask by an agent records the agent actor - agent creations become attributable", async () => {
    const task = await createTask({}, agentCtx);

    const rows = await activityFor(task.id);
    expect(rows.length).toBe(1);
    expect(rows[0].kind).toBe("created");
    expect(rows[0].actorType).toBe("agent");
    expect(rows[0].actorId).toBe(agentId);
  });

  it("createTask stamps toIsTerminal for an untyped 'done' creation", async () => {
    const task = await createTask({ status: "done" });

    const rows = await activityFor(task.id);
    expect(rows.length).toBe(1);
    expect(rows[0].toStatus).toBe("done");
    expect(rows[0].toIsTerminal).toBe(true);
  });

  it("createTask replay with the same idempotency key records exactly one row", async () => {
    const key = "idem-create-" + crypto.randomUUID();
    const first = await createTask({ idempotencyKey: key });
    const second = await createTask({ idempotencyKey: key });
    expect(second.id).toBe(first.id);

    const rows = await activityFor(first.id);
    expect(rows.length).toBe(1);
  });

  // --- updateTaskStatus ---

  it("updateTaskStatus records 'status_changed' with both statuses, terminality, and the current assignee", async () => {
    const task = await createTask({ status: "todo" });
    await handler.assignTask({ taskId: task.id, agentId }, ctx);
    // Only the status change itself is under test below.
    const before = await activityFor(task.id);

    await handler.updateTaskStatus({ taskId: task.id, status: "done" }, ctx);

    const rows = (await activityFor(task.id)).filter((r: any) => r.kind === "status_changed");
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      kind: "status_changed",
      fromStatus: "todo",
      toStatus: "done",
      fromIsTerminal: false,
      toIsTerminal: true,
      actorType: "user",
      actorId: userId,
      assigneeAgentId: agentId,
      assigneeUserId: null,
    });
    expect((await activityFor(task.id)).length).toBe(before.length + 1);
  });

  it("typed statuses: every status sharing the max position is terminal", async () => {
    const taskTypeId = "tt-" + crypto.randomUUID();
    await db.insert(schemaSqlite.taskTypes).values({ id: taskTypeId, orgId, name: "Typed", createdAt: new Date() });
    await db.insert(schemaSqlite.taskStatuses).values([
      { id: "tst-a-" + crypto.randomUUID(), taskTypeId, name: "open", position: 0 },
      { id: "tst-b-" + crypto.randomUUID(), taskTypeId, name: "shipped", position: 1 },
      { id: "tst-c-" + crypto.randomUUID(), taskTypeId, name: "cancelled", position: 1 },
    ]);

    const task = await createTask({ taskTypeId, status: "open" });
    await handler.updateTaskStatus({ taskId: task.id, status: "shipped" }, ctx);
    await handler.updateTaskStatus({ taskId: task.id, status: "cancelled" }, ctx);

    const rows = (await activityFor(task.id)).filter((r: any) => r.kind === "status_changed");
    expect(rows.length).toBe(2);
    const toShipped = rows.find((r: any) => r.toStatus === "shipped");
    const toCancelled = rows.find((r: any) => r.toStatus === "cancelled");
    expect(toShipped.fromIsTerminal).toBe(false);
    expect(toShipped.toIsTerminal).toBe(true);
    // shipped -> cancelled is terminal on both sides (a tie at max position).
    expect(toCancelled.fromIsTerminal).toBe(true);
    expect(toCancelled.toIsTerminal).toBe(true);

    const created = (await activityFor(task.id)).find((r: any) => r.kind === "created");
    expect(created.toIsTerminal).toBe(false);
  });

  it("a rejected updateTaskStatus records nothing", async () => {
    const task = await createTask({ status: "todo" });
    await expect(handler.updateTaskStatus({ taskId: task.id, status: "not-a-status" }, ctx)).rejects.toThrow();
    const rows = (await activityFor(task.id)).filter((r: any) => r.kind === "status_changed");
    expect(rows.length).toBe(0);
  });

  // --- claimTask ---

  it("claimTask records 'claimed' with the claiming agent as assignee and actor, statuses null", async () => {
    const task = await createTask();
    await handler.claimTask({ taskId: task.id }, agentCtx);

    const rows = (await activityFor(task.id)).filter((r: any) => r.kind === "claimed");
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      kind: "claimed",
      fromStatus: null,
      toStatus: null,
      fromIsTerminal: false,
      toIsTerminal: false,
      actorType: "agent",
      actorId: agentId,
      assigneeAgentId: agentId,
      assigneeUserId: null,
    });
  });

  it("claimTask by a user records the user as assignee and actor", async () => {
    const task = await createTask();
    await handler.claimTask({ taskId: task.id }, ctx);

    const rows = (await activityFor(task.id)).filter((r: any) => r.kind === "claimed");
    expect(rows.length).toBe(1);
    expect(rows[0].actorType).toBe("user");
    expect(rows[0].actorId).toBe(userId);
    expect(rows[0].assigneeUserId).toBe(userId);
    expect(rows[0].assigneeAgentId).toBe(null);
  });

  it("claimTask replay with the same idempotency key records exactly one 'claimed' row", async () => {
    const task = await createTask();
    const key = "idem-claim-" + crypto.randomUUID();
    await handler.claimTask({ taskId: task.id, idempotencyKey: key }, agentCtx);
    await handler.claimTask({ taskId: task.id, idempotencyKey: key }, agentCtx);

    const rows = (await activityFor(task.id)).filter((r: any) => r.kind === "claimed");
    expect(rows.length).toBe(1);
  });

  it("a lost claim (task already assigned) records nothing", async () => {
    const task = await createTask();
    await handler.assignTask({ taskId: task.id, userId }, ctx);

    await expect(handler.claimTask({ taskId: task.id }, agentCtx)).rejects.toThrow(
      /already assigned/,
    );

    const rows = (await activityFor(task.id)).filter((r: any) => r.kind === "claimed");
    expect(rows.length).toBe(0);
  });

  // --- assignTask / unassignTask ---

  it("assignTask records 'assigned' with the new holder; the duplicate no-op path records nothing", async () => {
    const task = await createTask();
    await handler.assignTask({ taskId: task.id, agentId }, ctx);
    // Exact duplicate - handler early-returns before inserting.
    await handler.assignTask({ taskId: task.id, agentId }, ctx);

    const rows = (await activityFor(task.id)).filter((r: any) => r.kind === "assigned");
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      kind: "assigned",
      fromStatus: null,
      toStatus: null,
      actorType: "user",
      actorId: userId,
      assigneeAgentId: agentId,
      assigneeUserId: null,
    });
  });

  it("unassignTask records 'unassigned' with the removed holder; unassigning nothing records nothing", async () => {
    const task = await createTask();
    await handler.assignTask({ taskId: task.id, agentId }, ctx);
    await handler.unassignTask({ taskId: task.id, agentId }, ctx);

    let rows = (await activityFor(task.id)).filter((r: any) => r.kind === "unassigned");
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      kind: "unassigned",
      actorType: "user",
      actorId: userId,
      assigneeAgentId: agentId,
      assigneeUserId: null,
    });

    // Second unassign: still success (idempotent RPC), but no row was
    // actually deleted, so no second activity row.
    const resp = await handler.unassignTask({ taskId: task.id, agentId }, ctx);
    expect(resp.success).toBe(true);
    rows = (await activityFor(task.id)).filter((r: any) => r.kind === "unassigned");
    expect(rows.length).toBe(1);
  });

  // --- deleteTask / restoreTask ---

  it("deleteTask records 'archived' with fromStatus; a double archive records once", async () => {
    const task = await createTask({ status: "done" });
    await handler.deleteTask({ taskId: task.id }, ctx);
    await handler.deleteTask({ taskId: task.id }, ctx);

    const rows = (await activityFor(task.id)).filter((r: any) => r.kind === "archived");
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      kind: "archived",
      fromStatus: "done",
      toStatus: null,
      fromIsTerminal: true,
      toIsTerminal: false,
      actorType: "user",
      actorId: userId,
    });
  });

  it("restoreTask records 'restored' with toStatus; restoring a live task records nothing", async () => {
    const task = await createTask({ status: "in-progress" });
    // Restoring a task that is not archived: no state change, no row.
    await handler.restoreTask({ taskId: task.id }, ctx);
    expect((await activityFor(task.id)).filter((r: any) => r.kind === "restored").length).toBe(0);

    await handler.deleteTask({ taskId: task.id }, ctx);
    await handler.restoreTask({ taskId: task.id }, ctx);

    const rows = (await activityFor(task.id)).filter((r: any) => r.kind === "restored");
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      kind: "restored",
      fromStatus: null,
      toStatus: "in-progress",
      fromIsTerminal: false,
      toIsTerminal: false,
      actorType: "user",
      actorId: userId,
    });
  });

  // --- notes / handoffs / comments ---

  it("createTaskNote records 'note' with the agent actor and the current assignee", async () => {
    const task = await createTask();
    await handler.assignTask({ taskId: task.id, agentId }, ctx);
    await notesHandler.createTaskNote({ taskId: task.id, content: "progress" }, agentCtx);

    const rows = (await activityFor(task.id)).filter((r: any) => r.kind === "note");
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      kind: "note",
      fromStatus: null,
      toStatus: null,
      actorType: "agent",
      actorId: agentId,
      assigneeAgentId: agentId,
      assigneeUserId: null,
    });
  });

  it("createTaskNote with noteType 'handoff' records 'handoff'", async () => {
    const task = await createTask();
    await notesHandler.createTaskNote({ taskId: task.id, content: "over to you", noteType: "handoff" }, agentCtx);

    const rows = (await activityFor(task.id)).filter((r: any) => r.kind === "handoff");
    expect(rows.length).toBe(1);
    expect(rows[0].actorType).toBe("agent");
    expect(rows[0].actorId).toBe(agentId);
    expect((await activityFor(task.id)).filter((r: any) => r.kind === "note").length).toBe(0);
  });

  it("createComment on a task records 'comment' for user and agent actors; artifact comments record nothing", async () => {
    const task = await createTask();
    await commentsHandler.createComment({ entityId: task.id, entityType: "task", content: "hi" }, ctx);
    await commentsHandler.createComment({ entityId: task.id, entityType: "task", content: "hello" }, agentCtx);

    const rows = (await activityFor(task.id)).filter((r: any) => r.kind === "comment");
    expect(rows.length).toBe(2);
    const userRow = rows.find((r: any) => r.actorType === "user");
    const agentRow = rows.find((r: any) => r.actorType === "agent");
    expect(userRow.actorId).toBe(userId);
    expect(agentRow.actorId).toBe(agentId);
    expect(userRow.projectId).toBe(projectId);

    // A comment on a non-task entity writes no activity.
    const folderId = "fld-" + crypto.randomUUID();
    const artifactId = "art-" + crypto.randomUUID();
    await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: "Folder", createdAt: new Date() });
    await db.insert(schemaSqlite.artifacts).values({ id: artifactId, folderId, name: "Artifact", createdAt: new Date() });
    await commentsHandler.createComment({ entityId: artifactId, entityType: "artifact", content: "art" }, ctx);

    const all = await db.select().from(schemaSqlite.taskActivity);
    expect(all.filter((r: any) => r.taskId === artifactId).length).toBe(0);
  });

  // --- failure isolation ---

  it("an activity-insert failure is swallowed and logged - the mutation still succeeds", async () => {
    const task = await createTask({ status: "todo" });
    const errorSpy = spyOn(logger, "error");
    const callsBefore = errorSpy.mock.calls.length;
    await db.run(sql`ALTER TABLE task_activity RENAME TO task_activity_broken`);

    try {
      // The primary mutation must not be failed by the activity write
      // (ADR-0020's accepted drift).
      const resp = await handler.updateTaskStatus({ taskId: task.id, status: "done" }, ctx);
      expect(resp.task.status).toBe("done");

      const failureLogs = errorSpy.mock.calls
        .slice(callsBefore)
        .filter((c: any[]) => c.some((arg) => typeof arg === "string" && arg.includes("task_activity")));
      expect(failureLogs.length).toBe(1);
    } finally {
      await db.run(sql`ALTER TABLE task_activity_broken RENAME TO task_activity`);
      errorSpy.mockRestore();
    }

    // And the task really did move.
    const rows = await db.select().from(schemaSqlite.tasks).where(eq(schemaSqlite.tasks.id, task.id));
    expect(rows[0].status).toBe("done");
  });

  // --- purge integration ---

  const seedTaskWithActivity = async () => {
    const task = await createTask({ status: "todo" });
    await handler.assignTask({ taskId: task.id, agentId }, ctx);
    await handler.updateTaskStatus({ taskId: task.id, status: "done" }, ctx);
    expect((await activityFor(task.id)).length).toBeGreaterThanOrEqual(3);
    return task;
  };

  it("purgeTask deletes the task's activity rows", async () => {
    const task = await seedTaskWithActivity();
    await handler.deleteTask({ taskId: task.id }, ctx);
    await handler.purgeTask({ taskId: task.id }, ctx);

    expect((await activityFor(task.id)).length).toBe(0);
  });

  it("purgeTaskCascade deletes the task's activity rows", async () => {
    const task = await seedTaskWithActivity();
    await purgeTaskCascade(db, task.id);

    expect((await activityFor(task.id)).length).toBe(0);
    const taskRows = await db.select().from(schemaSqlite.tasks).where(eq(schemaSqlite.tasks.id, task.id));
    expect(taskRows.length).toBe(0);
  });

  it("purgeProjectCascade deletes all activity rows of the project's tasks", async () => {
    const taskA = await seedTaskWithActivity();
    const taskB = await seedTaskWithActivity();
    await purgeProjectCascade(db, projectId);

    expect((await activityFor(taskA.id)).length).toBe(0);
    expect((await activityFor(taskB.id)).length).toBe(0);
    const projectRows = await db.select().from(schemaSqlite.projects).where(eq(schemaSqlite.projects.id, projectId));
    expect(projectRows.length).toBe(0);
  });
});
