import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * M10-T03 (ADR-0013 Option 5). Same reasoning as every other migrate-*.test.ts:
 * the constraints (and here, the actual seeded data) are the point.
 * `organization_members` isn't part of 0033's tables, so this file builds it
 * from `0000`'s original CREATE TABLE rather than duplicating 0033's setup.
 */

const SEED_MIGRATION = readFileSync(
  join(import.meta.dir, '../../drizzle-sqlite/0034_seed_system_roles_and_migrate_grants.sql'),
  'utf8',
);
const SCHEMA_MIGRATION = readFileSync(
  join(import.meta.dir, '../../drizzle-sqlite/0033_roles_teams_grants.sql'),
  'utf8',
);

function run(db: Database, sql: string) {
  for (const statement of sql.split('--> statement-breakpoint')) {
    const s = statement.trim();
    if (s) db.run(s);
  }
}

function migratedDb(members: Array<{ orgId: string; userId: string; role: string; joinedAt: number }> = []): Database {
  const db = new Database(':memory:');
  db.run(`CREATE TABLE organizations (id text PRIMARY KEY, name text)`);
  db.run(`CREATE TABLE users (id text PRIMARY KEY, name text)`);
  db.run(`CREATE TABLE organization_members (
    org_id text NOT NULL, user_id text NOT NULL, role text DEFAULT 'member' NOT NULL,
    joined_at integer NOT NULL, PRIMARY KEY (org_id, user_id))`);
  run(db, SCHEMA_MIGRATION);

  const orgIds = new Set(members.map((m) => m.orgId));
  const userIds = new Set(members.map((m) => m.userId));
  for (const orgId of orgIds) db.run(`INSERT INTO organizations (id, name) VALUES (?, ?)`, [orgId, orgId]);
  for (const userId of userIds) db.run(`INSERT INTO users (id, name) VALUES (?, ?)`, [userId, userId]);
  for (const m of members) {
    db.run(`INSERT INTO organization_members (org_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`,
      [m.orgId, m.userId, m.role, m.joinedAt]);
  }

  run(db, SEED_MIGRATION);
  return db;
}

describe('0034_seed_system_roles_and_migrate_grants: permissions', () => {
  it('seeds exactly the 32 keys ADR-0013 Option 2 enumerates', () => {
    const db = migratedDb();
    const row = db.query(`SELECT COUNT(*) as c FROM permissions`).get() as any;
    expect(row.c).toBe(32);
  });

  it('is idempotent - re-running the migration does not duplicate rows', () => {
    const db = migratedDb();
    run(db, SEED_MIGRATION);
    const row = db.query(`SELECT COUNT(*) as c FROM permissions`).get() as any;
    expect(row.c).toBe(32);
  });
});

describe('0034_seed_system_roles_and_migrate_grants: system roles', () => {
  it('seeds owner/admin/member/viewer as global (org_id NULL), immutable system roles', () => {
    const db = migratedDb();
    const rows = db.query(`SELECT id, name, org_id, is_system FROM roles ORDER BY id`).all() as any[];
    expect(rows).toEqual([
      { id: 'role-admin', name: 'admin', org_id: null, is_system: 1 },
      { id: 'role-member', name: 'member', org_id: null, is_system: 1 },
      { id: 'role-owner', name: 'owner', org_id: null, is_system: 1 },
      { id: 'role-viewer', name: 'viewer', org_id: null, is_system: 1 },
    ]);
  });

  // Each count is a direct restatement of lib/authz.ts's WRITER_ROLES/
  // ADMIN_ROLES, per ADR-0013's "Concretely, from the audit" paragraph.
  it.each([
    ['role-viewer', 13],
    ['role-member', 23],
    ['role-admin', 31],
    ['role-owner', 32],
  ])('%s holds exactly %d permissions', (roleId, count) => {
    const db = migratedDb();
    const row = db.query(`SELECT COUNT(*) as c FROM role_permissions WHERE role_id = ?`).get(roleId) as any;
    expect(row.c).toBe(count);
  });

  it('viewer holds only *:read permissions - no write or admin', () => {
    const db = migratedDb();
    const rows = db.query(`SELECT permission_key FROM role_permissions WHERE role_id = 'role-viewer'`).all() as any[];
    expect(rows.every((r) => r.permission_key.endsWith(':read'))).toBe(true);
  });

  it('member holds team:write and agent:write - members can create agents today', () => {
    const db = migratedDb();
    const keys = (db.query(`SELECT permission_key FROM role_permissions WHERE role_id = 'role-member'`).all() as any[])
      .map((r) => r.permission_key);
    expect(keys).toContain('team:write');
    expect(keys).toContain('agent:write');
    expect(keys).not.toContain('org:admin');
  });

  it('admin holds role:manage in addition to every *:admin permission', () => {
    const db = migratedDb();
    const keys = (db.query(`SELECT permission_key FROM role_permissions WHERE role_id = 'role-admin'`).all() as any[])
      .map((r) => r.permission_key);
    expect(keys).toContain('role:manage');
    expect(keys).toContain('org:admin');
    expect(keys).not.toContain('org:owner');
  });

  it('owner holds org:owner - the one permission no other role has', () => {
    const db = migratedDb();
    const keys = (db.query(`SELECT permission_key FROM role_permissions WHERE role_id = 'role-owner'`).all() as any[])
      .map((r) => r.permission_key);
    expect(keys).toContain('org:owner');
  });
});

