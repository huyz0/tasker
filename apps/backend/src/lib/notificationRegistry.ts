import { randomUUID } from 'node:crypto';
import * as schemaMysql from '../db/schema.mysql';
import * as schemaSqlite from '../db/schema.sqlite';
import { logger } from './logger';

/**
 * How a domain event becomes an in-app notification (M29-T04).
 *
 * The point of this file is that `writeNotifications` below never learns what
 * a stalled claim is. A new notification type registers a renderer here and
 * reaches the bell without either the write path or the GUI component being
 * touched — which is M29's own exit criterion, not a stylistic preference.
 * If you find yourself adding `if (type === ...)` to either, the milestone
 * has failed its acceptance test.
 */

export interface NotificationRecipient {
  userId: string;
}

/** What a renderer produces. Stored as-is; the GUI displays it verbatim. */
export interface RenderedNotification {
  title: string;
  body: string;
  /**
   * Where clicking goes. Carries its own scope query string (ADR-0025), so a
   * notification opened from any screen lands in the right org and project.
   */
  targetPath: string | null;
  /**
   * Per-type idempotency key. Whatever makes "the same notification" for this
   * type — a redelivered event must collide rather than notify twice.
   */
  dedupeKey: string;
  orgId: string;
  projectId: string | null;
}

export type NotificationRenderer<P = any> = (payload: P) => RenderedNotification | null;

const registry = new Map<string, NotificationRenderer>();

/** Registered at module load; exported for tests to add their own types. */
export function registerNotificationType(type: string, render: NotificationRenderer): void {
  registry.set(type, render);
}

export function notificationTypes(): string[] {
  return [...registry.keys()];
}

/** Visible for tests that register a throwaway type and clean up after. */
export function unregisterNotificationType(type: string): void {
  registry.delete(type);
}

function scoped(path: string, orgId: string, projectId: string | null): string {
  const params = new URLSearchParams({ org: orgId });
  if (projectId) params.set('project', projectId);
  return `${path}?${params.toString()}`;
}

// ── Registered types ───────────────────────────────────────────────────────

export interface TaskStalledPayload {
  orgId: string;
  projectId: string;
  taskId: string;
  taskDisplayId?: string;
  taskTitle?: string;
  agentName?: string | null;
  hoursSilent: number;
  /** The claim anchor, which is what makes one stall distinct from the next. */
  anchorAt: number;
}

export const TASK_STALLED = 'task.stalled';

registerNotificationType(TASK_STALLED, (p: TaskStalledPayload): RenderedNotification => {
  const label = p.taskDisplayId ?? p.taskId;
  const title = p.taskTitle ? `${label} — ${p.taskTitle}` : label;
  const who = p.agentName ? `${p.agentName}'s claim` : 'The claim';
  return {
    title,
    body: `${who} has been silent for ${p.hoursSilent} ${p.hoursSilent === 1 ? 'hour' : 'hours'}.`,
    targetPath: scoped(`/tasks/${p.taskId}`, p.orgId, p.projectId),
    // Task plus claim anchor: a fresh claim that stalls again is a new
    // notification, the same rule `stalled_claim_alerts` dedupes on.
    dedupeKey: `${p.taskId}::${p.anchorAt}`,
    orgId: p.orgId,
    projectId: p.projectId,
  };
});

export interface WebhookDisabledPayload {
  orgId: string;
  webhookId: string;
  /** Host only - a URL's path or query can carry a token. */
  host: string;
  failures: number;
  disabledAt: string;
}

// M37 (ADR-0030): a webhook that kept failing was switched off; its org's
// admins are the ones who can fix the receiver and turn it back on.
registerNotificationType('webhook.disabled', (p: WebhookDisabledPayload) => ({
  title: `Webhook to ${p.host} disabled`,
  body: `Turned off after ${p.failures} consecutive failed deliveries. Fix the receiver, then re-enable it.`,
  targetPath: `/organizations?${new URLSearchParams({ section: 'webhooks', org: p.orgId }).toString()}`,
  dedupeKey: `${p.webhookId}::${p.disabledAt}`,
  orgId: p.orgId,
  projectId: null,
}));

export interface InputRequestedPayload {
  orgId: string;
  projectId: string;
  taskId: string;
  inputRequestId: string;
  taskDisplayId?: string;
  question: string;
  askedByName: string;
}

// M38 (ADR-0031): an agent stopped to ask a person something. The task's
// reviewers hear first, else its organization's owners and admins - the same
// people a stalled claim reaches.
registerNotificationType('task.input_requested', (p: InputRequestedPayload) => ({
  title: `${p.askedByName} asks on ${p.taskDisplayId ?? p.taskId}`,
  body: p.question.length > 280 ? `${p.question.slice(0, 279)}…` : p.question,
  targetPath: scoped(`/tasks/${p.taskId}`, p.orgId, p.projectId),
  dedupeKey: p.inputRequestId,
  orgId: p.orgId,
  projectId: p.projectId,
}));

export interface ApprovalRequestedPayload {
  orgId: string;
  projectId: string;
  taskId: string;
  approvalId: string;
  taskDisplayId?: string;
  fromStatus: string;
  toStatus: string;
  requestedByName: string;
}

// M39 (ADR-0032): an agent's move crossed a transition that needs a person's
// yes. Same recipients as an input request.
registerNotificationType('task.approval_requested', (p: ApprovalRequestedPayload) => ({
  title: `${p.requestedByName} asks to move ${p.taskDisplayId ?? p.taskId} to ${p.toStatus}`,
  body: `From "${p.fromStatus}" to "${p.toStatus}" - approve or reject it on the task.`,
  targetPath: scoped(`/tasks/${p.taskId}`, p.orgId, p.projectId),
  dedupeKey: p.approvalId,
  orgId: p.orgId,
  projectId: p.projectId,
}));

// ── The write path ─────────────────────────────────────────────────────────

/**
 * Persist one notification per recipient for `type`. Returns how many rows
 * were actually written — a collision on the dedupe index is expected and
 * silent, not an error.
 */
export async function writeNotifications(
  db: any,
  isStandalone: boolean,
  type: string,
  payload: unknown,
  recipients: NotificationRecipient[],
): Promise<number> {
  const render = registry.get(type);
  if (!render) {
    logger.error({ type }, 'notifications.unknown_type');
    return 0;
  }

  const rendered = render(payload);
  if (!rendered) return 0;

  const schema = isStandalone ? schemaSqlite : schemaMysql;
  let written = 0;

  for (const recipient of recipients) {
    try {
      await db.insert(schema.notifications).values({
        id: randomUUID(),
        userId: recipient.userId,
        orgId: rendered.orgId,
        projectId: rendered.projectId,
        type,
        title: rendered.title,
        body: rendered.body,
        targetPath: rendered.targetPath,
        dedupeKey: rendered.dedupeKey,
        createdAt: new Date(),
        readAt: null,
      });
      written++;
    } catch (err) {
      // The unique index doing its job is the common case here: the same
      // event reaching the same person twice. Logged at debug rather than
      // error so a redelivery does not read as a fault.
      logger.debug({ err, type, userId: recipient.userId }, 'notifications.write_skipped');
    }
  }

  return written;
}
