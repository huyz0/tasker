import { describe, it, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import { createTaskManagementHandler } from "./tasks.handler";
import { ConnectError, Code } from "@connectrpc/connect";

async function seed(db: any) {
  const s = String(Math.random()).slice(2);
  const orgId = `org-${s}`, member = `u-${s}`, other = `u2-${s}`;
  const roleId = `role-${s}`, agentId = `a-${s}`;
  const templateId = `t-${s}`, projectId = `p-${s}`, taskId = `task-${s}`;
  const now = new Date();
  await db.insert(schema.organizations).values({ id: orgId, name: "O", slug: orgId, createdAt: now });
  await db.insert(schema.users).values([
    { id: member, email: `${member}@t.test`, name: "Ada Lovelace", createdAt: now },
    { id: other, email: `${other}@t.test`, name: "Grace Hopper", createdAt: now },
  ]);
  await db.insert(schema.organizationMembers).values([
    { orgId, userId: member, role: "admin", joinedAt: now },
    { orgId, userId: other, role: "member", joinedAt: now },
  ]);
  await db.insert(schema.agentRoles).values({ id: roleId, orgId, name: "R", systemPrompt: "p", capabilities: "[]", createdAt: now });
  await db.insert(schema.agents).values({ id: agentId, orgId, agentRoleId: roleId, name: "Reviewer Bot", createdAt: now });
  await db.insert(schema.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: now });
  await db.insert(schema.projects).values({ id: projectId, orgId, templateId, ownerId: member, name: "P", key: "AS", createdAt: now });
  await db.insert(schema.tasks).values({ id: taskId, projectId, title: "T", status: "todo", createdAt: now });
  return { orgId, member, other, agentId, projectId, taskId };
}

const handlerFor = (db: any) => createTaskManagementHandler(db, null);

describe("assignees are readable", () => {
  it("listTasks reports an assigned person by name", async () => {
    const { db } = await setupIntegrationTest();
    const { member, projectId, taskId } = await seed(db);
    const handler = handlerFor(db);
    await handler.assignTask({ taskId, userId: member }, makeAuthContext(member));

    const res: any = await handler.listTasks({ projectId }, makeAuthContext(member));

    // Stored since M01, readable for the first time here — which is why the
    // card showed a hardcoded avatar instead.
    expect(res.tasks[0].assignees).toEqual([
      { userId: member, agentId: "", name: "Ada Lovelace" },
    ]);
  });

  it("reports an assigned agent by name", async () => {
    const { db } = await setupIntegrationTest();
    const { member, agentId, projectId, taskId } = await seed(db);
    const handler = handlerFor(db);
    await handler.assignTask({ taskId, agentId }, makeAuthContext(member));

    const res: any = await handler.listTasks({ projectId }, makeAuthContext(member));
    expect(res.tasks[0].assignees).toEqual([{ userId: "", agentId, name: "Reviewer Bot" }]);
  });

  it("reports every assignee, because a task can carry several", async () => {
    const { db } = await setupIntegrationTest();
    const { member, other, agentId, projectId, taskId } = await seed(db);
    const handler = handlerFor(db);
    await handler.assignTask({ taskId, userId: member }, makeAuthContext(member));
    await handler.assignTask({ taskId, userId: other }, makeAuthContext(member));
    await handler.assignTask({ taskId, agentId }, makeAuthContext(member));

    const res: any = await handler.listTasks({ projectId }, makeAuthContext(member));
    // Rendering "the assignee" would show one row of a set and hide the rest,
    // making a task look less owned than it is.
    expect(res.tasks[0].assignees).toHaveLength(3);
    expect(res.tasks[0].assignees.map((a: any) => a.name).sort())
      .toEqual(["Ada Lovelace", "Grace Hopper", "Reviewer Bot"]);
  });

  it("returns an empty list for an unassigned task, not null", async () => {
    const { db } = await setupIntegrationTest();
    const { member, projectId } = await seed(db);
    const res: any = await handlerFor(db).listTasks({ projectId }, makeAuthContext(member));
    expect(res.tasks[0].assignees).toEqual([]);
  });

  it("resolves assignees for many tasks without a query per task", async () => {
    const { db } = await setupIntegrationTest();
    const { member, projectId } = await seed(db);
    const handler = handlerFor(db);
    const now = new Date();
    for (let i = 0; i < 25; i++) {
      const id = `bulk-${i}`;
      await db.insert(schema.tasks).values({ id, projectId, title: `T${i}`, status: "todo", createdAt: now });
      await handler.assignTask({ taskId: id, userId: member }, makeAuthContext(member));
    }

    let queries = 0;
    const counting = new Proxy(db, {
      get(target, prop) {
        if (prop === "select") queries++;
        return (target as any)[prop];
      },
    });
    await handlerFor(counting).listTasks({ projectId }, makeAuthContext(member));

    // The page itself, the count, the assignment rows and the name lookups —
    // a handful. One per task would be 26+ and would grow with the page size.
    expect(queries).toBeLessThan(10);
  });
});

