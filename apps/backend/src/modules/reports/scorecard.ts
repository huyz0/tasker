import { and, eq, gte, inArray, sql } from "drizzle-orm";
import * as schema from "../../db/schema.sqlite";
import { PANEL_LIMIT, DELETED_AGENT, completionByAgent, fromSeconds, iso } from "./common";

/**
 * The fleet scorecard half of the exceptions report (M24-T05): per-agent and
 * per-role outcome rows over one window of `task_activity`, plus the
 * completion headline counts. Pure aggregation - authorization, validation
 * and tenancy all happened in `reports.handler.ts` before anything here runs.
 */

interface Score {
  claimed: number;
  completed: number;
  reopened: number;
  handedOff: number;
  takenAway: number;
  autonomousCompleted: number;
  openNow: number;
  lastActiveAt: Date | undefined;
}

const toScorecardRow = (subjectId: string, subjectName: string, score: Score) => ({
  subjectId,
  subjectName,
  claimed: BigInt(score.claimed),
  completed: BigInt(score.completed),
  reopened: BigInt(score.reopened),
  handedOff: BigInt(score.handedOff),
  takenAway: BigInt(score.takenAway),
  autonomousCompleted: BigInt(score.autonomousCompleted),
  openNow: BigInt(score.openNow),
  lastActiveAt: iso(score.lastActiveAt),
});

// Deterministic order for a capped list: the busiest outcomes first.
const byOutcome = (a: { name: string; score: Score }, b: { name: string; score: Score }) =>
  b.score.completed - a.score.completed
  || b.score.claimed - a.score.claimed
  || String(a.name).localeCompare(String(b.name));

/**
 * Every scorecard column is a JS aggregation over one window-bounded fetch.
 * The kind list names exactly what the scorecard reads row-by-row; it also
 * keeps the query on the (project_id, kind, occurred_at) index shape the T03
 * gate already covers. archived/restored are deliberately absent - they are
 * bin administration, not fleet work. `created` is absent too, but for cost,
 * not meaning (M24-T06): creations are the largest kind in the table and the
 * scorecard needs nothing from them row-by-row - their only contribution
 * (an agent's creations count as activity for `lastActiveAt`) is aggregated
 * SQL-side below. The one semantic edge accepted: a task's `created` row no
 * longer counts as a "user touch" for autonomy - it predates any visible
 * claim/assign anchor anyway, so it could only matter for a completion with
 * no anchor at all.
 */
const SCORECARD_KINDS = ["claimed", "assigned", "unassigned", "status_changed", "handoff", "note", "comment"];

/**
 * Autonomy (milestone: "agent-held completions with zero user-actor rows"):
 * the completing actor is an agent, and between the last claimed/assigned
 * anchor and the completion no user-actor row touched the task. `taskRows`
 * is whatever slice of the task's activity the caller fetched, so the
 * judgement is bounded by that fetch (the scorecard and the trends series
 * both pass window-bounded rows - an anchor or a human touch that predates
 * the window is invisible, the honest cost of one bounded fetch).
 * `fallbackAnchor` is the fetch's own start, used when no anchor is visible.
 * Shared with trends.ts (M24-T06) rather than duplicated.
 */
export function isAutonomousCompletion(
  completion: { id: string; taskId: string; occurredAt: Date; actorType: string },
  taskRows: { id: string; kind: string; occurredAt: Date; actorType: string }[],
  fallbackAnchor: Date,
): boolean {
  if (completion.actorType !== "agent") return false;
  let anchorAt: Date | undefined;
  for (const r of taskRows) {
    if ((r.kind === "claimed" || r.kind === "assigned") && r.occurredAt <= completion.occurredAt) {
      if (!anchorAt || r.occurredAt > anchorAt) anchorAt = r.occurredAt;
    }
  }
  const from = anchorAt ?? fallbackAnchor;
  return !taskRows.some((r) =>
    r.actorType === "user" &&
    r.id !== completion.id &&
    r.occurredAt >= from &&
    r.occurredAt < completion.occurredAt,
  );
}

