/**
 * Shared primitives for the Reports module (M24-T05). The report is built by
 * sibling files - `exceptions.ts` (exception panels + orchestration) and
 * `scorecard.ts` (fleet scorecard + completion headline), with `trends.ts` to
 * follow in M24-T06 - and these are the constants and decode helpers they all
 * read. Only `reports.handler.ts` talks to the wire.
 */

/**
 * Every list is server-capped - like the Dashboard's PANEL_LIMIT, this is a
 * place to notice something, not to work through it. 10 rather than the
 * Dashboard's 8 because these cards are full-width tables, not sidebars.
 */
export const PANEL_LIMIT = 10;

/**
 * A claim with no signal for this long is stalled. Same 24h judgement as the
 * Dashboard's agent-liveness panel (its SILENT_AFTER_HOURS precedent): agents
 * work in minutes-to-hours; a silent day is a failure, not a pause.
 */
export const STALLED_AFTER_HOURS = 24;

/**
 * An unclaimed task younger than this is normal intake, not an exception.
 * The list itself is oldest-first - the threshold only filters the noise of
 * work created earlier today.
 */
export const UNCLAIMED_AFTER_HOURS = 24;

export const HOUR_MS = 3600_000;
export const DAY_MS = 24 * HOUR_MS;

// The activity columns carry no FK (the audit_log precedent), so a purged
// actor leaves dangling text and readers render these fallbacks.
export const DELETED_AGENT = "(deleted agent)";
export const DELETED_USER = "(deleted user)";

export const iso = (v: Date | null | undefined): string | undefined =>
  v instanceof Date ? v.toISOString() : undefined;

/**
 * `max(occurredAt)` and friends bypass drizzle's timestamp decoding, so the
 * value arrives as the stored integer - sqlite-**seconds**, not ms (the
 * dashboard.handler.ts gotcha: treating it as ms reported everything as 1970).
 */
export const fromSeconds = (v: unknown): Date | undefined =>
  v == null ? undefined : new Date(Number(v) * 1000);

/**
 * Assignee attribution for a completion row (ADR-0020): who HELD the task as
 * it completed, not who clicked. A completion with no assignee at all falls
 * back to the actor's kind - there is nobody else to credit. Shared by the
 * scorecard's completion headline and the trends' recent-completions strip.
 */
export const completionByAgent = (r: {
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  actorType: string;
}): boolean => (r.assigneeAgentId ? true : r.assigneeUserId ? false : r.actorType === "agent");
