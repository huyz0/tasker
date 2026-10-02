import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { applyEmbeddedMigrations, sqliteRunner } from './embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';

/**
 * M35-T01 (ADR-0028). 0052 adds `tasks.priority` / `tasks.parent_task_id` and
 * the `task_links` table. A task that existed before it must read as "no
 * priority, no parent" - what every task meant until now - and a relation may
 * be recorded once per kind.
 */
const TAG = '0052_work_graph';

describe('work graph migration (0052)', () => {
  it('leaves existing tasks unprioritised and parentless, and links unique per kind', async () => {
    const sqlite = new Database(':memory:');
    sqlite.query('CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, content="")').run();
    const at = EMBEDDED_SQLITE_MIGRATIONS.findIndex((m) => m.tag === TAG);
    expect(at).toBeGreaterThan(0);
    await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS.slice(0, at));

    const now = Math.floor(Date.now() / 1000);
    sqlite.run(`INSERT INTO organizations (id, name, slug, created_at) VALUES ('o', 'O', 'o', ${now})`);
    sqlite.run(`INSERT INTO users (id, created_at) VALUES ('u', ${now})`);
    sqlite.run(`INSERT INTO project_templates (id, org_id, name, created_at) VALUES ('tp', 'o', 'T', ${now})`);
    sqlite.run(`INSERT INTO projects (id, org_id, template_id, owner_id, name, created_at) VALUES ('p', 'o', 'tp', 'u', 'P', ${now})`);
    sqlite.run(`INSERT INTO tasks (id, project_id, title, status, created_at) VALUES ('t1', 'p', 't1', 'todo', ${now})`);

    await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS);

    expect(sqlite.query(`SELECT priority, parent_task_id FROM tasks WHERE id = 't1'`).get()).toEqual({ priority: 0, parent_task_id: null });
    const link = (id: string, kind: string) =>
      sqlite.run(`INSERT INTO task_links (id, task_id, linked_task_id, kind, created_at) VALUES ('${id}', 't1', 't2', '${kind}', ${now})`);
    link('l1', 'blocked_by');
    link('l2', 'discovered_from');
    expect(() => link('l3', 'blocked_by')).toThrow(/UNIQUE/);
  });
});
