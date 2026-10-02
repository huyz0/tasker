/**
 * The webhook outbox (M37, ADR-0030): one `webhook_deliveries` row per event
 * per webhook, delivered by the sweep.
 */
import { and, eq, isNull, or } from "drizzle-orm";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { filtersMatch } from "./events";

export interface WebhookEventBody {
  /** Shared by every webhook's copy of one event - what a receiver de-duplicates on, with the delivery id. */
  id: string;
  type: string;
  occurredAt: string;
  orgId: string;
  projectId: string | null;
  data: unknown;
}

/** Queues one delivery, due now. Returns its row. */
export async function insertDelivery(db: any, isStandalone: boolean, webhookId: string, event: WebhookEventBody) {
  const deliveries = isStandalone ? schemaSqlite.webhookDeliveries : schemaMysql.webhookDeliveries;
  const now = new Date();
  const row = {
    id: `whd-${crypto.randomUUID()}`,
    webhookId,
    eventId: event.id,
    eventType: event.type,
    payload: JSON.stringify(event),
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
  };
  await db.insert(deliveries).values(row);
  return row;
}

const TASK_SUBJECT = /^domain\.(task|tasknote)\.[a-z_]+$/;

/** How long another process's webhook changes can take to reach this one's cache. */
export const ORG_CACHE_TTL_MS = 30_000;

export interface WebhookSink {
  /** For `setDomainEventSink`: queue deliveries for a published event. Never throws. */
  publish(subject: string, payload: unknown): void;
  /** The same work, awaitable - what `publish` runs, exposed for tests. */
  enqueue(subject: string, payload: unknown): Promise<number>;
  /** Forget which organizations have webhooks - call on any webhook change. */
  invalidate(): void;
}

/**
 * The webhook outbox sink (ADR-0030). For a `domain.task.*` or
 * `domain.tasknote.*` event it resolves the task's project and organization
 * and writes one delivery per active, matching webhook. Organizations with no
 * active webhook - nearly all events, nearly always - cost nothing beyond a set
 * lookup, refreshed every 30 s and on any change in this process.
 */
export function createWebhookSink(db: any, isStandalone: boolean, onError: (err: unknown, subject: string) => void, now: () => number = Date.now): WebhookSink {
  const webhooks = isStandalone ? schemaSqlite.webhooks : schemaMysql.webhooks;
  const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
  const projects = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
  let cache: { orgs: Set<string>; at: number } | null = null;

  async function activeOrgs(): Promise<Set<string>> {
    if (cache && now() - cache.at < ORG_CACHE_TTL_MS) return cache.orgs;
    const rows = await db.selectDistinct({ orgId: (webhooks as any).orgId }).from(webhooks).where(eq((webhooks as any).active, true));
    cache = { orgs: new Set(rows.map((r: any) => r.orgId)), at: now() };
    return cache.orgs;
  }

  async function enqueue(subject: string, payload: unknown): Promise<number> {
    if (!TASK_SUBJECT.test(subject)) return 0;
    const orgs = await activeOrgs();
    if (orgs.size === 0) return 0;

    const p = (payload ?? {}) as Record<string, any>;
    const taskId: string | undefined = p.taskId ?? (subject.startsWith("domain.task.") ? p.id : undefined);
    let projectId: string | undefined = p.projectId;
    if (!projectId && taskId) {
      const [task] = await db.select({ projectId: (tasks as any).projectId }).from(tasks).where(eq((tasks as any).id, taskId)).limit(1);
      projectId = task?.projectId;
    }
    if (!projectId) return 0; // a purged task's last event, with nothing left to place it
    const [project] = await db.select({ orgId: (projects as any).orgId }).from(projects).where(eq((projects as any).id, projectId)).limit(1);
    if (!project || !orgs.has(project.orgId)) return 0;

    const type = subject.slice("domain.".length);
    const candidates = await db.select().from(webhooks).where(and(
      eq((webhooks as any).orgId, project.orgId),
      eq((webhooks as any).active, true),
      or(isNull((webhooks as any).projectId), eq((webhooks as any).projectId, projectId)),
    ));
    const matching = candidates.filter((w: any) => filtersMatch(JSON.parse(w.events), type));
    const event: WebhookEventBody = {
      id: `evt-${crypto.randomUUID()}`,
      type,
      occurredAt: new Date(now()).toISOString(),
      orgId: project.orgId,
      projectId,
      data: payload,
    };
    for (const w of matching) await insertDelivery(db, isStandalone, w.id, event);
    return matching.length;
  }

  return {
    enqueue,
    publish(subject, payload) {
      if (!TASK_SUBJECT.test(subject)) return;
      enqueue(subject, payload).catch((err) => onError(err, subject));
    },
    invalidate() {
      cache = null;
    },
  };
}
