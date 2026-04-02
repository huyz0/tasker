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
});
