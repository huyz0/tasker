import { describe, it, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { setupIntegrationTest } from "../test/setup";
import * as schemaSqlite from "./schema.sqlite";
import { executePaginatedQuery, encodeCursor, decodeCursor } from "./query-builder";

async function seedTasks(db: any, count: number, projectId: string) {
  await db.insert(schemaSqlite.organizations).values({ id: `org-${projectId}`, name: "Org", slug: `org-${projectId}`, createdAt: new Date() });
  await db.insert(schemaSqlite.users).values({ id: `user-${projectId}`, email: `${projectId}@test.com`, createdAt: new Date() });
  await db.insert(schemaSqlite.projectTemplates).values({ id: `tmpl-${projectId}`, orgId: `org-${projectId}`, name: "T", createdAt: new Date() });
  await db.insert(schemaSqlite.projects).values({ id: projectId, orgId: `org-${projectId}`, templateId: `tmpl-${projectId}`, ownerId: `user-${projectId}`, name: "P", createdAt: new Date() });
  for (let i = 0; i < count; i++) {
    await db.insert(schemaSqlite.tasks).values({
      id: `${projectId}-tsk-${i}`, projectId, title: `Task ${i}`, status: "todo",
      createdAt: new Date(Date.now() + i * 1000),
    });
  }
}

describe("executePaginatedQuery cursor-cached totalCount", () => {
  it("carries totalCount forward in the cursor instead of recomputing it on later pages", async () => {
    const { db } = await setupIntegrationTest();
    const projectId = "proj-cache-" + Date.now();
    await seedTasks(db, 3, projectId);

    const page1 = await executePaginatedQuery(db, schemaSqlite.tasks, eq(schemaSqlite.tasks.projectId, projectId), { limit: 2 });
    expect(page1.totalCount).toBe(3);
    expect(page1.nextCursor).toBeTruthy();

    // Insert more rows after page 1 - if page 2 actually reran COUNT(*), it
    // would now see 4, not 3. Seeing 3 proves it reused the cached count
    // carried in page 1's cursor instead of recomputing it.
    await db.insert(schemaSqlite.tasks).values({ id: `${projectId}-tsk-extra`, projectId, title: "Extra", status: "todo", createdAt: new Date() });

    const page2 = await executePaginatedQuery(db, schemaSqlite.tasks, eq(schemaSqlite.tasks.projectId, projectId), { limit: 2, cursor: page1.nextCursor });
    expect(page2.totalCount).toBe(3);
  });

  it("propagates the cached totalCount into page 2's own nextCursor for page 3 to reuse", async () => {
    const { db } = await setupIntegrationTest();
    const projectId = "proj-cache-prop-" + Date.now();
    await seedTasks(db, 5, projectId);

    const page1 = await executePaginatedQuery(db, schemaSqlite.tasks, eq(schemaSqlite.tasks.projectId, projectId), { limit: 2 });
    const page2 = await executePaginatedQuery(db, schemaSqlite.tasks, eq(schemaSqlite.tasks.projectId, projectId), { limit: 2, cursor: page1.nextCursor });
    expect(page2.nextCursor).toBeTruthy();

    const decoded = decodeCursor(page2.nextCursor);
    expect(decoded?.totalCount).toBe(5);
  });

  it("recomputes totalCount fresh when the filter changes between pages, instead of reusing a stale cached count", async () => {
    const { db } = await setupIntegrationTest();
    const projectId = "proj-cache-filter-" + Date.now();
    await seedTasks(db, 3, projectId);
    // Give one task a distinguishing title to filter on.
    await db.update(schemaSqlite.tasks).set({ title: "special-needle" }).where(eq(schemaSqlite.tasks.id, `${projectId}-tsk-0`));

    const page1 = await executePaginatedQuery(db, schemaSqlite.tasks, eq(schemaSqlite.tasks.projectId, projectId), { limit: 1 }, schemaSqlite.tasks.title);
    expect(page1.totalCount).toBe(3);

    // Reuse page 1's cursor but with a different filter - the cached count
    // (3, for "no filter") must not leak into this request (1 match).
    const page2 = await executePaginatedQuery(db, schemaSqlite.tasks, eq(schemaSqlite.tasks.projectId, projectId), { limit: 1, cursor: page1.nextCursor, filter: "special-needle" }, schemaSqlite.tasks.title);
    expect(page2.totalCount).toBe(1);
  });

  it("recomputes totalCount fresh for an older cursor minted without a cached count", async () => {
    const { db } = await setupIntegrationTest();
    const projectId = "proj-cache-legacy-" + Date.now();
    await seedTasks(db, 2, projectId);

    // Simulate a cursor from before totalCount caching existed: value/id/field only.
    const legacyCursor = encodeCursor(new Date().getTime(), `${projectId}-tsk-0`, "createdAt");
    const decoded = decodeCursor(legacyCursor);
    expect(decoded?.totalCount).toBeUndefined();

    const page = await executePaginatedQuery(db, schemaSqlite.tasks, eq(schemaSqlite.tasks.projectId, projectId), { limit: 10, cursor: legacyCursor });
    expect(page.totalCount).toBe(2);
  });
});
