import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import * as schemaMysql from '../db/schema.mysql';
import * as schemaSqlite from '../db/schema.sqlite';
import { logger } from './logger';
import type { Mailer } from './mailer';
import { publishDomainEvent } from './natsCorrelation';
import { DELETED_AGENT, HOUR_MS, STALLED_AFTER_HOURS } from '../modules/reports/common';
import { findStalledCandidates, type StalledClaimCandidate } from './stalledClaims';
import { resolveTaskAlertRecipients, type TaskAlertRecipient } from './resolveTaskAlertRecipients';
import { renderStalledClaimAlertEmail } from './stalledClaimAlertEmail';

/**
 * The stalled-claim alert sweep (M25-T04, ADR-0022). Reuses M25-T03's shared
 * detector rather than reimplementing it, groups newly-stalled candidates by
 * resolved recipient (Decision 2: one digest per recipient per sweep, never
 * one email per task - the first-run-floods-everyone failure mode ADR-0022
 * names as the most likely way this feature gets disabled on day one), and
 * dedupes against `stalled_claim_alerts` keyed on the claim's own anchor
 * (Decision 3), not the wider silence clock.
 */

/** Per-recipient cap; overflow stays eligible for a later sweep (Decision 2) - only what a digest actually itemizes is ever marked alerted. */
export const DIGEST_TASK_LIMIT = 20;

/**
 * Read lazily, exactly like `authz.ts`'s `isStandalone()`: freezing this at
 * module load would capture whatever `STALLED_ALERT_AFTER_HOURS` held at
 * import time, not what a test (or a deployment) sets afterward. Defaults to
 * the report panel's own `STALLED_AFTER_HOURS` (ADR-0022 Decision 5) - the
 * two are deliberately independent knobs, not the same value read twice.
 */
function getStalledAlertAfterHours(): number {
  return Number(process.env.STALLED_ALERT_AFTER_HOURS) || STALLED_AFTER_HOURS;
}

function alertKey(taskId: string, anchorAt: Date): string {
  return `${taskId}::${anchorAt.getTime()}`;
}

function hoursSilent(candidate: StalledClaimCandidate, now: number): number {
  return Math.floor((now - candidate.silentSince.getTime()) / HOUR_MS);
}

interface RecipientGroup {
  name: string;
  /** Recorded from whichever candidate first resolved this recipient this
   * sweep. A person could in principle be a reviewer for one task and an
   * admin-fallback recipient for another inside the same digest; the email
   * template takes one reason for the whole digest (matching its own input
   * shape), so the first resolution wins rather than trying to represent a
   * mixed reason - a corner case rare enough not to warrant a richer shape. */
  reason: 'reviewer' | 'admin';
  candidates: StalledClaimCandidate[];
}

