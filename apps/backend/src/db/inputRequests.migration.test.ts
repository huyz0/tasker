import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { applyEmbeddedMigrations, sqliteRunner } from './embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';

/** M38-T01 (ADR-0031). 0054: a nullable plan on every task, and the input_requests table. */
describe('plans and input requests migration (0054)', () => {
  it('leaves existing tasks planless and creates input_requests with its defaults', async () => {
    const sqlite = new Database(':memory:');
    sqlite.query('CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, content="")').run();
    const at = EMBEDDED_SQLITE_MIGRATIONS.findIndex((m) => m.tag === '0054_plans_and_input_requests');
    expect(at).toBeGreaterThan(0);
    await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS.slice(0, at));
    const now = Math.floor(Date.now() / 1000);
    sqlite.run(`INSERT INTO organizations (id, name, slug, created_at) VALUES ('o', 'O', 'o', ${now})`);
    sqlite.run(`INSERT INTO users (id, created_at) VALUES ('u', ${now})`);
    sqlite.run(`INSERT INTO project_templates (id, org_id, name, created_at) VALUES ('tp', 'o', 'T', ${now})`);
    sqlite.run(`INSERT INTO projects (id, org_id, template_id, owner_id, name, created_at) VALUES ('p', 'o', 'tp', 'u', 'P', ${now})`);
    sqlite.run(`INSERT INTO tasks (id, project_id, title, status, created_at) VALUES ('t', 'p', 't', 'todo', ${now})`);
    await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS);

    expect((sqlite.query(`SELECT plan FROM tasks WHERE id = 't'`).get() as any).plan).toBeNull();
    sqlite.run(`INSERT INTO input_requests (id, task_id, org_id, project_id, question, created_at) VALUES ('ir', 't', 'o', 'p', 'Which?', ${now})`);
    expect(sqlite.query(`SELECT status, options, answer FROM input_requests`).get()).toEqual({ status: 'open', options: '[]', answer: null });
  });
});
