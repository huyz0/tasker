import { eq } from "drizzle-orm";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { logger } from "../../lib/logger";
import type { Principal } from "../auth/session";

/**
 * M24-T04 (ADR-0020): the one write path for `task_activity` - a first-class
 * history table written synchronously by the task, task-note and comment
 * handlers, immediately AFTER each mutation's own success/CAS check.
 *
 * Two rules every call site follows:
 * - The activity insert never runs before the primary write has been
 *   confirmed (a lost CAS, a lost claim, a duplicate no-op all write
 *   nothing).
 * - The activity insert never fails the mutation. The write is not
 *   transactional with the primary statement (this codebase's handlers issue
 *   sequential awaited statements - see ADR-0020's "accepted drift"), so a
 *   failure here is logged and swallowed: the table powers charts, never
 *   task correctness.
 */

type TaskActivityKind =
  | "created"
  | "status_changed"
  | "claimed"
  | "assigned"
  | "unassigned"
  | "archived"
  | "restored"
  | "note"
  | "comment"
  | "handoff";

export interface TaskActivityEntry {
  taskId: string;
  projectId: string;
  kind: TaskActivityKind;
  fromStatus?: string | null;
  toStatus?: string | null;
  fromIsTerminal?: boolean;
  toIsTerminal?: boolean;
  // 'system' is reserved for the backfill/retention paths (T07) - no live
  // handler stamps it; live writes always carry the request principal.
  actorType: "user" | "agent" | "system";
  actorId: string | null;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
}

/**
 * The actor columns for a request principal. Attribution is a property of
 * the credential, never of the request body (security-standard §2 /
 * ADR-0008) - call sites derive it from the authenticated principal only.
 */
export function actorFromPrincipal(principal: Principal): { actorType: "user" | "agent"; actorId: string } {
  return principal.kind === "user"
    ? { actorType: "user", actorId: principal.userId }
    : { actorType: "agent", actorId: principal.agentId };
}

/**
 * Whether `status` is terminal for a task of the given type, per ADR-0020:
 * a status is terminal when its `position` equals the type's maximum
 * position (ties: every status sharing the max is terminal - `position` has
 * no uniqueness constraint). Untyped tasks - and types with no statuses
 * configured, which fall back to the fixed todo/in-progress/done enum
 * exactly like validateStatusForTaskType does - use `status === 'done'`.
 *
 * One query per call; this is the mutation path, at human/agent rate.
 * `preloadedStatuses` lets a caller that already has the type's status list
 * skip that query.
 */
export async function isTerminalStatus(
  db: any,
  isStandalone: boolean,
  taskTypeId: string | null,
  status: string,
  preloadedStatuses?: any[],
): Promise<boolean> {
  if (!taskTypeId) return status === "done";

  const statusesTable = isStandalone ? schemaSqlite.taskStatuses : schemaMysql.taskStatuses;
  const configured = preloadedStatuses
    ?? await db.select().from(statusesTable).where(eq((statusesTable as any).taskTypeId, taskTypeId));
  if (configured.length === 0) return status === "done";

  const row = configured.find((s: any) => s.name === status);
  if (!row) return false; // A status that predates the type's state machine is never terminal.
  const maxPosition = configured.reduce((max: number, s: any) => Math.max(max, Number(s.position ?? 0)), 0);
  return Number(row.position ?? 0) === maxPosition;
}

/**
 * The task's current assignment (XOR agent/user, like task_assignments), for
 * stamping assignee-at-event on rows that don't themselves change the
 * assignment (status changes, notes, comments). Events that DO change it
 * (claimed/assigned/unassigned) pass the holder explicitly from the call
 * site instead - re-querying after the mutation would read the wrong side
 * of the event.
 *
 * A task can technically carry several assignment rows; the first is taken -
 * the reports attribute to "the" holder, and multi-assignment has no defined
 * ordering anywhere else in this codebase either.
 */
export async function currentAssignee(
  db: any,
  isStandalone: boolean,
  taskId: string,
): Promise<{ assigneeAgentId: string | null; assigneeUserId: string | null }> {
  const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;
  const rows = await db.select().from(assignments).where(eq((assignments as any).taskId, taskId)).limit(1);
  if (!rows || rows.length === 0) return { assigneeAgentId: null, assigneeUserId: null };
  return { assigneeAgentId: rows[0].agentId ?? null, assigneeUserId: rows[0].userId ?? null };
}

/**
 * Inserts one activity row. MUST be called only after the primary write's
 * success check. Never throws: a failed insert is logged
 * (`task_activity.write_failed`) and swallowed so the mutation the caller
 * already committed still succeeds - ADR-0020's accepted drift, tested
 * deliberately in taskActivity.test.ts.
 */
export async function recordTaskActivity(db: any, isStandalone: boolean, entry: TaskActivityEntry): Promise<void> {
  try {
    const table = isStandalone ? schemaSqlite.taskActivity : schemaMysql.taskActivity;
    await db.insert(table).values({
      id: `act-${crypto.randomUUID()}`,
      taskId: entry.taskId,
      projectId: entry.projectId,
      kind: entry.kind,
      fromStatus: entry.fromStatus ?? null,
      toStatus: entry.toStatus ?? null,
      fromIsTerminal: entry.fromIsTerminal ?? false,
      toIsTerminal: entry.toIsTerminal ?? false,
      actorType: entry.actorType,
      actorId: entry.actorId,
      assigneeAgentId: entry.assigneeAgentId ?? null,
      assigneeUserId: entry.assigneeUserId ?? null,
      occurredAt: new Date(),
    });
  } catch (err) {
    logger.error({ err, taskId: entry.taskId, kind: entry.kind }, "task_activity.write_failed");
  }
}