export async function buildScorecard(
  db: any,
  args: {
    projectId: string;
    windowStart: Date;
    /** The org's agents, archived included (loaded once by the orchestrator). */
    orgAgents: any[];
    /** Agent-held open tasks (the stalled-claims base set), for openNow. */
    openHeld: any[];
  },
) {
  const { taskActivity, agentRoles } = schema;
  const { projectId, windowStart, orgAgents, openHeld } = args;

  const windowRows = await db
    .select({
      id: taskActivity.id,
      taskId: taskActivity.taskId,
      kind: taskActivity.kind,
      occurredAt: taskActivity.occurredAt,
      actorType: taskActivity.actorType,
      actorId: taskActivity.actorId,
      assigneeAgentId: taskActivity.assigneeAgentId,
      assigneeUserId: taskActivity.assigneeUserId,
      fromIsTerminal: taskActivity.fromIsTerminal,
      toIsTerminal: taskActivity.toIsTerminal,
    })
    .from(taskActivity)
    .where(and(
      eq(taskActivity.projectId, projectId),
      inArray(taskActivity.kind, SCORECARD_KINDS),
      gte(taskActivity.occurredAt, windowStart),
    ));

  // Agent task-creations, aggregated in SQL (see the SCORECARD_KINDS note):
  // one row per creating agent, feeding lastActiveAt and the mention set.
  const createdAggRows = await db
    .select({ actorId: taskActivity.actorId, lastAt: sql<number | null>`max(${taskActivity.occurredAt})` })
    .from(taskActivity)
    .where(and(
      eq(taskActivity.projectId, projectId),
      eq(taskActivity.kind, "created"),
      eq(taskActivity.actorType, "agent"),
      gte(taskActivity.occurredAt, windowStart),
    ))
    .groupBy(taskActivity.actorId);
  const createdLastByAgent = new Map<string, Date>();
  for (const r of createdAggRows) {
    // max() bypasses drizzle's timestamp decode - sqlite seconds arrive raw.
    const at = fromSeconds(r.lastAt);
    if (r.actorId && at) createdLastByAgent.set(r.actorId, at);
  }

  const rowsByTask = new Map<string, any[]>();
  for (const r of windowRows) {
    if (!rowsByTask.has(r.taskId)) rowsByTask.set(r.taskId, []);
    rowsByTask.get(r.taskId)!.push(r);
  }
  for (const rows of rowsByTask.values()) rows.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  // Reopened attribution (ADR-0020 assignee attribution, pragmatic v1,
  // milestone: "per agent whose completion was reopened"): each in-window
  // regression is charged to the assignee of the task's most recent PRIOR
  // terminal transition, looked up over the whole table - regressions in
  // a window are naturally scarce, so one bounded query covers them all.
  const regressionRows = windowRows.filter(
    (r: any) => r.kind === "status_changed" && r.fromIsTerminal && !r.toIsTerminal,
  );
  const reopenedByAgent = new Map<string, number>();
  if (regressionRows.length > 0) {
    const priorTerminal = await db
      .select({
        id: taskActivity.id,
        taskId: taskActivity.taskId,
        occurredAt: taskActivity.occurredAt,
        assigneeAgentId: taskActivity.assigneeAgentId,
      })
      .from(taskActivity)
      .where(and(
        inArray(taskActivity.taskId, [...new Set(regressionRows.map((r: any) => r.taskId))]),
        eq(taskActivity.kind, "status_changed"),
        eq(taskActivity.toIsTerminal, true),
      ));
    for (const reg of regressionRows) {
      let prior: any;
      for (const p of priorTerminal) {
        // <= not <: the completion and its reopening can share a one-second
        // timestamp; the terminality filter already guarantees the
        // regression row itself is never a candidate.
        if (p.taskId !== reg.taskId || p.occurredAt > reg.occurredAt) continue;
        if (!prior || p.occurredAt > prior.occurredAt) prior = p;
      }
      if (prior?.assigneeAgentId) {
        reopenedByAgent.set(prior.assigneeAgentId, (reopenedByAgent.get(prior.assigneeAgentId) ?? 0) + 1);
      }
    }
  }

  // Subjects: start from the org's agents (the dashboard's precedent),
  // archived included so their history still renders a real name, then add
  // synthetic "(deleted agent)" rows for purged ids the window still mentions.
  const agentById = new Map<string, any>(orgAgents.map((a: any) => [a.id, a]));
  const mentionedAgentIds = new Set<string>(createdLastByAgent.keys());
  for (const r of windowRows) {
    if (r.actorType === "agent" && r.actorId) mentionedAgentIds.add(r.actorId);
    if (r.assigneeAgentId) mentionedAgentIds.add(r.assigneeAgentId);
  }
  const subjects: { id: string; name: string; agentRoleId: string | null }[] = orgAgents
    .filter((a: any) => !a.deletedAt || mentionedAgentIds.has(a.id))
    .map((a: any) => ({ id: a.id, name: a.name, agentRoleId: a.agentRoleId }));
  for (const id of mentionedAgentIds) {
    if (!agentById.has(id)) subjects.push({ id, name: DELETED_AGENT, agentRoleId: null });
  }

  const openNowByAgent = new Map<string, number>();
  for (const t of openHeld) {
    openNowByAgent.set(t.agentId, (openNowByAgent.get(t.agentId) ?? 0) + 1);
  }

  const scoreFor = (agentId: string): Score => {
    let claimed = 0, completed = 0, handedOff = 0, takenAway = 0, autonomousCompleted = 0;
    let lastActiveAt: Date | undefined = createdLastByAgent.get(agentId);
    for (const r of windowRows) {
      if (r.actorType === "agent" && r.actorId === agentId) {
        if (!lastActiveAt || r.occurredAt > lastActiveAt) lastActiveAt = r.occurredAt;
      }
      if (r.kind === "claimed" && r.assigneeAgentId === agentId) claimed++;
      if (r.kind === "handoff" && r.actorType === "agent" && r.actorId === agentId) handedOff++;
      if (r.kind === "unassigned" && r.assigneeAgentId === agentId && r.actorType === "user") takenAway++;
      if (r.kind === "status_changed" && r.toIsTerminal && r.assigneeAgentId === agentId) {
        completed++;
        if (isAutonomousCompletion(r, rowsByTask.get(r.taskId) ?? [], windowStart)) autonomousCompleted++;
      }
    }
    return {
      claimed, completed, handedOff, takenAway, autonomousCompleted,
      reopened: reopenedByAgent.get(agentId) ?? 0,
      openNow: openNowByAgent.get(agentId) ?? 0,
      lastActiveAt,
    };
  };

  const scoredSubjects = subjects.map((s) => ({ ...s, score: scoreFor(s.id) }));

  const agentRows = [...scoredSubjects].sort(byOutcome).slice(0, PANEL_LIMIT)
    .map((s) => toScorecardRow(s.id, s.name, s.score));

  // Role rollup: same numbers grouped by the agent's role. Purged agents
  // have no resolvable role, so their synthetic rows stay out - a rollup
  // of "(deleted agent)" rows would attribute work to nobody's persona.
  const roleAgg = new Map<string, Score>();
  for (const s of scoredSubjects) {
    if (!s.agentRoleId) continue;
    const acc = roleAgg.get(s.agentRoleId) ?? {
      claimed: 0, completed: 0, reopened: 0, handedOff: 0, takenAway: 0,
      autonomousCompleted: 0, openNow: 0, lastActiveAt: undefined as Date | undefined,
    };
    for (const k of ["claimed", "completed", "reopened", "handedOff", "takenAway", "autonomousCompleted", "openNow"] as const) {
      acc[k] += s.score[k];
    }
    if (s.score.lastActiveAt && (!acc.lastActiveAt || s.score.lastActiveAt > acc.lastActiveAt)) {
      acc.lastActiveAt = s.score.lastActiveAt;
    }
    roleAgg.set(s.agentRoleId, acc);
  }
  const roleNameById = new Map<string, string>();
  if (roleAgg.size > 0) {
    const roleRowsDb = await db
      .select({ id: agentRoles.id, name: agentRoles.name })
      .from(agentRoles)
      .where(inArray(agentRoles.id, [...roleAgg.keys()]));
    for (const r of roleRowsDb) roleNameById.set(r.id, r.name);
  }
  const roleRows = [...roleAgg.entries()]
    .map(([roleId, score]) => ({ id: roleId, name: roleNameById.get(roleId) ?? roleId, score }))
    .sort(byOutcome)
    .slice(0, PANEL_LIMIT)
    .map((r) => toScorecardRow(r.id, r.name, r.score));

  return { agentRows, roleRows };
}

