import { describe, it, expect } from 'bun:test';
import { createContextValues, ConnectError, Code } from '@connectrpc/connect';
import { setupIntegrationTest, makeAuthContext } from '../test/setup';
import * as schema from '../db/schema.sqlite';
import { currentPrincipalKey, type Principal } from '../modules/auth/session';
import { createTaskManagementHandler } from '../modules/tasks/tasks.handler';

/** M04-T07's verify line, and the shape of the guarantee around it. */

async function seed(db: any) {
  const s = String(Math.random()).slice(2);
  const orgId = `org-${s}`, otherOrg = `oorg-${s}`, user = `u-${s}`;
  const roleId = `role-${s}`, agentId = `a-${s}`;
  const templateId = `t-${s}`, projectId = `p-${s}`;
  await db.insert(schema.organizations).values([
    { id: orgId, name: 'O', slug: orgId, createdAt: new Date() },
    { id: otherOrg, name: 'P', slug: otherOrg, createdAt: new Date() },
  ]);
  await db.insert(schema.users).values({ id: user, email: `${user}@t.test`, createdAt: new Date() });
  await db.insert(schema.organizationMembers).values({ orgId, userId: user, role: 'member', joinedAt: new Date() });
  await db.insert(schema.agentRoles).values({ id: roleId, orgId, name: 'R', systemPrompt: 'p', capabilities: '[]', createdAt: new Date() });
  await db.insert(schema.agents).values({ id: agentId, orgId, agentRoleId: roleId, name: 'A', createdAt: new Date() });
  await db.insert(schema.projectTemplates).values({ id: templateId, orgId, name: 'T', createdAt: new Date() });
  await db.insert(schema.projects).values({ id: projectId, orgId, templateId, ownerId: user, name: 'P', key: 'SC', createdAt: new Date() });
  return { orgId, otherOrg, user, agentId, projectId };
}

const tokenCtx = (agentId: string, orgId: string, scopes: string[]) => {
  const values = createContextValues();
  const principal: Principal = { kind: 'agent', agentId, orgId, tokenId: 'tok', scopes };
  values.set(currentPrincipalKey, principal);
  return { values } as any;
};

describe('scopes are enforced per RPC', () => {
  it('a read-scoped token cannot create a task', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, agentId, projectId } = await seed(db);
    const handler = createTaskManagementHandler(db, null);

    try {
      await handler.createTask({ projectId, title: 'should not exist' }, tokenCtx(agentId, orgId, ['tasks:read']));
      throw new Error('expected a rejection');
    } catch (e) {
      expect(e).toBeInstanceOf(ConnectError);
      expect((e as ConnectError).code).toBe(Code.PermissionDenied);
      expect((e as ConnectError).message).toMatch(/tasks:write/);
    }
  });

  it('a write-scoped token can create a task, and it is attributed to no human', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, agentId, projectId } = await seed(db);
    const handler = createTaskManagementHandler(db, null);

    const res: any = await handler.createTask(
      { projectId, title: 'agent work' },
      tokenCtx(agentId, orgId, ['tasks:read', 'tasks:write']),
    );

    expect(res.task.title).toBe('agent work');
    const rows = await db.select().from(schema.tasks);
    expect(rows).toHaveLength(1);
    expect(rows[0].createdBy).toBeNull();
  });

  it('a read-scoped token can still read', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, agentId, projectId } = await seed(db);
    const handler = createTaskManagementHandler(db, null);
    const res: any = await handler.listTasks({ projectId }, tokenCtx(agentId, orgId, ['tasks:read']));
    expect(res.tasks).toEqual([]);
  });

  it('a token with no scopes at all can do nothing', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, agentId, projectId } = await seed(db);
    const handler = createTaskManagementHandler(db, null);
    await expect(handler.listTasks({ projectId }, tokenCtx(agentId, orgId, []))).rejects.toThrow(ConnectError);
  });

  it('a correctly-scoped token still cannot cross into another organization', async () => {
    const { db } = await setupIntegrationTest();
    const { otherOrg, agentId, projectId } = await seed(db);
    const handler = createTaskManagementHandler(db, null);
    // Holding tasks:write does not make the token's org binding negotiable.
    await expect(handler.createTask(
      { projectId, title: 'x' },
      tokenCtx(agentId, otherOrg, ['tasks:write']),
    )).rejects.toThrow(/cannot act in that organization/);
  });

  it('scopes do not apply to humans — a member with no token writes as before', async () => {
    const { db } = await setupIntegrationTest();
    const { user, projectId } = await seed(db);
    const handler = createTaskManagementHandler(db, null);
    // A person's authority is their organization role. Giving humans a second,
    // parallel permission system is M10's decision, not a side effect of
    // adding tokens.
    const res: any = await handler.createTask({ projectId, title: 'human work' }, makeAuthContext(user));
    expect(res.task.title).toBe('human work');
  });

  it('a viewer is still refused, so ADR-0006 survives the change', async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, projectId } = await seed(db);
    const viewer = `v-${Math.random()}`;
    await db.insert(schema.users).values({ id: viewer, email: `${viewer}@t.test`, createdAt: new Date() });
    await db.insert(schema.organizationMembers).values({ orgId, userId: viewer, role: 'viewer', joinedAt: new Date() });
    await expect(handlerFor(db).createTask({ projectId, title: 'x' }, makeAuthContext(viewer)))
      .rejects.toThrow(/read-only/);
  });
});

const handlerFor = (db: any) => createTaskManagementHandler(db, null);
