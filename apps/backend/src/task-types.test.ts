import { expect, test, describe } from "bun:test";
import { setupDatabase } from "../db";
import * as schemaSqlite from "../schema.sqlite";
import { eq } from "drizzle-orm";

describe("TaskTypes Service End-to-End Logic", () => {
  test("can insert a task type and retrieve it", async () => {
    // Only test locally via SQLite to avoid requiring MySQL credentials
    const db = await setupDatabase("sqlite");
    
    // Setup dummy organization
    const orgId = "org-tt-" + Date.now().toString();
    await (db as any).insert(schemaSqlite.organizations).values({
      id: orgId,
      name: "Test Org TT",
      slug: "test-org-tt-" + Date.now().toString(),
      createdAt: new Date(),
    });

    const newId = "tt-test-" + Date.now().toString();
    const payload = {
      id: newId,
      orgId: orgId,
      projectId: null,
      name: "Feature Bug",
    };

    await (db as any).insert(schemaSqlite.taskTypes).values({ ...payload, createdAt: new Date() });

    const result = await (db as any)
      .select()
      .from(schemaSqlite.taskTypes)
      .where(eq(schemaSqlite.taskTypes.id, newId));

    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Feature Bug");
  });
});
