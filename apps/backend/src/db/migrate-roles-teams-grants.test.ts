import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * M10-T02 (ADR-0013). Same reasoning as
 * `migrate-password-credentials-linked-identities.test.ts` for 0030: the
 * constraints are the point. subject_type/scope_type are deliberately plain
 * text here (not a SQLite CHECK), matching this schema's existing
 * enum-as-text convention (organization_members.role, remote_pull_requests
 * .status) — validated at the app layer, not the DB, in both dialects'
 * SQLite editions. MySQL enforces them with a real `enum(...)` column
 * instead, checked structurally below.
 */

const MIGRATION = readFileSync(
  join(import.meta.dir, '../../drizzle-sqlite/0033_roles_teams_grants.sql'),
  'utf8',
);

function migratedDb(): Database {
  const db = new Database(':memory:');
  db.run(`CREATE TABLE organizations (id text PRIMARY KEY, name text)`);
  db.run(`INSERT INTO organizations (id, name) VALUES ('org-1', 'Acme')`);
  db.run(`CREATE TABLE users (id text PRIMARY KEY, name text)`);
  db.run(`INSERT INTO users (id, name) VALUES ('user-1', 'A')`);
  for (const statement of MIGRATION.split('--> statement-breakpoint')) {
    const sql = statement.trim();
    if (sql) db.run(sql);
  }
  return db;
}

describe('0033_roles_teams_grants: permissions', () => {
  it('stores a permission keyed by its key', () => {
    const db = migratedDb();
    db.run(`INSERT INTO permissions (key, description) VALUES ('task.create', 'Create tasks')`);
    const row = db.query(`SELECT * FROM permissions WHERE key = 'task.create'`).get() as any;
    expect(row.description).toBe('Create tasks');
  });

  it('refuses a duplicate key', () => {
    const db = migratedDb();
    db.run(`INSERT INTO permissions (key, description) VALUES ('task.create', 'Create tasks')`);
    expect(() => db.run(`INSERT INTO permissions (key, description) VALUES ('task.create', 'dup')`))
      .toThrow(/UNIQUE|PRIMARY/i);
  });
});

describe('0033_roles_teams_grants: roles', () => {
  it('allows a system role with no org_id — a global, built-in role', () => {
    const db = migratedDb();
    db.run(`INSERT INTO roles (id, org_id, name, is_system, created_at) VALUES ('role-owner', NULL, 'owner', 1, 0)`);
    const row = db.query(`SELECT * FROM roles WHERE id = 'role-owner'`).get() as any;
    expect(row.org_id).toBeNull();
    expect(row.is_system).toBe(1);
  });

  it('allows an org-scoped custom role', () => {
    const db = migratedDb();
    db.run(`INSERT INTO roles (id, org_id, name, is_system, created_at)
      VALUES ('role-custom', 'org-1', 'triager', 0, 0)`);
    const row = db.query(`SELECT * FROM roles WHERE id = 'role-custom'`).get() as any;
    expect(row.org_id).toBe('org-1');
    expect(row.is_system).toBe(0);
  });

  it('defaults is_system to false', () => {
    const db = migratedDb();
    db.run(`INSERT INTO roles (id, org_id, name, created_at) VALUES ('role-x', 'org-1', 'x', 0)`);
    const row = db.query(`SELECT is_system FROM roles WHERE id = 'role-x'`).get() as any;
    expect(row.is_system).toBe(0);
  });

  it('refuses a role for an org that does not exist', () => {
    const db = migratedDb();
    db.run('PRAGMA foreign_keys = ON');
    expect(() => db.run(`INSERT INTO roles (id, org_id, name, is_system, created_at)
      VALUES ('role-x', 'missing-org', 'x', 0, 0)`)).toThrow(/FOREIGN KEY/i);
  });

  it('indexes org_id, since "list this org\'s custom roles" is the roles-page query', () => {
    const db = migratedDb();
    const names = (db.query(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='roles'`)
      .all() as any[]).map((r) => r.name);
    expect(names).toContain('roles_org_id_idx');
  });
});

describe('0033_roles_teams_grants: role_permissions', () => {
  const seed = (db: Database) => {
    db.run(`INSERT INTO roles (id, org_id, name, is_system, created_at) VALUES ('role-1', NULL, 'r', 1, 0)`);
    db.run(`INSERT INTO permissions (key, description) VALUES ('task.create', 'Create tasks')`);
  };

  it('grants a permission to a role', () => {
    const db = migratedDb();
    seed(db);
    db.run(`INSERT INTO role_permissions (role_id, permission_key) VALUES ('role-1', 'task.create')`);
    const row = db.query(`SELECT * FROM role_permissions WHERE role_id = 'role-1'`).get() as any;
    expect(row.permission_key).toBe('task.create');
  });

  it('refuses granting the same permission to the same role twice', () => {
    const db = migratedDb();
    seed(db);
    db.run(`INSERT INTO role_permissions (role_id, permission_key) VALUES ('role-1', 'task.create')`);
    expect(() => db.run(`INSERT INTO role_permissions (role_id, permission_key) VALUES ('role-1', 'task.create')`))
      .toThrow(/UNIQUE|PRIMARY/i);
  });
});

describe('0033_roles_teams_grants: teams', () => {
  it('requires an org_id — a team always belongs to exactly one org', () => {
    const db = migratedDb();
    expect(() => db.run(`INSERT INTO teams (id, name, created_at) VALUES ('team-1', 'Platform', 0)`))
      .toThrow(/NOT NULL/i);
  });

  it('creates a team scoped to an org', () => {
    const db = migratedDb();
    db.run(`INSERT INTO teams (id, org_id, name, created_at) VALUES ('team-1', 'org-1', 'Platform', 0)`);
    const row = db.query(`SELECT * FROM teams WHERE id = 'team-1'`).get() as any;
    expect(row.org_id).toBe('org-1');
    expect(row.deleted_at).toBeNull();
  });

  it('indexes org_id, since "list this org\'s teams" is the teams-page query', () => {
    const db = migratedDb();
    const names = (db.query(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='teams'`)
      .all() as any[]).map((r) => r.name);
    expect(names).toContain('teams_org_id_idx');
  });
});

