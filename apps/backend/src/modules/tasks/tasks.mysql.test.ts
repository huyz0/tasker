import { describe, it, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { setupDatabase } from "../../db/db";
import * as schemaMysql from "../../db/schema.mysql";
import { makeAuthContext } from "../../test/setup";
import { createTaskManagementHandler } from "./tasks.handler";

// Requires a real MySQL instance reachable via DB_HOST/DB_USER/DB_PASSWORD/DB_NAME
// (e.g. `docker compose up -d mysql` from the repo root) - not run by default
// `bun test` since CI has no MySQL service. This test exists because
// createTask's task-number allocation (update-then-select, now a `SELECT ...
// FOR UPDATE` transaction) is only exercised for real concurrency bugs under
// MySQL's multi-connection model - SQLite's single-writer model can't
// reproduce the race the fix addresses.
const runMysqlIntegration = process.env.TASKER_MYSQL_INTEGRATION === "1";
const testIf = runMysqlIntegration ? describe : describe.skip;

testIf("createTask concurrency (mysql)", () => {
  it("never assigns the same task number to two concurrent creates in the same project", async () => {
    const previousStandalone = process.env.STANDALONE;
    process.env.STANDALONE = "false";
    try {
      const db = (await setupDatabase("mysql")) as any;
      const handler = createTaskManagementHandler(db);

      const orgId = "org-" + crypto.randomUUID();
      const userId = "user-" + crypto.randomUUID();
      const templateId = "tmpl-" + crypto.randomUUID();
      const projectId = "proj-" + crypto.randomUUID();

      await db.insert(schemaMysql.organizations).values({ id: orgId, name: "Org", slug: "org-" + Date.now() });
      await db.insert(schemaMysql.users).values({ id: userId, email: `${userId}@test.com` });
      await db.insert(schemaMysql.organizationMembers).values({ orgId, userId, role: "admin" });
      await db.insert(schemaMysql.projectTemplates).values({ id: templateId, orgId, name: "Tmpl" });
      await db.insert(schemaMysql.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", key: "CONC" });

      const ctx = makeAuthContext(userId);
      const concurrentCreates = 10;
      const results = await Promise.all(
        Array.from({ length: concurrentCreates }, (_, i) =>
          handler.createTask({ projectId, title: `Task ${i}` }, ctx)
        )
      );

      const displayIds = results.map((r: any) => r.task.displayId);
      expect(new Set(displayIds).size).toBe(concurrentCreates);
    } finally {
      process.env.STANDALONE = previousStandalone;
    }
  });
});

// M14-T06's claim primitive uses different SQL per dialect (SQLite has no
// FROM DUAL; MySQL needs it for a literal-only SELECT) - the sqlite unit
// test proves the logic is race-safe, but only real MySQL under genuine
// concurrent connections proves the FROM DUAL variant is valid SQL at all
// and holds the same guarantee.
testIf("claimTask concurrency (mysql)", () => {
  it("assigns exactly one of several concurrent claimants to the same task", async () => {
    const previousStandalone = process.env.STANDALONE;
    process.env.STANDALONE = "false";
    try {
      const db = (await setupDatabase("mysql")) as any;
      const handler = createTaskManagementHandler(db);

      const orgId = "org-" + crypto.randomUUID();
      const userId = "user-" + crypto.randomUUID();
      const templateId = "tmpl-" + crypto.randomUUID();
      const projectId = "proj-" + crypto.randomUUID();
      const agentRoleId = "role-" + crypto.randomUUID();

      await db.insert(schemaMysql.organizations).values({ id: orgId, name: "Org", slug: "org-" + Date.now() });
      await db.insert(schemaMysql.users).values({ id: userId, email: `${userId}@test.com` });
      await db.insert(schemaMysql.organizationMembers).values({ orgId, userId, role: "admin" });
      await db.insert(schemaMysql.projectTemplates).values({ id: templateId, orgId, name: "Tmpl" });
      await db.insert(schemaMysql.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", key: "CLAIM" });
      await db.insert(schemaMysql.agentRoles).values({ id: agentRoleId, orgId, name: "Role", systemPrompt: "p", capabilities: "[]" });

      const ctx = makeAuthContext(userId);
      const task = await handler.createTask({ projectId, title: "Contested" }, ctx);

      const claimantCount = 8;
      const agentIds = await Promise.all(
        Array.from({ length: claimantCount }, async (_, i) => {
          const agentId = "agent-" + crypto.randomUUID();
          await db.insert(schemaMysql.agents).values({ id: agentId, orgId, agentRoleId, name: `Agent ${i}` });
          return agentId;
        })
      );

      const { createContextValues } = await import("@connectrpc/connect");
      const { currentPrincipalKey } = await import("../auth/session");
      const agentCtxs = agentIds.map((agentId) => {
        const v = createContextValues();
        v.set(currentPrincipalKey, { kind: "agent", agentId, orgId, tokenId: "tok-" + agentId, scopes: ["tasks:read", "tasks:write"] });
        return { values: v } as any;
      });

      const results = await Promise.allSettled(agentCtxs.map((c) => handler.claimTask({ taskId: task.task.id }, c)));
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled.length).toBe(1);

      const rows = await db.select().from(schemaMysql.taskAssignments).where(eq(schemaMysql.taskAssignments.taskId, task.task.id));
      expect(rows.length).toBe(1);
    } finally {
      process.env.STANDALONE = previousStandalone;
    }
  });
});