describe("unassignTask", () => {
  it("removes a person and leaves the others", async () => {
    const { db } = await setupIntegrationTest();
    const { member, other, projectId, taskId } = await seed(db);
    const handler = handlerFor(db);
    await handler.assignTask({ taskId, userId: member }, makeAuthContext(member));
    await handler.assignTask({ taskId, userId: other }, makeAuthContext(member));

    await handler.unassignTask({ taskId, userId: member }, makeAuthContext(member));

    const res: any = await handler.listTasks({ projectId }, makeAuthContext(member));
    expect(res.tasks[0].assignees.map((a: any) => a.userId)).toEqual([other]);
  });

  it("removes an agent without touching a person assigned to the same task", async () => {
    const { db } = await setupIntegrationTest();
    const { member, agentId, projectId, taskId } = await seed(db);
    const handler = handlerFor(db);
    await handler.assignTask({ taskId, userId: member }, makeAuthContext(member));
    await handler.assignTask({ taskId, agentId }, makeAuthContext(member));

    await handler.unassignTask({ taskId, agentId }, makeAuthContext(member));

    const res: any = await handlerFor(db).listTasks({ projectId }, makeAuthContext(member));
    expect(res.tasks[0].assignees.map((a: any) => a.name)).toEqual(["Ada Lovelace"]);
  });

  it("is idempotent — removing an assignment that is not there is not an error", async () => {
    const { db } = await setupIntegrationTest();
    const { member, taskId } = await seed(db);
    const res: any = await handlerFor(db).unassignTask({ taskId, userId: member }, makeAuthContext(member));
    expect(res.success).toBe(true);
  });

  it("requires naming someone", async () => {
    const { db } = await setupIntegrationTest();
    const { member, taskId } = await seed(db);
    // Without this, an empty request would match the "both null" row shape and
    // could delete an assignment nobody named.
    await expect(handlerFor(db).unassignTask({ taskId }, makeAuthContext(member))).rejects.toThrow();
  });

  it("refuses a viewer", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, member, taskId } = await seed(db);
    const viewer = `v-${Math.random()}`;
    await db.insert(schema.users).values({ id: viewer, email: `${viewer}@t.test`, createdAt: new Date() });
    await db.insert(schema.organizationMembers).values({ orgId, userId: viewer, role: "viewer", joinedAt: new Date() });
    await handlerFor(db).assignTask({ taskId, userId: member }, makeAuthContext(member));

    try {
      await handlerFor(db).unassignTask({ taskId, userId: member }, makeAuthContext(viewer));
      throw new Error("expected a rejection");
    } catch (e) {
      expect((e as ConnectError).code).toBe(Code.PermissionDenied);
    }
  });

  it("refuses someone outside the organization", async () => {
    const { db } = await setupIntegrationTest();
    const a = await seed(db);
    const b = await seed(db);
    await handlerFor(db).assignTask({ taskId: a.taskId, userId: a.member }, makeAuthContext(a.member));
    await expect(handlerFor(db).unassignTask({ taskId: a.taskId, userId: a.member }, makeAuthContext(b.member)))
      .rejects.toThrow(ConnectError);
  });

  it("leaves the row gone, not merely hidden", async () => {
    const { db } = await setupIntegrationTest();
    const { member, taskId } = await seed(db);
    const handler = handlerFor(db);
    await handler.assignTask({ taskId, userId: member }, makeAuthContext(member));
    await handler.unassignTask({ taskId, userId: member }, makeAuthContext(member));

    const rows = await db.select().from(schema.taskAssignments).where(eq(schema.taskAssignments.taskId, taskId));
    expect(rows).toHaveLength(0);
  });
});
