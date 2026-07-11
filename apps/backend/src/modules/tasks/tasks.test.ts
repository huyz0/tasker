import { expect, test, describe } from "bun:test";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createTasksHandler } from "./tasks.handler";

describe("Tasks Handler Integration Tests", () => {
  test("createTaskType can create, publish, and retrieve task types", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-handlertt-" + Date.now().toString();
    const userId = "user-handlertt-" + Date.now().toString();
    try {
        await db.insert(schemaSqlite.organizations).values({
          id: orgId,
          name: "Test Org Handler TT",
          slug: "test-org-handlertt-" + Date.now().toString(),
          createdAt: new Date(),
        });
        await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
        await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    } catch {}
    const ctx = makeAuthContext(userId);

    const handler = createTasksHandler(db, nc);

    const reqCreate = {
      orgId: orgId,
      projectId: null,
      name: "Integration Test Task",
    };

    const createResp = await handler.createTaskType(reqCreate, ctx);
    expect(createResp.taskType).toBeDefined();
    expect(createResp.taskType.name).toBe("Integration Test Task");

    const subjects = nc.publishedMessages.map((m: any) => m.subject);
    expect(subjects).toContain("domain.task_type.created");

    const getRes = await handler.getTaskType({ id: createResp.taskType.id }, ctx);
    expect(getRes.taskType).toBeDefined();
    expect(getRes.taskType.id).toBe(createResp.taskType.id);
    expect(getRes.taskType.name).toBe("Integration Test Task");

    await expect(handler.getTaskType({ id: createResp.taskType.id }, makeAuthContext("user-outsider"))).rejects.toThrow();

    // A projectId that belongs to a different org than the one requested must be rejected.
    const otherOrgId = "org-other-tt-" + Date.now();
    const otherUserId = "user-other-tt-" + Date.now();
    const otherTemplateId = "tmpl-other-tt-" + Date.now();
    const otherProjectId = "proj-other-tt-" + Date.now();
    await db.insert(schemaSqlite.organizations).values({ id: otherOrgId, name: "Other", slug: "other-tt-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: otherUserId, email: `${otherUserId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: otherOrgId, userId: otherUserId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: otherTemplateId, orgId: otherOrgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: otherProjectId, orgId: otherOrgId, templateId: otherTemplateId, ownerId: otherUserId, name: "P", createdAt: new Date() });

    await expect(handler.createTaskType({ orgId, projectId: otherProjectId, name: "Cross" }, ctx)).rejects.toThrow();
  });

  test("createTaskManagementHandler can create/assign tasks", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-taskman-" + Date.now().toString();
    const userId = "user-taskman-" + Date.now().toString();
    const templateId = "tmpl-taskman-" + Date.now().toString();
    const projectId = "proj-taskman-" + Date.now().toString();

    try {
        await db.insert(schemaSqlite.users).values({
          id: userId,
          email: "taskman@test.com",
          createdAt: new Date(),
        });
        await db.insert(schemaSqlite.organizations).values({
          id: orgId,
          name: "Test Org TaskMan",
          slug: "test-org-taskman-" + Date.now().toString(),
          createdAt: new Date(),
        });
        await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
        await db.insert(schemaSqlite.projectTemplates).values({
          id: templateId,
          orgId: orgId,
          name: "Test Temp",
          createdAt: new Date(),
        });
        await db.insert(schemaSqlite.projects).values({
          id: projectId,
          orgId: orgId,
          templateId: templateId,
          ownerId: userId,
          name: "Test Proj",
          createdAt: new Date(),
        });
    } catch {}
    const ctx = makeAuthContext(userId);

    const { createTaskManagementHandler } = require("./tasks.handler");
    const handler = createTaskManagementHandler(db, nc);

    const taskResp = await handler.createTask({
      projectId: projectId,
      title: "New Test Task",
      status: "todo",
      description: "testing",
    }, ctx);

    expect(taskResp.task).toBeDefined();
    expect(taskResp.task.title).toBe("New Test Task");

    const subjects = nc.publishedMessages.map((m: any) => m.subject);
    expect(subjects).toContain("domain.task.created");

    const assignResp = await handler.assignTask({
      taskId: taskResp.task.id,
      userId: userId,
    }, ctx);

    expect(assignResp.success).toBe(true);

    const listResp = await handler.listTasks({ projectId: projectId }, ctx);
    expect(listResp.tasks.length).toBeGreaterThan(0);
    expect(listResp.tasks.some((t: any) => t.title === "New Test Task")).toBe(true);

    await expect(handler.listTasks({}, ctx)).rejects.toThrow();

    const outsiderCtx = makeAuthContext("user-outsider-taskman");
    await db.insert(schemaSqlite.users).values({ id: "user-outsider-taskman", email: "outsider-tm@test.com", createdAt: new Date() });
    await expect(handler.listTasks({ projectId }, outsiderCtx)).rejects.toThrow();
    await expect(handler.createTask({ projectId, title: "X" }, outsiderCtx)).rejects.toThrow();
    await expect(handler.assignTask({ taskId: taskResp.task.id, userId: "user-outsider-taskman" }, outsiderCtx)).rejects.toThrow();

    // A legitimate org member trying to assign the task to an agentId that doesn't exist, or to a
    // user who isn't a member of this org, must be rejected too.
    await expect(handler.assignTask({ taskId: taskResp.task.id, agentId: "agent-does-not-exist" }, ctx)).rejects.toThrow();
    await expect(handler.assignTask({ taskId: taskResp.task.id, userId: "user-outsider-taskman" }, ctx)).rejects.toThrow();
  });

  test("updateTaskStatus updates status for org members and rejects everyone else", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-status-" + Date.now().toString();
    const userId = "user-status-" + Date.now().toString();
    const templateId = "tmpl-status-" + Date.now().toString();
    const projectId = "proj-status-" + Date.now().toString();

    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Test Org Status", slug: "test-org-status-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "P", createdAt: new Date() });

    const ctx = makeAuthContext(userId);
    const { createTaskManagementHandler } = require("./tasks.handler");
    const handler = createTaskManagementHandler(db, nc);

    const taskResp = await handler.createTask({ projectId, title: "Status Task", status: "todo", description: "" }, ctx);

    const updateResp = await handler.updateTaskStatus({ taskId: taskResp.task.id, status: "in-progress" }, ctx);
    expect(updateResp.task.status).toBe("in-progress");

    const listResp = await handler.listTasks({ projectId }, ctx);
    expect(listResp.tasks.find((t: any) => t.id === taskResp.task.id)?.status).toBe("in-progress");

    await expect(handler.updateTaskStatus({ taskId: taskResp.task.id, status: "not-a-real-status" }, ctx)).rejects.toThrow();
    await expect(handler.updateTaskStatus({ taskId: "task-does-not-exist", status: "done" }, ctx)).rejects.toThrow();

    const outsiderCtx = makeAuthContext("user-outsider-status");
    await db.insert(schemaSqlite.users).values({ id: "user-outsider-status", email: "outsider-status@test.com", createdAt: new Date() });
    await expect(handler.updateTaskStatus({ taskId: taskResp.task.id, status: "done" }, outsiderCtx)).rejects.toThrow();
  });
});
