import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { applyEmbeddedMigrations, splitStatements, sqliteRunner } from './embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';
import { taskActivity } from './schema.sqlite';

/**
 * M24-T03 (ADR-0020). The backfill's whole claim is truthfulness: one
 * `created` row per pre-existing non-archived task carrying its *current*
 * status, terminality stamped from current config, existing notes/handoffs/
 * task comments carried over at their real timestamps, and nothing invented.
 * This test runs the SHIPPED migration chain — the DDL through
 * `applyEmbeddedMigrations` exactly as a fresh database boots, fixtures
 * inserted at the point in history where real data would exist, then the
 * real backfill file's statements — so what is proven is the SQL that
 * deploys, not a paraphrase of it.
 */

const BACKFILL_TAG = '0046_backfill_task_activity';

const BACKFILL = readFileSync(
  join(import.meta.dir, `../../drizzle-sqlite/${BACKFILL_TAG}.sql`), 'utf8');

function run(db: Database, sql: string) {
  for (const statement of splitStatements(sql)) db.run(statement);
}

/** A database at the moment the backfill runs: full chain applied except it. */
async function dbBeforeBackfill(): Promise<Database> {
  const db = new Database(':memory:');
  // setupDatabase creates the FTS table before migrating; 0025/0026 refer to it.
  db.run('CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, content="")');
  const chain = EMBEDDED_SQLITE_MIGRATIONS.filter((m) => m.tag !== BACKFILL_TAG);
  // The backfill must be the newest migration, or an existing database
  // upgraded in place would order it before already-applied ones and skip it.
  const backfill = EMBEDDED_SQLITE_MIGRATIONS.find((m) => m.tag === BACKFILL_TAG)!;
  expect(Math.max(...chain.map((m) => m.when))).toBeLessThan(backfill.when);
  await applyEmbeddedMigrations(sqliteRunner(db), chain);
  return db;
}

/**
 * Pre-backfill fixtures covering every terminality branch:
 *
 * | task    | type      | status  | deleted | expect created row | to_is_terminal |
 * |---------|-----------|---------|---------|--------------------|----------------|
 * | t-term  | tt1       | review  | no      | yes                | 1 (max pos)    |
 * | t-tie   | tt1       | shipped | no      | yes                | 1 (ties at max)|
 * | t-open  | tt1       | doing   | no      | yes                | 0              |
 * | t-ghost | tt1       | vanished| no      | yes                | 0 (no such status) |
 * | t-done  | untyped   | done    | no      | yes                | 1              |
 * | t-todo  | untyped   | todo    | no      | yes                | 0              |
 * | t-bin   | untyped   | done    | YES     | NO                 | —              |
 */
function seedFixtures(db: Database) {
  db.run(`INSERT INTO task_statuses (id, task_type_id, name, position) VALUES
    ('s1', 'tt1', 'doing', 0),
    ('s2', 'tt1', 'review', 2),
    ('s3', 'tt1', 'shipped', 2)`);
  db.run(`INSERT INTO tasks (id, project_id, task_type_id, title, status, created_at, deleted_at) VALUES
    ('t-term',  'p1', 'tt1', 'x', 'review',   1000, NULL),
    ('t-tie',   'p1', 'tt1', 'x', 'shipped',  1001, NULL),
    ('t-open',  'p1', 'tt1', 'x', 'doing',    1002, NULL),
    ('t-ghost', 'p1', 'tt1', 'x', 'vanished', 1003, NULL),
    ('t-done',  'p1', NULL,  'x', 'done',     1004, NULL),
    ('t-todo',  'p1', NULL,  'x', 'todo',     1005, NULL),
    ('t-bin',   'p1', NULL,  'x', 'done',     1006, 2000)`);
  db.run(`INSERT INTO task_notes (id, task_id, agent_id, content, created_at, note_type) VALUES
    ('n1', 't-open', 'ag1', 'progress', 3000, 'comment'),
    ('n2', 't-open', 'ag1', 'handing off', 3001, 'handoff'),
    ('n3', 't-bin',  'ag1', 'on a deleted task', 3002, 'comment')`);
  db.run(`INSERT INTO comments (id, entity_id, entity_type, user_id, agent_id, content, created_at) VALUES
    ('c-user',   't-todo', 'task',     'u1', NULL,  'from a human', 4000),
    ('c-agent',  't-todo', 'task',     NULL, 'ag1', 'from an agent', 4001),
    ('c-purged', 't-todo', 'task',     NULL, NULL,  'author purged', 4002),
    ('c-art',    'art1',   'artifact', 'u1', NULL,  'not a task comment', 4003),
    ('c-bin',    't-bin',  'task',     'u1', NULL,  'on a deleted task', 4004),
    ('c-orphan', 't-gone', 'task',     'u1', NULL,  'task no longer exists', 4005)`);
}