describe('0034_seed_system_roles_and_migrate_grants: grants backfill', () => {
  it('migrates every organization_members row into an equivalent grant', () => {
    const db = migratedDb([
      { orgId: 'org-1', userId: 'user-1', role: 'owner', joinedAt: 100 },
      { orgId: 'org-1', userId: 'user-2', role: 'member', joinedAt: 200 },
      { orgId: 'org-2', userId: 'user-1', role: 'admin', joinedAt: 300 },
    ]);
    const rows = db.query(`SELECT subject_type, subject_id, scope_type, scope_id, role_id, created_at
      FROM grants ORDER BY subject_id, scope_id`).all() as any[];
    expect(rows).toEqual([
      { subject_type: 'user', subject_id: 'user-1', scope_type: 'organization', scope_id: 'org-1', role_id: 'role-owner', created_at: 100 },
      { subject_type: 'user', subject_id: 'user-1', scope_type: 'organization', scope_id: 'org-2', role_id: 'role-admin', created_at: 300 },
      { subject_type: 'user', subject_id: 'user-2', scope_type: 'organization', scope_id: 'org-1', role_id: 'role-member', created_at: 200 },
    ]);
  });

  it('preserves the viewer tier through the backfill too, not just writer/admin roles', () => {
    const db = migratedDb([{ orgId: 'org-1', userId: 'user-1', role: 'viewer', joinedAt: 0 }]);
    const row = db.query(`SELECT role_id FROM grants WHERE subject_id = 'user-1'`).get() as any;
    expect(row.role_id).toBe('role-viewer');
  });

  it('is idempotent - re-running the migration mints no duplicate grant for the same membership', () => {
    const db = migratedDb([{ orgId: 'org-1', userId: 'user-1', role: 'owner', joinedAt: 0 }]);
    run(db, SEED_MIGRATION);
    const row = db.query(`SELECT COUNT(*) as c FROM grants`).get() as any;
    expect(row.c).toBe(1);
  });

  it('produces no grants when there are no memberships to migrate', () => {
    const db = migratedDb();
    const row = db.query(`SELECT COUNT(*) as c FROM grants`).get() as any;
    expect(row.c).toBe(0);
  });
});

/**
 * The MySQL migration cannot be applied without a live server (see
 * `migrate-api-tokens.test.ts`'s note, owned by M12). Checked structurally -
 * already verified live in T03's own commit against `docker compose`'s
 * MySQL container (32 permissions, 4 roles, matching role_permissions
 * counts, and a real grants backfill against that database's existing
 * organization_members rows).
 */
describe('0021_seed_system_roles_and_migrate_grants (mysql, structural)', () => {
  const sql = readFileSync(
    join(import.meta.dir, '../../drizzle-mysql/0021_seed_system_roles_and_migrate_grants.sql'), 'utf8');

  it('seeds the same 32 permission keys as the SQLite edition', () => {
    const matches = sql.match(/\('[a-z]+:[a-z]+', '/g) ?? [];
    expect(matches.length).toBe(32);
  });

  it('seeds the same four system roles, marked is_system = true', () => {
    for (const roleId of ['role-viewer', 'role-member', 'role-admin', 'role-owner']) {
      expect(sql).toContain(`'${roleId}'`);
    }
    expect(sql).toMatch(/VALUES\s*\n\s*\('role-viewer', NULL, 'viewer', true\)/);
  });

  it('backfills grants with the same idempotency guard as the SQLite edition', () => {
    expect(sql).toMatch(/WHERE NOT EXISTS/);
  });
});
