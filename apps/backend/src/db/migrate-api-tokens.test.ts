import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The api_tokens migration is tested rather than assumed because the
 * constraints are the point of the table. A credential store whose uniqueness
 * and NOT NULLs are decorative is worse than none — it reads as enforcement
 * while enforcing nothing, which is exactly the failure M03 found twice.
 *
 * Note also that bun:sqlite silently discards errors from every statement after
 * the first in one multi-statement run(), so each statement is executed on its
 * own here, the way drizzle's migrator does.
 */

const MIGRATION = readFileSync(
  join(import.meta.dir, '../../drizzle-sqlite/0023_api_tokens.sql'),
  'utf8',
);

function migratedDb(): Database {
  const db = new Database(':memory:');
  db.run(`CREATE TABLE organizations (id text PRIMARY KEY, name text, slug text)`);
  db.run(`CREATE TABLE users (id text PRIMARY KEY, email text, name text)`);
  db.run(`CREATE TABLE agent_roles (id text PRIMARY KEY, org_id text NOT NULL, name text NOT NULL,
    system_prompt text NOT NULL, capabilities text NOT NULL, created_at integer)`);
  db.run(`CREATE TABLE agents (id text PRIMARY KEY, org_id text NOT NULL, agent_role_id text NOT NULL,
    name text NOT NULL, deleted_at integer, created_at integer)`);
  db.run(`INSERT INTO organizations VALUES ('org-a', 'A', 'a'), ('org-b', 'B', 'b')`);
  db.run(`INSERT INTO users VALUES ('user-1', 'u@x.test', 'U')`);
  db.run(`INSERT INTO agent_roles VALUES ('role-1', 'org-a', 'R', 'p', '[]', 0)`);
  db.run(`INSERT INTO agents VALUES ('agent-1', 'org-a', 'role-1', 'Agent', NULL, 0)`);

  for (const statement of MIGRATION.split('--> statement-breakpoint')) {
    const sql = statement.trim();
    if (sql) db.run(sql);
  }
  return db;
}

const insert = (db: Database, over: Record<string, any> = {}) => {
  const row = {
    id: 'tok-1', org_id: 'org-a', agent_id: 'agent-1', name: 'CI worker',
    token_prefix: 'tskr_abcd', token_hash: 'hash-1', scopes: '["tasks:read"]',
    created_by: 'user-1', created_at: 1, expires_at: 2, last_used_at: null, revoked_at: null,
    ...over,
  };
  db.run(
    `INSERT INTO api_tokens (id, org_id, agent_id, name, token_prefix, token_hash, scopes,
      created_by, created_at, expires_at, last_used_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.org_id, row.agent_id, row.name, row.token_prefix, row.token_hash, row.scopes,
      row.created_by, row.created_at, row.expires_at, row.last_used_at, row.revoked_at],
  );
};

describe('0023_api_tokens', () => {
  it('creates the table and accepts a well-formed token row', () => {
    const db = migratedDb();
    insert(db);
    const rows = db.query(`SELECT id, org_id, agent_id, scopes FROM api_tokens`).all() as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].org_id).toBe('org-a');
    expect(rows[0].scopes).toBe('["tasks:read"]');
  });

  it('refuses two rows with the same token hash', () => {
    const db = migratedDb();
    insert(db, { id: 'tok-1', token_hash: 'same' });
    // Two credentials hashing alike means presenting one authenticates as
    // whichever the lookup happens to return first. The index is what makes
    // "look the token up by hash" a safe way to authenticate at all.
    expect(() => insert(db, { id: 'tok-2', token_hash: 'same' })).toThrow(/UNIQUE/i);
  });

  it('refuses a token with no expiry', () => {
    const db = migratedDb();
    // ADR-0008: expiry is mandatory. A nullable column would let the
    // application forget one row and leave a permanent credential behind.
    expect(() => insert(db, { expires_at: null })).toThrow(/NOT NULL/i);
  });

  it('refuses a token with no scopes, hash, org or agent', () => {
    const db = migratedDb();
    expect(() => insert(db, { scopes: null })).toThrow(/NOT NULL/i);
    expect(() => insert(db, { token_hash: null })).toThrow(/NOT NULL/i);
    expect(() => insert(db, { org_id: null })).toThrow(/NOT NULL/i);
    expect(() => insert(db, { agent_id: null })).toThrow(/NOT NULL/i);
  });

  it('leaves revoked_at and last_used_at nullable — a live, never-used token is the normal case', () => {
    const db = migratedDb();
    insert(db, { revoked_at: null, last_used_at: null });
    const row = db.query(`SELECT revoked_at, last_used_at FROM api_tokens`).get() as any;
    expect(row.revoked_at).toBeNull();
    expect(row.last_used_at).toBeNull();
  });

  it('indexes the columns the interceptor and the list view actually query', () => {
    const db = migratedDb();
    const names = (db.query(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='api_tokens'`)
      .all() as any[]).map((r) => r.name);
    expect(names).toContain('api_tokens_token_hash_idx');
    expect(names).toContain('api_tokens_agent_id_idx');
    expect(names).toContain('api_tokens_org_id_idx');
  });
});

/**
 * The MySQL migration cannot be *applied* here: there is no MySQL server in
 * this environment, and none in CI either — no workflow starts one and no test
 * opens a mysql2 pool. That is true of every MySQL migration in this repository,
 * not just this one, and it is recorded rather than hidden (M12 owns it).
 *
 * What can be checked is that the file still describes the schema. That is not
 * ceremony: the generated file was hand-edited to strip catch-up statements for
 * migrations 0008/0009 that were written by hand and had left the meta snapshot
 * stale, and hand-editing generated DDL is exactly how a column quietly loses
 * its NOT NULL.
 */
describe('0010_api_tokens (mysql, structural)', () => {
  const sql = readFileSync(join(import.meta.dir, '../../drizzle-mysql/0010_api_tokens.sql'), 'utf8');

  it('declares every column the sqlite dialect declares', () => {
    for (const col of ['id', 'org_id', 'agent_id', 'name', 'token_prefix', 'token_hash',
      'scopes', 'created_by', 'created_at', 'expires_at', 'last_used_at', 'revoked_at']) {
      expect(sql).toContain(`\`${col}\``);
    }
  });

  it('keeps expires_at, scopes and token_hash NOT NULL', () => {
    expect(sql).toMatch(/`expires_at` timestamp NOT NULL/);
    expect(sql).toMatch(/`scopes` mediumtext NOT NULL/);
    expect(sql).toMatch(/`token_hash` varchar\(64\) NOT NULL/);
  });

  it('leaves last_used_at and revoked_at nullable', () => {
    expect(sql).toMatch(/`last_used_at` timestamp(?! NOT NULL)/);
    expect(sql).toMatch(/`revoked_at` timestamp(?! NOT NULL)/);
  });

  it('enforces one row per token hash', () => {
    expect(sql).toMatch(/UNIQUE\(`token_hash`\)/);
  });

  it('carries no catch-up statements for migrations already applied by hand', () => {
    // Regenerating against a stale snapshot re-emits these, and applying them a
    // second time fails with a duplicate column. If this fails after a
    // `drizzle-kit generate`, strip them again rather than shipping the file.
    expect(sql).not.toContain('ALTER TABLE `agent_roles`');
    expect(sql).not.toMatch(/ALTER TABLE `invitations` ADD `expires_at`/);
  });
});
