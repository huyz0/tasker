import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { applyEmbeddedMigrations, sqliteRunner } from './embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';

/** M40-T01 (ADR-0033). 0056: usage records, unique per task and idempotency key. */
describe('usage records migration (0056)', () => {
  it('creates usage_records with zero defaults and a per-task idempotency key', async () => {
    const sqlite = new Database(':memory:');
    sqlite.query('CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, content="")').run();
    await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS);
    const now = Math.floor(Date.now() / 1000);
    const insert = (id: string, task: string, key: string | null) =>
      sqlite.run(`INSERT INTO usage_records (id, task_id, org_id, project_id, idempotency_key, created_at) VALUES (?, ?, 'o', 'p', ?, ${now})`, [id, task, key]);
    insert('u1', 't1', 'k');
    insert('u2', 't2', 'k');
    insert('u3', 't1', null);
    insert('u4', 't1', null);
    expect(() => insert('u5', 't1', 'k')).toThrow(/UNIQUE/);
    const row = sqlite.query(`SELECT model_name, input_tokens, output_tokens, cost_micros FROM usage_records WHERE id = 'u1'`).get() as any;
    expect(row).toEqual({ model_name: '', input_tokens: 0, output_tokens: 0, cost_micros: 0 });
    // 64-bit: a cost beyond 32 bits survives.
    sqlite.run(`UPDATE usage_records SET cost_micros = 5000000000000 WHERE id = 'u1'`);
    expect((sqlite.query(`SELECT cost_micros FROM usage_records WHERE id = 'u1'`).get() as any).cost_micros).toBe(5000000000000);
  });
});
