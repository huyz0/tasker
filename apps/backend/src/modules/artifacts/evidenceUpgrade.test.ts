import { expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle as sqliteDrizzle } from 'drizzle-orm/bun-sqlite';
import { drizzle as mysqlDrizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { sql } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as SQ from '../../db/schema.sqlite';
import * as MY from '../../db/schema.mysql';
import { applyEmbeddedMigrations, sqliteRunner, mysqlRunner } from '../../db/embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS, EMBEDDED_MYSQL_MIGRATIONS } from '../../db/embeddedMigrations.generated';
import { setupDatabase } from '../../db/db';
import { makeAuthContext } from '../../test/setup';
import { createArtifactsHandler } from './artifacts.handler';

// Keep the actual legacy boundary when newer migrations are appended.
function beforeMigration(migrations: typeof EMBEDDED_SQLITE_MIGRATIONS, tag: string) {
  const index = migrations.findIndex(migration => migration.tag === tag);
  if (index < 0) throw new Error('missing historical evidence migration');
  return migrations.slice(0, index);
}

async function seedLegacy(db: any, S: typeof SQ | typeof MY) {
  const key = crypto.randomUUID(), orgId = `org-${key}`, userId = `user-${key}`, projectId = `project-${key}`;
  const templateId = `template-${key}`, folderId = `folder-${key}`, artifactId = `artifact-${key}`, taskId = `task-${key}`, linkId = `legacy-${key}`;
  const now = new Date();
  await db.insert(S.users).values({ id: userId, email: `${key}@example.test`, name: 'Legacy owner', createdAt: now });
  await db.insert(S.organizations).values({ id: orgId, slug: orgId, name: 'Legacy', createdAt: now });
  await db.insert(S.organizationMembers).values({ orgId, userId, role: 'admin', joinedAt: now });
  await db.insert(S.projectTemplates).values({ id: templateId, orgId, name: 'Template', createdAt: now });
  await db.insert(S.projects).values({ id: projectId, orgId, ownerId: userId, templateId, key: 'OLD', name: 'Project', createdAt: now });
  await db.insert(S.folders).values({ id: folderId, projectId, name: 'Folder', createdAt: now });
  await db.insert(S.artifacts).values({ id: artifactId, folderId, name: 'legacy.txt', content: 'Keep original content', contentType: 'text/plain', createdAt: now });
  await db.insert(S.tasks).values({ id: taskId, projectId, title: 'Legacy task', status: 'todo', createdAt: now });
  return { userId, artifactId, taskId, linkId };
}

async function verifyUpgrade(db: any, S: typeof SQ | typeof MY, f: Awaited<ReturnType<typeof seedLegacy>>) {
  const [row] = await db.select().from(S.taskArtifactLinks);
  expect(row).toEqual({ id: f.linkId, taskId: f.taskId, artifactId: f.artifactId,
    linkedAt: null, linkedByKind: null, linkedById: null, linkedByName: null });
  const handler = createArtifactsHandler(db);
  const repeated: any = await handler.linkTaskArtifact({ taskId: f.taskId, artifactId: f.artifactId }, makeAuthContext(f.userId));
  expect(repeated.link).toEqual({ id: f.linkId, taskId: f.taskId, artifactId: f.artifactId });
  const content: any = await handler.getArtifactContent({ artifactId: f.artifactId }, makeAuthContext(f.userId));
  expect(content.content).toBe('Keep original content');
}

it('SQLite upgrade preserves existing links/content and does not invent historical provenance on repeat', async () => {
  const previous = process.env.STANDALONE;
  process.env.STANDALONE = 'true';
  const directory = mkdtempSync(join(tmpdir(), 'tasker-evidence-upgrade-')), path = join(directory, 'legacy.sqlite');
  const raw = new Database(path);
  let db: any;
  try {
    raw.query('CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, body, content="")').run();
    await applyEmbeddedMigrations(sqliteRunner(raw), beforeMigration(EMBEDDED_SQLITE_MIGRATIONS, '0064_link_evidence'));
    const f = await seedLegacy(sqliteDrizzle(raw, { schema: SQ }), SQ);
    raw.query('INSERT INTO task_artifact_links (id,task_id,artifact_id) VALUES (?,?,?)').run(f.linkId, f.taskId, f.artifactId);
    raw.close();
    db = await setupDatabase('sqlite', path);
    await verifyUpgrade(db, SQ, f);
    db.$client.close(); db = undefined;
    db = await setupDatabase('sqlite', path);
    await verifyUpgrade(db, SQ, f);
  } finally {
    if (db) db.$client.close();
    try { raw.close(); } catch { /* already closed before real application boot */ }
    rmSync(directory, { recursive: true, force: true });
    if (previous === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = previous;
  }
});

const enabled = process.env.TASKER_MYSQL_INTEGRATION === '1';
(enabled ? it : it.skip)('MySQL application boot upgrades existing links without rewriting content/provenance', async () => {
  const oldStandalone = process.env.STANDALONE, oldName = process.env.DB_NAME;
  const name = `tasker_evidence_upgrade_${crypto.randomUUID().replaceAll('-', '')}`;
  const credentials = { host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD };
  const admin = await mysql.createConnection(credentials);
  let pool: ReturnType<typeof mysql.createPool> | undefined, db: any;
  try {
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);
    process.env.STANDALONE = 'false'; process.env.DB_NAME = name;
    pool = mysql.createPool({ ...credentials, database: name });
    const legacy = mysqlDrizzle(pool, { schema: MY, mode: 'default' });
    await applyEmbeddedMigrations(mysqlRunner(legacy, sql.raw.bind(sql)), beforeMigration(EMBEDDED_MYSQL_MIGRATIONS, '0052_link_evidence'));
    const f = await seedLegacy(legacy, MY);
    await pool.execute('INSERT INTO task_artifact_links (id,task_id,artifact_id) VALUES (?,?,?)', [f.linkId, f.taskId, f.artifactId]);
    await pool.end(); pool = undefined;
    db = await setupDatabase('mysql');
    await verifyUpgrade(db, MY, f);
    await db.$client.end(); db = undefined;
    db = await setupDatabase('mysql');
    await verifyUpgrade(db, MY, f);
  } finally {
    if (db) await db.$client.end();
    if (pool) await pool.end();
    try { await admin.query(`DROP DATABASE IF EXISTS \`${name}\``); } finally { await admin.end(); }
    if (oldStandalone === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = oldStandalone;
    if (oldName === undefined) delete process.env.DB_NAME; else process.env.DB_NAME = oldName;
  }
}, 90_000);
