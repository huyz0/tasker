import { describe, it, expect } from "bun:test";
import { setupDatabase } from "./db";

// Unit runs have no external prerequisite. The explicit CI command supplies
// real MySQL and a new owned schema; this test proves boot applies migrations.
const enabled = process.env.TASKER_MYSQL_INTEGRATION === "1";
const testIf = enabled ? describe : describe.skip;

testIf("setupDatabase(mysql)", () => {
  // Cold migration of the complete schema is bounded integration bootstrap,
  // not a steady-state query budget. Native read latency assertions stay intact.
  it("applies migrations on boot, creating all expected tables", async () => {
    const db = await setupDatabase("mysql");
    try {
      const [rows] = await (db as any).$client.query("SHOW TABLES");
      const tableNames = (rows as any[]).map((row: any) => Object.values(row)[0]);
      for (const expected of ["organizations", "projects", "tasks", "artifacts", "repository_links", "task_reviewers"]) {
        expect(tableNames).toContain(expected);
      }
    } finally { await (db as any).$client.end(); }
  }, 30_000);
});
