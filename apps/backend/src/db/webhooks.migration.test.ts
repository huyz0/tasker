import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { applyEmbeddedMigrations, sqliteRunner } from './embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';

/** M37-T01 (ADR-0030). 0053 creates the webhook tables with the defaults the sweep relies on. */
describe('webhooks migration (0053)', () => {
  it('creates webhooks and the delivery outbox with their defaults and indexes', async () => {
    const sqlite = new Database(':memory:');
    sqlite.query('CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, content="")').run();
    expect(EMBEDDED_SQLITE_MIGRATIONS.some((m) => m.tag === '0053_webhooks')).toBe(true);
    await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS);

    const now = Math.floor(Date.now() / 1000);
    sqlite.run(`INSERT INTO organizations (id, name, slug, created_at) VALUES ('o', 'O', 'o', ${now})`);
    sqlite.run(`INSERT INTO webhooks (id, org_id, url, secret_encrypted, events, created_at) VALUES ('w', 'o', 'https://x', 's', '["*"]', ${now})`);
    expect(sqlite.query(`SELECT active, consecutive_failures, description FROM webhooks`).get()).toEqual({ active: 1, consecutive_failures: 0, description: '' });
    sqlite.run(`INSERT INTO webhook_deliveries (id, webhook_id, event_id, event_type, payload, next_attempt_at, created_at) VALUES ('d', 'w', 'e', 'ping', '{}', ${now}, ${now})`);
    expect(sqlite.query(`SELECT status, attempts FROM webhook_deliveries`).get()).toEqual({ status: 'pending', attempts: 0 });
    const indexes = (sqlite.query(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'webhook_deliveries'`).all() as any[]).map((r) => r.name);
    expect(indexes).toContain('webhook_deliveries_status_next_attempt_idx');
  });
});
