import { createHash } from 'node:crypto';
import { and, eq, isNull, or } from 'drizzle-orm';
import * as schemaMysql from '../db/schema.mysql';
import * as schemaSqlite from '../db/schema.sqlite';
import { insertDelivery, type WebhookEventBody } from '../modules/webhooks/outbox';
import { filtersMatch } from '../modules/webhooks/events';
import { getRequestContext } from './requestContext';
import { injectTraceContext } from './telemetry/otel';

export interface CapturedDomainEvent {
  id: string;
  subject: string;
  orgId: string | null;
  projectId: string | null;
  payload: Record<string, any>;
  occurredAt: Date;
}

/** Snapshot at emission time, not after the handler can mutate its objects. */
export function snapshotDomainEvent(subject: string, payload: unknown): CapturedDomainEvent {
  const data = JSON.parse(JSON.stringify(payload));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('domain event payload must be an object');
  const ctx = getRequestContext();
  const id = `evt-${crypto.randomUUID()}`, occurredAt = new Date();
  data.eventId = id;
  data.occurredAt = occurredAt.toISOString();
  if (!data.requestId && ctx) data.requestId = ctx.requestId;
  if (!data.actor) data.actor = ctx?.actor ?? { kind: 'system' };
  if (!data.orgId) data.orgId = subject.startsWith('domain.org.') && data.id ? data.id : ctx?.orgId;
  if (!('projectId' in data)) data.projectId = subject.startsWith('domain.project.') && data.id ? data.id : ctx?.projectId;
  if (!data.traceparent) Object.assign(data, injectTraceContext());
  return { id, subject, orgId: data.orgId ?? null, projectId: data.projectId ?? null, payload: data, occurredAt };
}

/** Called only in the pre-commit phase with the owning transaction handle. */
export async function captureDomainEvent(db: any, standalone: boolean, event: CapturedDomainEvent, options: { brokerRequired: boolean }): Promise<void> {
  const S = standalone ? schemaSqlite : schemaMysql;
  const tasks = S.tasks as any, projects = S.projects as any;
  let projectId = event.projectId, orgId = event.orgId;
  if (!projectId && /^domain\.(task|tasknote)\./.test(event.subject)) {
    const taskId = event.payload.taskId ?? (event.subject.startsWith('domain.task.') ? event.payload.id : undefined);
    if (taskId) {
      const [task] = await db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
      projectId = task?.projectId ?? null;
    }
  }
  if (projectId) {
    const [project] = await db.select({ orgId: projects.orgId }).from(projects).where(eq(projects.id, projectId)).limit(1);
    if (project && orgId && project.orgId !== orgId) throw new Error('domain event project belongs to a different organization');
    orgId ??= project?.orgId ?? null;
  }
  const payload = { ...event.payload, ...(orgId ? { orgId } : {}), ...(projectId ? { projectId } : {}) };
  const now = new Date();
  await db.insert(S.domainEvents).values({
    id: event.id, subject: event.subject, orgId, projectId, payload: JSON.stringify(payload),
    occurredAt: event.occurredAt, createdAt: now, brokerRequired: options.brokerRequired,
    nextAttemptAt: now, attempts: 0,
  });

  // Match the subscriptions now. The old asynchronous sink's cached absence
  // could miss a just-created endpoint or lose a purged task's routing.
  if (!orgId || !/^domain\.(task|tasknote)\.[a-z_]+$/.test(event.subject)) return;
  const hooks = S.webhooks as any;
  const candidates = await db.select().from(hooks).where(and(
    eq(hooks.orgId, orgId), eq(hooks.active, true),
    projectId ? or(isNull(hooks.projectId), eq(hooks.projectId, projectId)) : isNull(hooks.projectId),
  ));
  const type = event.subject.slice('domain.'.length);
  const body: WebhookEventBody = { id: event.id, type, occurredAt: event.occurredAt.toISOString(), orgId, projectId, data: payload };
  for (const hook of candidates) {
    if (!filtersMatch(JSON.parse(hook.events), type)) continue;
    const id = `whd-${createHash('sha256').update(`${event.id}\0${hook.id}`).digest('hex')}`;
    // A deterministic primary key protects a retried capture/fanout without
    // changing legacy delivery IDs. Only an already-existing identical row
    // is a duplicate; storage/foreign-key errors still abort the mutation.
    try { await insertDelivery(db, standalone, hook.id, body, id); }
    catch (error) {
      const deliveries = S.webhookDeliveries as any;
      const [existing] = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
      if (!existing || existing.eventId !== event.id || existing.webhookId !== hook.id) throw error;
    }
  }
}
