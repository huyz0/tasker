import { expect, it } from 'bun:test';
import { Code } from '@connectrpc/connect';
import { and, eq, sql } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import { setupDatabase } from '../../db/db';
import * as S from '../../db/schema.mysql';
import { makeAuthContext } from '../../test/setup';
import { withUnitOfWork } from '../../db/access';
import { purgeOrgCascade, purgeProjectCascade } from '../../lib/cascadePurge';
import { createSavedViewsHandler } from './views.handler';

const enabled = process.env.TASKER_MYSQL_INTEGRATION === '1';
const testIf = enabled ? it : it.skip;
async function refuses(promise: Promise<unknown>, code: Code) {
  const error: any = await promise.then(() => null, error => error);expect(error?.code).toBe(code);
}
async function ownedMysql(run: (fixture: any) => Promise<void>) {
  const previousStandalone = process.env.STANDALONE, previousName = process.env.DB_NAME;
  const name = `tasker_m58_views_${crypto.randomUUID().replaceAll('-', '')}`;
  const adminConnection = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD });
  let db: any, created = false;
  try {
    await adminConnection.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);created = true;
    process.env.STANDALONE = 'false';process.env.DB_NAME = name;db = await setupDatabase('mysql');
    const now = new Date(), orgId = 'native-views-org', projectId = 'native-views-project', foreignOrgId = 'native-foreign-org', foreignProjectId = 'native-foreign-project';
    const users = ['native-admin', 'native-member', 'native-other', 'native-foreign'];
    await db.insert(S.users).values(users.map(id => ({ id, createdAt: now })));
    await db.insert(S.organizations).values([{ id: orgId, name: 'Views', slug: orgId, createdAt: now }, { id: foreignOrgId, name: 'Foreign', slug: foreignOrgId, createdAt: now }]);
    await db.insert(S.organizationMembers).values(users.map((userId, index) => ({ orgId: index === 3 ? foreignOrgId : orgId, userId, role: index === 0 || index === 3 ? 'admin' : 'member', joinedAt: now })));
    await db.insert(S.projectTemplates).values([{ id: 'native-template', orgId, name: 'T', createdAt: now }, { id: 'foreign-template', orgId: foreignOrgId, name: 'F', createdAt: now }]);
    await db.insert(S.projects).values([{ id: projectId, orgId, templateId: 'native-template', ownerId: users[0], name: 'Native project', createdAt: now }, { id: foreignProjectId, orgId: foreignOrgId, templateId: 'foreign-template', ownerId: users[3], name: 'Foreign project', createdAt: now }]);
    await run({ db, views: createSavedViewsHandler(db), orgId, projectId, foreignOrgId, foreignProjectId, admin: users[0], member: users[1], other: users[2], foreign: users[3] });
  } finally {
    await db?.$client.end();if (created) await adminConnection.query(`DROP DATABASE \`${name}\``);await adminConnection.end();
    if (previousStandalone === undefined) delete process.env.STANDALONE;else process.env.STANDALONE = previousStandalone;
    if (previousName === undefined) delete process.env.DB_NAME;else process.env.DB_NAME = previousName;
  }
}

