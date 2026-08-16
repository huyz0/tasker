import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * M13-T04. ADR-0012 §3's whole argument is that `users.id` doesn't move —
 * this test is what makes that a checked claim rather than an assertion in
 * a document. Also covers the migration's own idempotency guard, since it
 * is the thing standing between "safe to re-run" and "duplicate key error
 * on the second deploy".
 */

const REBUILD = readFileSync(
  join(import.meta.dir, '../../drizzle-sqlite/0028_users_email_optional_username.sql'), 'utf8');
const NEW_TABLES = readFileSync(
  join(import.meta.dir, '../../drizzle-sqlite/0030_password_credentials_linked_identities.sql'), 'utf8');
const BACKFILL = readFileSync(
  join(import.meta.dir, '../../drizzle-sqlite/0031_backfill_google_linked_identities.sql'), 'utf8');

function run(db: Database, sql: string) {
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim();
    if (trimmed) db.run(trimmed);
  }
}

function preM13Db(): Database {
  const db = new Database(':memory:');
  db.run(`CREATE TABLE users (
    id text PRIMARY KEY NOT NULL, email text NOT NULL, name text, avatar_url text, created_at integer NOT NULL
  )`);
  db.run(`CREATE UNIQUE INDEX users_email_unique ON users (email)`);
  run(db, REBUILD);
  run(db, NEW_TABLES);
  return db;
}

describe('0031_backfill_google_linked_identities', () => {
  it('gives every pre-existing user a google linked identity pointing at their own id, unchanged', () => {
    const db = preM13Db();
    db.run(`INSERT INTO users (id, email, name, avatar_url, created_at)
      VALUES ('108234098234', 'jane@example.com', 'Jane', NULL, 1000)`);
    run(db, BACKFILL);

    const row = db.query(`SELECT user_id, provider, provider_user_id, linked_at
      FROM linked_identities WHERE user_id = '108234098234'`).get() as any;
    expect(row).toBeTruthy();
    expect(row.provider).toBe('google');
    // The load-bearing claim: the provider identity is the SAME value the
    // user's id already was. Nothing about how this user logs in changes.
    expect(row.provider_user_id).toBe('108234098234');
    expect(row.linked_at).toBe(1000);
  });

  it('backfills every user, not just one', () => {
    const db = preM13Db();
    db.run(`INSERT INTO users (id, email, name, avatar_url, created_at) VALUES ('u1', 'a@x.test', 'A', NULL, 0)`);
    db.run(`INSERT INTO users (id, email, name, avatar_url, created_at) VALUES ('u2', 'b@x.test', 'B', NULL, 0)`);
    db.run(`INSERT INTO users (id, email, name, avatar_url, created_at) VALUES ('u3', 'c@x.test', 'C', NULL, 0)`);
    run(db, BACKFILL);
    const count = (db.query(`SELECT COUNT(*) as n FROM linked_identities WHERE provider = 'google'`)
      .get() as any).n;
    expect(count).toBe(3);
  });

  it('is idempotent — running it twice does not duplicate or error', () => {
    const db = preM13Db();
    db.run(`INSERT INTO users (id, email, name, avatar_url, created_at) VALUES ('u1', 'a@x.test', 'A', NULL, 0)`);
    run(db, BACKFILL);
    expect(() => run(db, BACKFILL)).not.toThrow();
    const count = (db.query(`SELECT COUNT(*) as n FROM linked_identities WHERE user_id = 'u1'`).get() as any).n;
    expect(count).toBe(1);
  });

  it('does not touch a user who was already linked by a prior task/fixture', () => {
    const db = preM13Db();
    db.run(`INSERT INTO users (id, email, name, avatar_url, created_at) VALUES ('u1', 'a@x.test', 'A', NULL, 0)`);
    db.run(`INSERT INTO linked_identities (id, user_id, provider, provider_user_id, linked_at)
      VALUES ('li-manual', 'u1', 'google', 'u1', 999)`);
    run(db, BACKFILL);
    const rows = db.query(`SELECT id FROM linked_identities WHERE user_id = 'u1'`).all() as any[];
    expect(rows).toEqual([{ id: 'li-manual' }]);
  });
});

describe('0018_backfill_google_linked_identities (mysql, structural)', () => {
  const sql = readFileSync(
    join(import.meta.dir, '../../drizzle-mysql/0018_backfill_google_linked_identities.sql'), 'utf8');

  it('derives the provider identity from the user\'s own unchanged id', () => {
    expect(sql).toContain("SELECT CONCAT('li-', UUID()), id, 'google', id, created_at");
  });

  it('is guarded to be idempotent', () => {
    expect(sql).toMatch(/WHERE id NOT IN \(SELECT user_id FROM linked_identities WHERE provider = 'google'\)/);
  });
});
