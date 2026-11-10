import { expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle as sqliteDrizzle } from 'drizzle-orm/bun-sqlite';
import { drizzle as mysqlDrizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { eq, sql } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as sqliteSchema from './schema.sqlite';
import * as mysqlSchema from './schema.mysql';
import { applyEmbeddedMigrations, mysqlRunner, sqliteRunner } from './embeddedMigrations';
import { EMBEDDED_MYSQL_MIGRATIONS, EMBEDDED_SQLITE_MIGRATIONS } from './embeddedMigrations.generated';
import { setupDatabase } from './db';
import { createSavedViewsHandler } from '../modules/views/views.handler';
import { makeAuthContext } from '../test/setup';

async function seedBeforeViewMigration(db: any, S: any) {
  const now = new Date();
  await db.insert(S.users).values({ id: 'view-upgrade-user', createdAt: now });
  await db.insert(S.organizations).values({ id: 'view-upgrade-org', name: 'Old organization', slug: 'view-upgrade-org', createdAt: now });
  await db.insert(S.organizationMembers).values({ orgId: 'view-upgrade-org', userId: 'view-upgrade-user', role: 'admin', joinedAt: now });
  await db.insert(S.projectTemplates).values({ id: 'view-upgrade-template', orgId: 'view-upgrade-org', name: 'Old template', createdAt: now });
  await db.insert(S.projects).values({ id: 'view-upgrade-project', orgId: 'view-upgrade-org', templateId: 'view-upgrade-template', ownerId: 'view-upgrade-user', name: 'Old project', createdAt: now });
  await db.insert(S.tasks).values({ id: 'view-upgrade-task', projectId: 'view-upgrade-project', createdBy: 'view-upgrade-user', title: 'Retain existing work', status: 'todo', priority: 2, createdAt: now });
}
async function verifyOldWork(db: any, S: any) {
  expect((await db.select().from(S.tasks).where(eq(S.tasks.id, 'view-upgrade-task')))[0]).toMatchObject({ title: 'Retain existing work', priority: 2, createdBy: 'view-upgrade-user', status: 'todo' });
}
async function saveDefinition(db: any) {
  return (await createSavedViewsHandler(db).createSavedView({ projectId: 'view-upgrade-project', name: 'Persistent view', definition: { version: 1, screen: 'tasks', tasks: { priority: 0, ready: false } } }, makeAuthContext('view-upgrade-user'))).view!;
}
async function verifySavedAfterReboot(db: any, S: any, viewId: string) {
  await verifyOldWork(db, S);
  expect(await db.select().from(S.savedViews)).toHaveLength(1);
  expect((await createSavedViewsHandler(db).getSavedView({ viewId }, makeAuthContext('view-upgrade-user'))).definition).toMatchObject({ version: 1, screen: 'tasks', tasks: { priority: 0, ready: false } });
}

it('SQLite adds named-view storage to populated old data and retains definitions through a second boot', async () => {
  const previous = process.env.STANDALONE;
  const root = mkdtempSync(join(tmpdir(), 'tasker-m58-upgrade-')), path = join(root, 'owned.sqlite');
  let raw: Database | undefined, db: any;
  try {
    process.env.STANDALONE = 'true';raw = new Database(path);
    raw.run('CREATE VIRTUAL TABLE search_index USING fts5(title, body, content="")');
    const at = EMBEDDED_SQLITE_MIGRATIONS.findIndex(item => item.tag === '0067_saved_views');expect(at).toBeGreaterThan(0);
    await applyEmbeddedMigrations(sqliteRunner(raw), EMBEDDED_SQLITE_MIGRATIONS.slice(0, at));
    await seedBeforeViewMigration(sqliteDrizzle(raw, { schema: sqliteSchema }), sqliteSchema);
    expect(raw.query("SELECT name FROM sqlite_master WHERE name='saved_views'").get()).toBeNull();
    raw.close();raw = undefined;
    db = await setupDatabase('sqlite', path);await verifyOldWork(db, sqliteSchema);
    const view = await saveDefinition(db);db.$client.close();db = undefined;
    db = await setupDatabase('sqlite', path);await verifySavedAfterReboot(db, sqliteSchema, view.id);
  } finally {
    raw?.close();db?.$client.close();rmSync(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.STANDALONE;else process.env.STANDALONE = previous;
  }
});

(process.env.TASKER_MYSQL_INTEGRATION === '1' ? it : it.skip)('MySQL adds named views to populated old data and reboots without changing old work', async () => {
  const previousStandalone = process.env.STANDALONE, previousName = process.env.DB_NAME;
  const name = `tasker_m58_upgrade_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD });
  let oldPool: mysql.Pool | undefined, db: any, created = false;
  try {
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);created = true;
    process.env.STANDALONE = 'false';process.env.DB_NAME = name;
    oldPool = mysql.createPool({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD, database: name });
    const old = mysqlDrizzle(oldPool, { schema: mysqlSchema, mode: 'default' });
    const at = EMBEDDED_MYSQL_MIGRATIONS.findIndex(item => item.tag === '0055_saved_views');expect(at).toBeGreaterThan(0);
    await applyEmbeddedMigrations(mysqlRunner(old, sql.raw.bind(sql)), EMBEDDED_MYSQL_MIGRATIONS.slice(0, at));
    await seedBeforeViewMigration(old, mysqlSchema);
    const [missing]: any = await oldPool.query("SHOW TABLES LIKE 'saved_views'");expect(missing).toHaveLength(0);
    await oldPool.end();oldPool = undefined;
    db = await setupDatabase('mysql');await verifyOldWork(db, mysqlSchema);
    const view = await saveDefinition(db);await db.$client.end();db = undefined;
    db = await setupDatabase('mysql');await verifySavedAfterReboot(db, mysqlSchema, view.id);
  } finally {
    await oldPool?.end();await db?.$client.end();
    if (created) await admin.query(`DROP DATABASE \`${name}\``);await admin.end();
    if (previousStandalone === undefined) delete process.env.STANDALONE;else process.env.STANDALONE = previousStandalone;
    if (previousName === undefined) delete process.env.DB_NAME;else process.env.DB_NAME = previousName;
  }
}, 30000);
