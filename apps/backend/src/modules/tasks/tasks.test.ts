import { expect, test, describe } from "bun:test";
import { setupIntegrationTest } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createTasksHandler } from "./tasks.handler";

describe("Tasks Handler Integration Tests", () => {
  test("createTaskType can create, publish, and retrieve task types", async () => {
    const { db, nc } = await setupIntegrationTest();
    
    // Pre-requisite: Setup dummy organization explicitly needed to avoid foreign constraints
    const orgId = "org-handlertt-" + Date.now().toString();
    try {
        await db.insert(schemaSqlite.organizations).values({
          id: orgId,
          name: "Test Org Handler TT",
          slug: "test-org-handlertt-" + Date.now().toString(),
          createdAt: new Date(),
        });
    } catch {}

    // 3. Inject Dependencies into factory
    const handler = createTasksHandler(db, nc);

    // 4. Test createTaskType
    const reqCreate = {
      orgId: orgId,
      projectId: null,
      name: "Integration Test Task",
    };

    const createResp = await handler.createTaskType(reqCreate);
    expect(createResp.taskType).toBeDefined();
    expect(createResp.taskType.name).toBe("Integration Test Task");

    // 5. Verify NATS publish logic fired
    const subjects = nc.publishedMessages.map((m: any) => m.subject);
    expect(subjects).toContain("domain.task_type.created");

    // 6. Test getTaskType (fetching what we just created)
    const getRes = await handler.getTaskType({ id: createResp.taskType.id });
    expect(getRes.taskType).toBeDefined();
    expect(getRes.taskType.id).toBe(createResp.taskType.id);
    expect(getRes.taskType.name).toBe("Integration Test Task");
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

    const { createTaskManagementHandler } = require("./tasks.handler");
    const handler = createTaskManagementHandler(db, nc);

    const taskResp = await handler.createTask({
      projectId: projectId,
      title: "New Test Task",
      status: "todo",
      description: "testing",
    });
    
    expect(taskResp.task).toBeDefined();
    expect(taskResp.task.title).toBe("New Test Task");

    const subjects = nc.publishedMessages.map((m: any) => m.subject);
    expect(subjects).toContain("domain.task.created");

    const assignResp = await handler.assignTask({
      taskId: taskResp.task.id,
      userId: userId,
    });
    
    expect(assignResp.success).toBe(true);
  });
});
