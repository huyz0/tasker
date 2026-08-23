import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { applyEmbeddedMigrations, sqliteRunner, type EmbeddedMigration } from './embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';

/**
 * M26-T04. `applyEmbeddedMigrations` selects pending work with
 * `m.when > lastAppliedAt`, so a migration stamped before one already applied
 * is skipped in silence. `0044_audit_log` was stamped nine days before its own
 * predecessor, which meant any database that had reached 0043 never created
 * `audit_log` — and then applied 0045-0047 without complaint, moving its
 * watermark *past* the slot 0044 occupies even once the stamp is corrected.
 *
 * So the correction alone reaches no database that was actually damaged. These
 * tests build both affected databases for real and prove each recovers, rather
 * than reasoning about the journal — a migration ledger being exactly the wrong
 * place to be approximately right.
 */

const REPAIR_TAG = '0048_repair_audit_log';
const AUDIT_TAG = '0044_audit_log';
/** What 0044 was stamped with before M26-T04 corrected it. */
const BROKEN_AUDIT_WHEN = 1787232705138;

const freshSqlite = () => {
  const sqlite = new Database(':memory:');
  sqlite.query('CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, content="")').run();
  return sqlite;
};

const hasAuditLog = (sqlite: Database) =>
  Boolean(sqlite.query("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'").get());

/** The journal exactly as it stood before this task: 0044 misstamped, no repair. */
const asShippedBeforeM26 = (): EmbeddedMigration[] =>
  EMBEDDED_SQLITE_MIGRATIONS
    .filter((m) => m.tag !== REPAIR_TAG)
    .map((m) => (m.tag === AUDIT_TAG ? { ...m, when: BROKEN_AUDIT_WHEN } : m));

/**
 * Everything up to and including the given journal number — a database that
 * stopped there. Keyed on the tag's numeric prefix: an `EmbeddedMigration`
 * carries `tag`/`when`/`hash`/`path` and no index, and slicing the array by
 * position would silently depend on nothing ever being inserted earlier.
 */
const through = (journalNumber: number): EmbeddedMigration[] =>
  EMBEDDED_SQLITE_MIGRATIONS.filter((m) => Number(m.tag.slice(0, 4)) <= journalNumber);

describe('audit_log repair (M26-T04)', () => {
  it('a database stopped at 0043 gains audit_log when it next boots', async () => {
    const sqlite = freshSqlite();
    await applyEmbeddedMigrations(sqliteRunner(sqlite), through(43));
    expect(hasAuditLog(sqlite)).toBe(false);

    const applied = await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS);
    expect(applied).toContain(AUDIT_TAG);
    expect(hasAuditLog(sqlite)).toBe(true);
  });

  it('reproduces the original defect, then repairs the database it left behind', async () => {
    const sqlite = freshSqlite();

    // 1. Reach 0043, as any database of that vintage did.
    await applyEmbeddedMigrations(sqliteRunner(sqlite), through(43));

    // 2. Upgrade to the code as it shipped before M26 — this is the bug.
    //    0044 is invisible (its `when` is below the watermark) while 0045-0047
    //    apply and push the watermark forward.
    const damaged = await applyEmbeddedMigrations(sqliteRunner(sqlite), asShippedBeforeM26());
    expect(damaged).not.toContain(AUDIT_TAG);
    expect(hasAuditLog(sqlite)).toBe(false);

    // 3. Upgrade to this task's code. Correcting 0044's stamp cannot help —
    //    the watermark is already past it — so the repair is what lands.
    const repaired = await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS);
    expect(repaired).not.toContain(AUDIT_TAG);
    expect(repaired).toContain(REPAIR_TAG);
    expect(hasAuditLog(sqlite)).toBe(true);
  });

  it('is a no-op on a healthy database, including a fresh one', async () => {
    const sqlite = freshSqlite();
    const applied = await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS);
    // A fresh database runs 0044 *and* the repair; the repair must not fail on
    // the table 0044 just created, which is what CREATE TABLE IF NOT EXISTS buys.
    expect(applied).toContain(AUDIT_TAG);
    expect(applied).toContain(REPAIR_TAG);
    expect(hasAuditLog(sqlite)).toBe(true);

    // And re-booting applies nothing at all.
    expect(await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS)).toEqual([]);
  });

  it('leaves a repaired database indistinguishable from a healthy one', async () => {
    const ddl = (sqlite: Database) => [
      (sqlite.query("SELECT sql FROM sqlite_master WHERE name='audit_log'").get() as any)?.sql,
      ...sqlite.query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='audit_log' ORDER BY name")
        .all().map((r: any) => r.name),
    ];

    const healthy = freshSqlite();
    await applyEmbeddedMigrations(sqliteRunner(healthy), EMBEDDED_SQLITE_MIGRATIONS);

    const repaired = freshSqlite();
    await applyEmbeddedMigrations(sqliteRunner(repaired), through(43));
    await applyEmbeddedMigrations(sqliteRunner(repaired), asShippedBeforeM26());
    await applyEmbeddedMigrations(sqliteRunner(repaired), EMBEDDED_SQLITE_MIGRATIONS);

    expect(ddl(repaired)).toEqual(ddl(healthy));
  });
});
