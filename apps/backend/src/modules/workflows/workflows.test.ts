import { describe, it, expect, beforeEach } from "bun:test";
import { Code, createContextValues } from "@connectrpc/connect";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { currentPrincipalKey } from "../auth/session";
import { createTaskManagementHandler, createTasksHandler } from "../tasks/tasks.handler";
import { createWorkflowsHandler, orderSteps } from "./workflows.handler";

/** M42 (ADR-0035): a stored step graph, instantiated as ordinary tasks. */
describe("workflow templates (M42)", () => {
  const S = schemaSqlite;
  let db: any, nc: any, wf: any, tasks: any, types: any;
  let orgId: string, adminId: string, projectId: string, stamp: string, agentId: string;
  let ctx: any;

  function agentCtx(scopes = ["tasks:read", "tasks:write"]) {
    const v = createContextValues();
    v.set(currentPrincipalKey, { kind: "agent", agentId, orgId, tokenId: "tok-" + agentId, scopes });
    return { values: v } as any;
  }

  const RELEASE = [
    { key: "build", title: "Build artifacts", priority: 2 },
    { key: "test", title: "Run the suite", dependsOn: ["build"] },
    { key: "notes", title: "Write release notes" },
    { key: "ship", title: "Ship it", priority: 1, dependsOn: ["test", "notes"] },
  ];

  beforeEach(async () => {
    ({ db, nc } = await setupIntegrationTest());
    stamp = Date.now() + "-" + Math.random().toString(36).slice(2);
    orgId = "org-wf-" + stamp;
    adminId = "user-wf-" + stamp;
    projectId = "proj-wf-" + stamp;
    agentId = "agent-wf-" + stamp;
    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "WF Org" });
    await seedProject(db, { orgId, userId: adminId, templateId: "tmpl-wf-" + stamp, projectId, name: "P" });
    await db.insert(S.agentRoles).values({ id: "role-wf-" + stamp, orgId, name: "R", systemPrompt: "p", capabilities: "[]" });
    await db.insert(S.agents).values({ id: agentId, orgId, agentRoleId: "role-wf-" + stamp, name: "Runner" });
    ctx = makeAuthContext(adminId);
    wf = createWorkflowsHandler(db, nc);
    tasks = createTaskManagementHandler(db, nc);
    types = createTasksHandler(db, nc);
  });

  async function expectCode(p: Promise<unknown>, code: Code, message?: RegExp) {
    const err: any = await p.then(() => null, (e) => e);
    const actual = err?.name === "ZodError" ? Code.InvalidArgument : err?.code;
    expect(actual).toBe(code);
    if (message) expect(err.message).toMatch(message);
  }

  const create = (steps: any[] = RELEASE, extra: Record<string, unknown> = {}) =>
    wf.createWorkflowTemplate({ orgId, name: "Release", description: "Cut a release", steps, ...extra }, ctx);

  describe("orderSteps", () => {
    it("puts every step after its dependencies, keeping the author's order otherwise", () => {
      const parsed = RELEASE.map((s: any) => ({ description: "", priority: 0, dependsOn: [], ...s }));
      expect(orderSteps(parsed).map((s) => s.key)).toEqual(["build", "notes", "test", "ship"]);
    });
  });

  describe("template CRUD", () => {
    it("creates, reads, lists, replaces and deletes a template", async () => {
      const t = (await create()).template;
      expect(t).toMatchObject({ orgId, name: "Release", description: "Cut a release" });
      expect(t.steps.map((s: any) => [s.key, s.priority, s.dependsOn])).toEqual([
        ["build", 2, []], ["test", 0, ["build"]], ["notes", 0, []], ["ship", 1, ["test", "notes"]],
      ]);
      expect((await wf.getWorkflowTemplate({ id: t.id }, agentCtx(["tasks:read"]))).template.name).toBe("Release");

      const own = (await create([{ key: "a", title: "A" }], { name: "Project only", projectId })).template;
      expect(own.projectId).toBe(projectId);
      expect((await wf.listWorkflowTemplates({ orgId }, ctx)).templates.map((x: any) => x.name).sort()).toEqual(["Project only", "Release"]);
      expect((await wf.listWorkflowTemplates({}, agentCtx(["tasks:read"]))).page.totalCount).toBe(2);

      const updated = (await wf.updateWorkflowTemplate({ id: t.id, name: "Release v2", steps: [{ key: "only", title: "Only" }] }, ctx)).template;
      expect(updated).toMatchObject({ name: "Release v2", description: "" });
      expect(updated.steps.map((s: any) => s.key)).toEqual(["only"]);
      expect((await wf.deleteWorkflowTemplate({ id: t.id }, ctx)).success).toBe(true);
      await expectCode(wf.getWorkflowTemplate({ id: t.id }, ctx), Code.NotFound);
    });

    it("refuses a malformed graph, naming the problem", async () => {
      await expectCode(create([]), Code.InvalidArgument, /at least one step/);
      await expectCode(create([{ key: "a", title: "A" }, { key: "a", title: "B" }]), Code.InvalidArgument, /used twice/);
      await expectCode(create([{ key: "a", title: "A", dependsOn: ["zzz"] }]), Code.InvalidArgument, /"zzz", which is not a step/);
      await expectCode(create([{ key: "a", title: "A", dependsOn: ["a"] }]), Code.InvalidArgument, /depends on itself/);
      await expectCode(create([
        { key: "a", title: "A", dependsOn: ["c"] }, { key: "b", title: "B", dependsOn: ["a"] }, { key: "c", title: "C", dependsOn: ["b"] },
        { key: "d", title: "D" },
      ]), Code.InvalidArgument, /"a", "b", "c" depend on each other in a cycle/);
      await expectCode(create([{ key: "Bad Key", title: "A" }]), Code.InvalidArgument);
      await expectCode(create([{ key: "a", title: " " }]), Code.InvalidArgument);
      await expectCode(create([{ key: "a", title: "A", priority: 9 }]), Code.InvalidArgument);
      await expectCode(create(Array.from({ length: 51 }, (_, i) => ({ key: `s${i}`, title: `S${i}` }))), Code.InvalidArgument, /at most 50/);
    });

    it("checks typed steps against the organization's task types", async () => {
      const typeId = (await types.createTaskType({ orgId, projectId, name: "Change" }, ctx)).taskType.id;
      await types.createTaskStatus({ taskTypeId: typeId, name: "queued" }, ctx);
      await types.createTaskStatus({ taskTypeId: typeId, name: "shipped" }, ctx);
      expect((await create([{ key: "a", title: "A", taskTypeId: typeId, status: "shipped" }])).template.steps[0].status).toBe("shipped");
      await expectCode(create([{ key: "a", title: "A", taskTypeId: typeId, status: "nope" }]), Code.InvalidArgument, /does not have \(queued, shipped\)/);
      await expectCode(create([{ key: "a", title: "A", taskTypeId: "tt-other" }]), Code.InvalidArgument, /not a task type of this organization/);
    });

    it("lets people define templates and agents only read them", async () => {
      await expectCode(wf.createWorkflowTemplate({ orgId, name: "X", steps: [{ key: "a", title: "A" }] }, agentCtx()), Code.PermissionDenied);
      const viewer = "viewer-wf-" + stamp;
      await db.insert(S.users).values({ id: viewer, name: "Vi", createdAt: new Date() });
      await db.insert(S.organizationMembers).values({ orgId, userId: viewer, role: "viewer", joinedAt: new Date() });
      await expectCode(wf.createWorkflowTemplate({ orgId, name: "X", steps: [{ key: "a", title: "A" }] }, makeAuthContext(viewer)), Code.PermissionDenied);
      const t = (await create()).template;
      await expectCode(wf.deleteWorkflowTemplate({ id: t.id }, makeAuthContext(viewer)), Code.PermissionDenied);
      await expectCode(wf.getWorkflowTemplate({ id: t.id }, agentCtx([])), Code.PermissionDenied);
      await expectCode(wf.listWorkflowTemplates({}, ctx), Code.InvalidArgument);
      await expectCode(create(undefined, { projectId: "proj-nope" }), Code.NotFound);
    });
  });

  describe("InstantiateWorkflow", () => {
    it("creates a parent and wired subtasks that claim-next hands out in dependency order", async () => {
      const t = (await create()).template;
      nc.clear();
      const res = await wf.instantiateWorkflow({ templateId: t.id, projectId, title: "Release 4.2" }, agentCtx());
      expect(res.parent).toMatchObject({ title: "Release 4.2", description: "Cut a release", projectId });
      expect(res.steps.map((s: any) => s.title)).toEqual(["Build artifacts", "Run the suite", "Write release notes", "Ship it"]);
      expect(res.steps.every((s: any) => s.parentTaskId === res.parent.id)).toBe(true);
      expect(res.steps.map((s: any) => s.priority)).toEqual([2, 0, 0, 1]);
      expect(nc.publishedMessages.find((m: any) => m.subject === "domain.task.workflow_started").data)
        .toMatchObject({ taskId: res.parent.id, templateId: t.id, steps: 4 });

      const [build, test, notes, ship] = res.steps;
      const links = await tasks.listTaskLinks({ taskId: ship.id }, ctx);
      expect(links.blockedBy.map((r: any) => r.id).sort()).toEqual([test.id, notes.id].sort());
      expect(links.parent.id).toBe(res.parent.id);

      // Work it through claim-next: the parent and the open steps are all
      // claimable, but a blocked step never is until its blockers finish.
      const claimable = async () => (await tasks.listTasks({ projectId, ready: true }, ctx)).tasks.map((x: any) => x.id);
      expect(await claimable()).not.toContain(test.id);
      expect(await claimable()).not.toContain(ship.id);
      expect(await claimable()).toEqual(expect.arrayContaining([build.id, notes.id]));
      await tasks.updateTaskStatus({ taskId: build.id, status: "done" }, ctx);
      expect(await claimable()).toContain(test.id);
      await tasks.updateTaskStatus({ taskId: test.id, status: "done" }, ctx);
      expect(await claimable()).not.toContain(ship.id);
      await tasks.updateTaskStatus({ taskId: notes.id, status: "done" }, ctx);
      expect(await claimable()).toContain(ship.id);
    });

    it("defaults the title, uses a typed step's first status, and replays by key", async () => {
      const typeId = (await types.createTaskType({ orgId, projectId, name: "Change" }, ctx)).taskType.id;
      await types.createTaskStatus({ taskTypeId: typeId, name: "queued" }, ctx);
      await types.createTaskStatus({ taskTypeId: typeId, name: "shipped" }, ctx);
      const t = (await create([{ key: "a", title: "A", taskTypeId: typeId }])).template;
      const first = await wf.instantiateWorkflow({ templateId: t.id, projectId, idempotencyKey: "run-1" }, agentCtx());
      expect(first.parent.title).toBe("Release");
      expect(first.steps[0]).toMatchObject({ taskTypeId: typeId, status: "queued" });
      const again = await wf.instantiateWorkflow({ templateId: t.id, projectId, idempotencyKey: "run-1" }, agentCtx());
      expect(again.parent.id).toBe(first.parent.id);
      expect((await tasks.listTasks({ projectId }, ctx)).page.totalCount).toBe(2);
    });

    it("leaves nothing behind when a step cannot be created", async () => {
      const typeId = (await types.createTaskType({ orgId, projectId, name: "Change" }, ctx)).taskType.id;
      await types.createTaskStatus({ taskTypeId: typeId, name: "queued" }, ctx);
      const t = (await create([{ key: "a", title: "A" }, { key: "b", title: "B", taskTypeId: typeId, dependsOn: ["a"] }])).template;
      // The type changes after the template was saved: its status goes away.
      await db.delete(S.taskStatuses).where((await import("drizzle-orm")).eq(S.taskStatuses.taskTypeId, typeId));
      await db.insert(S.taskStatuses).values({ id: "st-x-" + stamp, taskTypeId: typeId, name: "other", position: 0 });
      await db.update(S.workflowTemplates).set({
        steps: JSON.stringify([{ key: "a", title: "A", description: "", priority: 0, dependsOn: [] },
          { key: "b", title: "B", description: "", priority: 0, taskTypeId: typeId, status: "queued", dependsOn: ["a"] }]),
      });
      await expectCode(wf.instantiateWorkflow({ templateId: t.id, projectId }, ctx), Code.InvalidArgument, /does not have \(other\)/);
      expect(await db.select().from(S.tasks)).toHaveLength(0);

      // A failure CreateTask itself raises mid-way is rolled back too.
      await db.update(S.workflowTemplates).set({
        steps: JSON.stringify([{ key: "a", title: "A", description: "", priority: 0, dependsOn: [] },
          { key: "b", title: "B", description: "", priority: 0, status: "x".repeat(300), dependsOn: ["a"] }]),
      });
      await expectCode(wf.instantiateWorkflow({ templateId: t.id, projectId }, ctx), Code.InvalidArgument);
      expect(await db.select().from(S.tasks)).toHaveLength(0);
      expect(await db.select().from(S.taskLinks)).toHaveLength(0);
    });

    it("needs tasks:write in the template's organization, and the template's project", async () => {
      const t = (await create()).template;
      await expectCode(wf.instantiateWorkflow({ templateId: t.id, projectId }, agentCtx(["tasks:read"])), Code.PermissionDenied);
      const other = "proj2-wf-" + stamp;
      await db.insert(S.projects).values({ id: other, orgId, templateId: "tmpl-wf-" + stamp, ownerId: adminId, name: "Q", key: "QQ", createdAt: new Date() });
      const own = (await create([{ key: "a", title: "A" }], { projectId: other })).template;
      await expectCode(wf.instantiateWorkflow({ templateId: own.id, projectId }, ctx), Code.FailedPrecondition, /another project/);
      await seedOrgWithAdmin(db, { orgId: "org2-wf-" + stamp, userId: "u2-wf-" + stamp, name: "Other" });
      await seedProject(db, { orgId: "org2-wf-" + stamp, userId: "u2-wf-" + stamp, templateId: "tmpl2-wf-" + stamp, projectId: "proj3-wf-" + stamp, name: "R" });
      await expectCode(wf.instantiateWorkflow({ templateId: t.id, projectId: "proj3-wf-" + stamp }, makeAuthContext("u2-wf-" + stamp)), Code.NotFound);
      await expectCode(wf.instantiateWorkflow({ templateId: "wft-nope", projectId }, ctx), Code.NotFound);
    });
  });
});
