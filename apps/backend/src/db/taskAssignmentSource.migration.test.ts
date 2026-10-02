import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { applyEmbeddedMigrations, sqliteRunner } from './embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';

/**
 * M33-T01 (ADR-0027). 0051 adds `task_assignments.source` and backfills
 * 'claim' only where the activity log shows the holder claimed the task.
 * Stops the shipped chain just before 0051, plants the rows the backfill must
 * classify, then applies the rest - the shape `auditLogRepair.migration.test`
 * uses for the same reason.
 */
const TAG = '0051_task_assignment_source';

describe('task_assignments.source backfill (0051)', () => {
  it('marks only holders the activity log shows claiming as claims', async () => {
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
    sqlite.run(`INSERT INTO agent_roles (id, org_id, name, system_prompt, capabilities) VALUES ('r', 'o', 'R', 'p', '[]')`);
    for (const a of ['a1', 'a2']) sqlite.run(`INSERT INTO agents (id, org_id, agent_role_id, name) VALUES ('${a}', 'o', 'r', '${a}')`);
    for (const t of ['t1', 't2', 't3']) sqlite.run(`INSERT INTO tasks (id, project_id, title, status, created_at) VALUES ('${t}', 'p', '${t}', 'todo', ${now})`);
    // t1: a1 claimed it. t2: a human assigned a2. t3: a2 holds it, but the
    // only 'claimed' row names a *different* agent - not a2's claim.
    sqlite.run(`INSERT INTO task_assignments (id, task_id, agent_id) VALUES ('as1', 't1', 'a1'), ('as2', 't2', 'a2'), ('as3', 't3', 'a2')`);
    const act = (id: string, task: string, kind: string, agent: string) => sqlite.run(
      `INSERT INTO task_activity (id, task_id, project_id, kind, actor_type, actor_id, assignee_agent_id, occurred_at)
       VALUES ('${id}', '${task}', 'p', '${kind}', 'agent', '${agent}', '${agent}', ${now})`);
    act('ac1', 't1', 'claimed', 'a1');
    act('ac2', 't2', 'assigned', 'a2');
    act('ac3', 't3', 'claimed', 'a1');

    await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS);

    const source = (id: string) => (sqlite.query(`SELECT source FROM task_assignments WHERE id = '${id}'`).get() as any).source;
    expect(source('as1')).toBe('claim');
    expect(source('as2')).toBe('assign');
    expect(source('as3')).toBe('assign');
  });
});
