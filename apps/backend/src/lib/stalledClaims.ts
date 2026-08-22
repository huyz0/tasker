import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import * as schemaMysql from "../db/schema.mysql";
import * as schemaSqlite from "../db/schema.sqlite";
import { isTerminalStatus } from "../modules/tasks/taskActivity";

/**
 * The stalled-claim detector (M25-T03, ADR-0022): an agent-held, currently
 * open task whose last recorded signal - or its claim, or its own creation,
 * whichever is the honest anchor - predates `afterHours`. Extracted out of
 * `modules/reports/exceptions.ts` (M24-T05's original, project-scoped-only
 * home) so both the Reports panel and M25-T04's alert sweep call one
 * implementation instead of two copies drifting apart.
 *
 * Every semantic here is a direct carry-over from the original: last signal
 * excludes only the `created` kind (a human comment, a note, a status change
 * all count as proof of life); the claim/assign anchor is
 * `maxDate(claimedAt, assignedAt)`; `neverStarted` is true when nothing
 * happened after that anchor (or nothing happened at all, for a claim with
 * no anchor); the silence clock is `lastSignalAt ?? claimedAt ?? createdAt`,
 * never the anchor itself (a claim predating activity collection has no
 * anchor and no last signal - only the task's own age is left to judge it
 * by).
 *
 * Dialect-branched via an explicit `isStandalone` parameter, the same
 * calling convention `taskActivity.ts`'s `isTerminalStatus`/
 * `recordTaskActivity` already use - not `cascadePurge.ts`/`retentionSweep
 * .ts`'s module-private `process.env.STANDALONE` read, since this module is
 * called from request-handling code (`reports/exceptions.ts`) that already
 * threads `isStandalone` through explicitly.
 */

const HOUR_MS = 3600_000;

/**
 * `MAX(CASE WHEN … THEN occurredAt END)` bypasses drizzle's own timestamp
 * decoding, the same gotcha `reports/common.ts`'s `fromSeconds` documents:
 * SQLite's `timestamp`-mode integer column stores epoch **seconds**, so the
 * raw aggregate needs multiplying back up or every value reads as 1970.
 * MySQL's native `timestamp` column already comes back as a `Date` via
 * mysql2, so this only ever multiplies on the SQLite side. Reimplemented
 * locally rather than imported from `reports/common.ts`: `lib/` sits below
 * `modules/`, so importing a `modules/reports` helper here would point the
 * dependency the wrong way.
 */
function decodeAggregate(v: unknown, isStandalone: boolean): Date | undefined {
  if (v == null) return undefined;
  if (v instanceof Date) return v;
  return isStandalone ? new Date(Number(v) * 1000) : new Date(v as any);
}

function maxDate(...ds: (Date | undefined)[]): Date | undefined {
  return ds.reduce<Date | undefined>((m, d) => (d && (!m || d > m) ? d : m), undefined);
}

export interface StalledClaimCandidate {
  taskId: string;
  taskDisplayId: string;
  taskTitle: string;
  status: string;
  projectId: string;
  /** Join to `projects.orgId` - the report handler never needed this; the
   * M25-T04 sweep does, for recipient resolution and the domain event. */
  orgId: string;
  agentId: string;
  agentName?: string;
  claimedAt?: Date;
  lastSignalAt?: Date;
  agentLastSeenAt?: Date;
  neverStarted: boolean;
}

export interface FindStalledCandidatesOptions {
  /** Scope to one project; omitted for the global (cross-org) sweep query. */
  projectId?: string;
  /** Applied only when provided - the report caller passes PANEL_LIMIT, the
   * sweep passes nothing so no genuinely stalled claim goes unalerted. */
  limit?: number;
  afterHours: number;
}

/**
 * Builds (but does not execute) the one indexed pass over agent-held tasks:
 * a join straight through to the task's org, conditionally aggregated
 * against `task_activity` - never a driver-side IN-list of held task ids
 * (the M24-T06 bug this design exists to avoid repeating at global scope,
 * per ADR-0022). The global (no `projectId`) case is exactly this query with
 * the trailing `eq()` simply not added; the project-scoped case is this same
 * query bounded to one project. Exported separately (rather than inlined in
 * `findStalledCandidates`) so a test can call `.toSQL()` on the returned
 * query builder and assert its parameter count directly, without needing the
 * query to run to completion first.
 */
