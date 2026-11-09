import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { applyEmbeddedMigrations, sqliteRunner } from './embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';

describe('durable schedule occurrence upgrade (0063)', () => {
  it('retains legacy receipts and enforces unique new slots while allowing legacy nulls', async () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.run('CREATE VIRTUAL TABLE search_index USING fts5(title, body, content="")');
      const at = EMBEDDED_SQLITE_MIGRATIONS.findIndex(m => m.tag === '0063_schedule_occurrences');
      expect(at).toBeGreaterThan(0);
      await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS.slice(0, at));
      sqlite.run("INSERT INTO schedule_runs(id,schedule_id,ran_at,outcome,task_id,trigger) VALUES ('old1','s',1,'created','original','schedule'),('old2','s',2,'skipped',NULL,'manual')");
      await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS);
      expect(sqlite.query('SELECT id,outcome,task_id,slot_key,attempts FROM schedule_runs ORDER BY id').all()).toEqual([
        { id: 'old1', outcome: 'created', task_id: 'original', slot_key: null, attempts: 0 },
        { id: 'old2', outcome: 'skipped', task_id: null, slot_key: null, attempts: 0 },
      ]);
      sqlite.run("INSERT INTO schedule_runs(id,schedule_id,ran_at,outcome,trigger,slot_key) VALUES ('new1','s',3,'queued','schedule','scheduled:slot')");
      expect(() => sqlite.run("INSERT INTO schedule_runs(id,schedule_id,ran_at,outcome,trigger,slot_key) VALUES ('new2','s',3,'queued','schedule','scheduled:slot')"))
        .toThrow(/UNIQUE constraint/);
      sqlite.run("INSERT INTO schedule_runs(id,schedule_id,ran_at,outcome,trigger,slot_key) VALUES ('other','s2',3,'queued','schedule','scheduled:slot')");
      const body = '漢'.repeat(100_000);
      sqlite.query('UPDATE schedule_runs SET frozen_inputs=? WHERE id=?').run(body, 'new1');
      expect((sqlite.query('SELECT length(frozen_inputs) AS size FROM schedule_runs WHERE id=?').get('new1') as any).size).toBe(100_000);
    } finally { sqlite.close(); }
  });
});
