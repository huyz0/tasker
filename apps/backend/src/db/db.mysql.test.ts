import { describe, it, expect } from "bun:test";
import { setupDatabase } from "./db";

// Requires a real MySQL instance reachable via DB_HOST/DB_USER/DB_PASSWORD/DB_NAME
// (e.g. `docker compose up -d mysql` from the repo root) - not run by default
// `bun test` since CI has no MySQL service. This test exists because
// setupDatabase's mysql branch previously never ran migrations at all (no
// drizzle-mysql folder existed), so a fresh MySQL deployment would boot with
// zero tables - a bug the sqlite-only integration test suite could never
// catch.
const runMysqlIntegration = process.env.TASKER_MYSQL_INTEGRATION === "1";
const testIf = runMysqlIntegration ? describe : describe.skip;

testIf("setupDatabase(mysql)", () => {
  it("applies migrations on boot, creating all expected tables", async () => {
    const db = await setupDatabase("mysql");
    const [rows] = await (db as any).$client.query("SHOW TABLES");
    const tableNames = (rows as any[]).map((r: any) => Object.values(r)[0]);

    for (const expected of ["organizations", "projects", "tasks", "artifacts", "repository_links", "task_reviewers"]) {
      expect(tableNames).toContain(expected);
    }
  });
});