export async function runStalledClaimAlertSweep(
  db: any,
  isStandalone: boolean,
  mailer: Mailer,
  nc: { publish: (subject: string, data?: any) => void } | null,
): Promise<void> {
  // Decision 5: the common no-SMTP deployment pays nothing for a scan whose
  // result would be discarded anyway - checked before any query runs.
  if (!mailer.enabled) return;

  const schema = isStandalone ? schemaSqlite : schemaMysql;

  const candidates = await findStalledCandidates(db, isStandalone, { afterHours: getStalledAlertAfterHours() });
  if (candidates.length === 0) return;

  // Dedup against what has already been alerted for each task's CURRENT
  // claim anchor - a fresh claim (a new anchorAt) is eligible again even if
  // an earlier claim on the same task was already alerted.
  const taskIds = [...new Set(candidates.map((c) => c.taskId))];
  const existingAlerts = await db
    .select({ taskId: schema.stalledClaimAlerts.taskId, anchorAt: schema.stalledClaimAlerts.anchorAt })
    .from(schema.stalledClaimAlerts)
    .where(inArray(schema.stalledClaimAlerts.taskId, taskIds));
  const alreadyAlerted = new Set(existingAlerts.map((r: any) => alertKey(r.taskId, r.anchorAt as Date)));
  const unalerted = candidates.filter((c) => !alreadyAlerted.has(alertKey(c.taskId, c.anchorAt)));
  if (unalerted.length === 0) return;

  // Group by resolved recipient email. A task can land in more than one
  // recipient's digest (multiple task_reviewers rows); a candidate that
  // resolves to nobody is simply not notified for - not an error.
  const groups = new Map<string, RecipientGroup>();
  for (const candidate of unalerted) {
    let recipients: TaskAlertRecipient[];
    try {
      recipients = await resolveTaskAlertRecipients(db, isStandalone, { taskId: candidate.taskId, orgId: candidate.orgId });
    } catch (err) {
      logger.error({ err, taskId: candidate.taskId }, 'stalled_claim_alerts.recipient_resolution_failed');
      continue;
    }
    for (const recipient of recipients) {
      let group = groups.get(recipient.email);
      if (!group) {
        group = { name: recipient.name, reason: recipient.reason, candidates: [] };
        groups.set(recipient.email, group);
      }
      group.candidates.push(candidate);
    }
  }

  const orgNameCache = new Map<string, string>();
  async function resolveOrgName(orgId: string): Promise<string> {
    const cached = orgNameCache.get(orgId);
    if (cached) return cached;
    const rows = await db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1);
    const name = rows[0]?.name ?? 'your organization';
    orgNameCache.set(orgId, name);
    return name;
  }

  const now = Date.now();

  for (const [email, group] of groups) {
    // Per-recipient isolation (mirrors retentionSweep.ts's per-row
    // isolation): one recipient's failure must not stop the rest of the sweep.
    try {
      // Most-silent-first - the same convention the report panel itself sorts
      // by, and the priority order the digest implicitly communicates.
      const sorted = [...group.candidates].sort((a, b) => a.silentSince.getTime() - b.silentSince.getTime());
      const itemized = sorted.slice(0, DIGEST_TASK_LIMIT);
      const overflowCount = Math.max(0, sorted.length - DIGEST_TASK_LIMIT);

      const orgName = await resolveOrgName(itemized[0]!.orgId);
      const rendered = renderStalledClaimAlertEmail({
        recipientName: group.name,
        reason: group.reason,
        orgName,
        tasks: itemized.map((c) => ({
          taskDisplayId: c.taskDisplayId,
          taskTitle: c.taskTitle,
          agentName: c.agentName ?? DELETED_AGENT,
          neverStarted: c.neverStarted,
          hoursSilent: hoursSilent(c, now),
          taskUrl: `${mailer.appUrl}/tasks/${c.taskId}`,
        })),
        overflowCount,
        appUrl: mailer.appUrl,
      });

      const outcome = await mailer.send({ to: email, subject: rendered.subject, text: rendered.text, html: rendered.html });
      // Only a task actually itemized in a SENT digest is ever recorded as
      // alerted or published - overflow stays eligible, and a 'skipped'/
      // 'failed' send must not mark anything (Decision 2).
      if (outcome !== 'sent') continue;

      for (const c of itemized) {
        try {
          await db.insert(schema.stalledClaimAlerts).values({
            id: randomUUID(),
            taskId: c.taskId,
            anchorAt: c.anchorAt,
            alertedAt: new Date(),
          });
        } catch (err) {
          logger.error({ err, taskId: c.taskId }, 'stalled_claim_alerts.record_failed');
        }

        try {
          // Decision 4: publish now, with an explicit orgId (left untouched by
          // the correlation Proxy precisely because it is present), and the
          // claimed agent as `stalledAgentId` - never `agentId`, which
          // `auditProjector.ts`'s `extractActor` would read first and
          // misattribute this to the agent instead of 'system'.
          publishDomainEvent(nc, 'domain.task.stalled', {
            orgId: c.orgId,
            projectId: c.projectId,
            taskId: c.taskId,
            stalledAgentId: c.agentId,
            hoursSilent: hoursSilent(c, now),
          });
        } catch (err) {
          logger.error({ err, taskId: c.taskId }, 'stalled_claim_alerts.publish_failed');
        }
      }
    } catch (err) {
      logger.error({ err, email }, 'stalled_claim_alerts.recipient_group_failed');
    }
  }
}