/**
 * The "Agents completed N% (M% prior window)" headline, as counts, not
 * precomputed rates (the contract's own reasoning). Counted straight off the
 * activity table with no task join: a completion happened even if its task
 * was archived since - deleting yesterday's work should not rewrite
 * yesterday's throughput.
 */
export async function buildCompletionHeadline(
  db: any,
  args: { projectId: string; windowStart: Date; priorStart: Date },
) {
  const { taskActivity } = schema;
  const completionRows = await db
    .select({
      occurredAt: taskActivity.occurredAt,
      actorType: taskActivity.actorType,
      assigneeAgentId: taskActivity.assigneeAgentId,
      assigneeUserId: taskActivity.assigneeUserId,
    })
    .from(taskActivity)
    .where(and(
      eq(taskActivity.projectId, args.projectId),
      eq(taskActivity.kind, "status_changed"),
      eq(taskActivity.toIsTerminal, true),
      gte(taskActivity.occurredAt, args.priorStart),
    ));

  let agentCompleted = 0, humanCompleted = 0, priorAgentCompleted = 0, priorHumanCompleted = 0;
  for (const r of completionRows) {
    const byAgent = completionByAgent(r);
    if (r.occurredAt >= args.windowStart) {
      if (byAgent) agentCompleted++;
      else humanCompleted++;
    } else if (byAgent) priorAgentCompleted++;
    else priorHumanCompleted++;
  }

  return {
    agentCompleted: BigInt(agentCompleted),
    humanCompleted: BigInt(humanCompleted),
    priorAgentCompleted: BigInt(priorAgentCompleted),
    priorHumanCompleted: BigInt(priorHumanCompleted),
  };
}
