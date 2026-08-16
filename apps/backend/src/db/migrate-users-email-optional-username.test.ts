import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * M13-T02. Two migrations tested rather than assumed, for the same reason
 * `migrate-api-tokens.test.ts` tests 0023: the constraints (email nullable,
 * username unique, both dialects) are the point, and the backfill's
 * uniqueness claim ("appending the id makes collisions impossible") is a
 * claim worth actually exercising against colliding local parts.
 */

const REBUILD = readFileSync(
  join(import.meta.dir, '../../drizzle-sqlite/0028_users_email_optional_username.sql'),
  'utf8',
);
const BACKFILL = readFileSync(
  join(import.meta.dir, '../../drizzle-sqlite/0029_backfill_usernames.sql'),
  'utf8',
);

function run(db: Database, sql: string) {
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim();
    if (trimmed) db.run(trimmed);
  }
}

function preMigrationDb(): Database {
  const db = new Database(':memory:');
  // The exact pre-0028 shape: email NOT NULL UNIQUE, no username column.
  db.run(`CREATE TABLE users (
    id text PRIMARY KEY NOT NULL,
    email text NOT NULL,
    name text,
    avatar_url text,
    created_at integer NOT NULL
  )`);
  db.run(`CREATE UNIQUE INDEX users_email_unique ON users (email)`);
  return db;
}

describe('0028_users_email_optional_username', () => {
  it('makes email nullable without losing existing rows', () => {
    const db = preMigrationDb();
    db.run(`INSERT INTO users VALUES ('user-1', 'a@x.test', 'A', NULL, 0)`);
    run(db, REBUILD);
    const rows = db.query(`SELECT id, email, username FROM users`).all() as any[];
    expect(rows).toEqual([{ id: 'user-1', email: 'a@x.test', username: null }]);
    // And a NULL email is now accepted at all.
    db.run(`INSERT INTO users (id, email, name, avatar_url, created_at) VALUES ('user-2', NULL, 'B', NULL, 0)`);
    expect((db.query(`SELECT email FROM users WHERE id = 'user-2'`).get() as any).email).toBeNull();
  });

  it('still refuses two rows with the same email', () => {
    const db = preMigrationDb();
    db.run(`INSERT INTO users VALUES ('user-1', 'a@x.test', 'A', NULL, 0)`);
    run(db, REBUILD);
    expect(() => db.run(`INSERT INTO users (id, email, name, avatar_url, created_at)
      VALUES ('user-2', 'a@x.test', 'B', NULL, 0)`)).toThrow(/UNIQUE/i);
  });

  it('allows multiple NULL emails — many local-only accounts can coexist', () => {
    const db = preMigrationDb();
    run(db, REBUILD);
    db.run(`INSERT INTO users (id, email, name, avatar_url, created_at) VALUES ('user-1', NULL, 'A', NULL, 0)`);
    expect(() => db.run(`INSERT INTO users (id, email, name, avatar_url, created_at)
      VALUES ('user-2', NULL, 'B', NULL, 0)`)).not.toThrow();
  });

  it('refuses two rows with the same username', () => {
    const db = preMigrationDb();
    run(db, REBUILD);
    db.run(`INSERT INTO users (id, email, username, name, avatar_url, created_at)
      VALUES ('user-1', NULL, 'jane', 'A', NULL, 0)`);
    expect(() => db.run(`INSERT INTO users (id, email, username, name, avatar_url, created_at)
      VALUES ('user-2', NULL, 'jane', 'B', NULL, 0)`)).toThrow(/UNIQUE/i);
  });
});

describe('0029_backfill_usernames', () => {
  it('derives a username from the email local part for every pre-existing row', () => {
    const db = preMigrationDb();
    db.run(`INSERT INTO users VALUES ('user-1', 'Jane@Example.com', 'Jane', NULL, 0)`);
    run(db, REBUILD);
    run(db, BACKFILL);
    const row = db.query(`SELECT username FROM users WHERE id = 'user-1'`).get() as any;
    expect(row.username).toBe('jane-user-1');
  });

  it('never collides even when two accounts share an email local part', () => {
    const db = preMigrationDb();
    db.run(`INSERT INTO users VALUES ('user-1', 'jane@example.com', 'Jane', NULL, 0)`);
    db.run(`INSERT INTO users VALUES ('user-2', 'jane@other.test', 'Jane B', NULL, 0)`);
    run(db, REBUILD);
    // The unique index is live at this point; if the backfill produced a
    // collision the second UPDATE row in the statement would violate it.
    expect(() => run(db, BACKFILL)).not.toThrow();
    const usernames = (db.query(`SELECT username FROM users ORDER BY id`).all() as any[])
      .map((r) => r.username);
    expect(new Set(usernames).size).toBe(2);
    expect(usernames).toEqual(['jane-user-1', 'jane-user-2']);
  });

  it('leaves an already-backfilled username alone', () => {
    const db = preMigrationDb();
    db.run(`INSERT INTO users VALUES ('user-1', 'jane@example.com', 'Jane', NULL, 0)`);
    run(db, REBUILD);
    db.run(`UPDATE users SET username = 'chosen-by-user' WHERE id = 'user-1'`);
    run(db, BACKFILL);
    expect((db.query(`SELECT username FROM users WHERE id = 'user-1'`).get() as any).username)
      .toBe('chosen-by-user');
  });
});

/**
 * The MySQL migrations cannot be applied without a live MySQL server (see
 * `migrate-api-tokens.test.ts`'s note — true of every MySQL migration here,
 * owned by M12). What's checked is that the files describe the same shape
 * as the SQLite pair and carry no re-proposed catch-up statements for
 * changes already applied by an earlier hand-written migration.
 */
describe('0015_users_email_optional_username / 0016_backfill_usernames (mysql, structural)', () => {
  const rebuildSql = readFileSync(
    join(import.meta.dir, '../../drizzle-mysql/0015_users_email_optional_username.sql'), 'utf8');
  const backfillSql = readFileSync(
    join(import.meta.dir, '../../drizzle-mysql/0016_backfill_usernames.sql'), 'utf8');

  it('drops NOT NULL on email and adds a nullable, unique username', () => {
    expect(rebuildSql).toMatch(/MODIFY COLUMN `email` varchar\(256\) NULL/);
    expect(rebuildSql).toMatch(/ADD COLUMN `username` varchar\(256\) NULL/);
    expect(rebuildSql).toMatch(/UNIQUE\(`username`\)/);
  });

  it('derives the same username shape as the sqlite backfill', () => {
    expect(backfillSql).toMatch(/SUBSTRING_INDEX\(email, '@', 1\)/);
    expect(backfillSql).toContain("'-'");
    expect(backfillSql).toMatch(/WHERE username IS NULL/);
  });

  it('carries no catch-up statements for migrations already applied by hand', () => {
    expect(rebuildSql).not.toContain('ALTER TABLE `task_statuses`');
    expect(rebuildSql).not.toContain('remote_pull_requests');
  });
});
