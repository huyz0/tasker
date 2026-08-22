import { and, desc, eq, gte, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import * as schema from "../../db/schema.sqlite";
import { notDeleted } from "../../db/query-builder";
import { isTerminalStatus } from "../tasks/taskActivity";
import { findStalledCandidates } from "../../lib/stalledClaims";
import {
  PANEL_LIMIT, STALLED_AFTER_HOURS, UNCLAIMED_AFTER_HOURS, HOUR_MS, DAY_MS,
  DELETED_AGENT, DELETED_USER, iso, fromSeconds,
} from "./common";
import { buildScorecard, buildCompletionHeadline } from "./scorecard";

/**
 * The exception panels of the Reports screen (M24-T05), assembled into one
 * GetReportExceptionsResponse. Every panel reads the `task_activity` history
 * table (ADR-0020) that the task, note and comment handlers write
 * synchronously; nothing here recomputes history from live rows except where
 * the question is genuinely live (a task's *current* terminality, the
 * *current* claim). Authorization, validation and tenancy resolution all
 * happened in `reports.handler.ts` before this runs.
 */
export async function buildReportExceptions(
  db: any,
  isStandalone: boolean,
  args: { projectId: string; orgId: string; windowDays: number },
) {
  const { tasks, taskAssignments, taskActivity, taskStatuses, agents, users } = schema;
  const { projectId, orgId, windowDays } = args;

  // One clock for the whole request - every window boundary and threshold
  // derives from it, so no panel disagrees with another about "now".
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * DAY_MS);
  const priorStart = new Date(now.getTime() - 2 * windowDays * DAY_MS);
  const unclaimedBefore = new Date(now.getTime() - UNCLAIMED_AFTER_HOURS * HOUR_MS);

  // ── current-terminality, batched ──────────────────────────────────────────
  // Live classification (stalled / unclaimed / openNow) needs "is this task's
  // CURRENT status terminal?". The type's status lists are loaded once per
  // request and fed to isTerminalStatus as preloadedStatuses, so the per-task
  // check is a lookup, never a query.
  const typeIdRows = await db
    .selectDistinct({ taskTypeId: tasks.taskTypeId })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), notDeleted(tasks), isNotNull(tasks.taskTypeId)));
  const typeIds: string[] = typeIdRows.map((r: any) => r.taskTypeId).filter(Boolean);
  const statusesByType = new Map<string, any[]>(typeIds.map((id) => [id, []]));
  if (typeIds.length > 0) {
    const statusRows = await db.select().from(taskStatuses).where(inArray(taskStatuses.taskTypeId, typeIds));
    for (const s of statusRows) statusesByType.get(s.taskTypeId)?.push(s);
  }
  const isTerminalNow = (taskTypeId: string | null, status: string): Promise<boolean> =>
    // With preloadedStatuses supplied this never queries; the untyped (null)
    // path is a pure `status === 'done'` check inside the helper.
    isTerminalStatus(db, isStandalone, taskTypeId, status, taskTypeId ? statusesByType.get(taskTypeId) ?? [] : undefined);

  // ── agent-held open tasks (openNow, for the scorecard) ───────────────────
  const heldRows = await db
    .select({
      id: tasks.id,
      displayId: tasks.displayId,
      title: tasks.title,
      status: tasks.status,
      taskTypeId: tasks.taskTypeId,
      createdAt: tasks.createdAt,
      agentId: taskAssignments.agentId,
    })
    .from(tasks)
    .innerJoin(taskAssignments, eq(taskAssignments.taskId, tasks.id))
    .where(and(eq(tasks.projectId, projectId), notDeleted(tasks), isNotNull(taskAssignments.agentId)));

  const openHeld: any[] = [];
  for (const t of heldRows) {
    if (!(await isTerminalNow(t.taskTypeId ?? null, t.status))) openHeld.push(t);
  }

  // ── stalled claims ────────────────────────────────────────────────────────
  // M25-T03 (ADR-0022): shared with the M25-T04 alert sweep rather than
  // recomputed here - this call is project-scoped and PANEL_LIMIT-capped,
  // same as the inline computation it replaces.
  const stalledCandidates = await findStalledCandidates(db, isStandalone, {
    projectId, limit: PANEL_LIMIT, afterHours: STALLED_AFTER_HOURS,
  });

  // ── unclaimed ─────────────────────────────────────────────────────────────
  const unheldRows = await db
    .select({
      id: tasks.id,
      displayId: tasks.displayId,
      title: tasks.title,
      status: tasks.status,
      taskTypeId: tasks.taskTypeId,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .leftJoin(taskAssignments, eq(taskAssignments.taskId, tasks.id))
    .where(and(eq(tasks.projectId, projectId), notDeleted(tasks), isNull(taskAssignments.id)));

  const openUnheld: any[] = [];
  for (const t of unheldRows) {
    if (!(await isTerminalNow(t.taskTypeId ?? null, t.status))) openUnheld.push(t);
  }

  // Grouped over the project's `unassigned` rows (the (project_id, kind,
  // occurred_at) index shape) rather than an IN-list of every open unheld
  // task: at the 50k-task scale target that list is tens of thousands of
  // parameters, and unassignments are far rarer than unclaimed tasks
  // (M24-T06's measurement found this the hard way).
  const lastUnassignedByTask = new Map<string, Date>();
  if (openUnheld.length > 0) {
    const rows = await db
      .select({ taskId: taskActivity.taskId, lastAt: sql<number | null>`max(${taskActivity.occurredAt})` })
      .from(taskActivity)
      .where(and(eq(taskActivity.projectId, projectId), eq(taskActivity.kind, "unassigned")))
      .groupBy(taskActivity.taskId);
    for (const r of rows) {
      const at = fromSeconds(r.lastAt);
      if (at) lastUnassignedByTask.set(r.taskId, at);
    }
  }

  const unclaimed = openUnheld
    .map((t) => ({ t, waitingSince: lastUnassignedByTask.get(t.id) ?? (t.createdAt as Date) }))
    .filter((c) => c.waitingSince < unclaimedBefore)
    // Oldest-waiting first - the list IS the priority order.
    .sort((a, b) => a.waitingSince.getTime() - b.waitingSince.getTime())
    .slice(0, PANEL_LIMIT);

  // ── regressions (panel: newest first, capped) ─────────────────────────────
  const regressionPanelRows = await db
    .select({
      activityId: taskActivity.id,
      taskId: taskActivity.taskId,
      fromStatus: taskActivity.fromStatus,
      toStatus: taskActivity.toStatus,
      occurredAt: taskActivity.occurredAt,
      actorType: taskActivity.actorType,
      actorId: taskActivity.actorId,
      assigneeAgentId: taskActivity.assigneeAgentId,
      taskDisplayId: tasks.displayId,
      taskTitle: tasks.title,
    })
    .from(taskActivity)
    .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
    .where(and(
      eq(taskActivity.projectId, projectId),
      eq(taskActivity.kind, "status_changed"),
      eq(taskActivity.fromIsTerminal, true),
      eq(taskActivity.toIsTerminal, false),
      gte(taskActivity.occurredAt, windowStart),
      notDeleted(tasks),
    ))
    .orderBy(desc(taskActivity.occurredAt), desc(taskActivity.id))
    .limit(PANEL_LIMIT);

  // ── churning ──────────────────────────────────────────────────────────────
  const churnAgg = await db
    .select({
      taskId: taskActivity.taskId,
      taskDisplayId: tasks.displayId,
      taskTitle: tasks.title,
      handoffCount: sql<number>`count(*)`,
      lastAt: sql<number>`max(${taskActivity.occurredAt})`,
    })
    .from(taskActivity)
    .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
    .where(and(
      eq(taskActivity.projectId, projectId),
      eq(taskActivity.kind, "handoff"),
      gte(taskActivity.occurredAt, windowStart),
      notDeleted(tasks),
    ))
    .groupBy(taskActivity.taskId, tasks.displayId, tasks.title)
    .having(sql`count(*) >= 2`)
    .orderBy(desc(sql`count(*)`), desc(sql`max(${taskActivity.occurredAt})`))
    .limit(PANEL_LIMIT);

  // Latest handoff row per churning task: at most PANEL_LIMIT single-row
  // seeks over the (task_id, occurred_at) index. `id` is only a
  // *deterministic* tiebreak, not a chronological one - ids are random
  // UUIDs, and within one sqlite-second the true order is unrecorded.
  const lastHandoffByTask = new Map<string, { actorId: string | null }>();
  for (const c of churnAgg) {
    const rows = await db
      .select({ actorId: taskActivity.actorId })
      .from(taskActivity)
      .where(and(eq(taskActivity.taskId, c.taskId), eq(taskActivity.kind, "handoff")))
      .orderBy(desc(taskActivity.occurredAt), desc(taskActivity.id))
      .limit(1);
    lastHandoffByTask.set(c.taskId, { actorId: rows[0]?.actorId ?? null });
  }

  // "claim held" = an agent still holds the task, so no other agent can
  // pick it up (agents cannot self-unassign; releasing takes a human).
  const claimHeldByTask = new Map<string, boolean>();
  if (churnAgg.length > 0) {
    const rows = await db
      .select({ taskId: taskAssignments.taskId })
      .from(taskAssignments)
      .where(and(inArray(taskAssignments.taskId, churnAgg.map((c: any) => c.taskId)), isNotNull(taskAssignments.agentId)));
    for (const r of rows) claimHeldByTask.set(r.taskId, true);
  }

  // ── fleet scorecard + completion headline ────────────────────────────────
  // The org's agents, archived included so history still renders a real name;
  // shared between the scorecard's subjects and the panels' name resolution.
  const orgAgents = await db
    .select({ id: agents.id, name: agents.name, agentRoleId: agents.agentRoleId, deletedAt: agents.deletedAt })
    .from(agents)
    .where(eq(agents.orgId, orgId));
  const agentById = new Map<string, any>(orgAgents.map((a: any) => [a.id, a]));

  const [{ agentRows, roleRows }, headline] = await Promise.all([
    buildScorecard(db, { projectId, windowStart, orgAgents, openHeld }),
    buildCompletionHeadline(db, { projectId, windowStart, priorStart }),
  ]);

  // ── name resolution for the exception panels ─────────────────────────────
  const neededUserIds = [...new Set(
    regressionPanelRows.filter((r: any) => r.actorType === "user" && r.actorId).map((r: any) => r.actorId as string),
  )];
  const userNameById = new Map<string, string>();
  if (neededUserIds.length > 0) {
    const rows = await db
      .select({ id: users.id, name: users.name, username: users.username, email: users.email })
      .from(users)
      .where(inArray(users.id, neededUserIds));
    for (const u of rows) userNameById.set(u.id, u.name ?? u.username ?? u.email ?? DELETED_USER);
  }
  const agentName = (id: string | null | undefined): string =>
    (id && agentById.get(id)?.name) || DELETED_AGENT;

  return {
    // Field names carried over 1:1 from the pre-extraction inline shape;
    // `agentName` is resolved through this handler's own `agentById` map
    // (below) rather than the candidate's own `agentName`, so a purged agent
    // still falls back to the same DELETED_AGENT text every other panel uses.
    stalledClaims: stalledCandidates.map((c) => ({
      taskId: c.taskId,
      taskDisplayId: c.taskDisplayId,
      taskTitle: c.taskTitle,
      status: c.status,
      agentId: c.agentId,
      agentName: agentName(c.agentId),
      claimedAt: iso(c.claimedAt),
      lastSignalAt: iso(c.lastSignalAt),
      agentLastSeenAt: iso(c.agentLastSeenAt),
      neverStarted: c.neverStarted,
    })),
    unclaimed: unclaimed.map((c) => ({
      taskId: c.t.id,
      taskDisplayId: c.t.displayId,
      taskTitle: c.t.title,
      status: c.t.status,
      waitingSince: iso(c.waitingSince) ?? "",
    })),
    regressions: regressionPanelRows.map((r: any) => ({
      taskId: r.taskId,
      taskDisplayId: r.taskDisplayId,
      taskTitle: r.taskTitle,
      fromStatus: r.fromStatus ?? "",
      toStatus: r.toStatus ?? "",
      occurredAt: iso(r.occurredAt) ?? "",
      actorType: r.actorType,
      actorName: r.actorType === "user"
        ? (r.actorId ? userNameById.get(r.actorId) ?? DELETED_USER : DELETED_USER)
        : agentName(r.actorId),
      holderAgentId: r.assigneeAgentId ?? undefined,
      holderAgentName: r.assigneeAgentId ? agentName(r.assigneeAgentId) : undefined,
    })),
    churning: churnAgg.map((c: any) => ({
      taskId: c.taskId,
      taskDisplayId: c.taskDisplayId,
      taskTitle: c.taskTitle,
      handoffCount: BigInt(Number(c.handoffCount)),
      lastAgentId: lastHandoffByTask.get(c.taskId)?.actorId ?? "",
      lastAgentName: agentName(lastHandoffByTask.get(c.taskId)?.actorId),
      lastHandoffAt: iso(fromSeconds(c.lastAt)) ?? "",
      claimHeld: claimHeldByTask.get(c.taskId) ?? false,
    })),
    agentRows,
    roleRows,
    ...headline,
  };
}
