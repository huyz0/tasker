import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { applyEmbeddedMigrations, sqliteRunner } from './embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';
import { stalledClaimAlerts, tasks, projects, projectTemplates, organizations, users } from './schema.sqlite';

/**
 * M25-T02 (ADR-0022 Decision 3). Runs the SHIPPED migration chain exactly as
 * a fresh database boots (`applyEmbeddedMigrations` over the real embedded
 * SQLite migrations), then proves the one thing this table exists for: the
 * unique index on (task_id, anchor_at) actually rejects a duplicate pair,
 * which is what makes `anchor_at NOT NULL` load-bearing rather than
 * decorative — a nullable anchor would let every such pair dodge the index
 * entirely (SQLite treats NULLs in a UNIQUE index as mutually distinct).
 */

async function freshDb() {
  const sqlite = new Database(':memory:');
  // setupDatabase creates this before migrating; 0025/0026 refer to it.
  sqlite.query('CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, content="")').run();
  await applyEmbeddedMigrations(sqliteRunner(sqlite), EMBEDDED_SQLITE_MIGRATIONS);
  return { sqlite, db: drizzle(sqlite) };
}

/** One minimal, real task row - the FK stalled_claim_alerts.task_id points at. */
async function seedTask(db: ReturnType<typeof drizzle>, taskId: string) {
  await db.insert(organizations).values({ id: 'org1', name: 'Org', slug: 'org1', createdAt: new Date() });
  await db.insert(users).values({ id: 'user1', createdAt: new Date() });
  await db.insert(projectTemplates).values({ id: 'tmpl1', orgId: 'org1', name: 'Tmpl', createdAt: new Date() });
  await db.insert(projects).values({ id: 'proj1', orgId: 'org1', templateId: 'tmpl1', ownerId: 'user1', name: 'Proj', createdAt: new Date() });
  await db.insert(tasks).values({ id: taskId, projectId: 'proj1', title: 'Task', status: 'todo', createdAt: new Date() });
}

describe('stalled_claim_alerts DDL (0047)', () => {
  it('creates the table and its unique index', async () => {
    const { sqlite, db } = await freshDb();

    const table = sqlite.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='stalled_claim_alerts'").get();
    expect(table).toBeTruthy();

    const indexes = sqlite.query(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='stalled_claim_alerts'")
      .all().map((r: any) => r.name);
    expect(indexes).toContain('stalled_claim_alerts_task_id_anchor_at_idx');
  });

  it('a drizzle-typed select against the table works, proving the schema matches the shipped DDL', async () => {
    const { db } = await freshDb();
    const rows = await db.select().from(stalledClaimAlerts);
    expect(rows).toEqual([]);
  });

  it('inserting one row succeeds', async () => {
    const { db } = await freshDb();
    await seedTask(db, 't1');

    await db.insert(stalledClaimAlerts).values({
      id: 'sca1',
      taskId: 't1',
      anchorAt: new Date(1000 * 1000),
      alertedAt: new Date(2000 * 1000),
    });

    const rows = await db.select().from(stalledClaimAlerts);
    expect(rows).toHaveLength(1);
  });

  it('rejects a second row with the SAME (task_id, anchor_at) pair - the dedup mechanism NOT NULL closes the hole for', async () => {
    const { db } = await freshDb();
    await seedTask(db, 't1');

    const anchorAt = new Date(1000 * 1000);
    await db.insert(stalledClaimAlerts).values({ id: 'sca1', taskId: 't1', anchorAt, alertedAt: new Date(2000 * 1000) });

    await expect(
      (async () => {
        await db.insert(stalledClaimAlerts).values({ id: 'sca2', taskId: 't1', anchorAt, alertedAt: new Date(3000 * 1000) });
      })(),
    ).rejects.toThrow();

    // The rejected insert must not have landed a second row.
    const rows = await db.select().from(stalledClaimAlerts);
    expect(rows).toHaveLength(1);
  });

  it('accepts a second row with the same task_id but a DIFFERENT anchor_at - a fresh claim is eligible again', async () => {
    const { db } = await freshDb();
    await seedTask(db, 't1');

    await db.insert(stalledClaimAlerts).values({
      id: 'sca1', taskId: 't1', anchorAt: new Date(1000 * 1000), alertedAt: new Date(2000 * 1000),
    });
    await db.insert(stalledClaimAlerts).values({
      id: 'sca2', taskId: 't1', anchorAt: new Date(1500 * 1000), alertedAt: new Date(2500 * 1000),
    });

    const rows = await db.select().from(stalledClaimAlerts);
    expect(rows).toHaveLength(2);
  });
});
