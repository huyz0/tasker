import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The M03 plan names this migration as the milestone's risk, so the migration
 * itself is tested rather than only the schema it leaves behind.
 *
 * Applying it through drizzle's migrator would only ever exercise the
 * empty-database path, because the migrator runs every migration in order
 * against a fresh file. The cases that matter are all about data that already
 * exists, so the migration's SQL is run directly against a database built in
 * the *pre*-migration shape.
 */

const MIGRATION = readFileSync(
  join(import.meta.dir, '../../drizzle-sqlite/0021_scope_agent_roles_to_org.sql'),
  'utf8',
);

/** Builds just enough of the old schema for the migration to act on. */
function oldShapeDb(): Database {
  const db = new Database(':memory:');
  db.run(`CREATE TABLE organizations (id text PRIMARY KEY, name text, slug text)`);
  db.run(`CREATE TABLE agent_roles (
    id text PRIMARY KEY, name text NOT NULL, system_prompt text NOT NULL,
    capabilities text NOT NULL, created_at integer
  )`);
  db.run(`CREATE TABLE agents (
    id text PRIMARY KEY, org_id text NOT NULL, agent_role_id text NOT NULL, name text NOT NULL
  )`);
  db.run(`INSERT INTO organizations VALUES ('org-a', 'A', 'a'), ('org-b', 'B', 'b')`);
  return db;
}

const addRole = (db: Database, id: string) =>
  db.run(`INSERT INTO agent_roles VALUES (?, ?, 'prompt', '[]', 0)`, [id, `Role ${id}`]);

const addAgent = (db: Database, id: string, orgId: string, roleId: string) =>
  db.run(`INSERT INTO agents VALUES (?, ?, ?, ?)`, [id, orgId, roleId, `Agent ${id}`]);

/** Runs the migration the way drizzle does — statement by statement. */
const applyMigration = (db: Database) => {
  for (const statement of MIGRATION.split('--> statement-breakpoint')) {
    const sql = statement.trim();
    if (sql) db.run(sql);
  }
};

describe('0021_scope_agent_roles_to_org', () => {
  it('assigns a role to the organization of the agents that reference it', () => {
    const db = oldShapeDb();
    addRole(db, 'role-1');
    addAgent(db, 'agent-1', 'org-a', 'role-1');
    addAgent(db, 'agent-2', 'org-a', 'role-1');

    applyMigration(db);

    const rows = db.query(`SELECT id, org_id FROM agent_roles`).all() as any[];
    expect(rows).toEqual([{ id: 'role-1', org_id: 'org-a' }]);
  });

  it('deletes a role no agent references, because no organization can claim it', () => {
    const db = oldShapeDb();
    addRole(db, 'role-used');
    addRole(db, 'role-orphan');
    addAgent(db, 'agent-1', 'org-b', 'role-used');

    applyMigration(db);

    const ids = (db.query(`SELECT id FROM agent_roles`).all() as any[]).map((r) => r.id);
    expect(ids).toEqual(['role-used']);
  });

  // The milestone's stated risk, and the reason this file exists: the migration
  // must refuse rather than pick an owner, because picking one silently hands
  // another tenant's persona away.
  it('aborts when a role is shared across organizations', () => {
    const db = oldShapeDb();
    addRole(db, 'role-shared');
    addAgent(db, 'agent-a', 'org-a', 'role-shared');
    addAgent(db, 'agent-b', 'org-b', 'role-shared');

    expect(() => applyMigration(db)).toThrow(/_abort_agent_role_is_shared_across_orgs|CHECK/i);
  });

  it('leaves the data untouched when it aborts', () => {
    const db = oldShapeDb();
    addRole(db, 'role-shared');
    addRole(db, 'role-orphan');
    addAgent(db, 'agent-a', 'org-a', 'role-shared');
    addAgent(db, 'agent-b', 'org-b', 'role-shared');

    try {
      applyMigration(db);
    } catch {
      /* expected */
    }

    // The guard is the first statement, so the orphan delete has not run yet.
    // If the guard were placed after it, an aborted migration would still have
    // destroyed rows on its way to failing.
    const ids = (db.query(`SELECT id FROM agent_roles ORDER BY id`).all() as any[]).map((r) => r.id);
    expect(ids).toEqual(['role-orphan', 'role-shared']);
  });

  it('is a no-op on an empty catalogue', () => {
    const db = oldShapeDb();

    applyMigration(db);

    expect(db.query(`SELECT COUNT(*) AS n FROM agent_roles`).get()).toEqual({ n: 0 });
  });

  it('produces a NOT NULL org_id, so a role cannot be created unscoped afterwards', () => {
    const db = oldShapeDb();
    addRole(db, 'role-1');
    addAgent(db, 'agent-1', 'org-a', 'role-1');

    applyMigration(db);

    expect(() =>
      db.run(`INSERT INTO agent_roles (id, name, system_prompt, capabilities) VALUES ('x', 'X', 'p', '[]')`),
    ).toThrow(/NOT NULL/i);
  });
});
