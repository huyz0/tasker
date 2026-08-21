import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import {
  applyEmbeddedMigrations,
  splitStatements,
  hashMigration,
  sqliteRunner,
  type EmbeddedMigration,
  type MigrationRunner,
} from './embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';
import { generate } from '../../scripts/generate-embedded-migrations';

const migration = (tag: string, when: number, sql = 'SELECT 1;'): EmbeddedMigration & { sql: string } => ({
  tag,
  when,
  hash: hashMigration(sql),
  path: `/fake/${tag}.sql`,
  sql,
});

/** Records what was run, without a database. */
function fakeRunner(lastAppliedAt: number | null = null) {
  const ran: string[] = [];
  const recorded: Array<{ hash: string; when: number }> = [];
  const runner: MigrationRunner = {
    run: (sql) => void ran.push(sql),
    lastAppliedAt: () => lastAppliedAt,
    record: (hash, when) => void recorded.push({ hash, when }),
  };
  return { runner, ran, recorded };
}

const readFrom = (list: Array<EmbeddedMigration & { sql: string }>) => async (m: EmbeddedMigration) =>
  list.find((x) => x.tag === m.tag)!.sql;

describe('splitStatements', () => {
  it("splits on drizzle-kit's own marker, not on semicolons", () => {
    // Splitting on `;` would cut through string literals and trigger bodies.
    const sql = "INSERT INTO t VALUES ('a;b');\n--> statement-breakpoint\nSELECT 1;";
    expect(splitStatements(sql)).toEqual(["INSERT INTO t VALUES ('a;b');", 'SELECT 1;']);
  });

  it('drops the empty trailing chunk a file ending in a breakpoint leaves', () => {
    expect(splitStatements('SELECT 1;\n--> statement-breakpoint\n')).toEqual(['SELECT 1;']);
  });
});

describe('hashMigration', () => {
  it("reproduces drizzle's recorded hash for a real migration", () => {
    // The whole compatibility claim rests on this: if the hash differs, a
    // database migrated by drizzle-kit is not recognisably migrated here.
    const first = EMBEDDED_SQLITE_MIGRATIONS[0]!;
    const sql = readFileSync(join(import.meta.dir, '../../drizzle-sqlite', `${first.tag}.sql`), 'utf8');
    expect(hashMigration(sql)).toBe(first.hash);
  });
});

