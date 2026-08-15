import { describe, it, expect } from "bun:test";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import { createTasksHandler, createTaskManagementHandler } from "./tasks.handler";

async function seed(db: any) {
  const s = String(Math.random()).slice(2);
  const orgId = `org-${s}`, admin = `u-${s}`, viewer = `v-${s}`;
  const templateId = `t-${s}`, projectId = `p-${s}`, typeId = `tt-${s}`;
  const now = new Date();
  await db.insert(schema.organizations).values({ id: orgId, name: "O", slug: orgId, createdAt: now });
  await db.insert(schema.users).values([
    { id: admin, email: `${admin}@t.test`, name: "Admin", createdAt: now },
    { id: viewer, email: `${viewer}@t.test`, name: "Viewer", createdAt: now },
  ]);
  await db.insert(schema.organizationMembers).values([
    { orgId, userId: admin, role: "admin", joinedAt: now },
    { orgId, userId: viewer, role: "viewer", joinedAt: now },
  ]);
  await db.insert(schema.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: now });
  await db.insert(schema.projects).values({ id: projectId, orgId, templateId, ownerId: admin, name: "P", key: "TT", createdAt: now });
  await db.insert(schema.taskTypes).values({ id: typeId, orgId, projectId, name: "Bug", createdAt: now });
  return { orgId, admin, viewer, projectId, typeId, now };
}

const types = (db: any) => createTasksHandler(db, null);
const tasks = (db: any) => createTaskManagementHandler(db, null);

const addStatuses = async (db: any, typeId: string, admin: string, names: string[]) => {
  const h = types(db);
  const out: any[] = [];
  for (const name of names) out.push((await h.createTaskStatus({ taskTypeId: typeId, name }, makeAuthContext(admin)) as any).status);
  return out;
};

