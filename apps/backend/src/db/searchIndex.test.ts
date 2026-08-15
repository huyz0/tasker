import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { setupIntegrationTest } from "../test/setup";
import * as schema from "./schema.sqlite";

/**
 * The FTS5 index is maintained by triggers, not by the application (M07-T05).
 *
 * These tests exist because that is the only property that matters: an
 * application-side index update has to be repeated at every write site, and the
 * site that forgets is invisible until someone reports a search result that is
 * missing. A trigger cannot be forgotten — so what needs pinning is that the
 * triggers exist and cover all three of insert, update and delete.
 */
const matches = async (db: any, table: string, term: string): Promise<number> => {
  const rows = await db.all(sql.raw(`SELECT rowid FROM ${table} WHERE ${table} MATCH '${term}'`));
  return rows.length;
};

describe("FTS5 search index", () => {
  it("indexes a task on insert, by a word only its description contains", async () => {
    const { db } = await setupIntegrationTest();
    await db.insert(schema.tasks).values({
      id: `tsk-fts-${Date.now()}`,
      projectId: "proj-fts",
      displayId: "FTS-1",
      title: "Unrelated title",
      status: "todo",
      description: "the quick brown vulpine jumps",
      createdAt: new Date(),
    });

    expect(await matches(db, "tasks_fts", "vulpine")).toBe(1);
  });

  it("replaces the indexed text on update, rather than accumulating both", async () => {
    const { db } = await setupIntegrationTest();
    const id = `tsk-fts-upd-${Date.now()}`;
    await db.insert(schema.tasks).values({
      id, projectId: "proj-fts", displayId: "FTS-2", title: "T", status: "todo",
      description: "mentions vulpine", createdAt: new Date(),
    });
    await db.update(schema.tasks).set({ description: "mentions aardvark" }).where(sql`id = ${id}`);

    // Both halves matter: a contentless FTS5 table cannot be updated in place,
    // so an update that only inserted would leave the old text findable.
    expect(await matches(db, "tasks_fts", "vulpine")).toBe(0);
    expect(await matches(db, "tasks_fts", "aardvark")).toBe(1);
  });

  it("removes a task from the index when the row is deleted", async () => {
    const { db } = await setupIntegrationTest();
    const id = `tsk-fts-del-${Date.now()}`;
    await db.insert(schema.tasks).values({
      id, projectId: "proj-fts", displayId: "FTS-3", title: "T", status: "todo",
      description: "mentions pangolin", createdAt: new Date(),
    });
    await db.delete(schema.tasks).where(sql`id = ${id}`);

    expect(await matches(db, "tasks_fts", "pangolin")).toBe(0);
  });

  it("indexes artifacts by name and description too", async () => {
    const { db } = await setupIntegrationTest();
    await db.insert(schema.artifacts).values({
      id: `art-fts-${Date.now()}`,
      folderId: "fld-fts",
      name: "quokka-notes.md",
      description: "a description mentioning capybara",
      contentType: "text/markdown",
      createdAt: new Date(),
    });

    expect(await matches(db, "artifacts_fts", "capybara")).toBe(1);
  });

  it("matches whole words, not substrings", async () => {
    // The old `LIKE '%term%'` matched "cat" inside "concatenate". That is not a
    // search result anyone asked for, and it is why relevance was impossible.
    const { db } = await setupIntegrationTest();
    await db.insert(schema.tasks).values({
      id: `tsk-fts-sub-${Date.now()}`,
      projectId: "proj-fts", displayId: "FTS-4", title: "T", status: "todo",
      description: "we should concatenate the results", createdAt: new Date(),
    });

    expect(await matches(db, "tasks_fts", "concatenate")).toBe(1);
    expect(await matches(db, "tasks_fts", "cat")).toBe(0);
  });
});