export function buildHeldTaskQuery(db: any, isStandalone: boolean, opts: { projectId?: string }) {
  const schema = isStandalone ? schemaSqlite : schemaMysql;
  const { tasks, taskAssignments, taskActivity, projects } = schema as any;

  return db
    .select({
      taskId: tasks.id,
      taskDisplayId: tasks.displayId,
      taskTitle: tasks.title,
      status: tasks.status,
      taskTypeId: tasks.taskTypeId,
      createdAt: tasks.createdAt,
      projectId: tasks.projectId,
      orgId: projects.orgId,
      agentId: taskAssignments.agentId,
      // Last signal: any kind except 'created' - a human comment also proves
      // the task isn't silent.
      lastSignalRaw: sql<unknown>`max(case when ${taskActivity.kind} != 'created' then ${taskActivity.occurredAt} end)`,
      // The hold anchor's two components, aggregated separately so
      // `claimedAt` can also be reported on its own (the response field), and
      // `neverStarted`/`silentSince` reasoning still fall back to `claimedAt`
      // specifically, not the wider claimed-or-assigned anchor.
      claimedRaw: sql<unknown>`max(case when ${taskActivity.kind} = 'claimed' then ${taskActivity.occurredAt} end)`,
      assignedRaw: sql<unknown>`max(case when ${taskActivity.kind} = 'assigned' then ${taskActivity.occurredAt} end)`,
    })
    .from(taskAssignments)
    .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(taskActivity, eq(taskActivity.taskId, tasks.id))
    .where(and(
      isNotNull(taskAssignments.agentId),
      isNull(tasks.deletedAt),
      opts.projectId ? eq(tasks.projectId, opts.projectId) : undefined,
    ))
    .groupBy(
      taskAssignments.id, tasks.id, tasks.displayId, tasks.title, tasks.status,
      tasks.taskTypeId, tasks.createdAt, tasks.projectId, projects.orgId, taskAssignments.agentId,
    );
}

export async function findStalledCandidates(
  db: any,
  isStandalone: boolean,
  opts: FindStalledCandidatesOptions,
): Promise<StalledClaimCandidate[]> {
  const schema = isStandalone ? schemaSqlite : schemaMysql;
  const { taskStatuses, agents, apiTokens } = schema as any;

  const now = new Date();
  const silentBefore = new Date(now.getTime() - opts.afterHours * HOUR_MS);

  const heldRows = await buildHeldTaskQuery(db, isStandalone, { projectId: opts.projectId });

  // Batched terminality: one query over the distinct task TYPES appearing
  // among the held rows above - bounded by the org's own configuration, not
  // by how many tasks are held, unlike a per-task query would be.
  const typeIds = [...new Set(heldRows.map((r: any) => r.taskTypeId).filter(Boolean))] as string[];
  const statusesByType = new Map<string, any[]>(typeIds.map((id) => [id, []]));
  if (typeIds.length > 0) {
    const statusRows = await db.select().from(taskStatuses).where(inArray(taskStatuses.taskTypeId, typeIds));
    for (const s of statusRows) statusesByType.get(s.taskTypeId)?.push(s);
  }

  const openHeld: any[] = [];
  for (const r of heldRows) {
    const terminal = await isTerminalStatus(
      db, isStandalone, r.taskTypeId ?? null, r.status,
      r.taskTypeId ? statusesByType.get(r.taskTypeId) ?? [] : undefined,
    );
    if (!terminal) openHeld.push(r);
  }

  const withSilence = openHeld.map((r) => {
    const lastSignalAt = decodeAggregate(r.lastSignalRaw, isStandalone);
    const claimedAt = decodeAggregate(r.claimedRaw, isStandalone);
    const assignedAt = decodeAggregate(r.assignedRaw, isStandalone);
    const anchorAt = maxDate(claimedAt, assignedAt);
    // Claims predating activity collection have no rows at all; the task's
    // own createdAt is the honest fallback silence anchor.
    const silentSince: Date = lastSignalAt ?? claimedAt ?? r.createdAt;
    const neverStarted = anchorAt ? (!lastSignalAt || lastSignalAt <= anchorAt) : !lastSignalAt;
    return { r, lastSignalAt, claimedAt, silentSince, neverStarted };
  });

  const stalled = withSilence
    .filter((c) => c.silentSince < silentBefore)
    // Most-silent first.
    .sort((a, b) => a.silentSince.getTime() - b.silentSince.getTime());
  const limited = opts.limit != null ? stalled.slice(0, opts.limit) : stalled;

  // Per-agent liveness and name, batched over the distinct agents actually
  // surfaced - bounded by how many distinct agents hold stalled claims, not
  // by how many tasks they hold between them.
  const agentIds = [...new Set(limited.map((c) => c.r.agentId as string))];
  const lastSeenByAgent = new Map<string, Date>();
  const nameByAgent = new Map<string, string>();
  if (agentIds.length > 0) {
    const [seenRows, agentRows] = await Promise.all([
      db
        .select({ agentId: apiTokens.agentId, lastUsedAt: sql<unknown>`max(${apiTokens.lastUsedAt})` })
        .from(apiTokens)
        .where(and(inArray(apiTokens.agentId, agentIds), isNull(apiTokens.revokedAt)))
        .groupBy(apiTokens.agentId),
      db.select({ id: agents.id, name: agents.name }).from(agents).where(inArray(agents.id, agentIds)),
    ]);
    for (const row of seenRows) {
      const at = decodeAggregate(row.lastUsedAt, isStandalone);
      if (at) lastSeenByAgent.set(row.agentId, at);
    }
    for (const a of agentRows) nameByAgent.set(a.id, a.name);
  }

  return limited.map((c) => ({
    taskId: c.r.taskId,
    taskDisplayId: c.r.taskDisplayId,
    taskTitle: c.r.taskTitle,
    status: c.r.status,
    projectId: c.r.projectId,
    orgId: c.r.orgId,
    agentId: c.r.agentId,
    agentName: nameByAgent.get(c.r.agentId),
    claimedAt: c.claimedAt,
    lastSignalAt: c.lastSignalAt,
    agentLastSeenAt: lastSeenByAgent.get(c.r.agentId),
    neverStarted: c.neverStarted,
  }));
}
