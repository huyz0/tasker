import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Code, createContextValues } from '@connectrpc/connect';
import { and, eq } from 'drizzle-orm';
import { makeAuthContext, seedOrgWithAdmin, seedProject, seedUser, setupIntegrationTest } from '../../test/setup';
import * as S from '../../db/schema.sqlite';
import { currentPrincipalKey } from '../auth/session';
import { purgeOrgCascade, purgeProjectCascade } from '../../lib/cascadePurge';
import { withUnitOfWork } from '../../db/access';
import { setDurableDomainEventCapture } from '../../lib/natsCorrelation';
import { createSavedViewsHandler } from './views.handler';
import { create as message, fromBinary, toBinary } from '@bufbuild/protobuf';
import { CreateSavedViewRequestSchema, GetSavedViewResponseSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';

const taskDefinition = () => ({ version: 1, screen: 'tasks', tasks: { viewMode: 'table', search: 'release', priority: 0, ready: true, sort: 'title:asc' } });
const reportDefinition = () => ({ version: 1, screen: 'reports', reports: { windowDays: 90 } });
async function rejectsCode(promise: Promise<unknown>, expected: Code) {
  const error: any = await promise.then(() => null, error => error);
  expect(error?.name === 'ZodError' ? Code.InvalidArgument : error?.code).toBe(expected);
}

describe('named operational definitions (ADR0044)', () => {
  let db: any, views: any;
  const orgId = 'views-org', foreignOrgId = 'views-foreign', projectId = 'views-project', foreignProjectId = 'views-foreign-project';
  const admin = 'views-admin', alice = 'views-alice', bob = 'views-bob', outsider = 'views-outsider';
  const ctx = (userId = bob) => makeAuthContext(userId);
  const create = (extra: object = {}, userId = bob) => views.createSavedView({ projectId, name: 'Release review', definition: taskDefinition(), ...extra }, ctx(userId));
  const list = (extra: object = {}, userId = bob) => views.listSavedViews({ orgId, screen: 'tasks', ...extra }, ctx(userId));
  beforeEach(async () => {
    ({ db } = await setupIntegrationTest());
    await seedOrgWithAdmin(db, { orgId, userId: admin });
    await seedProject(db, { orgId, userId: admin, templateId: 'views-template', projectId, name: 'Readable release project' });
    for (const userId of [alice, bob]) {
      await seedUser(db, userId);
      await db.insert(S.organizationMembers).values({ orgId, userId, role: 'member', joinedAt: new Date() });
    }
    await seedOrgWithAdmin(db, { orgId: foreignOrgId, userId: outsider });
    await seedProject(db, { orgId: foreignOrgId, userId: outsider, templateId: 'views-foreign-template', projectId: foreignProjectId });
    views = createSavedViewsHandler(db);
  });
  afterEach(() => { setDurableDomainEventCapture(null);db?.$client.close(); });

  it('stores supported settings under server-derived identity and keeps query contents out of catalog metadata', async () => {
    const { view } = await create({ ownerUserId: admin, orgId: foreignOrgId });
    expect(view).toMatchObject({ ownerUserId: bob, orgId, projectId, visibility: 'personal', screen: 'tasks', canEdit: true });
    expect(view.definition).toBeUndefined();
    const loaded = await views.getSavedView({ viewId: view.id }, ctx());
    expect(loaded.definition).toEqual(taskDefinition());
    const catalog = await list();
    expect(catalog.views).toHaveLength(1);expect(Number(catalog.page.totalCount)).toBe(1);
    expect(catalog.views[0].definition).toBeUndefined();
    expect(JSON.stringify(catalog)).not.toContain('release"');
    const renamed = await views.renameSavedView({ viewId: view.id, name: '  Weekly release  ', visibility: 'organization', ownerUserId: alice, projectId: foreignProjectId }, ctx());
    expect(renamed.view).toMatchObject({ name: 'Weekly release', visibility: 'personal', ownerUserId: bob, projectId });
    expect((await views.getSavedView({ viewId: view.id }, ctx())).definition).toEqual(taskDefinition());
    expect((await views.deleteSavedView({ viewId: view.id }, ctx())).success).toBe(true);
    await rejectsCode(views.getSavedView({ viewId: view.id }, ctx()), Code.NotFound);
  });

  it('retains protobuf presence and accepts real codec metadata without persisting it', async () => {
    const request = message(CreateSavedViewRequestSchema, { projectId, name: 'Wire absent priority', definition: { version: 1, screen: 'tasks', tasks: {} } });
    const { view } = await views.createSavedView(request, ctx());
    const response = message(GetSavedViewResponseSchema, await views.getSavedView({ viewId: view.id }, ctx()));
    const decoded = fromBinary(GetSavedViewResponseSchema, toBinary(GetSavedViewResponseSchema, response));
    expect(decoded.definition?.tasks?.priority).toBeUndefined();
    expect(decoded.definition?.tasks?.ready).toBe(false);
    const zero = await views.createSavedView(message(CreateSavedViewRequestSchema, { projectId, name: 'Wire zero priority', definition: { version: 1, screen: 'tasks', tasks: { priority: 0, ready: false } } }), ctx());
    const zeroResponse = message(GetSavedViewResponseSchema, await views.getSavedView({ viewId: zero.view.id }, ctx()));
    expect(fromBinary(GetSavedViewResponseSchema, toBinary(GetSavedViewResponseSchema, zeroResponse)).definition?.tasks?.priority).toBe(0);
    const raw = (await db.select().from(S.savedViews).where(eq(S.savedViews.id, zero.view.id)))[0];
    expect(raw.definitionJson).not.toContain('$typeName');
  });

  it('lets a viewer manage only personal configuration while shared administration stays denied', async () => {
    await db.update(S.organizationMembers).set({ role: 'viewer' }).where(and(eq(S.organizationMembers.orgId, orgId), eq(S.organizationMembers.userId, bob)));
    const { view } = await create();
    expect((await views.renameSavedView({ viewId: view.id, name: 'Viewer preference' }, ctx())).view.canEdit).toBe(true);
    await rejectsCode(create({ visibility: 'organization', name: 'No shared edit' }), Code.PermissionDenied);
    expect((await views.deleteSavedView({ viewId: view.id }, ctx())).success).toBe(true);
  });

  it('hides another person’s private ID from members, administrators and other organizations', async () => {
    const { view } = await create();
    for (const userId of [alice, admin, outsider]) {
      await rejectsCode(views.getSavedView({ viewId: view.id }, ctx(userId)), Code.NotFound);
      await rejectsCode(views.renameSavedView({ viewId: view.id, name: 'Guessed' }, ctx(userId)), Code.NotFound);
      await rejectsCode(views.deleteSavedView({ viewId: view.id }, ctx(userId)), Code.NotFound);
    }
    for (const userId of [alice, admin]) {
      const result = await list({}, userId);expect(result.views).toHaveLength(0);expect(Number(result.page.totalCount)).toBe(0);
    }
    await rejectsCode(list({}, outsider), Code.PermissionDenied);
  });

  it('checks live org administration for shared creation and edits, including the former-admin creator', async () => {
    await rejectsCode(create({ visibility: 'organization' }), Code.PermissionDenied);
    const { view } = await create({ visibility: 'organization' }, admin);
    expect((await list()).views[0]).toMatchObject({ id: view.id, canEdit: false, visibility: 'organization' });
    expect((await views.getSavedView({ viewId: view.id }, ctx())).definition).toEqual(taskDefinition());
    await rejectsCode(views.renameSavedView({ viewId: view.id, name: 'Blocked' }, ctx()), Code.PermissionDenied);
    await rejectsCode(views.deleteSavedView({ viewId: view.id }, ctx()), Code.PermissionDenied);
    await db.update(S.organizationMembers).set({ role: 'member' }).where(and(eq(S.organizationMembers.orgId, orgId), eq(S.organizationMembers.userId, admin)));
    await rejectsCode(views.renameSavedView({ viewId: view.id, name: 'Still blocked' }, ctx(admin)), Code.PermissionDenied);
    await rejectsCode(views.deleteSavedView({ viewId: view.id }, ctx(admin)), Code.PermissionDenied);
    await db.update(S.organizationMembers).set({ role: 'admin' }).where(and(eq(S.organizationMembers.orgId, orgId), eq(S.organizationMembers.userId, alice)));
    expect((await views.renameSavedView({ viewId: view.id, name: 'Admin-managed' }, ctx(alice))).view.ownerUserId).toBe(admin);
    expect((await views.deleteSavedView({ viewId: view.id }, ctx(alice))).success).toBe(true);
  });

  it('derives the tenant from the actual active project and refuses foreign or missing references', async () => {
    await rejectsCode(create({ projectId: foreignProjectId, orgId }), Code.NotFound);
    await rejectsCode(create({ projectId: 'missing-project' }), Code.NotFound);
    await db.update(S.projects).set({ deletedAt: new Date() }).where(eq(S.projects.id, projectId));
    await rejectsCode(create(), Code.NotFound);
  });

  it('requires a human before validation on every operation', async () => {
    const values = createContextValues();values.set(currentPrincipalKey, { kind: 'agent', agentId: 'agent', orgId, tokenId: 'token-fixture', scopes: ['tasks:read', 'tasks:write'] });
    for (const [method, req] of [
      ['createSavedView', {}], ['getSavedView', {}], ['listSavedViews', {}], ['renameSavedView', {}], ['deleteSavedView', {}],
    ] as const) {
      await rejectsCode(views[method](req, { values }), Code.PermissionDenied);
      await rejectsCode(views[method](req, makeAuthContext(null)), Code.Unauthenticated);
    }
  });

  it('canonicalizes missing defaults without turning absent priority into priority0', async () => {
    const first = await create({ definition: { version: 1, screen: 'tasks', tasks: {} } });
    const task = (await views.getSavedView({ viewId: first.view.id }, ctx())).definition.tasks;
    expect(task).toMatchObject({ viewMode: 'board', search: '', ready: false });expect(task.priority).toBeUndefined();expect(task.sort).toBeUndefined();
    const second = await create({ name: 'Report', definition: { version: 1, screen: 'reports', reports: {} } });
    expect((await views.getSavedView({ viewId: second.view.id }, ctx())).definition.reports.windowDays).toBe(30);
  });

  it.each([
    { version: 2, screen: 'tasks', tasks: {} },
    { version: 1, screen: 'unknown', tasks: {} },
    { version: 1, screen: 'tasks', tasks: {}, reports: { windowDays: 7 } },
    { version: 1, screen: 'reports', tasks: {} },
    { version: 1, screen: 'tasks', tasks: { viewMode: 'unknown' } },
    { version: 1, screen: 'tasks', tasks: { search: 'x'.repeat(501) } },
    { version: 1, screen: 'tasks', tasks: { search: 'unsafe\u0000text' } },
    { version: 1, screen: 'tasks', tasks: { priority: 5 } },
    { version: 1, screen: 'tasks', tasks: { ready: 'true' } },
    { version: 1, screen: 'tasks', tasks: { sort: 'title:sideways' } },
    { version: 1, screen: 'tasks', tasks: { sort: 'DROP TABLE tasks' } },
    { version: 1, screen: 'tasks', tasks: { cursor: 'not-portable' } },
    { version: 1, screen: 'tasks', tasks: { results: [{ id: 'private' }] } },
    { version: 1, screen: 'tasks', tasks: {}, sql: 'SELECT * FROM users' },
    { version: 1, screen: 'reports', reports: { windowDays: 0 } },
    { version: 1, screen: 'reports', reports: { windowDays: 365 } },
  ])('refuses unsupported definition %j before persistence', async definition => {
    await rejectsCode(create({ definition }), Code.InvalidArgument);
    expect((await list()).views).toHaveLength(0);
  });

  it.each(['', '   ', 'x'.repeat(129), 'bad\nname'])('refuses invalid name %j', async name => {
    await rejectsCode(create({ name }), Code.InvalidArgument);
  });

  it('keeps normalized names unique within each personal/shared namespace under concurrent writes', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => create({ name: ' Résumé ' })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    for (const result of results) if (result.status === 'rejected') expect((result.reason as any).code).toBe(Code.AlreadyExists);
    await rejectsCode(create({ name: 'RE\u0301SUME\u0301' }), Code.AlreadyExists);
    expect((await create({ name: 'Résumé' }, alice)).view.ownerUserId).toBe(alice);
    await create({ name: 'Résumé', visibility: 'organization' }, admin);
    await db.update(S.organizationMembers).set({ role: 'admin' }).where(and(eq(S.organizationMembers.orgId, orgId), eq(S.organizationMembers.userId, alice)));
    await rejectsCode(create({ name: 'RÉSUMÉ', visibility: 'organization' }, alice), Code.AlreadyExists);
  });

  it('filters private/foreign rows before bounded pagination/count and binds audience/screen/user cursor identity', async () => {
    const templates = [
      (await create()).view, (await create({ visibility: 'organization' }, admin)).view,
      (await create({}, alice)).view, (await create({ projectId: foreignProjectId }, outsider)).view,
    ];
    const raw = await Promise.all(templates.map(view => db.select().from(S.savedViews).where(eq(S.savedViews.id, view.id)).then((rows: any[]) => rows[0])));
    await db.delete(S.savedViews);
    const rows = [
      ...Array.from({ length: 40 }, (_, i) => ({ ...raw[0], id: `personal-${i}`, name: `Visible ${String(i).padStart(3, '0')}` })),
      ...Array.from({ length: 80 }, (_, i) => ({ ...raw[1], id: `shared-${i}`, name: `Visible ${String(i + 40).padStart(3, '0')}` })),
      ...Array.from({ length: 140 }, (_, i) => ({ ...raw[2], id: `hidden-${i}`, name: `AAA hidden ${i}` })),
      ...Array.from({ length: 40 }, (_, i) => ({ ...raw[3], id: `foreign-${i}`, name: `AAA foreign ${i}` })),
    ].map(row => ({ ...row, nameKey: crypto.randomUUID().replaceAll('-', '') }));
    await db.insert(S.savedViews).values(rows);
    const first = await list({ page: { limit: 10000, sort: 'name:asc' } });
    expect(first.views).toHaveLength(100);expect(Number(first.page.totalCount)).toBe(120);expect(first.page.nextCursor).toBeTruthy();
    const second = await list({ page: { limit: 10000, sort: 'name:asc', cursor: first.page.nextCursor } });
    expect(second.views).toHaveLength(20);expect(new Set([...first.views, ...second.views].map((view: any) => view.id)).size).toBe(120);
    expect((await list({ visibility: 'personal' })).views).toHaveLength(40);
    expect(Number((await list({ visibility: 'organization' })).page.totalCount)).toBe(80);
    for (const extra of [{ screen: 'reports' }, { visibility: 'personal' }, { page: { limit: 100, sort: 'name:asc', cursor: first.page.nextCursor, filter: 'Visible' } }]) {
      await rejectsCode(list({ page: { limit: 100, sort: 'name:asc', cursor: first.page.nextCursor }, ...extra }), Code.InvalidArgument);
    }
    await rejectsCode(list({ page: { sort: 'name:asc', cursor: first.page.nextCursor } }, admin), Code.InvalidArgument);
  });

  it('rechecks source-read rights and organization access on every explicit Get', async () => {
    const { view } = await create();
    await db.delete(S.rolePermissions).where(and(eq(S.rolePermissions.roleId, 'role-member'), eq(S.rolePermissions.permissionKey, 'task:read')));
    await rejectsCode(views.getSavedView({ viewId: view.id }, ctx()), Code.PermissionDenied);
    expect((await list()).views[0].id).toBe(view.id);
    await db.delete(S.organizationMembers).where(and(eq(S.organizationMembers.orgId, orgId), eq(S.organizationMembers.userId, bob)));
    await rejectsCode(views.getSavedView({ viewId: view.id }, ctx()), Code.NotFound);
  });

  it('does not enrich a project name from org:read when project:read is absent', async () => {
    const { view } = await create();
    expect(view.projectName).toBe('Readable release project');
    await db.delete(S.rolePermissions).where(and(eq(S.rolePermissions.roleId, 'role-member'), eq(S.rolePermissions.permissionKey, 'project:read')));
    const loaded = await views.getSavedView({ viewId: view.id }, ctx());
    expect(loaded.definition).toEqual(taskDefinition());expect(loaded.view.projectName).toBeUndefined();
    expect((await list()).views[0].projectName).toBeUndefined();
  });

  it('retains removed-project metadata for recovery and permits owner cleanup without returning an obsolete query', async () => {
    const { view } = await create();
    await purgeProjectCascade(db, projectId);
    const catalog = await list();expect(catalog.views[0]).toMatchObject({ id: view.id, unavailableReason: 'project_unavailable' });
    await rejectsCode(views.getSavedView({ viewId: view.id }, ctx()), Code.FailedPrecondition);
    expect((await views.renameSavedView({ viewId: view.id, name: 'Old release' }, ctx())).view.name).toBe('Old release');
    expect((await views.deleteSavedView({ viewId: view.id }, ctx())).success).toBe(true);
  });

  it('refuses invalid persisted definitions and mismatched stored project tenants without exposing query contents', async () => {
    const { view } = await create();
    await db.update(S.savedViews).set({ definitionJson: JSON.stringify({ version: 2, screen: 'tasks', tasks: {} }) }).where(eq(S.savedViews.id, view.id));
    expect((await list()).views[0].unavailableReason).toBe('definition_invalid');
    await rejectsCode(views.getSavedView({ viewId: view.id }, ctx()), Code.FailedPrecondition);
    await db.update(S.savedViews).set({ definitionJson: JSON.stringify(taskDefinition()), projectId: foreignProjectId }).where(eq(S.savedViews.id, view.id));
    expect((await list()).views[0].projectName).toBeUndefined();
    await rejectsCode(views.getSavedView({ viewId: view.id }, ctx()), Code.FailedPrecondition);
  });

  it('purges a tenant’s definitions with that organization, including references to already purged projects', async () => {
    await create();await create({ name: 'Shared', visibility: 'organization' }, admin);
    await purgeProjectCascade(db, projectId);await purgeOrgCascade(db, orgId);
    expect(await db.select().from(S.savedViews).where(eq(S.savedViews.orgId, orgId))).toHaveLength(0);
  });

  it('keeps private bookmark names/query contents out of durable organization events', async () => {
    const events: unknown[] = [];setDurableDomainEventCapture(async (_tx, _standalone, event) => { events.push(event); });
    await withUnitOfWork(db, async () => {
      const { view } = await create({ name: 'Private note', definition: { version: 1, screen: 'tasks', tasks: { search: 'sensitive search phrase' } } });
      await views.renameSavedView({ viewId: view.id, name: 'Private renamed' }, ctx());
      await views.deleteSavedView({ viewId: view.id }, ctx());
    });
    expect(events).toHaveLength(0);
  });
});
