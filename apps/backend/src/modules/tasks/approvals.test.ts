import { describe, it, expect, beforeEach } from "bun:test";
import { Code, createContextValues } from "@connectrpc/connect";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { currentPrincipalKey } from "../auth/session";
import { createTaskManagementHandler, createTasksHandler } from "./tasks.handler";
import { purgeTaskCascade } from "../../lib/cascadePurge";

/** M39 (ADR-0032): an agent's move across a gated transition waits for a person. */
describe("approval gates (M39)", () => {
  const S = schemaSqlite;
  let db: any, nc: any, handler: any, types: any;
  let orgId: string, adminId: string, projectId: string, stamp: string, agentId: string, typeId: string;
  let gatedEdgeId: string;
  let ctx: any;

  function agentCtx(scopes = ["tasks:read", "tasks:write"]) {
    const v = createContextValues();
    v.set(currentPrincipalKey, { kind: "agent", agentId, orgId, tokenId: "tok-" + agentId, scopes });
    return { values: v } as any;
  }

  beforeEach(async () => {
    ({ db, nc } = await setupIntegrationTest());
    stamp = Date.now() + "-" + Math.random().toString(36).slice(2);
    orgId = "org-ag-" + stamp;
    adminId = "user-ag-" + stamp;
    projectId = "proj-ag-" + stamp;
    agentId = "agent-ag-" + stamp;
    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "AG Org" });
    await seedProject(db, { orgId, userId: adminId, templateId: "tmpl-ag-" + stamp, projectId, name: "P" });
    await db.insert(S.agentRoles).values({ id: "role-ag-" + stamp, orgId, name: "R", systemPrompt: "p", capabilities: "[]" });
    await db.insert(S.agents).values({ id: agentId, orgId, agentRoleId: "role-ag-" + stamp, name: "Shipper" });
    ctx = makeAuthContext(adminId);
    handler = createTaskManagementHandler(db, nc);
    types = createTasksHandler(db, nc);

    typeId = (await types.createTaskType({ orgId, projectId, name: "Change" }, ctx)).taskType.id;
    const st: Record<string, string> = {};
    for (const name of ["todo", "review", "done"]) st[name] = (await types.createTaskStatus({ taskTypeId: typeId, name }, ctx)).status.id;
    gatedEdgeId = (await types.createTaskStatusTransition({ taskTypeId: typeId, fromStatusId: st.todo, toStatusId: st.done }, ctx)).transition.id;
    await types.createTaskStatusTransition({ taskTypeId: typeId, fromStatusId: st.todo, toStatusId: st.review }, ctx);
    await types.createTaskStatusTransition({ taskTypeId: typeId, fromStatusId: st.review, toStatusId: st.done }, ctx);
    await types.setTransitionApproval({ taskTypeId: typeId, transitionId: gatedEdgeId, requiresApproval: true }, ctx);
  });

  async function task(title = "T") {
    return (await handler.createTask({ projectId, title, status: "todo", taskTypeId: typeId }, ctx)).task;
  }

  async function expectCode(p: Promise<unknown>, code: Code, message?: RegExp) {
    const err: any = await p.then(() => null, (e) => e);
    const actual = err?.name === "ZodError" ? Code.InvalidArgument : err?.code;
    expect(actual).toBe(code);
    if (message) expect(err.message).toMatch(message);
  }

  const status = async (id: string) => (await handler.getTask({ taskId: id }, ctx)).task.status;

  describe("SetTransitionApproval", () => {
    it("flags an edge, shows it on the type, and clears it", async () => {
      let edges = (await types.getTaskType({ id: typeId }, ctx)).transitions;
      expect(edges.find((e: any) => e.id === gatedEdgeId).requiresApproval).toBe(true);
      expect(edges.filter((e: any) => e.requiresApproval)).toHaveLength(1);
      const res = await types.setTransitionApproval({ taskTypeId: typeId, transitionId: gatedEdgeId, requiresApproval: false }, ctx);
      expect(res.transition).toMatchObject({ id: gatedEdgeId, requiresApproval: false });
      edges = (await types.getTaskType({ id: typeId }, ctx)).transitions;
      expect(edges.some((e: any) => e.requiresApproval)).toBe(false);
    });

    it("needs tasktype:write, people only, and a real edge of that type", async () => {
      const member = "member-ag-" + stamp;
      await db.insert(S.users).values({ id: member, name: "Mo", createdAt: new Date() });
      await db.insert(S.organizationMembers).values({ orgId, userId: member, role: "viewer", joinedAt: new Date() });
      await expectCode(types.setTransitionApproval({ taskTypeId: typeId, transitionId: gatedEdgeId, requiresApproval: false }, makeAuthContext(member)), Code.PermissionDenied);
      await expectCode(types.setTransitionApproval({ taskTypeId: typeId, transitionId: gatedEdgeId, requiresApproval: false }, agentCtx()), Code.PermissionDenied);
      await expectCode(types.setTransitionApproval({ taskTypeId: typeId, transitionId: "tstr-nope", requiresApproval: true }, ctx), Code.NotFound);
      await expectCode(types.setTransitionApproval({ taskTypeId: "tt-nope", transitionId: gatedEdgeId, requiresApproval: true }, ctx), Code.NotFound);
    });
  });

  describe("an agent's gated move", () => {
    it("is held: nothing changes, the pending approval comes back, people are told and the task counts it", async () => {
      const t = await task("Release 1.2");
      nc.clear();
      const res = await handler.updateTaskStatus({ taskId: t.id, status: "done" }, agentCtx());
      expect(res.task.status).toBe("todo");
      expect(res.pendingApproval).toMatchObject({
        taskId: t.id, taskDisplayId: t.displayId, taskTitle: "Release 1.2", fromStatus: "todo", toStatus: "done",
        status: "pending", requestedByAgentId: agentId, requestedByName: "Shipper",
      });
      expect(await status(t.id)).toBe("todo");
      expect(nc.publishedMessages.some((m: any) => m.subject === "domain.task.status_updated")).toBe(false);
      expect(nc.publishedMessages.find((m: any) => m.subject === "domain.task.approval_requested").data)
        .toMatchObject({ approvalId: res.pendingApproval.id, taskId: t.id, toStatus: "done", requestedByAgentId: agentId });

      const notes = await db.select().from(S.notifications);
      expect(notes.map((n: any) => [n.userId, n.type])).toEqual([[adminId, "task.approval_requested"]]);
      expect(notes[0].title).toBe(`Shipper asks to move ${t.displayId} to done`);
      expect(notes[0].targetPath).toContain(`/tasks/${t.id}`);

      expect((await handler.getTask({ taskId: t.id }, ctx)).task.pendingApprovalCount).toBe(1);
      expect((await handler.listTasks({ projectId }, ctx)).tasks[0].pendingApprovalCount).toBe(1);
    });

    it("asked twice gives back the same pending approval", async () => {
      const t = await task();
      const a = (await handler.updateTaskStatus({ taskId: t.id, status: "done" }, agentCtx())).pendingApproval;
      const b = (await handler.updateTaskStatus({ taskId: t.id, status: "done" }, agentCtx())).pendingApproval;
      expect(b.id).toBe(a.id);
      expect(await db.select().from(S.transitionApprovals)).toHaveLength(1);
    });

    it("ungated edges and people are never held", async () => {
      const t = await task();
      const viaReview = await handler.updateTaskStatus({ taskId: t.id, status: "review" }, agentCtx());
      expect(viaReview.pendingApproval).toBeUndefined();
      expect(viaReview.task.status).toBe("review");
      const t2 = await task();
      const byPerson = await handler.updateTaskStatus({ taskId: t2.id, status: "done" }, ctx);
      expect(byPerson.pendingApproval).toBeUndefined();
      expect(byPerson.task.status).toBe("done");
      expect(await db.select().from(S.transitionApprovals)).toHaveLength(0);
    });

    it("a disallowed move is still refused, not held", async () => {
      const t = await task();
      await handler.updateTaskStatus({ taskId: t.id, status: "review" }, ctx);
      await expectCode(handler.updateTaskStatus({ taskId: t.id, status: "todo" }, agentCtx()), Code.InvalidArgument);
      expect(await db.select().from(S.transitionApprovals)).toHaveLength(0);
    });
  });

  describe("DecideTransitionApproval", () => {
    async function held() {
      const t = await task();
      const approval = (await handler.updateTaskStatus({ taskId: t.id, status: "done" }, agentCtx())).pendingApproval;
      return { t, approval };
    }

    it("approving applies the move as the approver and announces both", async () => {
      const { t, approval } = await held();
      nc.clear();
      const decided = (await handler.decideTransitionApproval({ id: approval.id, approve: true, reason: "" }, ctx)).approval;
      expect(decided).toMatchObject({ status: "approved", decidedByUserId: adminId });
      expect(decided.decidedAt).toBeDefined();
      expect(decided.reason).toBeUndefined();
      expect(await status(t.id)).toBe("done");
      expect(nc.publishedMessages.find((m: any) => m.subject === "domain.task.status_updated")).toBeDefined();
      expect(nc.publishedMessages.find((m: any) => m.subject === "domain.task.approval_decided").data)
        .toMatchObject({ approvalId: approval.id, taskId: t.id, approved: true, decidedByUserId: adminId, requestedByAgentId: agentId });
      const activity = await db.select().from(S.taskActivity);
      expect(activity.some((a: any) => a.taskId === t.id && a.toStatus === "done" && a.actorType === "user" && a.actorId === adminId)).toBe(true);
      expect((await handler.getTask({ taskId: t.id }, ctx)).task.pendingApprovalCount).toBe(0);
      await expectCode(handler.decideTransitionApproval({ id: approval.id, approve: false }, ctx), Code.FailedPrecondition, /already approved/);
    });

    it("rejecting leaves the task and records the reason", async () => {
      const { t, approval } = await held();
      const decided = (await handler.decideTransitionApproval({ id: approval.id, approve: false, reason: " needs QA first " }, ctx)).approval;
      expect(decided).toMatchObject({ status: "rejected", reason: "needs QA first", decidedByName: expect.any(String) });
      expect(await status(t.id)).toBe("todo");
      await expectCode(handler.decideTransitionApproval({ id: approval.id, approve: true }, ctx), Code.FailedPrecondition, /already rejected/);
      // A rejected move can be asked again.
      const again = (await handler.updateTaskStatus({ taskId: t.id, status: "done" }, agentCtx())).pendingApproval;
      expect(again.id).not.toBe(approval.id);
    });

    it("a task that moved since makes the approval stale", async () => {
      const { t, approval } = await held();
      await handler.updateTaskStatus({ taskId: t.id, status: "review" }, ctx);
      await expectCode(handler.decideTransitionApproval({ id: approval.id, approve: true }, ctx), Code.FailedPrecondition, /moved since/);
      expect(await status(t.id)).toBe("review");
      expect((await handler.getTransitionApproval({ id: approval.id }, ctx)).approval.status).toBe("stale");
    });

    it("is for people with task:write only", async () => {
      const { approval } = await held();
      await expectCode(handler.decideTransitionApproval({ id: approval.id, approve: true }, agentCtx()), Code.PermissionDenied);
      const viewer = "viewer-ag-" + stamp;
      await db.insert(S.users).values({ id: viewer, name: "Vi", createdAt: new Date() });
      await db.insert(S.organizationMembers).values({ orgId, userId: viewer, role: "viewer", joinedAt: new Date() });
      await expectCode(handler.decideTransitionApproval({ id: approval.id, approve: true }, makeAuthContext(viewer)), Code.PermissionDenied);
      await expectCode(handler.decideTransitionApproval({ id: "apr-nope", approve: true }, ctx), Code.NotFound);
      await expectCode(handler.decideTransitionApproval({ id: approval.id }, ctx), Code.InvalidArgument);
    });
  });

  describe("reading approvals", () => {
    it("an agent can follow its own approval; lists default to pending and filter by task and status", async () => {
      const t1 = await task("one");
      const t2 = await task("two");
      const a1 = (await handler.updateTaskStatus({ taskId: t1.id, status: "done" }, agentCtx())).pendingApproval;
      const a2 = (await handler.updateTaskStatus({ taskId: t2.id, status: "done" }, agentCtx())).pendingApproval;
      await handler.decideTransitionApproval({ id: a2.id, approve: false }, ctx);

      expect((await handler.getTransitionApproval({ id: a1.id }, agentCtx(["tasks:read"]))).approval.status).toBe("pending");
      await expectCode(handler.getTransitionApproval({ id: a1.id }, agentCtx([])), Code.PermissionDenied);

      expect((await handler.listTransitionApprovals({ orgId }, ctx)).approvals.map((a: any) => a.id)).toEqual([a1.id]);
      expect((await handler.listTransitionApprovals({}, agentCtx(["tasks:read"]))).approvals.map((a: any) => a.id)).toEqual([a1.id]);
      const all = await handler.listTransitionApprovals({ orgId, status: "all" }, ctx);
      expect(all.approvals.map((a: any) => a.id).sort()).toEqual([a1.id, a2.id].sort());
      expect(all.page.totalCount).toBe(2);
      expect((await handler.listTransitionApprovals({ taskId: t2.id, status: "rejected" }, ctx)).approvals.map((a: any) => a.id)).toEqual([a2.id]);
      await expectCode(handler.listTransitionApprovals({}, ctx), Code.InvalidArgument);
      await expectCode(handler.listTransitionApprovals({ orgId, status: "maybe" }, ctx), Code.InvalidArgument);
    });

    it("purging a task removes its approvals", async () => {
      const t = await task();
      await handler.updateTaskStatus({ taskId: t.id, status: "done" }, agentCtx());
      await purgeTaskCascade(db, t.id);
      expect(await db.select().from(S.transitionApprovals)).toHaveLength(0);
    });
  });
});
