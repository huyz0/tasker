import { expect, it } from 'bun:test';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq, sql } from 'drizzle-orm';
import { createContextValues } from '@connectrpc/connect';
import * as S from './schema.mysql';
import { manageDatabase } from './access';
import { applyEmbeddedMigrations, mysqlRunner } from './embeddedMigrations';
import { EMBEDDED_MYSQL_MIGRATIONS } from './embeddedMigrations.generated';
import { currentUserIdKey } from '../modules/auth/session';
import { createSchedulesHandler, createScheduleAdmission } from '../modules/schedules/schedules.handler';
import { createScheduleExecutor } from '../modules/schedules/occurrenceExecution';
import { createWorkflowsHandler } from '../modules/workflows/workflows.handler';

const enabled = process.env.TASKER_MYSQL_INTEGRATION === '1';
(enabled ? it : it.skip)('MySQL populated schedule upgrade retains receipts and executes a bounded large snapshot', async () => {
  const database = `tasker_m47_upgrade_${crypto.randomUUID().replaceAll('-', '')}`;
  const oldStandalone = process.env.STANDALONE;
  const connection = { host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD };
  const admin = await mysql.createConnection(connection);
  let pool: mysql.Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
    process.env.STANDALONE = 'false';
    pool = mysql.createPool({ ...connection, database, connectionLimit: 2 });
    const raw = drizzle(pool, { schema: S, mode: 'default' });
    const at = EMBEDDED_MYSQL_MIGRATIONS.findIndex(m => m.tag === '0051_schedule_occurrences');
    expect(at).toBeGreaterThan(0);
    await applyEmbeddedMigrations(mysqlRunner(raw, sql.raw.bind(sql)), EMBEDDED_MYSQL_MIGRATIONS.slice(0, at));
    const date = new Date('2026-11-08T09:00:00Z');
    await pool.execute('INSERT INTO users(id,created_at) VALUES (?,?)', ['u', date]);
    await pool.execute('INSERT INTO organizations(id,name,slug,created_at) VALUES (?,?,?,?)', ['o', 'Upgrade', 'upgrade', date]);
    await pool.execute('INSERT INTO organization_members(org_id,user_id,role,joined_at) VALUES (?,?,?,?)', ['o', 'u', 'admin', date]);
    await pool.execute('INSERT INTO project_templates(id,org_id,name,created_at) VALUES (?,?,?,?)', ['pt', 'o', 'Upgrade', date]);
    await pool.execute('INSERT INTO projects(id,org_id,template_id,owner_id,name,key_code,next_task_number,created_at) VALUES (?,?,?,?,?,?,?,?)', ['p', 'o', 'pt', 'u', 'Upgrade', 'UP', 2, date]);
    await pool.execute('INSERT INTO tasks(id,project_id,title,status,display_id,created_at) VALUES (?,?,?,?,?,?)', ['legacy-task', 'p', 'Legacy task', 'todo', 'UP-1', date]);
    await pool.execute('INSERT INTO schedules(id,org_id,project_id,name,cadence,task_title,active,next_run_at,last_run_at,last_task_id,last_outcome,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ['legacy-schedule', 'o', 'p', 'Legacy schedule', 'daily', 'Legacy task', false, date, date, 'legacy-task', 'created', 'u', date]);
    await pool.execute('INSERT INTO schedule_runs(id,schedule_id,ran_at,outcome,task_id,`trigger`) VALUES (?,?,?,?,?,?),(?,?,?,?,?,?)',
      ['legacy-created', 'legacy-schedule', date, 'created', 'legacy-task', 'schedule', 'legacy-skipped', 'legacy-schedule', new Date(date.getTime() + 1000), 'skipped', null, 'manual']);

    await applyEmbeddedMigrations(mysqlRunner(raw, sql.raw.bind(sql)), EMBEDDED_MYSQL_MIGRATIONS);
    const db = manageDatabase(raw, false);
    const values = createContextValues(); values.set(currentUserIdKey, 'u');
    let now = new Date('2026-11-09T08:00:00Z');
    const handler = createSchedulesHandler(db, null, () => now);
    const history = await handler.listScheduleRuns({ scheduleId: 'legacy-schedule', page: { limit: 1 } }, { values });
    expect(history.runs).toHaveLength(1);
    expect(history.page.nextCursor).toBeTruthy();
    const next = await handler.listScheduleRuns({ scheduleId: 'legacy-schedule', page: { limit: 1, cursor: history.page.nextCursor } }, { values });
    const retained = [...history.runs, ...next.runs];
    expect(retained.map(run => run.id).sort()).toEqual(['legacy-created', 'legacy-skipped']);
    expect(retained.find(run => run.id === 'legacy-created')).toMatchObject({ outcome: 'created', taskId: 'legacy-task', ranAt: date.toISOString() });
    expect(retained.every(run => run.attempts === undefined && run.dueAt === undefined)).toBe(true);
    const legacy = await db.select().from(S.scheduleRuns);
    expect(legacy.every(run => run.slotKey === null && run.attempts === 0)).toBe(true);

    const first = { id: 'unique-a', scheduleId: 'legacy-schedule', ranAt: now, outcome: 'cancelled', trigger: 'schedule', slotKey: 'scheduled:unique' };
    await db.insert(S.scheduleRuns).values(first);
    const error: any = await db.insert(S.scheduleRuns).values({ ...first, id: 'unique-b' }).then(() => null, error => error);
    expect(error?.cause?.code ?? error?.code).toBe('ER_DUP_ENTRY');
    const [columns] = await pool.query<mysql.RowDataPacket[]>('SELECT DATA_TYPE FROM information_schema.columns WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?', [database, 'schedule_runs', 'frozen_inputs']);
    expect(columns[0]!.DATA_TYPE).toBe('longtext');

    const workflows = createWorkflowsHandler(db);
    const { template } = await workflows.createWorkflowTemplate({ orgId: 'o', name: 'Large workflow', description: 'Frozen parent', steps:
      Array.from({ length: 20 }, (_, index) => ({ key: `step-${index}`, title: `Step ${index}`, description: '漢'.repeat(4096) })),
    }, { values });
    const { schedule } = await handler.createSchedule({ projectId: 'p', name: 'Large routine', cadence: 'daily', hourUtc: 9, templateId: template.id }, { values });
    now = new Date('2026-11-09T10:00:00Z');
    const admitted = await createScheduleAdmission(db, null, () => now)();
    expect(admitted).toHaveLength(1);
    const run = admitted[0]!.run;
    expect(Buffer.byteLength(run.frozenInputs, 'utf8')).toBeGreaterThan(65_535);
    const [stored] = await db.select().from(S.scheduleRuns).where(eq(S.scheduleRuns.id, run.id));
    expect(stored!.frozenInputs).toBe(run.frozenInputs);
    const executor = createScheduleExecutor(db, null, () => now);
    await executor.execute((await executor.claim(run.id))!);
    const receipt = await executor.loadRun(run.id);
    expect(receipt).toMatchObject({ outcome: 'created', frozenInputs: null });
    const children = await db.select({ id: S.tasks.id }).from(S.tasks).where(eq(S.tasks.parentTaskId, receipt.taskId));
    expect(children).toHaveLength(20);
    const [after] = await db.select().from(S.tasks).where(eq(S.tasks.id, 'legacy-task'));
    expect(after!.title).toBe('Legacy task');
    expect((await handler.getSchedule({ id: schedule.id }, { values })).schedule.lastTaskId).toBe(receipt.taskId);
  } finally {
    if (pool) await pool.end();
    try { await admin.query(`DROP DATABASE IF EXISTS \`${database}\``); } finally { await admin.end(); }
    if (oldStandalone === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = oldStandalone;
  }
}, 120_000);
