import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq, sql } from 'drizzle-orm';
import { Code } from '@connectrpc/connect';
import { setupDatabase } from '../../db/db';
import * as sqliteSchema from '../../db/schema.sqlite';
import * as mysqlSchema from '../../db/schema.mysql';
import mysql from 'mysql2/promise';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { makeAuthContext } from '../../test/setup';
import { currentPrincipalKey } from '../auth/session';
import { traceRows } from '../../test/traceRows';
import { createAttentionHandler } from './attention.handler';

const kinds = ['question', 'approval', 'review', 'stalled_claim'] as const;
const HOUR = 3_600_000;
const MYSQL = process.env.TASKER_ATTENTION_MYSQL === '1', S = MYSQL ? mysqlSchema : sqliteSchema;
const previousStandalone = process.env.STANDALONE, previousDatabase = process.env.DB_NAME;
const ownedSchema = `tasker_attention_${crypto.randomUUID().replaceAll('-', '')}`;
let mysqlAdmin: Awaited<ReturnType<typeof mysql.createConnection>> | undefined, schemaCreated = false;
beforeAll(async () => {
  if (!MYSQL) return;
  mysqlAdmin = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD });
  await mysqlAdmin.query(`CREATE DATABASE \`${ownedSchema}\` CHARACTER SET utf8mb4`); schemaCreated = true;
  process.env.STANDALONE = 'false'; process.env.DB_NAME = ownedSchema;
  const initial: any = await setupDatabase('mysql'); await initial.$client.end();
}, 60_000);
afterAll(async () => {
  try { if (mysqlAdmin) { try { if (schemaCreated) await mysqlAdmin.query(`DROP DATABASE IF EXISTS \`${ownedSchema}\``); } finally { await mysqlAdmin.end(); } } }
  finally {
    if (previousStandalone === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = previousStandalone;
    if (previousDatabase === undefined) delete process.env.DB_NAME; else process.env.DB_NAME = previousDatabase;
  }
});
async function seedUser(db: any, userId: string, extra = {}) {
  await db.insert(S.users).values({ id: userId, email: `${userId}@example.test`, createdAt: new Date(), ...extra });
}
async function seedOrgWithAdmin(db: any, scope: { orgId: string; userId: string }) {
  await seedUser(db, scope.userId); await db.insert(S.organizations).values({ id: scope.orgId, slug: scope.orgId, name: 'Owned attention org', createdAt: new Date() });
  await db.insert(S.organizationMembers).values({ ...scope, role: 'admin', joinedAt: new Date() });
}
async function seedProject(db: any, scope: { orgId: string; userId: string; projectId: string; templateId: string; name: string }) {
  await db.insert(S.projectTemplates).values({ id: scope.templateId, orgId: scope.orgId, name: scope.templateId, createdAt: new Date() });
  await db.insert(S.projects).values({ id: scope.projectId, orgId: scope.orgId, ownerId: scope.userId, templateId: scope.templateId, name: scope.name, key: scope.projectId.slice(0, 12), createdAt: new Date() });
}
const opened: Promise<any>[] = [];
const temporaryPaths: string[] = [];
afterEach(async () => { for (const pending of opened.splice(0)) { const db = await pending; if (MYSQL) await db.$client.end(); else db.$client.close(); } for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true }); });

