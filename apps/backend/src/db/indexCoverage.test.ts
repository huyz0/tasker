import { describe, it, expect } from "bun:test";
import { setupDatabase } from "../db/db";
import { sql } from "drizzle-orm";

/**
 * M07-T09's verify line, as a gate rather than a one-time observation:
 * **no hot query performs a full table scan.**
 *
 * The queries below are the shapes the list endpoints actually issue — the
 * `WHERE` and `ORDER BY` that `executePaginatedQuery` builds, written out so
 * the plan can be read. Two of them were full scans when this was first run:
 * `remote_pull_requests` by `task_id` had no index at all, and `entity_labels`
 * by `label_id` walked the whole unique index because that index starts at
 * `entity_id`.
 *
 * Checked against SQLite because that is the standalone dialect and the one
 * `moon check` can plan without a server. The MySQL side is covered by
 * `search.mysql.test.ts` and by the measurements recorded in the M07-T09
 * journal entry.
 */

/** One entry per hot read path, named as the product feature it serves. */
const HOT_QUERIES: Record<string, string> = {
  "task list for a project":
    "SELECT id FROM tasks WHERE project_id='p' AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 50",
  "one Kanban column":
    "SELECT id FROM tasks WHERE project_id='p' AND status='todo' AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 50",
  "artifacts in a folder":
    "SELECT id FROM artifacts WHERE folder_id='f' AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 50",
  "projects in an org":
    "SELECT id FROM projects WHERE org_id='o' AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 50",
  "agents in an org":
    "SELECT id FROM agents WHERE org_id='o' AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 50",
  "comments on a task":
    "SELECT id FROM comments WHERE entity_id='e' AND entity_type='task' ORDER BY created_at DESC, id DESC LIMIT 50",
  "members of an org":
    "SELECT user_id FROM organization_members WHERE org_id='o' LIMIT 50",
  "notes on a task":
    "SELECT id FROM task_notes WHERE task_id='t' ORDER BY created_at DESC LIMIT 50",
  "folders in a project":
    "SELECT id FROM folders WHERE project_id='p' AND deleted_at IS NULL",
  "labels in an org":
    "SELECT id FROM labels WHERE org_id='o'",
  "pull requests for a task":
    "SELECT id FROM remote_pull_requests WHERE task_id='t'",
  "entities carrying a label":
    "SELECT entity_id FROM entity_labels WHERE label_id='l'",
  "tasks awaiting my review (dashboard)":
    "SELECT task_id FROM task_reviewers WHERE user_id='u'",
  "when an agent last called (dashboard)":
    "SELECT max(last_used_at) FROM api_tokens WHERE agent_id='a'",
};

/**
 * Lists that page with a cursor and must not sort their whole match set.
 *
 * `USE TEMP B-TREE FOR ORDER BY` means the filter used an index and the sort
 * did not, so a project with 50,000 tasks sorted 50,000 rows to return 50. It
 * is not a full table scan, so it is asserted separately from the verify line.
 */
const MUST_NOT_SORT = [
  "task list for a project",
  "one Kanban column",
  "artifacts in a folder",
  "projects in an org",
  "agents in an org",
  "comments on a task",
];

async function planFor(db: any, query: string): Promise<string> {
  const rows = await db.all(sql.raw(`EXPLAIN QUERY PLAN ${query}`));
  return rows.map((r: any) => r.detail).join(" | ");
}

describe("hot query index coverage", () => {
  it("plans every hot query without a full table scan", async () => {
    const db = (await setupDatabase("sqlite", ":memory:")) as any;

    const scanning: string[] = [];
    for (const [name, query] of Object.entries(HOT_QUERIES)) {
      const plan = await planFor(db, query);
      // SQLite says `SCAN <table>` for a full scan and `SEARCH <table> USING
      // INDEX …` for a seek. `SCAN … USING COVERING INDEX` still reads every
      // index entry, so it counts too — that is exactly what `entity_labels`
      // by label was doing.
      if (plan.includes("SCAN ")) scanning.push(`${name}: ${plan}`);
    }

    expect(scanning).toEqual([]);
  });

  it("serves each cursor-paginated list from an index that also does the sorting", async () => {
    const db = (await setupDatabase("sqlite", ":memory:")) as any;

    const sorting: string[] = [];
    for (const name of MUST_NOT_SORT) {
      const plan = await planFor(db, HOT_QUERIES[name]!);
      if (plan.includes("TEMP B-TREE")) sorting.push(`${name}: ${plan}`);
    }

    expect(sorting).toEqual([]);
  });

  it("fails when a query has no index to use, rather than passing vacuously", async () => {
    // Without this, a typo in a query string would produce a plan nobody reads
    // and a test that always passes. `sqlite_stat1` has no index on `tbl`.
    const db = (await setupDatabase("sqlite", ":memory:")) as any;
    await db.run(sql.raw("CREATE TABLE unindexed_probe (a TEXT, b TEXT)"));

    const plan = await planFor(db, "SELECT a FROM unindexed_probe WHERE b='x'");
    expect(plan).toContain("SCAN");
  });
});
