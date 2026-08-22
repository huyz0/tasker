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
 * Filtered to non-null email throughout - the same M13 local-account
 * bail-out `sendInviteEmail`'s own caller already applies, since a person
 * with no email configured has nowhere for this alert to go.
 */

export interface TaskAlertRecipient {
  email: string;
  name: string;
  /** Which tier resolved this recipient - every sent email states it. */
  reason: 'reviewer' | 'admin';
}

/** First occurrence wins - a person appearing twice (unexpected, since both
 * `task_reviewers` and `organization_members` are keyed so one row per
 * person per task/org) keeps whichever reason was recorded for them first. */
function dedupeByEmail(recipients: TaskAlertRecipient[]): TaskAlertRecipient[] {
  const seen = new Map<string, TaskAlertRecipient>();
  for (const r of recipients) {
    if (!seen.has(r.email)) seen.set(r.email, r);
  }
  return [...seen.values()];
}

export async function resolveTaskAlertRecipients(
  db: any,
  isStandalone: boolean,
  opts: { taskId: string; orgId: string },
): Promise<TaskAlertRecipient[]> {
  const schema = isStandalone ? schemaSqlite : schemaMysql;
  const { taskReviewers, organizationMembers, users } = schema as any;

  const reviewerRows = await db
    .select({ email: users.email, name: users.name })
    .from(taskReviewers)
    .innerJoin(users, eq(users.id, taskReviewers.userId))
    .where(eq(taskReviewers.taskId, opts.taskId));

  const reviewers = dedupeByEmail(
    reviewerRows
      .filter((r: any) => r.email)
      .map((r: any) => ({ email: r.email as string, name: (r.name as string | null) ?? (r.email as string), reason: 'reviewer' as const })),
  );
  if (reviewers.length > 0) return reviewers;

  const adminRows = await db
    .select({ email: users.email, name: users.name })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.orgId, opts.orgId), inArray(organizationMembers.role, ADMIN_ROLES)));

  return dedupeByEmail(
    adminRows
      .filter((r: any) => r.email)
      .map((r: any) => ({ email: r.email as string, name: (r.name as string | null) ?? (r.email as string), reason: 'admin' as const })),
  );
}