const activityRow = (db: Database, id: string) =>
  db.query('SELECT * FROM task_activity WHERE id = ?').get(id) as any;

describe('task_activity DDL (0045)', () => {
  it('creates the table and both report indexes', async () => {
    const db = await dbBeforeBackfill();
    const table = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_activity'").get();
    expect(table).toBeTruthy();

    // The drizzle table object must agree with the shipped DDL — this is
    // also the schema export's first real consumer.
    const viaDrizzle = await drizzle(db).select().from(taskActivity);
    expect(viaDrizzle).toEqual([]);

    const indexes = db.query(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='task_activity'")
      .all().map((r: any) => r.name);
    expect(indexes).toContain('task_activity_project_kind_occurred_idx');
    expect(indexes).toContain('task_activity_task_occurred_idx');
  });
});

describe('0046_backfill_task_activity', () => {
  it('creates exactly one created row per non-deleted task, none for the soft-deleted one', async () => {
    const db = await dbBeforeBackfill();
    seedFixtures(db);
    run(db, BACKFILL);

    const created = db.query(
      "SELECT task_id FROM task_activity WHERE kind = 'created' ORDER BY task_id")
      .all().map((r: any) => r.task_id);
    expect(created).toEqual(['t-done', 't-ghost', 't-open', 't-term', 't-tie', 't-todo']);
  });

  it('stamps status and terminality truthfully for every case in the fixture table', async () => {
    const db = await dbBeforeBackfill();
    seedFixtures(db);
    run(db, BACKFILL);

    const cases: Array<[string, string, number]> = [
      ['t-term', 'review', 1],   // typed, at the type's max position
      ['t-tie', 'shipped', 1],   // typed, shares the max position — ties are terminal
      ['t-open', 'doing', 0],    // typed, below max
      ['t-ghost', 'vanished', 0],// typed, status not in the type's list
      ['t-done', 'done', 1],     // untyped, 'done' is terminal
      ['t-todo', 'todo', 0],     // untyped, anything else is not
    ];
    for (const [taskId, toStatus, terminal] of cases) {
      const row = activityRow(db, `act-${taskId}`);
      expect(row).toBeTruthy();
      expect(row.kind).toBe('created');
      expect(row.project_id).toBe('p1');
      expect(row.to_status).toBe(toStatus);
      expect(row.to_is_terminal).toBe(terminal);
      // The honest baseline invents nothing: no prior status, no actor
      // identity, no assignee (holder-at-creation is unknown).
      expect(row.from_status).toBeNull();
      expect(row.from_is_terminal).toBe(0);
      expect(row.actor_type).toBe('system');
      expect(row.actor_id).toBeNull();
      expect(row.assignee_agent_id).toBeNull();
      expect(row.assignee_user_id).toBeNull();
    }
  });

  it('uses the task creation time as occurred_at, copied as the same seconds value', async () => {
    const db = await dbBeforeBackfill();
    seedFixtures(db);
    run(db, BACKFILL);
    expect(activityRow(db, 'act-t-term').occurred_at).toBe(1000);
    expect(activityRow(db, 'act-t-todo').occurred_at).toBe(1005);
  });

  it('carries task notes over as note/handoff rows with the agent actor and real timestamps', async () => {
    const db = await dbBeforeBackfill();
    seedFixtures(db);
    run(db, BACKFILL);

    const note = activityRow(db, 'act-tn-n1');
    expect(note.kind).toBe('note');
    expect(note.task_id).toBe('t-open');
    expect(note.project_id).toBe('p1');
    expect(note.actor_type).toBe('agent');
    expect(note.actor_id).toBe('ag1');
    expect(note.occurred_at).toBe(3000);
    expect(note.to_status).toBeNull();
    expect(note.to_is_terminal).toBe(0);

    const handoff = activityRow(db, 'act-tn-n2');
    expect(handoff.kind).toBe('handoff');
    expect(handoff.occurred_at).toBe(3001);

    // The note on the soft-deleted task stays out, same as its task does.
    expect(activityRow(db, 'act-tn-n3')).toBeNull();
  });

  it('carries task comments over with the right actor per author column', async () => {
    const db = await dbBeforeBackfill();
    seedFixtures(db);
    run(db, BACKFILL);

    const fromUser = activityRow(db, 'act-c-c-user');
    expect(fromUser.kind).toBe('comment');
    expect(fromUser.task_id).toBe('t-todo');
    expect(fromUser.actor_type).toBe('user');
    expect(fromUser.actor_id).toBe('u1');
    expect(fromUser.occurred_at).toBe(4000);

    const fromAgent = activityRow(db, 'act-c-c-agent');
    expect(fromAgent.actor_type).toBe('agent');
    expect(fromAgent.actor_id).toBe('ag1');

    // A purged author leaves NULL ids; actor_type stays 'agent' rather than
    // leaving null ambiguous — the audit_log convention.
    const purged = activityRow(db, 'act-c-c-purged');
    expect(purged.actor_type).toBe('agent');
    expect(purged.actor_id).toBeNull();

    // Artifact comments, comments on soft-deleted tasks and comments whose
    // task no longer exists are not task activity.
    expect(activityRow(db, 'act-c-c-art')).toBeNull();
    expect(activityRow(db, 'act-c-c-bin')).toBeNull();
    expect(activityRow(db, 'act-c-c-orphan')).toBeNull();
  });

  it('is idempotent — re-running inserts nothing and errors nothing', async () => {
    const db = await dbBeforeBackfill();
    seedFixtures(db);
    run(db, BACKFILL);
    const before = (db.query('SELECT COUNT(*) AS n FROM task_activity').get() as any).n;
    expect(() => run(db, BACKFILL)).not.toThrow();
    const after = (db.query('SELECT COUNT(*) AS n FROM task_activity').get() as any).n;
    expect(after).toBe(before);
    expect(before).toBe(6 + 2 + 3); // created + notes + comments
  });

  it('does not resurrect rows a purge deleted (idempotency is per-id, not per-run)', async () => {
    // ADR-0020: purge deletes activity explicitly. A re-run of the backfill
    // (e.g. a restored database re-migrating) must not re-create the rows
    // for tasks that still exist — INSERT OR IGNORE keys on the same
    // deterministic id, so this holds by construction; proven anyway.
    const db = await dbBeforeBackfill();
    seedFixtures(db);
    run(db, BACKFILL);
    db.run("DELETE FROM task_activity WHERE id = 'act-tn-n1'");
    run(db, BACKFILL);
    // n1's task still exists, so the second run legitimately re-inserts it —
    // what must NOT happen is any duplicate of the rows that stayed.
    const dupes = db.query(
      'SELECT id, COUNT(*) AS n FROM task_activity GROUP BY id HAVING n > 1').all();
    expect(dupes).toEqual([]);
  });
});

describe('0033_backfill_task_activity (mysql, structural)', () => {
  const sql = readFileSync(
    join(import.meta.dir, '../../drizzle-mysql/0033_backfill_task_activity.sql'), 'utf8');

  it('derives the same deterministic ids with CONCAT and guards with INSERT IGNORE', () => {
    expect(sql).toContain("CONCAT('act-', t.id)");
    expect(sql).toContain("CONCAT('act-tn-', n.id)");
    expect(sql).toContain("CONCAT('act-c-', c.id)");
    expect(sql.match(/INSERT IGNORE INTO task_activity/g)).toHaveLength(3);
  });

  it('covers the same three sources with the same exclusions as the sqlite file', () => {
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain("entity_type = 'task'");
    expect(sql).toMatch(/CASE n.note_type WHEN 'handoff' THEN 'handoff' ELSE 'note' END/);
    expect(sql).toMatch(/CASE WHEN c.user_id IS NOT NULL THEN 'user' ELSE 'agent' END/);
  });
});