describe("status ordering", () => {
  it("appends each new status rather than dropping it in the middle", async () => {
    const { db } = await setupIntegrationTest();
    const { typeId, admin } = await seed(db);
    const created = await addStatuses(db, typeId, admin, ["todo", "in progress", "done"]);

    expect(created.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it("returns statuses in their configured order, not the database's", async () => {
    const { db } = await setupIntegrationTest();
    const { typeId, admin } = await seed(db);
    const [todo, doing, done] = await addStatuses(db, typeId, admin, ["todo", "in progress", "done"]);

    await types(db).reorderTaskStatuses(
      { taskTypeId: typeId, statusIds: [done.id, todo.id, doing.id] },
      makeAuthContext(admin),
    );

    const res: any = await types(db).getTaskType({ id: typeId }, makeAuthContext(admin));
    expect(res.statuses.map((s: any) => s.name)).toEqual(["done", "todo", "in progress"]);
  });

  it("refuses a reorder that does not name every status", async () => {
    const { db } = await setupIntegrationTest();
    const { typeId, admin } = await seed(db);
    const [todo] = await addStatuses(db, typeId, admin, ["todo", "in progress", "done"]);

    // Leaving statuses out is how two of them end up sharing a position.
    await expect(
      types(db).reorderTaskStatuses({ taskTypeId: typeId, statusIds: [todo.id] }, makeAuthContext(admin)),
    ).rejects.toThrow(/every status/);
  });

  it("refuses a reorder naming a status twice, or one from another type", async () => {
    const { db } = await setupIntegrationTest();
    const a = await seed(db);
    const b = await seed(db);
    const [todo, doing] = await addStatuses(db, a.typeId, a.admin, ["todo", "in progress"]);
    const [other] = await addStatuses(db, b.typeId, b.admin, ["todo"]);

    await expect(
      types(db).reorderTaskStatuses({ taskTypeId: a.typeId, statusIds: [todo.id, todo.id] }, makeAuthContext(a.admin)),
    ).rejects.toThrow(/duplicate/);
    await expect(
      types(db).reorderTaskStatuses({ taskTypeId: a.typeId, statusIds: [todo.id, other.id] }, makeAuthContext(a.admin)),
    ).rejects.toThrow(/every status/);
    // The valid case still works, so the rejections above are not the handler
    // simply refusing everything.
    await types(db).reorderTaskStatuses({ taskTypeId: a.typeId, statusIds: [doing.id, todo.id] }, makeAuthContext(a.admin));
  });

  it("refuses a reorder from a viewer", async () => {
    const { db } = await setupIntegrationTest();
    const { typeId, admin, viewer } = await seed(db);
    const [todo] = await addStatuses(db, typeId, admin, ["todo"]);

    await expect(
      types(db).reorderTaskStatuses({ taskTypeId: typeId, statusIds: [todo.id] }, makeAuthContext(viewer)),
    ).rejects.toThrow();
  });
});

describe("deleting a transition", () => {
  it("removes the edge so the transition stops being allowed", async () => {
    const { db } = await setupIntegrationTest();
    const { typeId, admin, projectId, now } = await seed(db);
    const [todo, done] = await addStatuses(db, typeId, admin, ["todo", "done"]);
    const h = types(db);
    const edge: any = await h.createTaskStatusTransition(
      { taskTypeId: typeId, fromStatusId: todo.id, toStatusId: done.id }, makeAuthContext(admin));
    await db.insert(schema.tasks).values({ id: `task-${typeId}`, projectId, taskTypeId: typeId, title: "T", status: "todo", createdAt: now });

    // Allowed while the edge exists...
    await tasks(db).updateTaskStatus({ taskId: `task-${typeId}`, status: "done" }, makeAuthContext(admin));
    await tasks(db).updateTaskStatus({ taskId: `task-${typeId}`, status: "todo" }, makeAuthContext(admin))
      .catch(() => { /* no edge back; irrelevant to this assertion */ });

    await h.deleteTaskStatusTransition({ transitionId: edge.transition.id, taskTypeId: typeId }, makeAuthContext(admin));

    const res: any = await h.getTaskType({ id: typeId }, makeAuthContext(admin));
    expect(res.transitions).toHaveLength(0);
  });

  it("is idempotent, and authorizes even when the edge is already gone", async () => {
    const { db } = await setupIntegrationTest();
    const { typeId, admin, viewer } = await seed(db);
    const h = types(db);

    const res: any = await h.deleteTaskStatusTransition(
      { transitionId: "tstr-never-existed", taskTypeId: typeId }, makeAuthContext(admin));
    expect(res.success).toBe(true);

    // The authorization must not depend on the row existing — otherwise any
    // caller gets "success" for any id, and the check never runs.
    await expect(
      h.deleteTaskStatusTransition({ transitionId: "tstr-never-existed", taskTypeId: typeId }, makeAuthContext(viewer)),
    ).rejects.toThrow();
  });

  it("will not delete an edge belonging to a different task type", async () => {
    const { db } = await setupIntegrationTest();
    const a = await seed(db);
    const b = await seed(db);
    const [todo, done] = await addStatuses(db, a.typeId, a.admin, ["todo", "done"]);
    const edge: any = await types(db).createTaskStatusTransition(
      { taskTypeId: a.typeId, fromStatusId: todo.id, toStatusId: done.id }, makeAuthContext(a.admin));

    // b's admin is authorized for b's type, so only the pair match stops this.
    await types(db).deleteTaskStatusTransition(
      { transitionId: edge.transition.id, taskTypeId: b.typeId }, makeAuthContext(b.admin));

    const res: any = await types(db).getTaskType({ id: a.typeId }, makeAuthContext(a.admin));
    expect(res.transitions).toHaveLength(1);
  });
});

describe("the configured machine is what gets enforced", () => {
  it("refuses a status the type does not define, and a transition it does not allow", async () => {
    const { db } = await setupIntegrationTest();
    const { typeId, admin, projectId, now } = await seed(db);
    const [triage, doing, done] = await addStatuses(db, typeId, admin, ["triage", "doing", "done"]);
    const h = types(db);
    await h.createTaskStatusTransition({ taskTypeId: typeId, fromStatusId: triage.id, toStatusId: doing.id }, makeAuthContext(admin));
    const taskId = `task-enf-${typeId}`;
    await db.insert(schema.tasks).values({ id: taskId, projectId, taskTypeId: typeId, title: "T", status: "triage", createdAt: now });

    // "todo" is one of the built-in fallback statuses; a type with its own
    // statuses must stop honouring those.
    await expect(tasks(db).updateTaskStatus({ taskId, status: "todo" }, makeAuthContext(admin)))
      .rejects.toThrow(/invalid status/);
    await expect(tasks(db).updateTaskStatus({ taskId, status: "done" }, makeAuthContext(admin)))
      .rejects.toThrow(/not allowed/);
    await tasks(db).updateTaskStatus({ taskId, status: "doing" }, makeAuthContext(admin));

    const after: any = await tasks(db).listTasks({ projectId }, makeAuthContext(admin));
    expect(after.tasks.find((t: any) => t.id === taskId).status).toBe("doing");
    expect(done.position).toBe(2);
  });
});
