import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { applyEmbeddedMigrations, sqliteRunner } from './embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';

/** M43-T01 (ADR-0036). 0059: schedules, their runs, and tasks.schedule_id. */
describe('schedules migration (0059)', () => {
  it('creates schedules with active, skip-if-open defaults, and leaves existing tasks unscheduled', async () => {
    const sqlite = new Database(':memory:');
    sqlite.query('CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, content="")').run();
    const at = EMBEDDED_SQLITE_MIGRATIONS.findIndex((m) => m.tag === '0059_schedules');
    expect(at).toBeGreaterThan(0);
    await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS.slice(0, at));
    const now = Math.floor(Date.now() / 1000);
    sqlite.run(`INSERT INTO organizations (id, name, slug, created_at) VALUES ('o', 'O', 'o', ${now})`);
    sqlite.run(`INSERT INTO users (id, email, created_at) VALUES ('u', 'u@x', ${now})`);
    sqlite.run(`INSERT INTO project_templates (id, org_id, name, created_at) VALUES ('tp', 'o', 'T', ${now})`);
    sqlite.run(`INSERT INTO projects (id, org_id, template_id, owner_id, name, key, created_at) VALUES ('p', 'o', 'tp', 'u', 'P', 'P', ${now})`);
    sqlite.run(`INSERT INTO tasks (id, project_id, title, status, created_at) VALUES ('t', 'p', 'Old', 'todo', ${now})`);
    await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS);
    expect((sqlite.query(`SELECT schedule_id FROM tasks`).get() as any).schedule_id).toBeNull();
    sqlite.run(`INSERT INTO schedules (id, org_id, project_id, name, cadence, next_run_at, created_by, created_at) VALUES ('s', 'o', 'p', 'Weekly', 'weekly', ${now}, 'u', ${now})`);
    expect(sqlite.query(`SELECT active, skip_if_open, weekdays, hour_utc, task_priority FROM schedules`).get())
      .toEqual({ active: 1, skip_if_open: 1, weekdays: '[]', hour_utc: 9, task_priority: 0 });
  });
});
