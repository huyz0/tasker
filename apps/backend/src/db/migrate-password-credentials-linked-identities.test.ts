import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * M13-T03. The constraints are the point, same reasoning as
 * `migrate-api-tokens.test.ts` for 0023: a credential store whose uniqueness
 * is decorative is worse than none.
 */

const MIGRATION = readFileSync(
  join(import.meta.dir, '../../drizzle-sqlite/0030_password_credentials_linked_identities.sql'),
  'utf8',
);

function migratedDb(): Database {
  const db = new Database(':memory:');
  db.run(`CREATE TABLE users (id text PRIMARY KEY, email text, username text, name text)`);
  db.run(`INSERT INTO users (id, email, username, name) VALUES ('user-1', 'a@x.test', 'a-user-1', 'A')`);
  db.run(`INSERT INTO users (id, email, username, name) VALUES ('user-2', 'b@x.test', 'b-user-2', 'B')`);
  for (const statement of MIGRATION.split('--> statement-breakpoint')) {
    const sql = statement.trim();
    if (sql) db.run(sql);
  }
  return db;
}

describe('0030_password_credentials_linked_identities: password_credentials', () => {
  it('accepts one credential per user', () => {
    const db = migratedDb();
    db.run(`INSERT INTO password_credentials (user_id, password_hash, updated_at)
      VALUES ('user-1', '$argon2id$v=19$...', 0)`);
    const row = db.query(`SELECT * FROM password_credentials WHERE user_id = 'user-1'`).get() as any;
    expect(row.password_hash).toBe('$argon2id$v=19$...');
    expect(row.failed_attempts).toBe(0);
    expect(row.must_change_password).toBe(0);
  });

  it('refuses a second credential for the same user — the relationship is 1:1', () => {
    const db = migratedDb();
    db.run(`INSERT INTO password_credentials (user_id, password_hash, updated_at)
      VALUES ('user-1', 'hash-a', 0)`);
    expect(() => db.run(`INSERT INTO password_credentials (user_id, password_hash, updated_at)
      VALUES ('user-1', 'hash-b', 1)`)).toThrow(/UNIQUE|PRIMARY/i);
  });

  it('requires a password_hash and an updated_at', () => {
    const db = migratedDb();
    expect(() => db.run(`INSERT INTO password_credentials (user_id, updated_at) VALUES ('user-1', 0)`))
      .toThrow(/NOT NULL/i);
  });

  it('leaves locked_until nullable — an account that has never failed a login is the normal case', () => {
    const db = migratedDb();
    db.run(`INSERT INTO password_credentials (user_id, password_hash, updated_at) VALUES ('user-1', 'h', 0)`);
    const row = db.query(`SELECT locked_until FROM password_credentials WHERE user_id = 'user-1'`).get() as any;
    expect(row.locked_until).toBeNull();
  });
});

describe('0030_password_credentials_linked_identities: linked_identities', () => {
  const insert = (db: Database, over: Record<string, any> = {}) => {
    const row = { id: 'li-1', user_id: 'user-1', provider: 'google', provider_user_id: 'g-123', linked_at: 0, ...over };
    db.run(`INSERT INTO linked_identities (id, user_id, provider, provider_user_id, linked_at)
      VALUES (?, ?, ?, ?, ?)`, [row.id, row.user_id, row.provider, row.provider_user_id, row.linked_at]);
  };

  it('links a provider identity to a user', () => {
    const db = migratedDb();
    insert(db);
    const row = db.query(`SELECT * FROM linked_identities WHERE id = 'li-1'`).get() as any;
    expect(row.user_id).toBe('user-1');
    expect(row.provider_user_id).toBe('g-123');
  });

  it('refuses linking the same provider identity to two different accounts', () => {
    const db = migratedDb();
    insert(db, { id: 'li-1', user_id: 'user-1' });
    // This is the constraint that makes "sign in with Google" resolve to
    // exactly one account: without it, a stolen or reused provider id could
    // be linked to a second user and both would authenticate as that identity.
    expect(() => insert(db, { id: 'li-2', user_id: 'user-2' })).toThrow(/UNIQUE/i);
  });

  it('allows one user to link more than one provider', () => {
    const db = migratedDb();
    insert(db, { id: 'li-1', provider: 'google', provider_user_id: 'g-123' });
    expect(() => insert(db, { id: 'li-2', provider: 'github', provider_user_id: 'gh-456' })).not.toThrow();
    const rows = db.query(`SELECT provider FROM linked_identities WHERE user_id = 'user-1' ORDER BY provider`).all() as any[];
    expect(rows.map((r) => r.provider)).toEqual(['github', 'google']);
  });

  it('indexes user_id, since "list this user\'s linked identities" is the settings-page query', () => {
    const db = migratedDb();
    const names = (db.query(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='linked_identities'`)
      .all() as any[]).map((r) => r.name);
    expect(names).toContain('linked_identities_user_id_idx');
  });
});

/**
 * The MySQL migration cannot be applied without a live server (see
 * `migrate-api-tokens.test.ts`'s note, owned by M12). Checked structurally.
 */
describe('0017_password_credentials_linked_identities (mysql, structural)', () => {
  const sql = readFileSync(
    join(import.meta.dir, '../../drizzle-mysql/0017_password_credentials_linked_identities.sql'), 'utf8');

  it('declares every column both tables need', () => {
    for (const col of ['user_id', 'password_hash', 'updated_at', 'failed_attempts', 'locked_until', 'must_change_password']) {
      expect(sql).toContain(`\`${col}\``);
    }
    for (const col of ['id', 'user_id', 'provider', 'provider_user_id', 'linked_at']) {
      expect(sql).toContain(`\`${col}\``);
    }
  });

  it('enforces one linked identity per (provider, provider_user_id)', () => {
    expect(sql).toMatch(/UNIQUE\(`provider`,`provider_user_id`\)/);
  });

  it('keeps password_hash and password_credentials.user_id NOT NULL', () => {
    expect(sql).toMatch(/`password_hash` varchar\(255\) NOT NULL/);
    expect(sql).toMatch(/`user_id` varchar\(256\) NOT NULL/);
  });

  it('carries no catch-up statements for migrations already applied by hand', () => {
    expect(sql).not.toContain('ALTER TABLE `task_statuses`');
    expect(sql).not.toContain('MODIFY COLUMN `email`');
  });
});
