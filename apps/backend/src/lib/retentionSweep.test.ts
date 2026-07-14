import { expect, test, describe } from "bun:test";
import { eq } from "drizzle-orm";
import { setupIntegrationTest } from "../test/setup";
import * as schemaSqlite from "../db/schema.sqlite";
import { runRetentionSweep, DEFAULT_RETENTION_DAYS, stillExpired } from "./retentionSweep";

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

describe("runRetentionSweep", () => {
  test("purges a project past the default 30-day retention, and its full cascade of tasks/folders/artifacts", async () => {
    const { db } = await setupIntegrationTest();

    const orgId = "org-sweep-" + Date.now();
    const userId = "user-sweep-" + Date.now();
    const templateId = "tmpl-sweep-" + Date.now();
    const projectId = "proj-sweep-" + Date.now();
    const folderId = "folder-sweep-" + Date.now();
    const artifactId = "art-sweep-" + Date.now();
    const taskId = "tsk-sweep-" + Date.now();

    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Sweep Org", slug: "sweep-org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({
      id: projectId, orgId, templateId, ownerId: userId, name: "Expired Project",
      createdAt: new Date(), deletedAt: daysAgo(DEFAULT_RETENTION_DAYS + 1),
    });
    await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: "F", createdAt: new Date() });
    await db.insert(schemaSqlite.artifacts).values({ id: artifactId, folderId, name: "A", createdAt: new Date() });
    await db.insert(schemaSqlite.tasks).values({ id: taskId, projectId, title: "Task", status: "todo", createdAt: new Date() });

    const purged = await runRetentionSweep(db);
    expect(purged.projects).toBe(1);

    expect((await db.select().from(schemaSqlite.projects).where(eq(schemaSqlite.projects.id, projectId))).length).toBe(0);
    expect((await db.select().from(schemaSqlite.folders).where(eq(schemaSqlite.folders.id, folderId))).length).toBe(0);
    expect((await db.select().from(schemaSqlite.artifacts).where(eq(schemaSqlite.artifacts.id, artifactId))).length).toBe(0);
    expect((await db.select().from(schemaSqlite.tasks).where(eq(schemaSqlite.tasks.id, taskId))).length).toBe(0);
  });

  test("does not purge an archived project before its retention period elapses", async () => {
    const { db } = await setupIntegrationTest();

    const orgId = "org-sweep-fresh-" + Date.now();
    const userId = "user-sweep-fresh-" + Date.now();
    const templateId = "tmpl-sweep-fresh-" + Date.now();
    const projectId = "proj-sweep-fresh-" + Date.now();

    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Fresh Org", slug: "fresh-org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({
      id: projectId, orgId, templateId, ownerId: userId, name: "Recently Archived",
      createdAt: new Date(), deletedAt: daysAgo(5),
    });

    const purged = await runRetentionSweep(db);
    expect(purged.projects).toBe(0);
    expect((await db.select().from(schemaSqlite.projects).where(eq(schemaSqlite.projects.id, projectId))).length).toBe(1);
  });

  test("respects a per-org custom retention override", async () => {
    const { db } = await setupIntegrationTest();

    const orgId = "org-sweep-custom-" + Date.now();
    const userId = "user-sweep-custom-" + Date.now();
    const templateId = "tmpl-sweep-custom-" + Date.now();
    const projectId = "proj-sweep-custom-" + Date.now();

    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Custom Org", slug: "custom-org-" + Date.now(), createdAt: new Date(), binRetentionDays: 60 });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({
      id: projectId, orgId, templateId, ownerId: userId, name: "40 Days Archived",
      createdAt: new Date(), deletedAt: daysAgo(40),
    });

    // Would be expired under the 30-day default, but this org overrides to 60.
    const purged = await runRetentionSweep(db);
    expect(purged.projects).toBe(0);
    expect((await db.select().from(schemaSqlite.projects).where(eq(schemaSqlite.projects.id, projectId))).length).toBe(1);
  });

  test("purges an expired org and forcibly cascades through its live (non-expired) project", async () => {
    const { db } = await setupIntegrationTest();

    const orgId = "org-sweep-cascade-" + Date.now();
    const userId = "user-sweep-cascade-" + Date.now();
    const templateId = "tmpl-sweep-cascade-" + Date.now();
    const projectId = "proj-sweep-cascade-" + Date.now();

    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({
      id: orgId, name: "Expired Org", slug: "expired-org-" + Date.now(), createdAt: new Date(),
      deletedAt: daysAgo(DEFAULT_RETENTION_DAYS + 1),
    });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    // This project is still "live" (not archived) - the org's expiry should still take it with it.
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Still Active Project", createdAt: new Date() });

    const purged = await runRetentionSweep(db);
    expect(purged.organizations).toBe(1);

    expect((await db.select().from(schemaSqlite.organizations).where(eq(schemaSqlite.organizations.id, orgId))).length).toBe(0);
    expect((await db.select().from(schemaSqlite.projects).where(eq(schemaSqlite.projects.id, projectId))).length).toBe(0);
  });

  test("is a no-op when nothing is archived", async () => {
    const { db } = await setupIntegrationTest();
    const purged = await runRetentionSweep(db);
    expect(Object.values(purged).every((n) => n === 0)).toBe(true);
  });

  test("independently purges an expired task, folder, artifact, and agent within a still-live project", async () => {
    const { db } = await setupIntegrationTest();

    const orgId = "org-sweep-leaf-" + Date.now();
    const userId = "user-sweep-leaf-" + Date.now();
    const templateId = "tmpl-sweep-leaf-" + Date.now();
    const projectId = "proj-sweep-leaf-" + Date.now();
    const folderId = "folder-sweep-leaf-" + Date.now();
    const artifactId = "art-sweep-leaf-" + Date.now();
    const taskId = "tsk-sweep-leaf-" + Date.now();
    const agentRoleId = "role-sweep-leaf-" + Date.now();
    const agentId = "agent-sweep-leaf-" + Date.now();

    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Leaf Org", slug: "leaf-org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    // The project itself is untouched (not archived) - only its contents are individually expired.
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Live Project", createdAt: new Date() });
    await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: "F", createdAt: new Date(), deletedAt: daysAgo(DEFAULT_RETENTION_DAYS + 1) });
    await db.insert(schemaSqlite.artifacts).values({ id: artifactId, folderId, name: "A", createdAt: new Date(), deletedAt: daysAgo(DEFAULT_RETENTION_DAYS + 1) });
    await db.insert(schemaSqlite.tasks).values({ id: taskId, projectId, title: "T", status: "todo", createdAt: new Date(), deletedAt: daysAgo(DEFAULT_RETENTION_DAYS + 1) });
    await db.insert(schemaSqlite.agentRoles).values({ id: agentRoleId, name: "Role", systemPrompt: "p", capabilities: "{}" });
    await db.insert(schemaSqlite.agents).values({ id: agentId, orgId, agentRoleId, name: "Agent", deletedAt: daysAgo(DEFAULT_RETENTION_DAYS + 1) });

    const purged = await runRetentionSweep(db);
    expect(purged.tasks).toBe(1);
    expect(purged.folders).toBe(1);
    // The artifact is removed as part of the folder's own forced cascade (folders
    // are swept before artifacts), so it isn't separately counted here - the
    // assertions below confirm it's gone either way.
    expect(purged.agents).toBe(1);
    expect(purged.projects).toBe(0);

    expect((await db.select().from(schemaSqlite.projects).where(eq(schemaSqlite.projects.id, projectId))).length).toBe(1);
    expect((await db.select().from(schemaSqlite.tasks).where(eq(schemaSqlite.tasks.id, taskId))).length).toBe(0);
    expect((await db.select().from(schemaSqlite.folders).where(eq(schemaSqlite.folders.id, folderId))).length).toBe(0);
    expect((await db.select().from(schemaSqlite.artifacts).where(eq(schemaSqlite.artifacts.id, artifactId))).length).toBe(0);
    expect((await db.select().from(schemaSqlite.agents).where(eq(schemaSqlite.agents.id, agentId))).length).toBe(0);
  });

  test("stillExpired reports false for a row whose deletedAt has since been cleared (restored)", async () => {
    const { db } = await setupIntegrationTest();

    const orgId = "org-race-" + Date.now();
    const userId = "user-race-" + Date.now();
    const templateId = "tmpl-race-" + Date.now();
    const projectId = "proj-race-" + Date.now();
    const taskId = "tsk-race-" + Date.now();

    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Race Org", slug: "race-org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "P", createdAt: new Date() });
    await db.insert(schemaSqlite.tasks).values({ id: taskId, projectId, title: "T", status: "todo", createdAt: new Date(), deletedAt: daysAgo(DEFAULT_RETENTION_DAYS + 1) });

    expect(await stillExpired(db, schemaSqlite.tasks, taskId)).toBe(true);

    // Simulates a user restoring the task in the window between the sweep's
    // initial batch fetch and the moment it's actually about to be purged.
    await db.update(schemaSqlite.tasks).set({ deletedAt: null }).where(eq(schemaSqlite.tasks.id, taskId));

    expect(await stillExpired(db, schemaSqlite.tasks, taskId)).toBe(false);
  });

  test("does not purge a task that was restored after the sweep's initial fetch but before it was actually purged", async () => {
    const { db } = await setupIntegrationTest();

    const orgId = "org-race2-" + Date.now();
    const userId = "user-race2-" + Date.now();
    const templateId = "tmpl-race2-" + Date.now();
    const projectId = "proj-race2-" + Date.now();
    const taskId = "tsk-race2-" + Date.now();

    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Race Org 2", slug: "race-org2-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "P", createdAt: new Date() });
    await db.insert(schemaSqlite.tasks).values({ id: taskId, projectId, title: "T", status: "todo", createdAt: new Date(), deletedAt: daysAgo(DEFAULT_RETENTION_DAYS + 1) });

    // Wraps the real db so that the moment the sweep issues its initial
    // "isNotNull(deletedAt)" batch fetch of tasks, a restore is raced in
    // right after - simulating a user clicking "Restore" in the same window
    // a background sweep is running.
    let taskBatchFetchSeen = false;
    const racingDb = new Proxy(db, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop !== "select" || typeof value !== "function") return value;
        return (...args: any[]) => {
          const builder = value.apply(target, args);
          const originalFrom = builder.from?.bind(builder);
          if (!originalFrom) return builder;
          builder.from = (table: any) => {
            const fromResult = originalFrom(table);
            if (table !== schemaSqlite.tasks || taskBatchFetchSeen) return fromResult;
            const originalWhere = fromResult.where?.bind(fromResult);
            if (!originalWhere) return fromResult;
            fromResult.where = (...whereArgs: any[]) => {
              taskBatchFetchSeen = true;
              const result = originalWhere(...whereArgs);
              return (async () => {
                const rows = await result;
                if (rows.some((r: any) => r.id === taskId)) {
                  await db.update(schemaSqlite.tasks).set({ deletedAt: null }).where(eq(schemaSqlite.tasks.id, taskId));
                }
                return rows;
              })();
            };
            return fromResult;
          };
          return builder;
        };
      },
    });

    const purged = await runRetentionSweep(racingDb);
    expect(purged.tasks).toBe(0);

    const rows = await db.select().from(schemaSqlite.tasks).where(eq(schemaSqlite.tasks.id, taskId));
    expect(rows.length).toBe(1);
    expect(rows[0].deletedAt).toBeNull();
  });
});