testIf('MySQL checks ownership/current administration/references, normalized races and bounded private SQL pages', async () => ownedMysql(async ({ db, views, orgId, projectId, foreignProjectId, admin, member, other, foreign }) => {
  const ctx = (userId = member) => makeAuthContext(userId);
  const definition = { version: 1, screen: 'tasks', tasks: { viewMode: 'table', priority: 0, ready: false, search: 'release', sort: 'title:asc' } };
  const create = (extra: object = {}, userId = member) => views.createSavedView({ projectId, name: 'Native review', definition, ...extra }, ctx(userId));
  const list = (extra: object = {}, userId = member) => views.listSavedViews({ orgId, screen: 'tasks', ...extra }, ctx(userId));
  expect((await list({}, admin)).canCreateShared).toBe(true);
  expect((await list({}, member)).canCreateShared).toBe(false);
  const { view } = await create({ ownerUserId: admin, orgId: 'forged' });
  expect(view).toMatchObject({ ownerUserId: member, orgId, projectId, visibility: 'personal' });
  expect((await views.getSavedView({ viewId: view.id }, ctx())).definition).toEqual(definition);
  for (const userId of [admin, other, foreign]) await refuses(views.getSavedView({ viewId: view.id }, ctx(userId)), Code.NotFound);
  await refuses(create({ projectId: foreignProjectId, orgId }), Code.NotFound);
  await refuses(create({ visibility: 'organization' }), Code.PermissionDenied);
  const shared = (await create({ visibility: 'organization' }, admin)).view;
  await refuses(views.renameSavedView({ viewId: shared.id, name: 'No' }, ctx()), Code.PermissionDenied);
  await refuses(views.deleteSavedView({ viewId: shared.id }, ctx()), Code.PermissionDenied);

  const races = await Promise.allSettled(Array.from({ length: 8 }, () => create({ name: ' Résumé ' })));
  expect(races.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  for (const result of races) if (result.status === 'rejected') expect((result.reason as any).code).toBe(Code.AlreadyExists);
  await refuses(create({ name: 'RE\u0301SUME\u0301' }), Code.AlreadyExists);
  const duplicate = (await create({ name: 'Other name' })).view;
  await refuses(views.renameSavedView({ viewId: duplicate.id, name: 'RÉSUMÉ' }, ctx()), Code.AlreadyExists);
  expect((await views.getSavedView({ viewId: duplicate.id }, ctx())).view.name).toBe('Other name');

  await db.delete(S.rolePermissions).where(and(eq(S.rolePermissions.roleId, 'role-member'), eq(S.rolePermissions.permissionKey, 'project:read')));
  expect((await views.getSavedView({ viewId: view.id }, ctx())).view.projectName).toBeUndefined();
  await db.insert(S.rolePermissions).values({ roleId: 'role-member', permissionKey: 'project:read' });
  await db.update(S.savedViews).set({ projectId: foreignProjectId }).where(eq(S.savedViews.id, view.id));
  await refuses(views.getSavedView({ viewId: view.id }, ctx()), Code.FailedPrecondition);
  await db.update(S.savedViews).set({ projectId }).where(eq(S.savedViews.id, view.id));

  const privateRaw = (await db.select().from(S.savedViews).where(eq(S.savedViews.id, view.id)))[0];
  const sharedRaw = (await db.select().from(S.savedViews).where(eq(S.savedViews.id, shared.id)))[0];
  await db.delete(S.savedViews);
  await db.insert(S.savedViews).values([
    ...Array.from({ length: 40 }, (_, i) => ({ ...privateRaw, id: `visible-personal-${i}`, name: `Visible ${String(i).padStart(3, '0')}`, nameKey: crypto.randomUUID() })),
    ...Array.from({ length: 80 }, (_, i) => ({ ...sharedRaw, id: `visible-shared-${i}`, name: `Visible ${String(i + 40).padStart(3, '0')}`, nameKey: crypto.randomUUID() })),
    ...Array.from({ length: 140 }, (_, i) => ({ ...privateRaw, id: `hidden-${i}`, ownerUserId: other, audienceKey: `user:${other}`, name: `AAA hidden ${i}`, nameKey: crypto.randomUUID() })),
  ]);
  const first = await list({ page: { limit: 10000, sort: 'name:asc' } });expect(first.views).toHaveLength(100);expect(Number(first.page.totalCount)).toBe(120);
  const second = await list({ page: { limit: 10000, sort: 'name:asc', cursor: first.page.nextCursor } });expect(second.views).toHaveLength(20);
  expect(new Set([...first.views, ...second.views].map((row: any) => row.id)).size).toBe(120);
  await refuses(list({ visibility: 'personal', page: { sort: 'name:asc', cursor: first.page.nextCursor } }), Code.InvalidArgument);
  const timings: number[] = [];
  for (let i = 0; i < 20; i++) { const start = performance.now();await list({ page: { limit: 50, sort: 'name:asc' } });timings.push(performance.now() - start); }
  timings.sort((a, b) => a - b);const p95 = timings[Math.ceil(timings.length * .95) - 1]!;expect(p95).toBeLessThan(150);console.log(`Saved-view list native p95: ${p95.toFixed(2)}ms (150ms budget)`);

  await db.delete(S.rolePermissions).where(and(eq(S.rolePermissions.roleId, 'role-member'), eq(S.rolePermissions.permissionKey, 'task:read')));
  await refuses(views.getSavedView({ viewId: 'visible-personal-0' }, ctx()), Code.PermissionDenied);
  await db.insert(S.rolePermissions).values({ roleId: 'role-member', permissionKey: 'task:read' });
  await db.update(S.organizationMembers).set({ role: 'member' }).where(and(eq(S.organizationMembers.orgId, orgId), eq(S.organizationMembers.userId, admin)));
  await refuses(views.renameSavedView({ viewId: 'visible-shared-0', name: 'Former admin' }, ctx(admin)), Code.PermissionDenied);
  await db.update(S.organizationMembers).set({ role: 'admin' }).where(and(eq(S.organizationMembers.orgId, orgId), eq(S.organizationMembers.userId, other)));
  expect((await views.renameSavedView({ viewId: 'visible-shared-0', name: 'Current admin' }, ctx(other))).view.ownerUserId).toBe(admin);
  await purgeProjectCascade(db, projectId);
  expect((await list()).views.every((row: any) => row.unavailableReason === 'project_unavailable')).toBe(true);
  await refuses(views.getSavedView({ viewId: 'visible-personal-0' }, ctx()), Code.FailedPrecondition);
  expect((await views.renameSavedView({ viewId: 'visible-personal-0', name: 'Old project' }, ctx())).view.name).toBe('Old project');
  await purgeOrgCascade(db, orgId);expect(await db.select().from(S.savedViews).where(eq(S.savedViews.orgId, orgId))).toHaveLength(0);
}), 30000);

testIf('MySQL never acknowledges a stale rename after a concurrent delete', async () => ownedMysql(async ({ db, views, projectId, member }) => {
  const context = makeAuthContext(member);
  const { view } = await views.createSavedView({ projectId, name: 'Before race', definition: { version: 1, screen: 'tasks', tasks: {} } }, context);
  let ready!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => ready = resolve), gate = new Promise<void>(resolve => release = resolve);
  const gated = new Proxy(db, { get(target, property) {
    if (property === 'update') return (table: any) => table !== S.savedViews ? target.update(table) : { set(values: any) { return { async where(condition: any) {
      ready();await gate;return target.update(table).set(values).where(condition);
    } }; } };
    const value = Reflect.get(target, property);return typeof value === 'function' ? value.bind(target) : value;
  } });
  const renaming = withUnitOfWork(db, () => createSavedViewsHandler(gated).renameSavedView({ viewId: view.id, name: 'After race' }, context))
    .then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
  try {
    await entered;
    const deletion = await withUnitOfWork(db, async () => {
      await db.execute(sql.raw('SET SESSION innodb_lock_wait_timeout = 1'));
      return views.deleteSavedView({ viewId: view.id }, context);
    }).then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
    release();const renamed = await renaming;
    // Both optimistic refusal and row serialization are valid. Neither may
    // report a successful rename of the already-removed row or a raw crash.
    if (deletion.ok) {
      expect(renamed.ok).toBe(false);
      if (!renamed.ok) expect(renamed.error.code).toBe(Code.NotFound);
    } else {
      let cause = deletion.error, lockTimeout = false;
      for (let i = 0; cause && i < 5; i++, cause = cause.cause) if (cause.code === 'ER_LOCK_WAIT_TIMEOUT') lockTimeout = true;
      expect(lockTimeout).toBe(true);expect(renamed.ok).toBe(true);
      if (renamed.ok) expect(renamed.value.view?.name).toBe('After race');
      expect((await views.deleteSavedView({ viewId: view.id }, context)).success).toBe(true);
    }
  } finally { release();await renaming; }
}), 30000);
