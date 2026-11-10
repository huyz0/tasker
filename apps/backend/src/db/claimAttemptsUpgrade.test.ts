import { expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle as sqliteDrizzle } from 'drizzle-orm/bun-sqlite';
import { drizzle as mysqlDrizzle } from 'drizzle-orm/mysql2';
import { eq, sql } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { setupDatabase } from './db';
import { EMBEDDED_MYSQL_MIGRATIONS, EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';
import { applyEmbeddedMigrations, sqliteRunner, mysqlRunner } from './embeddedMigrations';
import * as SQ from './schema.sqlite';
import * as MY from './schema.mysql';
import { makeAuthContext } from '../test/setup';
import { currentPrincipalKey } from '../modules/auth/session';
import { createTaskManagementHandler } from '../modules/tasks/tasks.handler';

async function seedLegacy(db: any, S: typeof SQ | typeof MY) {
  const suffix = crypto.randomUUID(), now = new Date('2020-01-01T00:00:00Z');
  const orgId = `org-${suffix}`, userId = `user-${suffix}`, projectId = `project-${suffix}`;
  const taskId = `task-${suffix}`, agentId = `agent-${suffix}`, roleId = `role-${suffix}`;
  await db.insert(S.users).values({ id: userId, email: `${suffix}@example.test`, createdAt: now });
  await db.insert(S.organizations).values({ id: orgId, name: 'Legacy org', slug: orgId, createdAt: now });
  await db.insert(S.organizationMembers).values({ orgId, userId, role: 'admin', joinedAt: now });
  await db.insert(S.projectTemplates).values({ id: `template-${suffix}`, orgId, name: 'Legacy template', createdAt: now });
  await db.insert(S.projects).values({ id: projectId, orgId, templateId: `template-${suffix}`, ownerId: userId, name: 'Legacy project', key: 'OLD', createdAt: now });
  await db.insert(S.tasks).values({ id: taskId, projectId, title: 'Legacy task', status: 'todo', createdAt: now });
  await db.insert(S.agentRoles).values({ id: roleId, orgId, name: 'Legacy role', systemPrompt: '', capabilities: '[]', createdAt: now });
  await db.insert(S.agents).values({ id: agentId, orgId, agentRoleId: roleId, name: 'Legacy worker', createdAt: now });
  await db.insert(S.taskAssignments).values({ id: `ta-legacy-${suffix}`, taskId, agentId, source: 'claim' });
  // This database predates the new nullable report column; seed the actual old shape.
  const legacyNote = sql`INSERT INTO task_notes (id, task_id, agent_id, content, note_type, created_at)
    VALUES (${`note-${suffix}`}, ${taskId}, ${agentId}, ${'Legacy report'}, ${'comment'}, ${S === SQ ? Math.floor(now.getTime() / 1000) : now})`;
  if (S === SQ) await db.run(legacyNote); else await db.execute(legacyNote);
  return { orgId, taskId, agentId };
}

async function verifyUpgrade(db: any, S: typeof SQ | typeof MY, f: Awaited<ReturnType<typeof seedLegacy>>) {
  expect(await db.select().from(S.taskClaimAttempts)).toHaveLength(0);
  expect(await db.select().from(S.taskAssignments).where(eq(S.taskAssignments.taskId, f.taskId))).toHaveLength(1);
  const legacyNote = (await db.select().from(S.taskNotes).where(eq(S.taskNotes.taskId, f.taskId)))[0];
  expect(legacyNote.content).toBe('Legacy report');
  expect(legacyNote.attemptId).toBeNull();
  const ctx = makeAuthContext(null);
  ctx.values.set(currentPrincipalKey, { kind: 'agent', agentId: f.agentId, orgId: f.orgId, tokenId: 'fixture-token', scopes: ['tasks:read', 'tasks:write'] });
  const tasks = createTaskManagementHandler(db);
  expect(await tasks.releaseTask({ taskId: f.taskId }, ctx)).toEqual({ success: true });
  expect(await db.select().from(S.taskClaimAttempts)).toHaveLength(0);
  const response: any = await tasks.claimTask({ taskId: f.taskId, externalRunId: 'post-upgrade' }, ctx);
  expect(response.attempt).toMatchObject({ taskId: f.taskId, orgId: f.orgId, externalRunId: 'post-upgrade', owner: { kind: 'agent', id: f.agentId, name: 'Legacy worker' } });
  expect(Date.parse(response.attempt.claimedAt)).toBeGreaterThan(Date.parse('2020-01-01T00:00:00Z'));
  return response.attempt;
}

it('SQLite boot preserves legacy ownership/reports without fabricating receipt times', async () => {
  const previous = process.env.STANDALONE;
  process.env.STANDALONE = 'true';
  const directory = mkdtempSync(join(tmpdir(), 'tasker-m57-upgrade-')), path = join(directory, 'legacy.sqlite');
  const raw = new Database(path);
  let db: any;
  try {
    const cut = EMBEDDED_SQLITE_MIGRATIONS.findIndex(migration => migration.tag === '0065_task_claim_attempts');
    if (cut < 0) throw new Error('missing historical claim receipt migration');
    raw.query('CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, content="")').run();
    await applyEmbeddedMigrations(sqliteRunner(raw), EMBEDDED_SQLITE_MIGRATIONS.slice(0, cut));
    const f = await seedLegacy(sqliteDrizzle(raw, { schema: SQ }), SQ);
    raw.close();
    db = await setupDatabase('sqlite', path);
    const attempt = await verifyUpgrade(db, SQ, f);
    db.$client.close(); db = undefined;
    db = await setupDatabase('sqlite', path);
    const rows = await db.select().from(SQ.taskClaimAttempts);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: attempt.id, ownerId: f.agentId, releasedAt: null });
    expect(rows[0].claimedAt.toISOString()).toBe(attempt.claimedAt);
  } finally {
    if (db) db.$client.close();
    try { raw.close(); } catch { /* the application boot already owns the reopened file */ }
    rmSync(directory, { recursive: true, force: true });
    if (previous === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = previous;
  }
});