async function fixture(count = 3, sqlitePath = ':memory:') {
  process.env.STANDALONE = MYSQL ? 'false' : 'true';
  const pending = setupDatabase(MYSQL ? 'mysql' : 'sqlite', sqlitePath); opened.push(pending); const db: any = await pending;
  const stamp = crypto.randomUUID(), orgId = `org-${stamp}`, userId = `user-${stamp}`, otherUserId = `other-${stamp}`;
  const projectA = `alpha-${stamp}`, projectB = `beta-${stamp}`, typeId = `type-${stamp}`, agentId = `agent-${stamp}`;
  let now = new Date('2026-11-09T12:00:00.500Z');
  const created = new Date(Math.floor((now.getTime() - 7 * 24 * HOUR) / 1000) * 1000), silent = new Date(Math.floor((now.getTime() - 30 * HOUR) / 1000) * 1000);
  await seedOrgWithAdmin(db, { orgId, userId }); await seedUser(db, otherUserId);
  await seedProject(db, { orgId, userId, templateId: `template-a-${stamp}`, projectId: projectA, name: 'Alpha project' });
  await db.update(S.projects).set({ key: 'ALPHA' }).where(eq(S.projects.id, projectA));
  await seedProject(db, { orgId, userId, templateId: `template-b-${stamp}`, projectId: projectB, name: 'Beta project' });
  await db.update(S.projects).set({ key: 'BETA' }).where(eq(S.projects.id, projectB));
  await db.insert(S.taskTypes).values({ id: typeId, orgId, name: 'Custom pipeline', createdAt: created });
  await db.insert(S.taskStatuses).values(['queued', 'working', 'shipped'].map((name, position) => ({ id: `${typeId}-${name}`, taskTypeId: typeId, name, position })));
  await db.insert(S.agentRoles).values({ id: `role-${stamp}`, orgId, name: 'Worker', systemPrompt: '', capabilities: '[]' });
  await db.insert(S.agents).values({ id: agentId, orgId, agentRoleId: `role-${stamp}`, name: 'Agent One' });
  if (count > 100) await db.insert(S.agents).values(Array.from({ length: 125 }, (_, i) => ({ id: `unused-agent-${stamp}-${i}`, orgId, agentRoleId: `role-${stamp}`, name: `Unused actor ${i}` })));
  const taskIds = Array.from({ length: count }, (_, i) => `task-${stamp}-${String(i).padStart(4, '0')}`);
  const sourceId = (kind: typeof kinds[number], i: number) => `${kind}-${stamp}-${String(i).padStart(4, '0')}`;
  for (let start = 0; start < count; start += 40) {
    const indexes = Array.from({ length: Math.min(40, count - start) }, (_, i) => start + i);
    await db.insert(S.tasks).values(indexes.map(i => ({ id: taskIds[i]!, projectId: i % 2 ? projectB : projectA, taskTypeId: typeId,
      title: `Task ${i}`, displayId: `ATTN-${i}`, status: 'working', description: i === 0 ? 'x'.repeat(4_000) : '', createdAt: new Date(created.getTime() + i * 1000) })));
    await db.insert(S.inputRequests).values(indexes.map(i => ({ id: sourceId('question', i), orgId, projectId: i % 2 ? projectB : projectA,
      taskId: taskIds[i]!, question: `Question ${i}`, options: '[]', status: 'open', askedByAgentId: agentId, createdAt: new Date(created.getTime() + i * 1000) })));
    await db.insert(S.transitionApprovals).values(indexes.map(i => ({ id: sourceId('approval', i), orgId, projectId: i % 2 ? projectB : projectA,
      taskId: taskIds[i]!, fromStatus: 'working', toStatus: 'shipped', status: 'pending', requestedByAgentId: agentId, createdAt: new Date(created.getTime() + i * 1000) })));
    await db.insert(S.taskReviewers).values(indexes.flatMap(i => [
      { id: sourceId('review', i), taskId: taskIds[i]!, userId }, { id: `other-review-${stamp}-${i}`, taskId: taskIds[i]!, userId: otherUserId },
    ]));
    await db.insert(S.taskAssignments).values(indexes.map(i => ({ id: sourceId('stalled_claim', i), taskId: taskIds[i]!, agentId, source: 'claim' })));
    await db.insert(S.taskActivity).values(indexes.map(i => ({ id: `activity-${stamp}-${i}`, taskId: taskIds[i]!, projectId: i % 2 ? projectB : projectA,
      kind: 'claimed', actorType: 'agent', actorId: agentId, assigneeAgentId: agentId, occurredAt: silent })));
  }
  const ctx = makeAuthContext(userId), clock = () => new Date(now);
  return { db, orgId, userId, otherUserId, projectA, projectB, typeId, agentId, taskIds, sourceId, ctx, clock,
    setNow: (value: Date) => { now = value; }, now, created, silent, handler: createAttentionHandler(db, clock) };
}