describe('0033_roles_teams_grants: team_members', () => {
  const seed = (db: Database) => {
    db.run(`INSERT INTO teams (id, org_id, name, created_at) VALUES ('team-1', 'org-1', 'Platform', 0)`);
  };

  it('adds a user to a team', () => {
    const db = migratedDb();
    seed(db);
    db.run(`INSERT INTO team_members (team_id, user_id, joined_at) VALUES ('team-1', 'user-1', 0)`);
    const row = db.query(`SELECT * FROM team_members WHERE team_id = 'team-1'`).get() as any;
    expect(row.user_id).toBe('user-1');
  });

  it('refuses adding the same user to the same team twice', () => {
    const db = migratedDb();
    seed(db);
    db.run(`INSERT INTO team_members (team_id, user_id, joined_at) VALUES ('team-1', 'user-1', 0)`);
    expect(() => db.run(`INSERT INTO team_members (team_id, user_id, joined_at) VALUES ('team-1', 'user-1', 1)`))
      .toThrow(/UNIQUE|PRIMARY/i);
  });

  it("indexes user_id, since \"list this user's teams\" is the profile-page query", () => {
    const db = migratedDb();
    const names = (db.query(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='team_members'`)
      .all() as any[]).map((r) => r.name);
    expect(names).toContain('team_members_user_id_idx');
  });
});

describe('0033_roles_teams_grants: grants', () => {
  const seed = (db: Database) => {
    db.run(`INSERT INTO roles (id, org_id, name, is_system, created_at) VALUES ('role-1', NULL, 'r', 1, 0)`);
  };

  it('grants a role to a user at an organization scope', () => {
    const db = migratedDb();
    seed(db);
    db.run(`INSERT INTO grants (id, subject_type, subject_id, scope_type, scope_id, role_id, created_at)
      VALUES ('grant-1', 'user', 'user-1', 'organization', 'org-1', 'role-1', 0)`);
    const row = db.query(`SELECT * FROM grants WHERE id = 'grant-1'`).get() as any;
    expect(row.subject_type).toBe('user');
    expect(row.scope_type).toBe('organization');
  });

  it('grants a role to a team, not just a user — a team can be a subject', () => {
    const db = migratedDb();
    seed(db);
    db.run(`INSERT INTO grants (id, subject_type, subject_id, scope_type, scope_id, role_id, created_at)
      VALUES ('grant-1', 'team', 'team-1', 'project', 'proj-1', 'role-1', 0)`);
    const row = db.query(`SELECT * FROM grants WHERE id = 'grant-1'`).get() as any;
    expect(row.subject_type).toBe('team');
    expect(row.scope_type).toBe('project');
  });

  it('allows more than one grant for the same subject at different scopes', () => {
    const db = migratedDb();
    seed(db);
    db.run(`INSERT INTO grants (id, subject_type, subject_id, scope_type, scope_id, role_id, created_at)
      VALUES ('grant-1', 'user', 'user-1', 'organization', 'org-1', 'role-1', 0)`);
    expect(() => db.run(`INSERT INTO grants (id, subject_type, subject_id, scope_type, scope_id, role_id, created_at)
      VALUES ('grant-2', 'user', 'user-1', 'project', 'proj-1', 'role-1', 1)`)).not.toThrow();
  });

  it('indexes subject and scope, since resolving "what can this subject do" and "who has access to this scope" are both hot queries', () => {
    const db = migratedDb();
    const names = (db.query(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='grants'`)
      .all() as any[]).map((r) => r.name);
    expect(names).toContain('grants_subject_idx');
    expect(names).toContain('grants_scope_idx');
  });
});

/**
 * The MySQL migration cannot be applied without a live server (see
 * `migrate-api-tokens.test.ts`'s note, owned by M12). Checked structurally —
 * already verified live in T02's own commit against `docker compose`'s
 * MySQL container.
 */
describe('0020_roles_teams_grants (mysql, structural)', () => {
  const sql = readFileSync(
    join(import.meta.dir, '../../drizzle-mysql/0020_roles_teams_grants.sql'), 'utf8');

  it('declares every table this migration owns', () => {
    for (const table of ['permissions', 'roles', 'role_permissions', 'teams', 'team_members', 'grants']) {
      expect(sql).toContain(`CREATE TABLE \`${table}\``);
    }
  });

  it('enforces subject_type/scope_type as a real enum, unlike the SQLite edition\'s plain text', () => {
    expect(sql).toMatch(/`subject_type` enum\('user','team'\) NOT NULL/);
    expect(sql).toMatch(/`scope_type` enum\('organization','team','project'\) NOT NULL/);
  });

  it('keeps role_permissions and team_members as pure composite-key join tables', () => {
    expect(sql).toMatch(/CONSTRAINT `role_permissions_role_id_permission_key_pk` PRIMARY KEY\(`role_id`,`permission_key`\)/);
    expect(sql).toMatch(/CONSTRAINT `team_members_team_id_user_id_pk` PRIMARY KEY\(`team_id`,`user_id`\)/);
  });

  it('carries no catch-up statements for migrations already applied by hand', () => {
    expect(sql).not.toContain('ALTER TABLE `task_statuses`');
    expect(sql).not.toContain('MODIFY COLUMN `email`');
  });
});