const enabled = process.env.TASKER_MYSQL_INTEGRATION === '1';
(enabled ? it : it.skip)('MySQL boot upgrades legacy claims without rewriting historical attribution', async () => {
  const previous = process.env.STANDALONE, previousName = process.env.DB_NAME;
  const name = `tasker_m57_upgrade_${crypto.randomUUID().replaceAll('-', '')}`;
  const credentials = { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD };
  const admin = await mysql.createConnection(credentials);
  let db: any, pool: ReturnType<typeof mysql.createPool> | undefined, created = false;
  try {
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`); created = true;
    process.env.STANDALONE = 'false'; process.env.DB_NAME = name;
    pool = mysql.createPool({ ...credentials, database: name });
    const legacy = mysqlDrizzle(pool, { schema: MY, mode: 'default' });
    const cut = EMBEDDED_MYSQL_MIGRATIONS.findIndex(migration => migration.tag === '0053_task_claim_attempts');
    if (cut < 0) throw new Error('missing historical claim receipt migration');
    await applyEmbeddedMigrations(mysqlRunner(legacy, sql.raw.bind(sql)), EMBEDDED_MYSQL_MIGRATIONS.slice(0, cut));
    const f = await seedLegacy(legacy, MY);
    await pool.end(); pool = undefined;
    db = await setupDatabase('mysql');
    const attempt = await verifyUpgrade(db, MY, f);
    await db.$client.end(); db = undefined;
    db = await setupDatabase('mysql');
    const rows = await db.select().from(MY.taskClaimAttempts);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: attempt.id, ownerId: f.agentId, releasedAt: null });
    expect(rows[0].claimedAt.toISOString()).toBe(attempt.claimedAt);
  } finally {
    if (db) await db.$client.end();
    if (pool) await pool.end();
    try { if (created) await admin.query(`DROP DATABASE \`${name}\``); } finally { await admin.end(); }
    if (previous === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = previous;
    if (previousName === undefined) delete process.env.DB_NAME; else process.env.DB_NAME = previousName;
  }
}, 60_000);
