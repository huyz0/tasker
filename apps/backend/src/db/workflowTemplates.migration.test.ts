import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { applyEmbeddedMigrations, sqliteRunner } from './embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';

/** M42-T01 (ADR-0035). 0058: workflow templates. */
describe('workflow templates migration (0058)', () => {
  it('creates workflow_templates with an empty default description', async () => {
    const sqlite = new Database(':memory:');
    sqlite.query('CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, content="")').run();
    await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS);
    const now = Math.floor(Date.now() / 1000);
    sqlite.run(`INSERT INTO workflow_templates (id, org_id, name, steps, created_at, updated_at) VALUES ('w', 'o', 'Release', '[]', ${now}, ${now})`);
    expect(sqlite.query(`SELECT description, project_id FROM workflow_templates`).get()).toEqual({ description: '', project_id: null });
  });
});
