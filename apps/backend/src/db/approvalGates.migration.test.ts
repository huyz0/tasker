import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { applyEmbeddedMigrations, sqliteRunner } from './embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';

/** M39-T01 (ADR-0032). 0055: every existing transition stays ungated; the approvals table exists. */
describe('approval gates migration (0055)', () => {
  it('leaves existing transitions ungated and creates transition_approvals', async () => {
    const sqlite = new Database(':memory:');
    sqlite.query('CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, content="")').run();
    const at = EMBEDDED_SQLITE_MIGRATIONS.findIndex((m) => m.tag === '0055_approval_gates');
    expect(at).toBeGreaterThan(0);
    await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS.slice(0, at));
    const now = Math.floor(Date.now() / 1000);
    sqlite.run(`INSERT INTO organizations (id, name, slug, created_at) VALUES ('o', 'O', 'o', ${now})`);
    sqlite.run(`INSERT INTO task_types (id, org_id, name, created_at) VALUES ('tt', 'o', 'T', ${now})`);
    sqlite.run(`INSERT INTO task_statuses (id, task_type_id, name, position) VALUES ('s1', 'tt', 'open', 0), ('s2', 'tt', 'done', 1)`);
    sqlite.run(`INSERT INTO task_status_transitions (id, task_type_id, from_status_id, to_status_id) VALUES ('e', 'tt', 's1', 's2')`);
    await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS);
    expect((sqlite.query(`SELECT requires_approval FROM task_status_transitions`).get() as any).requires_approval).toBe(0);
    sqlite.run(`INSERT INTO transition_approvals (id, task_id, org_id, project_id, from_status, to_status, requested_by_agent_id, created_at) VALUES ('a', 't', 'o', 'p', 'open', 'done', 'ag', ${now})`);
    expect((sqlite.query(`SELECT status FROM transition_approvals`).get() as any).status).toBe('pending');
  });
});
