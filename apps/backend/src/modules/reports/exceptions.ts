import { and, desc, eq, gte, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import * as schema from "../../db/schema.sqlite";
import { notDeleted } from "../../db/query-builder";
import { isTerminalStatus } from "../tasks/taskActivity";
import {
  PANEL_LIMIT, STALLED_AFTER_HOURS, UNCLAIMED_AFTER_HOURS, HOUR_MS, DAY_MS,
  DELETED_AGENT, DELETED_USER, iso, fromSeconds, maxDate,
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
  const { tasks, taskAssignments, taskActivity, taskStatuses, agents, users, apiTokens } = schema;
  const { projectId, orgId, windowDays } = args;

  // One clock for the whole request - every window boundary and threshold
  // derives from it, so no panel disagrees with another about "now".
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * DAY_MS);
  const priorStart = new Date(now.getTime() - 2 * windowDays * DAY_MS);
  const stalledBefore = new Date(now.getTime() - STALLED_AFTER_HOURS * HOUR_MS);
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

  // ── agent-held open tasks (stalled claims + openNow) ─────────────────────
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

  // Per-task signal times, one grouped query over the (task_id, occurred_at)
  // index. Grouped by kind as well so one pass yields the last signal, the
  // claim time and the claim/assign anchor.
  const heldIds = openHeld.map((t) => t.id);
  const lastByTaskKind = new Map<string, Map<string, Date>>();
  if (heldIds.length > 0) {
    const rows = await db
      .select({
        taskId: taskActivity.taskId,
        kind: taskActivity.kind,
        lastAt: sql<number | null>`max(${taskActivity.occurredAt})`,
      })
      .from(taskActivity)
      .where(inArray(taskActivity.taskId, heldIds))
      .groupBy(taskActivity.taskId, taskActivity.kind);
    for (const r of rows) {
      const at = fromSeconds(r.lastAt);
      if (!at) continue;
      if (!lastByTaskKind.has(r.taskId)) lastByTaskKind.set(r.taskId, new Map());
      lastByTaskKind.get(r.taskId)!.set(r.kind, at);
    }
  }

  const stalledCandidates = openHeld
    .map((t) => {
      const byKind = lastByTaskKind.get(t.id) ?? new Map<string, Date>();
      // Last signal: the latest activity row from ANY actor except the
      // 'created' row - a human comment also proves the task isn't silent.
      let lastSignalAt: Date | undefined;
      for (const [kind, at] of byKind) {
        if (kind === "created") continue;
        if (!lastSignalAt || at > lastSignalAt) lastSignalAt = at;
      }
      const claimedAt = byKind.get("claimed");
      // The hold anchor: the moment the agent last took (or was given) the
      // task. "Never started" means nothing happened after that moment -
      // the claim itself is possession, not work.
      const anchorAt = maxDate(byKind.get("claimed"), byKind.get("assigned"));
      // Claims predating activity collection have no rows at all; the task's
      // own createdAt is the honest fallback silence anchor.
      const silentSince = lastSignalAt ?? claimedAt ?? t.createdAt;
      const neverStarted = anchorAt ? !lastSignalAt || lastSignalAt <= anchorAt : !lastSignalAt;
      return { t, lastSignalAt, claimedAt, silentSince, neverStarted };
    })
    .filter((c) => c.silentSince < stalledBefore)
    // Most-silent first.
    .sort((a, b) => a.silentSince.getTime() - b.silentSince.getTime())
    .slice(0, PANEL_LIMIT);

  // Per-agent liveness for the stalled rows: max(lastUsedAt) across the
  // agent's unrevoked tokens, same join and same seconds-decode as the
  // dashboard's agent panel.
  const stalledAgentIds = [...new Set(stalledCandidates.map((c) => c.t.agentId as string))];
  const lastSeenByAgent = new Map<string, Date>();
  if (stalledAgentIds.length > 0) {
    const rows = await db
      .select({ agentId: apiTokens.agentId, lastUsedAt: sql<number | null>`max(${apiTokens.lastUsedAt})` })
      .from(apiTokens)
      .where(and(inArray(apiTokens.agentId, stalledAgentIds), isNull(apiTokens.revokedAt)))
      .groupBy(apiTokens.agentId);
    for (const r of rows) {
      const at = fromSeconds(r.lastUsedAt);
      if (at) lastSeenByAgent.set(r.agentId, at);
    }
  }

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
    stalledClaims: stalledCandidates.map((c) => ({
      taskId: c.t.id,
      taskDisplayId: c.t.displayId,
      taskTitle: c.t.title,
      status: c.t.status,
      agentId: c.t.agentId,
      agentName: agentName(c.t.agentId),
      claimedAt: iso(c.claimedAt),
      lastSignalAt: iso(c.lastSignalAt),
      agentLastSeenAt: iso(lastSeenByAgent.get(c.t.agentId)),
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
