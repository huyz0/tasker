import { afterEach, beforeEach, describe, it, expect } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { setupIntegrationTest, seedOrgWithAdmin, seedProject, makeAuthContext } from '../test/setup';
import * as S from '../db/schema.sqlite';
import { withUnitOfWork } from '../db/access';
import { captureDomainEvent } from './domainEventOutbox';
import { publishDomainEvent, setDurableDomainEventCapture } from './natsCorrelation';
import { runWithRequestContext } from './requestContext';
import { encryptToken } from './crypto';
import { createTaskManagementHandler } from '../modules/tasks/tasks.handler';

describe('transactional domain event capture', () => {
  let db: any, nc: any;
  const orgId = 'org-capture', userId = 'user-capture', projectId = 'project-capture';
  const hook = (id: string, org = orgId, project: string | null = null) => db.insert(S.webhooks).values({
    id, orgId: org, projectId: project, url: 'https://hooks.example.com/events', secretEncrypted: encryptToken('fixture-key'),
    events: JSON.stringify(['task.*']), active: true, createdAt: new Date(),
  });
  const emit = (payload: Record<string, unknown> = { projectId }) => withUnitOfWork(db, async () => {
    await db.insert(S.tasks).values({ id: 'task-capture', projectId, title: 'original', status: 'todo', createdAt: new Date() });
    publishDomainEvent(nc, 'domain.task.created', payload);
  });

  beforeEach(async () => {
    ({ db, nc } = await setupIntegrationTest());
    await seedOrgWithAdmin(db, { orgId, userId });
    await seedProject(db, { orgId, userId, projectId, templateId: 'template-capture' });
    await hook('hook-capture');
    setDurableDomainEventCapture((tx, standalone, event) => captureDomainEvent(tx, standalone, event, { brokerRequired: false }));
  });
  afterEach(() => setDurableDomainEventCapture(null));

  it('commits the mutation, immutable event and webhook delivery together without publishing to the broker', async () => {
    const payload = { id: 'task-capture', projectId, title: 'original', details: { state: 'original' } };
    await runWithRequestContext({ requestId: 'request-capture', orgId, projectId, actor: { kind: 'user', userId } }, () =>
      withUnitOfWork(db, async () => {
        await db.insert(S.tasks).values({ id: payload.id, projectId, title: payload.title, status: 'todo', createdAt: new Date() });
        publishDomainEvent(nc, 'domain.task.created', payload);
        payload.title = 'later mutation';
        payload.details.state = 'later mutation';
      }));
    const [event] = await db.select().from(S.domainEvents);
    const [delivery] = await db.select().from(S.webhookDeliveries);
    expect(event).toMatchObject({ orgId, projectId, brokerRequired: false, deliveredAt: null });
    expect(JSON.parse(event.payload)).toMatchObject({ title: 'original', details: { state: 'original' }, eventId: event.id, requestId: 'request-capture', actor: { kind: 'user', userId } });
    expect(delivery.eventId).toBe(event.id);
    expect(JSON.parse(delivery.payload)).toMatchObject({ id: event.id, orgId, projectId, data: { title: 'original' } });
    expect(await db.select().from(S.tasks)).toHaveLength(1);
    expect(nc.publishedMessages).toEqual([]);
  });

  it('discards every event and delivery when the mutation fails', async () => {
    await expect(withUnitOfWork(db, async () => {
      await db.insert(S.tasks).values({ id: 'task-capture', projectId, title: 'original', status: 'todo', createdAt: new Date() });
      publishDomainEvent(nc, 'domain.task.created', { projectId });
      throw new Error('mutation failed');
    })).rejects.toThrow('mutation failed');
    expect(await db.select().from(S.tasks)).toEqual([]);
    expect(await db.select().from(S.domainEvents)).toEqual([]);
    expect(await db.select().from(S.webhookDeliveries)).toEqual([]);
  });

  it.each(['domain_events', 'webhook_deliveries'])('rolls back the mutation if %s storage fails', async table => {
    await db.run(sql.raw(`CREATE TRIGGER fail_capture BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'capture storage unavailable'); END`));
    await expect(emit({ id: 'task-capture', projectId })).rejects.toThrow();
    expect(await db.select().from(S.tasks)).toEqual([]);
    expect(await db.select().from(S.domainEvents)).toEqual([]);
    expect(await db.select().from(S.webhookDeliveries)).toEqual([]);
    expect(nc.publishedMessages).toEqual([]);
  });

  it('captures a purged task in the authorized project even after its row is gone', async () => {
    const tasks = createTaskManagementHandler(db, nc), ctx = makeAuthContext(userId);
    const { task } = await tasks.createTask({ projectId, title: 'purge', status: 'todo' }, ctx);
    await withUnitOfWork(db, () => tasks.deleteTask({ taskId: task.id }, ctx));
    await runWithRequestContext({ requestId: 'purge', actor: { kind: 'user', userId } }, () =>
      withUnitOfWork(db, () => tasks.purgeTask({ taskId: task.id }, ctx)));
    const [event] = await db.select().from(S.domainEvents).where(eq(S.domainEvents.subject, 'domain.task.purged'));
    expect(event).toMatchObject({ orgId, projectId });
    const deliveries = await db.select().from(S.webhookDeliveries).where(eq(S.webhookDeliveries.eventId, event.id));
    expect(deliveries).toHaveLength(1);
    expect(await db.select().from(S.tasks)).toEqual([]);
  });

  it('matches current webhook subscriptions by organization, project and event type', async () => {
    await seedOrgWithAdmin(db, { orgId: 'foreign', userId: 'foreign-user' });
    await hook('foreign-hook', 'foreign');
    await hook('other-project-hook', orgId, 'other-project');
    await hook('project-hook', orgId, projectId);
    await emit({ id: 'task-capture', projectId });
    const deliveries = await db.select().from(S.webhookDeliveries);
    expect(deliveries.map((r: any) => r.webhookId).sort()).toEqual(['hook-capture', 'project-hook']);
  });

  it('sees a newly registered webhook without replaying earlier events into it', async () => {
    await db.delete(S.webhooks);
    const tasks = createTaskManagementHandler(db, nc), ctx = makeAuthContext(userId);
    await tasks.createTask({ projectId, title: 'before', status: 'todo' }, ctx);
    await hook('new-hook');
    await tasks.createTask({ projectId, title: 'after', status: 'todo' }, ctx);
    const deliveries = await db.select().from(S.webhookDeliveries);
    expect(deliveries).toHaveLength(1);
    expect(JSON.parse(deliveries[0].payload).data.title).toBe('after');
  });

  it('does not capture a second source event or delivery for a keyed task replay', async () => {
    const tasks = createTaskManagementHandler(db, nc), ctx = makeAuthContext(userId);
    const req = { projectId, title: 'once', status: 'todo', idempotencyKey: 'one' };
    await tasks.createTask(req, ctx);
    await tasks.createTask(req, ctx);
    expect(await db.select().from(S.domainEvents)).toHaveLength(1);
    expect(await db.select().from(S.webhookDeliveries)).toHaveLength(1);
  });

  it('retains an unscoped system event and derives a new organization from its payload', async () => {
    setDurableDomainEventCapture((tx, standalone, event) => captureDomainEvent(tx, standalone, event, { brokerRequired: true }));
    await withUnitOfWork(db, async () => { publishDomainEvent(nc, 'domain.agent.created', { agentId: 'system-created' }); });
    const [system] = await db.select().from(S.domainEvents);
    expect(system).toMatchObject({ orgId: null, projectId: null, brokerRequired: true });
    expect(JSON.parse(system.payload).actor).toEqual({ kind: 'system' });
    await runWithRequestContext({ requestId: 'new-org', orgId: 'parent-org' }, () => withUnitOfWork(db, async () => {
      publishDomainEvent(nc, 'domain.org.created', { id: orgId });
    }));
    const [organization] = await db.select().from(S.domainEvents).where(eq(S.domainEvents.subject, 'domain.org.created'));
    expect(organization.orgId).toBe(orgId);
    expect(await db.select().from(S.webhookDeliveries)).toEqual([]);
  });

  it('refuses unowned publication and inconsistent tenant routing', async () => {
    expect(() => publishDomainEvent(nc, 'domain.task.created', { projectId })).toThrow('unit of work');
    await expect(emit({ id: 'task-capture', projectId, orgId: 'wrong-org' })).rejects.toThrow('organization');
    expect(await db.select().from(S.tasks)).toEqual([]);
  });
});
