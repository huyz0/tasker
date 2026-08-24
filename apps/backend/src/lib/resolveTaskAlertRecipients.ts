import { and, eq, inArray } from 'drizzle-orm';
import * as schemaMysql from '../db/schema.mysql';
import * as schemaSqlite from '../db/schema.sqlite';
import { ADMIN_ROLES } from './authz';

/**
 * Two-tier recipient resolution for a stalled claim (M25-T04, ADR-0022
 * Decision 1): `task_reviewers` first; only when a task has none, the org's
 * `owner`/`admin` members. Rejected alternatives (an org-wide broadcast, a
 * reverse-resolved `can()` check, a third "commenters" tier) are recorded in
 * the ADR - this function is the one lever named there for adjusting the
 * fallback tier if it proves too broad or too narrow in practice.
 *
 * **Resolves people, not addresses (M29-T02).** M25 filtered this list to
 * non-null email throughout, on the reasoning that "a person with no email
 * configured has nowhere for this alert to go". That was true while email was
 * the only channel and false the moment a second one existed: M13 made email
 * optional deliberately, so the filter silently excluded every local-account
 * user from alerting. `email` is now returned as-is, nullable, and the email
 * channel skips the ones it cannot address.
 */

export interface TaskAlertRecipient {
  /** Stable identity, and the only field the in-app channel needs. */
  userId: string;
  /** Nullable by design - a local account need not have one (M13). */
  email: string | null;
  name: string;
  /** Which tier resolved this recipient - every sent email states it. */
  reason: 'reviewer' | 'admin';
}

/** First occurrence wins - a person appearing twice (unexpected, since both
 * `task_reviewers` and `organization_members` are keyed so one row per
 * person per task/org) keeps whichever reason was recorded for them first.
 * Keyed on `userId` rather than email since M29-T02: two email-less users
 * both deduped to `null` under the old key and one of them vanished. */
function dedupeByUser(recipients: TaskAlertRecipient[]): TaskAlertRecipient[] {
  const seen = new Map<string, TaskAlertRecipient>();
  for (const r of recipients) {
    if (!seen.has(r.userId)) seen.set(r.userId, r);
  }
  return [...seen.values()];
}

/** A person with neither name nor email still has to render as something. */
function displayName(name: string | null, email: string | null, userId: string): string {
  return name ?? email ?? userId;
}

export async function resolveTaskAlertRecipients(
  db: any,
  isStandalone: boolean,
  opts: { taskId: string; orgId: string },
): Promise<TaskAlertRecipient[]> {
  const schema = isStandalone ? schemaSqlite : schemaMysql;
  const { taskReviewers, organizationMembers, users } = schema as any;

  const reviewerRows = await db
    .select({ userId: users.id, email: users.email, name: users.name })
    .from(taskReviewers)
    .innerJoin(users, eq(users.id, taskReviewers.userId))
    .where(eq(taskReviewers.taskId, opts.taskId));

  const reviewers = dedupeByUser(
    reviewerRows.map((r: any) => ({
      userId: r.userId as string,
      email: (r.email as string | null) ?? null,
      name: displayName(r.name as string | null, r.email as string | null, r.userId as string),
      reason: 'reviewer' as const,
    })),
  );
  // The tier decision is "does this task have reviewers", not "does it have
  // reviewers we can email". Testing the filtered list, as this did before
  // M29-T02, routed a task whose only reviewer had no email to every org
  // owner/admin instead - both a missed notification and a disclosure to
  // people Decision 1 says should not receive it.
  if (reviewers.length > 0) return reviewers;

  const adminRows = await db
    .select({ userId: users.id, email: users.email, name: users.name })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.orgId, opts.orgId), inArray(organizationMembers.role, ADMIN_ROLES)));

  return dedupeByUser(
    adminRows.map((r: any) => ({
      userId: r.userId as string,
      email: (r.email as string | null) ?? null,
      name: displayName(r.name as string | null, r.email as string | null, r.userId as string),
      reason: 'admin' as const,
    })),
  );
}
