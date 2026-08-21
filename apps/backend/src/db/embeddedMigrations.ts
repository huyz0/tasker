import { createHash } from 'node:crypto';

/**
 * Applying migrations that travel inside the binary (M09-T01).
 *
 * drizzle's own migrator takes a `migrationsFolder` and reads it from the
 * working directory at runtime — which a single binary copied to an empty
 * directory does not have. This does the same work against migrations the
 * bundler already carried in.
 *
 * Bookkeeping is deliberately byte-compatible with drizzle's: the same
 * `__drizzle_migrations` table, the same `sha256`-of-the-file hash, the same
 * `created_at` taken from the journal's `when`. An existing `.data/local.sqlite`
 * migrated by `drizzle-kit` must not have its whole history re-applied the
 * first time the binary opens it, and a database the binary created must stay
 * usable by `moon run dev` afterwards.
 */

export interface EmbeddedMigration {
  tag: string;
  /** The journal's `when`, stored as `created_at` — drizzle orders on it. */
  when: number;
  /** sha256 of the migration file, as drizzle records it. */
  hash: string;
  /**
   * Where the SQL lives: a `/$bunfs/` path inside the compiled binary, or the
   * real file when running from source. `Bun.file` reads both.
   */
  path: string;
}

/** Minimal surface of `bun:sqlite`'s Database, so tests can stand in for it. */
export interface MigrationRunner {
  run(sql: string): void;
  /** The `created_at` of the most recently applied migration, or null. */
  lastAppliedAt(): number | null;
  record(hash: string, when: number): void;
}

const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)`;

/**
 * Splits a migration file into statements.
 *
 * `--> statement-breakpoint` is drizzle-kit's own marker, and it is there
 * because SQLite's driver executes one statement per call — splitting on `;`
 * would cut through string literals and triggers.
 */
export function splitStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The hash drizzle would record for this file's contents. */
export function hashMigration(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

/**
 * Applies every migration newer than the last one recorded.
 *
 * Ordered and filtered by `when` rather than by position, matching drizzle:
 * a database that stopped halfway resumes at the right place, and one already
 * fully migrated does nothing at all.
 *
 * Returns the tags actually applied, so a caller can log "first run, 45
 * migrations" rather than nothing at all.
 *
 * `readSql` is injectable so the ordering and bookkeeping can be tested
 * without a filesystem at all.
 */
export async function applyEmbeddedMigrations(
  runner: MigrationRunner,
  migrations: EmbeddedMigration[],
  readSql: (migration: EmbeddedMigration) => Promise<string> = (m) => Bun.file(m.path).text(),
): Promise<string[]> {
  runner.run(MIGRATIONS_TABLE);
  const lastAppliedAt = runner.lastAppliedAt();

  const pending = [...migrations]
    .sort((a, b) => a.when - b.when)
    .filter((m) => lastAppliedAt === null || m.when > lastAppliedAt);
  if (pending.length === 0) return [];

  // Read before opening the transaction, so nothing awaits inside it. An
  // already-migrated database never reaches here at all.
  const sqlByTag = new Map<string, string>();
  for (const migration of pending) sqlByTag.set(migration.tag, await readSql(migration));

  // One transaction around the whole run, exactly as drizzle does — and this
  // is load-bearing beyond atomicity. Two migrations bracket a table rebuild
  // with `PRAGMA foreign_keys=OFF` / `=ON`, and SQLite ignores that pragma
  // inside a transaction. Run bare, the `ON` half takes effect and stays on
  // for the life of the connection, which turns every fixture that inserts a
  // row before its parent into a foreign-key error.
  runner.run('BEGIN');
  try {
    for (const migration of pending) {
      for (const statement of splitStatements(sqlByTag.get(migration.tag)!)) runner.run(statement);
      runner.record(migration.hash, migration.when);
    }
    runner.run('COMMIT');
  } catch (err) {
    runner.run('ROLLBACK');
    throw err;
  }

  return pending.map((m) => m.tag);
}

/** Adapts a `bun:sqlite` Database to the runner interface above. */
export function sqliteRunner(sqlite: any): MigrationRunner {
  return {
    run: (sql: string) => sqlite.query(sql).run(),
    lastAppliedAt: () => {
      const row = sqlite
        .query('SELECT created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1')
        .get();
      return row ? Number(row.created_at) : null;
    },
    record: (hash: string, when: number) =>
      sqlite.query('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)').run(hash, when),
  };
}
