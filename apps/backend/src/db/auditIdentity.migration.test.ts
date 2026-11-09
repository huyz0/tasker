import { expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';
import { applyEmbeddedMigrations, sqliteRunner, mysqlRunner } from './embeddedMigrations';
import { EMBEDDED_SQLITE_MIGRATIONS, EMBEDDED_MYSQL_MIGRATIONS } from './embeddedMigrations.generated';
import * as S from './schema.mysql';
import { projectEvent } from '../consumers/auditProjector';

it('SQLite populated audit upgrade preserves legacy rows and removes sequence uniqueness', async () => {
  const raw = new Database(':memory:');
  try {
    raw.exec('CREATE VIRTUAL TABLE search_index USING fts5(title, body, content="")');
    await applyEmbeddedMigrations(sqliteRunner(raw), EMBEDDED_SQLITE_MIGRATIONS.slice(0, -1));
    raw.exec("INSERT INTO audit_log (id,subject,actor_type,payload,stream_seq,occurred_at) VALUES ('old','domain.task.created','system','{\"title\":\"legacy\"}',7,1794096000)");
    await applyEmbeddedMigrations(sqliteRunner(raw), EMBEDDED_SQLITE_MIGRATIONS);
    expect(raw.query('SELECT event_id, payload, occurred_at FROM audit_log').get()).toEqual({ event_id: 'legacy:7', payload: '{"title":"legacy"}', occurred_at: 1794096000 });
    raw.exec("INSERT INTO audit_log (id,event_id,subject,actor_type,payload,stream_seq,occurred_at) VALUES ('new','producer','domain.task.created','system','{}',7,1794096000)");
    expect((raw.query('SELECT COUNT(*) AS n FROM audit_log').get() as any).n).toBe(2);
  } finally { raw.close(); }
});

const mysqlTest = process.env.TASKER_MYSQL_INTEGRATION === '1' ? it : it.skip;
mysqlTest('MySQL populated audit upgrade preserves legacy replay and accepts a new producer with the same sequence', async () => {
  const originalStandalone = process.env.STANDALONE;
  const name = `tasker_audit_${crypto.randomUUID().replaceAll('-', '')}`;
  const config = { host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || 'password' };
  const admin = await mysql.createConnection(config);
  let connection: mysql.Connection | undefined;
  try {
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);
    connection = await mysql.createConnection({ ...config, database: name });
    const db = drizzle(connection, { schema: S, mode: 'default' });
    const runner = mysqlRunner(db, sql.raw.bind(sql));
    await applyEmbeddedMigrations(runner, EMBEDDED_MYSQL_MIGRATIONS.slice(0, -1));
    await connection.query("INSERT INTO audit_log (id,subject,actor_type,payload,stream_seq,occurred_at) VALUES ('old','domain.task.created','system','{\"title\":\"legacy\"}',7,'2026-11-08 00:00:00')");
    await applyEmbeddedMigrations(runner, EMBEDDED_MYSQL_MIGRATIONS);
    const [old] = await db.select().from(S.auditLog);
    expect(old).toMatchObject({ eventId: 'legacy:7', payload: '{"title":"legacy"}', streamSeq: 7 });
    process.env.STANDALONE = 'false';
    expect(await projectEvent(db, { subject: 'domain.task.created', payload: { title: 'legacy' }, seq: 7 })).toBe('duplicate');
    expect(await projectEvent(db, { subject: 'domain.task.created', payload: { eventId: 'producer', title: 'new' }, seq: 7 })).toBe('written');
    expect(await db.select().from(S.auditLog)).toHaveLength(2);
  } finally {
    await connection?.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await admin.end();
    if (originalStandalone === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = originalStandalone;
  }
}, 30_000);