describe('applyEmbeddedMigrations', () => {
  it('applies everything to an empty database', async () => {
    const list = [migration('0000_a', 100), migration('0001_b', 200)];
    const { runner, recorded } = fakeRunner(null);

    expect(await applyEmbeddedMigrations(runner, list, readFrom(list))).toEqual(['0000_a', '0001_b']);
    expect(recorded.map((r) => r.when)).toEqual([100, 200]);
  });

  it('applies nothing to a database already at the latest migration', async () => {
    // The case that matters for an existing `.data/local.sqlite`: opening it
    // with the binary must not re-run 45 migrations against live tables.
    const list = [migration('0000_a', 100), migration('0001_b', 200)];
    const { runner, recorded } = fakeRunner(200);

    expect(await applyEmbeddedMigrations(runner, list, readFrom(list))).toEqual([]);
    expect(recorded).toEqual([]);
  });

  it('resumes from where a half-migrated database stopped', async () => {
    const list = [migration('0000_a', 100), migration('0001_b', 200), migration('0002_c', 300)];
    const { runner } = fakeRunner(100);

    expect(await applyEmbeddedMigrations(runner, list, readFrom(list))).toEqual(['0001_b', '0002_c']);
  });

  it('orders by the journal timestamp, not by the order it was handed', async () => {
    const list = [migration('0002_c', 300), migration('0000_a', 100), migration('0001_b', 200)];
    const { runner } = fakeRunner(null);

    expect(await applyEmbeddedMigrations(runner, list, readFrom(list))).toEqual(['0000_a', '0001_b', '0002_c']);
  });

  it('never reads a migration it is not going to apply', async () => {
    // Opening an up-to-date database should not touch a single migration file.
    const list = [migration('0000_a', 100), migration('0001_b', 200)];
    const read: string[] = [];
    const { runner } = fakeRunner(100);

    await applyEmbeddedMigrations(runner, list, async (m) => {
      read.push(m.tag);
      return list.find((x) => x.tag === m.tag)!.sql;
    });
    expect(read).toEqual(['0001_b']);
  });

  it('runs the whole batch inside one transaction', async () => {
    // Atomicity is only half the reason. Two migrations bracket a table
    // rebuild with `PRAGMA foreign_keys=OFF`/`=ON`, and SQLite ignores that
    // pragma inside a transaction — which is exactly what drizzle relied on.
    // Run bare, the `ON` half sticks for the life of the connection and every
    // fixture that inserts a child before its parent starts failing.
    const list = [migration('0000_a', 100)];
    const { runner, ran } = fakeRunner(null);

    await applyEmbeddedMigrations(runner, list, readFrom(list));
    expect(ran).toContain('BEGIN');
    expect(ran).toContain('COMMIT');
    expect(ran.indexOf('BEGIN')).toBeLessThan(ran.indexOf('SELECT 1;'));
  });

  it('opens no transaction at all when there is nothing to apply', async () => {
    const list = [migration('0000_a', 100)];
    const { runner, ran } = fakeRunner(100);

    await applyEmbeddedMigrations(runner, list, readFrom(list));
    expect(ran).not.toContain('BEGIN');
  });

  it('rolls back and rethrows when a migration fails halfway', async () => {
    // A half-applied schema is worse than an unmigrated one: the next start
    // resumes from a position that does not describe the database.
    const list = [migration('0000_a', 100), migration('0001_b', 200, 'THIS IS NOT SQL')];
    const ran: string[] = [];
    const runner: MigrationRunner = {
      run: (sql) => {
        ran.push(sql);
        if (sql === 'THIS IS NOT SQL') throw new Error('syntax error');
      },
      lastAppliedAt: () => null,
      record: () => {},
    };

    await expect(applyEmbeddedMigrations(runner, list, readFrom(list))).rejects.toThrow('syntax error');
    expect(ran).toContain('ROLLBACK');
    expect(ran).not.toContain('COMMIT');
  });

  it('creates the bookkeeping table before reading it', async () => {
    const { runner, ran } = fakeRunner(null);
    await applyEmbeddedMigrations(runner, [], async () => '');
    expect(ran[0]).toContain('__drizzle_migrations');
  });
});

describe('sqliteRunner against a real database', () => {
  it('migrates an empty file and is a no-op the second time', async () => {
    const sqlite = new Database(':memory:');
    const list = [
      { ...migration('0000_a', 100, 'CREATE TABLE a (id text);'), path: '' },
      { ...migration('0001_b', 200, 'CREATE TABLE b (id text);'), path: '' },
    ];

    const first = await applyEmbeddedMigrations(sqliteRunner(sqlite), list, readFrom(list as any));
    expect(first).toEqual(['0000_a', '0001_b']);

    // Re-running must not fail on "table already exists", which is the whole
    // point of recording what was applied.
    const second = await applyEmbeddedMigrations(sqliteRunner(sqlite), list, readFrom(list as any));
    expect(second).toEqual([]);

    const tables = sqlite
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('a','b')")
      .all();
    expect(tables).toHaveLength(2);
  });

  it("reports no last migration for a database that has none, rather than throwing", async () => {
    const sqlite = new Database(':memory:');
    sqlite.query('CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)').run();
    expect(sqliteRunner(sqlite).lastAppliedAt()).toBeNull();
  });
});

describe('the generated module', () => {
  it('is in sync with the migrations folder', () => {
    // The gate that makes this safe to forget: adding a migration without
    // regenerating produces a binary that silently ships without it, which is
    // a corrupt database rather than a build error.
    const onDisk = readFileSync(join(import.meta.dir, 'embeddedMigrations.generated.ts'), 'utf8');
    expect(onDisk).toBe(generate());
  });

  it('carries every journalled migration', () => {
    const journal = JSON.parse(
      readFileSync(join(import.meta.dir, '../../drizzle-sqlite/meta/_journal.json'), 'utf8'),
    );
    expect(EMBEDDED_SQLITE_MIGRATIONS.map((m) => m.tag)).toEqual(journal.entries.map((e: any) => e.tag));
  });

  it('resolves each migration to something readable', async () => {
    // Proves the import attribute actually yields a path `Bun.file` can read.
    // `{ type: 'text' }` looks equivalent and is not: only the bundler inlines
    // it, so from source every migration became a one-line syntax error.
    const first = EMBEDDED_SQLITE_MIGRATIONS[0]!;
    expect((await Bun.file(first.path).text()).length).toBeGreaterThan(0);
  });
});
