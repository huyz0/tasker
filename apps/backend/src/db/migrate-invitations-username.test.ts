import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** M13-T09. Same reasoning as migrate-users-email-optional-username.test.ts. */

const REBUILD = readFileSync(
  join(import.meta.dir, '../../drizzle-sqlite/0032_invitations_username.sql'), 'utf8');

function run(db: Database, sql: string) {
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim();
    if (trimmed) db.run(trimmed);
  }
}

function preMigrationDb(): Database {
  const db = new Database(':memory:');
  db.run(`CREATE TABLE organizations (id text PRIMARY KEY, name text, slug text)`);
  db.run(`CREATE TABLE users (id text PRIMARY KEY, email text, name text)`);
  db.run(`CREATE TABLE invitations (
    id text PRIMARY KEY NOT NULL,
    org_id text NOT NULL,
    email text NOT NULL,
    invited_by text NOT NULL,
    role text DEFAULT 'member' NOT NULL,
    created_at integer NOT NULL,
    expires_at integer
  )`);
  db.run(`INSERT INTO organizations VALUES ('org-a', 'A', 'a')`);
  db.run(`INSERT INTO users VALUES ('inviter-1', 'i@x.test', 'Inviter')`);
  return db;
}

describe('0032_invitations_username', () => {
  it('makes email nullable and adds username without losing existing rows', () => {
    const db = preMigrationDb();
    db.run(`INSERT INTO invitations (id, org_id, email, invited_by, role, created_at)
      VALUES ('inv-1', 'org-a', 'a@x.test', 'inviter-1', 'member', 0)`);
    run(db, REBUILD);
    const row = db.query(`SELECT id, email, username, role FROM invitations WHERE id = 'inv-1'`).get() as any;
    expect(row).toEqual({ id: 'inv-1', email: 'a@x.test', username: null, role: 'member' });
  });

  it('accepts a username-only invitation with no email at all', () => {
    const db = preMigrationDb();
    run(db, REBUILD);
    expect(() => db.run(`INSERT INTO invitations (id, org_id, email, username, invited_by, role, created_at)
      VALUES ('inv-2', 'org-a', NULL, 'invited-handle', 'inviter-1', 'admin', 0)`)).not.toThrow();
    const row = db.query(`SELECT email, username FROM invitations WHERE id = 'inv-2'`).get() as any;
    expect(row).toEqual({ email: null, username: 'invited-handle' });
  });

  it('keeps the org_id index after the rebuild', () => {
    const db = preMigrationDb();
    run(db, REBUILD);
    const names = (db.query(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invitations'`)
      .all() as any[]).map((r) => r.name);
    expect(names).toContain('invitations_org_id_idx');
  });

  it('keeps role NOT NULL with its default', () => {
    const db = preMigrationDb();
    run(db, REBUILD);
    expect(() => db.run(`INSERT INTO invitations (id, org_id, username, invited_by, created_at)
      VALUES ('inv-3', 'org-a', 'someone', 'inviter-1', 0)`)).not.toThrow();
    const row = db.query(`SELECT role FROM invitations WHERE id = 'inv-3'`).get() as any;
    expect(row.role).toBe('member');
  });
});

describe('0019_invitations_username (mysql, structural)', () => {
  const sql = readFileSync(join(import.meta.dir, '../../drizzle-mysql/0019_invitations_username.sql'), 'utf8');

  it('drops NOT NULL on email and adds a nullable username', () => {
    expect(sql).toMatch(/MODIFY COLUMN `email` varchar\(256\) NULL/);
    expect(sql).toMatch(/ADD COLUMN `username` varchar\(256\) NULL/);
  });

  it('carries no catch-up statements for migrations already applied by hand', () => {
    expect(sql).not.toContain('ALTER TABLE `users`');
    expect(sql).not.toContain('ALTER TABLE `task_statuses`');
  });
});
