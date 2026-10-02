import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { applyEmbeddedMigrations, sqliteRunner } from './embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';

/** M41-T01 (ADR-0034). 0057: existing tasks keep everything and have no summary. */
describe('task summaries migration (0057)', () => {
  it('adds empty summary columns to existing tasks', async () => {
    const sqlite = new Database(':memory:');
    sqlite.query('CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, content="")').run();
    const at = EMBEDDED_SQLITE_MIGRATIONS.findIndex((m) => m.tag === '0057_task_summaries');
    expect(at).toBeGreaterThan(0);
    await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS.slice(0, at));
    const now = Math.floor(Date.now() / 1000);
    sqlite.run(`INSERT INTO organizations (id, name, slug, created_at) VALUES ('o', 'O', 'o', ${now})`);
    sqlite.run(`INSERT INTO users (id, email, created_at) VALUES ('u', 'u@x', ${now})`);
    sqlite.run(`INSERT INTO project_templates (id, org_id, name, created_at) VALUES ('tp', 'o', 'T', ${now})`);
    sqlite.run(`INSERT INTO projects (id, org_id, template_id, owner_id, name, key, created_at) VALUES ('p', 'o', 'tp', 'u', 'P', 'P', ${now})`);
    sqlite.run(`INSERT INTO tasks (id, project_id, title, status, created_at, plan) VALUES ('t', 'p', 'Old', 'done', ${now}, '[]')`);
    await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS);
    const row = sqlite.query(`SELECT title, plan, summary, summary_updated_at, summary_agent_id, summary_user_id FROM tasks`).get() as any;
    expect(row).toEqual({ title: 'Old', plan: '[]', summary: null, summary_updated_at: null, summary_agent_id: null, summary_user_id: null });
  });
});