async function all(f: Awaited<ReturnType<typeof fixture>>, kind: typeof kinds[number], projectId?: string) {
  const items: any[] = []; let cursor: string | undefined; const pages: any[] = [];
  do {
    const page: any = await f.handler.listAttention({ orgId: f.orgId, kind, ...(projectId ? { projectId } : {}), page: { limit: 20, ...(cursor ? { cursor } : {}) } }, f.ctx);
    items.push(...page.items); pages.push(page); cursor = page.page.nextCursor || undefined;
  } while (cursor);
  return { items, pages };
}

/** Observe raw source arrays/bytes before decoding or response-side slicing. */
function observe(db: any, inspect: (rows: any[]) => void) {
  return new Proxy(db, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (key === 'select') return (...args: any[]) => traceRows(value.apply(target, args), inspect);
    if (key === 'all' || key === 'execute') return async (...args: any[]) => {
      const result = await value.apply(target, args); inspect(Array.isArray(result[0]) ? result[0] : result); return result;
    };
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}

describe('current bounded attention source reads (M55)', () => {
  it.each(kinds.map(kind => [kind] as const))('reaches all125 %s sources with independent oldest-first SQL paging and current counts', async kind => {
    const f = await fixture(125), rawSizes: number[] = []; let actorQueries = 0;
    const traced = observe(f.db, rows => {
      if (rows.some(row => Object.keys(row).length === 2 && Object.hasOwn(row, 'name') && [f.agentId, f.userId].includes(row.id))) actorQueries++;
      if (rows.some(row => row.task_id || row.taskId || (row.id && row.name))) { rawSizes.push(rows.length); expect(rows.length).toBeLessThanOrEqual(21); }
      for (const row of rows) for (const value of Object.values(row)) {
        if (typeof value === 'string' || value instanceof Uint8Array) expect(Buffer.byteLength(value)).toBeLessThanOrEqual(2048);
      }
    });
    const result = await all({ ...f, handler: createAttentionHandler(traced, f.clock) }, kind);
    expect(result.items.map(row => row.sourceId)).toEqual(Array.from({ length: 125 }, (_, i) => f.sourceId(kind, i)));
    expect(result.pages).toHaveLength(7); expect(result.pages.every(page => page.page.totalCount === 125)).toBe(true);
    expect(new Set(result.items.map(row => row.kind + row.sourceId)).size).toBe(125);
    expect(result.items.every(row => !('description' in row) && !('summary' in row) && !('content' in row))).toBe(true);
    expect(rawSizes.length).toBeGreaterThanOrEqual(7); expect(actorQueries).toBeLessThanOrEqual(7 * 2);
    const alpha = await all(f, kind, f.projectA);
    expect(alpha.items).toHaveLength(63); expect(alpha.pages[0].page.totalCount).toBe(63);
    expect(alpha.items.every(row => row.projectId === f.projectA && row.projectName === 'Alpha project')).toBe(true);
    expect(result.pages[0].observedAt).toBe(f.now.toISOString());
  }, 20_000);

  it('keeps multiple sources on one task distinct and applies each exact drain condition', async () => {
    const f = await fixture();
    await f.db.insert(S.inputRequests).values({ id: 'extra-question', orgId: f.orgId, projectId: f.projectA, taskId: f.taskIds[0]!, question: 'Second question on task', options: '[]', status: 'open', createdAt: f.created });
    await f.db.update(S.tasks).set({ status: 'shipped' }).where(eq(S.tasks.id, f.taskIds[0]!));
    expect((await all(f, 'question')).items).toHaveLength(4); expect((await all(f, 'approval')).items).toHaveLength(3);
    expect((await all(f, 'review')).items).toHaveLength(2); expect((await all(f, 'stalled_claim')).items).toHaveLength(2);
    await f.db.update(S.inputRequests).set({ status: 'answered' }).where(eq(S.inputRequests.id, f.sourceId('question', 0)));
    await f.db.update(S.transitionApprovals).set({ status: 'stale' }).where(eq(S.transitionApprovals.id, f.sourceId('approval', 0)));
    await f.db.delete(S.taskReviewers).where(and(eq(S.taskReviewers.taskId, f.taskIds[1]!), eq(S.taskReviewers.userId, f.userId)));
    await f.db.delete(S.taskAssignments).where(eq(S.taskAssignments.taskId, f.taskIds[1]!));
    expect((await all(f, 'question')).items).toHaveLength(3); expect((await all(f, 'approval')).items).toHaveLength(2);
    expect((await all(f, 'review')).items).toHaveLength(1); expect((await all(f, 'stalled_claim')).items).toHaveLength(1);
    expect((await f.db.select().from(S.transitionApprovals).where(eq(S.transitionApprovals.id, f.sourceId('approval', 1))))[0].status).toBe('pending');
  });

  it.each(kinds.map(kind => [kind] as const))('excludes archived task/project/org parents for %s and restores unresolved source identity', async kind => {
    const f = await fixture(), expected = (await all(f, kind)).items.map(row => row.sourceId);
    await f.db.update(S.tasks).set({ deletedAt: f.now }).where(eq(S.tasks.id, f.taskIds[0]!));
    expect((await all(f, kind)).items).toHaveLength(2);
    await f.db.update(S.tasks).set({ deletedAt: null }).where(eq(S.tasks.id, f.taskIds[0]!));
    await f.db.update(S.projects).set({ deletedAt: f.now }).where(eq(S.projects.id, f.projectA));
    expect((await all(f, kind)).items.map(row => row.projectId)).toEqual([f.projectB]);
    await expect(f.handler.listAttention({ orgId: f.orgId, projectId: f.projectA, kind }, f.ctx)).rejects.toMatchObject({ code: Code.NotFound });
    await f.db.update(S.projects).set({ deletedAt: null }).where(eq(S.projects.id, f.projectA));
    await f.db.update(S.organizations).set({ deletedAt: f.now }).where(eq(S.organizations.id, f.orgId));
    await expect(f.handler.listAttention({ orgId: f.orgId, kind }, f.ctx)).rejects.toMatchObject({ code: Code.NotFound });
    await f.db.update(S.organizations).set({ deletedAt: null }).where(eq(S.organizations.id, f.orgId));
    expect((await all(f, kind)).items.map(row => row.sourceId)).toEqual(expected);
  });

  it('requires current human task-read authority and never lets a caller select another reviewer', async () => {
    const f = await fixture();
    await expect(f.handler.listAttention({ orgId: f.orgId, kind: 'question' }, makeAuthContext(null))).rejects.toMatchObject({ code: Code.Unauthenticated });
    const agent = makeAuthContext(null);
    agent.values.set(currentPrincipalKey, { kind: 'agent', agentId: f.agentId, orgId: f.orgId, tokenId: 'fixture', scopes: ['tasks:read'] });
    await expect(f.handler.listAttention({ orgId: f.orgId, kind: 'question' }, agent)).rejects.toMatchObject({ code: Code.PermissionDenied });
    await expect(f.handler.listAttention({ orgId: f.orgId, kind: 'question' }, makeAuthContext(f.otherUserId))).rejects.toMatchObject({ code: Code.PermissionDenied });
    const own: any = await f.handler.listAttention({ orgId: f.orgId, kind: 'review', userId: f.otherUserId }, f.ctx);
    expect(own.items.map((row: any) => row.sourceId)).toEqual(f.taskIds.map((_id, i) => f.sourceId('review', i)));
    const roleId = `reader-role-${f.orgId}`;
    await f.db.insert(S.roles).values({ id: roleId, orgId: f.orgId, name: 'Task reader', createdAt: f.created });
    await f.db.insert(S.rolePermissions).values({ roleId, permissionKey: 'task:read' });
    await f.db.insert(S.grants).values({ id: `grant-${roleId}`, subjectType: 'user', subjectId: f.otherUserId, scopeType: 'organization', scopeId: f.orgId, roleId, createdAt: f.created });
    expect((await f.handler.listAttention({ orgId: f.orgId, kind: 'review' }, makeAuthContext(f.otherUserId)) as any).items).toHaveLength(3);
    await f.db.delete(S.grants).where(eq(S.grants.roleId, roleId));
    await expect(f.handler.listAttention({ orgId: f.orgId, kind: 'question' }, makeAuthContext(f.otherUserId))).rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  it('rejects foreign project hints and never leaks foreign actor/project/source metadata', async () => {
    const f = await fixture(), foreignOrg = `foreign-${f.orgId}`, foreignUser = `foreign-${f.userId}`, foreignProject = `foreign-${f.projectA}`;
    await seedOrgWithAdmin(f.db, { orgId: foreignOrg, userId: foreignUser });
    await seedProject(f.db, { orgId: foreignOrg, userId: foreignUser, projectId: foreignProject, templateId: `foreign-template-${f.orgId}`, name: 'Secret foreign project' });
    await expect(f.handler.listAttention({ orgId: f.orgId, projectId: foreignProject, kind: 'question' }, f.ctx)).rejects.toMatchObject({ code: Code.NotFound });
    await expect(f.handler.listAttention({ orgId: foreignOrg, kind: 'question' }, f.ctx)).rejects.toMatchObject({ code: Code.PermissionDenied });
    for (const kind of kinds) expect(JSON.stringify((await all(f, kind)).items)).not.toContain('Secret foreign');
  });

  it('uses truthful timestamp bases and a bounded literal Unicode/NUL question preview before decoding', async () => {
    const f = await fixture(1), literal = '\uFEFF' + '漢😀\0'.repeat(5000);
    await f.db.update(S.inputRequests).set({ question: MYSQL ? sql`cast(${Buffer.from(literal)} as char character set utf8mb4)` : sql`cast(${Buffer.from(literal)} as text)` }).where(eq(S.inputRequests.id, f.sourceId('question', 0)));
    let rawPrefix = false;
    const traced = observe(f.db, rows => { for (const row of rows) for (const value of Object.values(row)) {
      if (value instanceof Uint8Array) { expect(value.byteLength).toBeLessThanOrEqual(804); rawPrefix = true; }
      if (typeof value === 'string') expect(Buffer.byteLength(value)).toBeLessThanOrEqual(2048);
    } });
    const question: any = await createAttentionHandler(traced, f.clock).listAttention({ orgId: f.orgId, kind: 'question' }, f.ctx);
    expect(question.items[0].reason).toBe(Array.from(literal).slice(0, 200).join(''));
    expect(question.items[0].reasonTruncated).toBe(true); expect(question.items[0].sinceKind).toBe('asked_at'); expect(rawPrefix).toBe(true);
    expect(question.items[0].actorId).toBe(f.agentId); expect(question.items[0].actorName).toBe('Agent One');
    const review = (await all(f, 'review')).items[0]; expect(review.sinceKind).toBe('task_created_at'); expect(review.since).toBe(f.created.toISOString().replace('.500Z', '.000Z'));
    const stalled = (await all(f, 'stalled_claim')).items[0]; expect(stalled.sinceKind).toBe('silent_since');
  });

  it('preserves strict24h silence, human signals and token-liveness independence with second-based SQL dates', async () => {
    const f = await fixture(4), boundary = new Date('2026-11-08T12:00:00.000Z');
    await f.db.update(S.taskActivity).set({ occurredAt: boundary }).where(eq(S.taskActivity.taskId, f.taskIds[0]!));
    f.setNow(new Date('2026-11-09T12:00:00.000Z'));
    expect((await all(f, 'stalled_claim')).items.some(row => row.taskId === f.taskIds[0])).toBe(false);
    f.setNow(new Date('2026-11-09T12:00:00.001Z'));
    expect((await all(f, 'stalled_claim')).items.some(row => row.taskId === f.taskIds[0])).toBe(true);
    await f.db.insert(S.taskActivity).values({ id: 'recent-human-comment', taskId: f.taskIds[1]!, projectId: f.projectB, kind: 'comment', actorType: 'user', actorId: f.userId, occurredAt: new Date('2026-11-09T11:59:00Z') });
    await f.db.insert(S.apiTokens).values({ id: 'active-token', agentId: f.agentId, orgId: f.orgId, name: 'Active elsewhere', tokenHash: 'fixture-hash', tokenPrefix: 'fixture', createdBy: f.userId, expiresAt: new Date(f.now.getTime() + 24 * HOUR), scopes: '["tasks:read"]', createdAt: f.created, lastUsedAt: new Date('2026-11-09T12:00:00Z') });
    expect((await all(f, 'stalled_claim')).items.map(row => row.taskId)).toEqual([f.taskIds[2], f.taskIds[3], f.taskIds[0]]);
  });

  it('binds cursors to kind/principal/org/project/order and ignores stale cursor counts', async () => {
    const f = await fixture(5);
    const first: any = await f.handler.listAttention({ orgId: f.orgId, kind: 'question', page: { limit: 2 } }, f.ctx);
    const cursor = first.page.nextCursor; expect(cursor).toBeTruthy();
    for (const request of [
      { orgId: f.orgId, kind: 'approval' }, { orgId: f.orgId, projectId: f.projectA, kind: 'question' },
    ]) await expect(f.handler.listAttention({ ...request, page: { limit: 2, cursor } }, f.ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
    await f.db.insert(S.organizationMembers).values({ orgId: f.orgId, userId: f.otherUserId, role: 'admin', joinedAt: f.created });
    await expect(f.handler.listAttention({ orgId: f.orgId, kind: 'question', page: { limit: 2, cursor } }, makeAuthContext(f.otherUserId))).rejects.toMatchObject({ code: Code.InvalidArgument });
    for (const bad of ['not-a-cursor', Buffer.from(JSON.stringify({ value: 1, id: 'unbound', field: 'createdAt' })).toString('base64')])
      await expect(f.handler.listAttention({ orgId: f.orgId, kind: 'question', page: { cursor: bad } }, f.ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
    for (const page of [{ filter: 'hidden filter' }, { sort: 'createdAt:desc' }])
      await expect(f.handler.listAttention({ orgId: f.orgId, kind: 'question', page }, f.ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
    await f.db.update(S.inputRequests).set({ status: 'answered' }).where(eq(S.inputRequests.id, f.sourceId('question', 4)));
    const next: any = await f.handler.listAttention({ orgId: f.orgId, kind: 'question', page: { limit: 2, cursor } }, f.ctx);
    expect(next.page.totalCount).toBe(4); expect(next.items.map((row: any) => row.sourceId)).toEqual([f.sourceId('question', 2), f.sourceId('question', 3)]);
  });


  it('preserves legacy no-history/created-only silence fallback without inventing assignment time', async () => {
    const f = await fixture(3);
    await f.db.delete(S.taskActivity).where(eq(S.taskActivity.taskId, f.taskIds[0]!));
    await f.db.update(S.taskActivity).set({ kind: 'created', occurredAt: f.now }).where(eq(S.taskActivity.taskId, f.taskIds[1]!));
    await f.db.update(S.taskActivity).set({ kind: 'created', occurredAt: f.now }).where(eq(S.taskActivity.taskId, f.taskIds[2]!));
    await f.db.update(S.tasks).set({ createdAt: f.now }).where(eq(S.tasks.id, f.taskIds[2]!));
    const rows = (await all(f, 'stalled_claim')).items;
    expect(rows.map(row => row.taskId)).toEqual([f.taskIds[0], f.taskIds[1]]);
    expect(rows[0].since).toBe(f.created.toISOString()); expect(rows[0].sinceKind).toBe('silent_since');
  });

  it('keeps separate agent/user-combined assignment identities and does not reuse a removed hold ID', async () => {
    const f = await fixture(1), secondAgent = `second-${f.agentId}`;
    await f.db.insert(S.agents).values({ id: secondAgent, orgId: f.orgId, agentRoleId: `role-${f.orgId.slice(4)}`, name: 'Agent Two' });
    await f.db.insert(S.taskAssignments).values({ id: 'combined-hold', taskId: f.taskIds[0]!, agentId: secondAgent, userId: f.userId, source: 'assign' });
    let rows = (await all(f, 'stalled_claim')).items;
    expect(rows).toHaveLength(2); expect(rows.map(row => row.sourceId)).toContain('combined-hold');
    expect(rows.find(row => row.sourceId === 'combined-hold').actorName).toBe('Agent Two');
    await f.db.delete(S.taskAssignments).where(eq(S.taskAssignments.id, f.sourceId('stalled_claim', 0)));
    await f.db.insert(S.taskAssignments).values({ id: 'replacement-hold', taskId: f.taskIds[0]!, agentId: f.agentId, source: 'claim' });
    rows = (await all(f, 'stalled_claim')).items;
    expect(rows.map(row => row.sourceId)).not.toContain(f.sourceId('stalled_claim', 0));
    expect(rows.map(row => row.sourceId)).toContain('replacement-hold');
  });

  it('shows unknown source actors honestly and never hydrates a foreign agent/user profile', async () => {
    const f = await fixture(2), foreignOrg = `foreign-${f.orgId}`, foreignUser = `foreign-${f.userId}`, foreignAgent = `foreign-${f.agentId}`;
    await seedOrgWithAdmin(f.db, { orgId: foreignOrg, userId: foreignUser });
    await f.db.update(S.users).set({ name: 'Secret foreign user' }).where(eq(S.users.id, foreignUser));
    await f.db.insert(S.agentRoles).values({ id: `role-${foreignOrg}`, orgId: foreignOrg, name: 'Foreign', systemPrompt: '', capabilities: '[]' });
    await f.db.insert(S.agents).values({ id: foreignAgent, orgId: foreignOrg, agentRoleId: `role-${foreignOrg}`, name: 'Secret foreign agent' });
    await f.db.update(S.inputRequests).set({ askedByAgentId: null, askedByUserId: null }).where(eq(S.inputRequests.id, f.sourceId('question', 0)));
    let rows = (await all(f, 'question')).items;
    expect(rows[0].actorName).toBeUndefined(); expect(rows[0].actorId).toBeUndefined();
    await f.db.update(S.inputRequests).set({ askedByAgentId: foreignAgent }).where(eq(S.inputRequests.id, f.sourceId('question', 0)));
    await f.db.update(S.inputRequests).set({ askedByAgentId: null, askedByUserId: foreignUser }).where(eq(S.inputRequests.id, f.sourceId('question', 1)));
    rows = (await all(f, 'question')).items;
    expect(rows.every(row => row.actorName === undefined)).toBe(true); expect(JSON.stringify(rows)).not.toContain('Secret foreign');
    const approval = (await all(f, 'approval')).items[0];
    expect(approval.reason).toBe('Requested move working → shipped'); expect(approval.taskStatus).toBe('working');
  });


  (MYSQL ? it.skip : it)('serves the new reader through the actual backend process and authenticated JSON RPC', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'tasker-attention-wire-')); temporaryPaths.push(directory);
    const dbPath = join(directory, 'owned.sqlite'), f = await fixture(25, dbPath);
    const reservation = createServer();
    await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    const env: Record<string, string | undefined> = { ...process.env, STANDALONE: 'true', NODE_ENV: 'test', ENABLE_TEST_LOGIN: 'true',
      JWT_SECRET: crypto.randomUUID() + crypto.randomUUID(), APP_ENCRYPTION_SECRET: crypto.randomUUID().replaceAll('-', ''),
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173', OTEL_SDK_DISABLED: 'true' };
    delete env.NATS_URL;
    const child = Bun.spawn([process.execPath, resolve(import.meta.dir, '../../index.ts'), '--port', String(port), '--db', dbPath], {
      cwd: resolve(import.meta.dir, '../../..'), env, stdout: 'ignore', stderr: 'ignore',
    });
    const base = `http://127.0.0.1:${port}`;
    try {
      const deadline = Date.now() + 10_000; let ready = false;
      while (Date.now() < deadline) {
        try { if ((await fetch(`${base}/readyz`, { signal: AbortSignal.timeout(500) })).ok) { ready = true; break; } } catch { /* startup only */ }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(ready).toBe(true);
      const login = await fetch(`${base}/api/auth/test/inject?userId=${encodeURIComponent(f.userId)}`);
      const cookie = login.headers.get('set-cookie')?.split(';')[0]; expect(!!cookie).toBe(true);
      const response = await fetch(`${base}/tasker.health.v1.AttentionService/ListAttention`, { method: 'POST',
        headers: { cookie: cookie!, 'content-type': 'application/json', 'connect-protocol-version': '1' }, body: JSON.stringify({ orgId: f.orgId, kind: 'question', page: {} }) });
      expect(response.ok).toBe(true);
      const body = await response.json() as any;
      expect(body.items[0]).toMatchObject({ sourceId: f.sourceId('question', 0), taskId: f.taskIds[0], projectId: f.projectA, reason: 'Question 0' });
      expect(body.items).toHaveLength(20); expect(body.page.totalCount).toBe(25); expect(body.observedAt).toBeTruthy();
      const next = await fetch(`${base}/tasker.health.v1.AttentionService/ListAttention`, { method: 'POST',
        headers: { cookie: cookie!, 'content-type': 'application/json', 'connect-protocol-version': '1' },
        body: JSON.stringify({ orgId: f.orgId, kind: 'question', page: { cursor: body.page.nextCursor } }) });
      expect(next.ok).toBe(true); const nextBody = await next.json() as any;
      expect(nextBody.items).toHaveLength(5); expect(nextBody.items[0].sourceId).toBe(f.sourceId('question', 20));
      const invalid = await fetch(`${base}/tasker.health.v1.AttentionService/ListAttention`, { method: 'POST',
        headers: { cookie: cookie!, 'content-type': 'application/json', 'connect-protocol-version': '1' },
        body: JSON.stringify({ orgId: f.orgId, kind: 'question', page: { limit: -1 } }) });
      expect(invalid.status).toBe(400);
    } finally {
      child.kill('SIGTERM');
      const exited = await Promise.race([child.exited.then(() => true), new Promise<false>(resolve => setTimeout(() => resolve(false), 5000))]);
      if (!exited) { child.kill('SIGKILL'); await child.exited; }
    }
  }, 20_000);

  it('defaults to20 and caps a requested huge page at100 without loading all source rows', async () => {
    const f = await fixture(125);
    const normal: any = await f.handler.listAttention({ orgId: f.orgId, kind: 'question' }, f.ctx);
    expect(normal.items).toHaveLength(20); expect(normal.page.totalCount).toBe(125);
    const traced = observe(f.db, rows => { if (rows.some(row => row.task_id || row.taskId || (row.id && row.name))) expect(rows.length).toBeLessThanOrEqual(101); });
    const capped: any = await createAttentionHandler(traced, f.clock).listAttention({ orgId: f.orgId, kind: 'question', page: { limit: 10000 } }, f.ctx);
    expect(capped.items).toHaveLength(100); expect(capped.page.nextCursor).toBeTruthy();
  }, 20_000);
});
