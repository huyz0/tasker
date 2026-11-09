import { it, expect } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import { createContextValues } from '@connectrpc/connect';
import { setupDatabase } from '../db/db';
import * as S from '../db/schema.mysql';
import { captureDomainEvent } from './domainEventOutbox';
import { setDurableDomainEventCapture } from './natsCorrelation';
import { runWithRequestContext } from './requestContext';
import { encryptToken } from './crypto';
import { purgeOrgCascade } from './cascadePurge';
import { currentPrincipalKey } from '../modules/auth/session';
import { createTaskManagementHandler } from '../modules/tasks/tasks.handler';

const mysqlTest = process.env.TASKER_MYSQL_INTEGRATION === '1' ? it : it.skip;
mysqlTest('captures a real MySQL task and matching webhook exactly once with its keyed response', async () => {
  const previous = process.env.STANDALONE;
  process.env.STANDALONE = 'false';
  const db: any = await setupDatabase('mysql');
  const suffix = crypto.randomUUID(), orgId = `org-${suffix}`, userId = `user-${suffix}`, projectId = `project-${suffix}`, templateId = `template-${suffix}`;
  try {
    await db.insert(S.users).values({ id: userId });
    await db.insert(S.organizations).values({ id: orgId, name: 'capture', slug: orgId });
    await db.insert(S.organizationMembers).values({ orgId, userId, role: 'admin' });
    await db.insert(S.projectTemplates).values({ id: templateId, orgId, name: 'capture' });
    await db.insert(S.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: 'capture', key: 'CAP' });
    await db.insert(S.webhooks).values({ id: `hook-${suffix}`, orgId, url: 'https://hooks.example.com/events', secretEncrypted: encryptToken('fixture-key'), events: '["task.*"]', active: true, createdAt: new Date() });
    setDurableDomainEventCapture((tx, standalone, event) => captureDomainEvent(tx, standalone, event, { brokerRequired: true }));
    const values = createContextValues();
    values.set(currentPrincipalKey, { kind: 'user', userId });
    const tasks = createTaskManagementHandler(db);
    const request = { projectId, title: 'one captured task', status: 'todo', idempotencyKey: suffix };
    const call = () => runWithRequestContext({ requestId: suffix, actor: { kind: 'user', userId } }, () => tasks.createTask(request, { values }));
    expect((await call()).task.id).toBe((await call()).task.id);
    const events = await db.select().from(S.domainEvents).where(eq(S.domainEvents.orgId, orgId));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ projectId, brokerRequired: true, deliveredAt: null });
    expect(JSON.parse(events[0].payload)).toMatchObject({ title: request.title, orgId, projectId, actor: { kind: 'user', userId } });
    expect(await db.select().from(S.webhookDeliveries).where(eq(S.webhookDeliveries.eventId, events[0].id))).toHaveLength(1);
  } finally {
    setDurableDomainEventCapture(null);
    const events = await db.select().from(S.domainEvents).where(eq(S.domainEvents.orgId, orgId));
    if (events.length) await db.delete(S.webhookDeliveries).where(inArray(S.webhookDeliveries.eventId, events.map((r: any) => r.id)));
    await db.delete(S.domainEvents).where(eq(S.domainEvents.orgId, orgId));
    await db.delete(S.webhooks).where(eq(S.webhooks.orgId, orgId));
    await db.delete(S.idempotencyKeys).where(eq(S.idempotencyKeys.principalKey, `user:${userId}`));
    await purgeOrgCascade(db, orgId);
    await db.delete(S.users).where(eq(S.users.id, userId));
    await db.$client.end();
    if (previous === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = previous;
  }
}, 30_000);
