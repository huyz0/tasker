import { and, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import * as schema from "../../db/schema.sqlite";
import { notDeleted } from "../../db/query-builder";
import { PANEL_LIMIT, DAY_MS, completionByAgent, fromSeconds, iso } from "./common";
import { isAutonomousCompletion } from "./scorecard";
import { dayBucketSql, epochDaySql, epochDayToDateStr } from "./dateBucket";

/**
 * The trends half of the Reports screen (M24-T06), assembled into one
 * GetReportTrendsResponse: the CFD (daily-delta + prefix-sum over the FULL
 * activity history, scoped to one task type), the created-vs-completed
 * cumulative pair, the autonomy & rework day rates, and the recent-completions
 * strip. Authorization, validation and tenancy all happened in
 * `reports.handler.ts` before this runs - including that an explicit
 * `taskTypeId` exists and belongs to the project's org. Every date in the
 * response is a UTC `YYYY-MM-DD` bucket (dateBucket.ts on the SQL side,
 * `toISOString().slice(0, 10)` on the JS side - the same UTC day both ways).
 */

/** The contract's sentinel for the fixed todo/in-progress/done scope. */
const UNTYPED = "untyped";

/**
 * The untyped vocabulary, also the fallback for a type with no statuses
 * configured - the same fallback validateStatusForTaskType and
 * isTerminalStatus apply, so bands match what the mutation path stamps.
 */
const FIXED_VOCABULARY = [
  { status: "todo", isTerminal: false },
  { status: "in-progress", isTerminal: false },
  { status: "done", isTerminal: true },
];

/**
 * A completion is any row that ENTERS a terminal status: a `status_changed`
 * with `to_is_terminal`, and - decided here, tested - a `created` straight
 * into a terminal status (an imported or instantly-closed task IS a
 * completion). `restored` is deliberately absent: un-archiving a done task
 * re-admits it to the CFD stack but completes nothing new.
 */
const COMPLETION_KINDS = ["status_changed", "created"];

const dayStr = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Prefix-sums per-day values onto the axis; days in the map before the axis
 * fold into `baseline`, which is the level the window opens at.
 */
function cumulate(axisDates: string[], byDay: Map<string, number>, baseline = 0) {
  let level = baseline;
  for (const [day, n] of byDay) if (day < axisDates[0]!) level += n;
  return axisDates.map((date) => {
    level += byDay.get(date) ?? 0;
    return { date, count: BigInt(level) };
  });
}

const groupByTask = <T extends { taskId: string }>(rows: T[]): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    if (!map.has(r.taskId)) map.set(r.taskId, []);
    map.get(r.taskId)!.push(r);
  }
  return map;
};

export async function buildReportTrends(
  db: any,
  isStandalone: boolean,
  args: { projectId: string; windowDays: number; taskTypeId?: string },
) {
  const { tasks, taskActivity, taskStatuses, taskTypes } = schema;
  const { projectId, windowDays } = args;

  // One clock for the whole request; the axis is windowDays+1 UTC days
  // ending today - one point per day whether or not anything happened.
  const now = new Date();
  const todayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const axisStart = new Date(todayStartMs - windowDays * DAY_MS);
  const axisDates: string[] = [];
  for (let k = windowDays; k >= 0; k--) axisDates.push(dayStr(new Date(todayStartMs - k * DAY_MS)));

  // collectedSince = the first recorded activity (ADR-0020's truthful
  // backfill makes that the honest "history starts here" label); a project
  // with no activity collects from today.
  const [minRow] = await db
    .select({ minAt: sql<number | null>`min(${taskActivity.occurredAt})` })
    .from(taskActivity)
    .where(eq(taskActivity.projectId, projectId));
  const collectedSinceAt = fromSeconds(minRow?.minAt);
  const collectedSince = dayStr(collectedSinceAt ?? now);

  const usage: { taskTypeId: string | null; n: number }[] = await db
    .select({ taskTypeId: tasks.taskTypeId, n: sql<number>`count(*)` })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), notDeleted(tasks)))
    .groupBy(tasks.taskTypeId);

  // created counts come from the tasks table, not from activity: creations
  // predate collection, so this is the one series that is retroactively
  // accurate across the whole window. It counts live AND archived rows -
  // deleting yesterday's task should not rewrite yesterday's intake - but
  // purged rows are gone, history and all (accepted, per ADR-0020's purge
  // semantics).
  const createdBucket = dayBucketSql(isStandalone, tasks.createdAt);
  const createdRows: { day: string; n: number }[] = await db
    .select({ day: createdBucket, n: sql<number>`count(*)` })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .groupBy(createdBucket);

  // A genuinely empty project (no tasks ever recorded, no activity): honest
  // empty series rather than an axis of invented zeros.
  if (!collectedSinceAt && createdRows.length === 0) {
    return {
      collectedSince,
      createdCumulative: [],
      completedCumulative: [],
      recentCompletions: [],
      autonomyRate: [],
      reworkRate: [],
      cfdBands: [],
      cfdTaskTypeId: args.taskTypeId ?? UNTYPED,
      taskTypeOptions: [],
    };
  }

  // ── task-type options + CFD scope ─────────────────────────────────────────
  const typedUsage = usage.filter((r) => r.taskTypeId != null) as { taskTypeId: string; n: number }[];
  const untypedCount = Number(usage.find((r) => r.taskTypeId == null)?.n ?? 0);
  const typeNameById = new Map<string, string>();
  if (typedUsage.length > 0) {
    const rows = await db
      .select({ id: taskTypes.id, name: taskTypes.name })
      .from(taskTypes)
      .where(inArray(taskTypes.id, typedUsage.map((r) => r.taskTypeId)));
    for (const r of rows) typeNameById.set(r.id, r.name);
  }
  const options = typedUsage.map((r) => ({
    id: r.taskTypeId,
    name: typeNameById.get(r.taskTypeId) ?? r.taskTypeId,
    taskCount: Number(r.n),
  }));
  if (untypedCount > 0) options.push({ id: UNTYPED, name: "Untyped", taskCount: untypedCount });
  // Deterministic: most-used first, name ascending on equal counts.
  options.sort((a, b) => b.taskCount - a.taskCount || a.name.localeCompare(b.name));

  // Scope: the explicit request wins; absent, the most-used TYPE (the same
  // count-then-name order as the options list); a project with no typed
  // tasks charts its untyped ones.
  const scope = args.taskTypeId ?? options.find((o) => o.id !== UNTYPED)?.id ?? UNTYPED;

  // ── CFD: status vocabulary ────────────────────────────────────────────────
  // Terminality mirrors isTerminalStatus: max position is terminal (ties: all
  // of them), fixed vocabulary for untyped tasks and unconfigured types.
  let vocabulary = FIXED_VOCABULARY;
  if (scope !== UNTYPED) {
    const statusRows: any[] = await db.select().from(taskStatuses).where(eq(taskStatuses.taskTypeId, scope));
    if (statusRows.length > 0) {
      statusRows.sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0) || String(a.name).localeCompare(String(b.name)));
      const maxPosition = statusRows.reduce((max, s) => Math.max(max, Number(s.position ?? 0)), 0);
      vocabulary = statusRows.map((s) => ({ status: s.name, isTerminal: Number(s.position ?? 0) === maxPosition }));
    }
  }

  // ── CFD: one SQL daily-delta pass over the FULL history ──────────────────
  // +1 for every status entered, -1 for every status left, grouped by UTC
  // day + status (ADR-0020's algebra: `archived` carries only from_status,
  // `restored` only to_status, so archives leave the stack and restores
  // re-enter it). Scoped to the CURRENT task type of each task - re-typing
  // a task moves its whole history between charts, per the ADR.
  // One scan, not a two-arm UNION ALL: each arm would re-walk the same
  // (project_id, kind, occurred_at) ranges, and at 100k+ activity rows the
  // second walk is what blew the 300 ms budget. A constant two-row `sign`
  // relation splits each scanned row into its +to/-from pair instead, and
  // days group as epoch-day integers (epochDaySql's rationale), rendered to
  // YYYY-MM-DD only for the tiny grouped result.
  const typeCond = scope === UNTYPED ? sql`t.task_type_id IS NULL` : sql`t.task_type_id = ${scope}`;
  const bucket = epochDaySql(isStandalone, sql`a.occurred_at`);
  const deltaQuery = sql`
    SELECT day, status, SUM(delta) AS delta FROM (
      SELECT ${bucket} AS day,
             CASE s.sign WHEN 1 THEN a.to_status ELSE a.from_status END AS status,
             s.sign AS delta
      FROM task_activity a
      JOIN tasks t ON t.id = a.task_id
      CROSS JOIN (SELECT 1 AS sign UNION ALL SELECT -1 AS sign) s
      WHERE a.project_id = ${projectId}
        AND a.kind IN ('created', 'status_changed', 'archived', 'restored')
        AND ${typeCond}
    ) deltas
    WHERE status IS NOT NULL
    GROUP BY day, status`;
  const deltaRows: { day: number; status: string; delta: number }[] = isStandalone
    ? db.all(deltaQuery)
    : (await db.execute(deltaQuery))[0];

  const deltasByStatus = new Map<string, Map<string, number>>();
  for (const r of deltaRows) {
    if (!deltasByStatus.has(r.status)) deltasByStatus.set(r.status, new Map());
    deltasByStatus.get(r.status)!.set(epochDayToDateStr(r.day), Number(r.delta));
  }

  // Configured statuses that never saw activity stay as zero bands (stable
  // chart shape); statuses history mentions but the config no longer has
  // follow the configured ones, never terminal - a chart must not lose a
  // band because an admin edited a status list.
  const known = new Set(vocabulary.map((v) => v.status));
  const orphanStatuses = [...deltasByStatus.keys()].filter((s) => !known.has(s)).sort();
  const bands = [...vocabulary, ...orphanStatuses.map((status) => ({ status, isTerminal: false }))];

  const cfdBands = bands.map(({ status, isTerminal }) => ({
    status,
    isTerminal,
    // The pre-window prefix is the window's day-0 baseline; days with no
    // activity carry the level forward - a point per day, always.
    counts: cumulate(axisDates, deltasByStatus.get(status) ?? new Map()),
  }));

  // ── created cumulative ────────────────────────────────────────────────────
  const createdByDay = new Map(createdRows.map((r) => [r.day, Number(r.n)]));
  const createdCumulative = cumulate(axisDates, createdByDay);

  // ── completions: one windowed row fetch + a scalar baseline count feeds ──
  // the completed cumulative AND the rates below. Completed data comes from
  // activity, so it honestly starts at collection: days before
  // collectedSince simply have nothing to count.
  const completionWhere = and(
    eq(taskActivity.projectId, projectId),
    inArray(taskActivity.kind, COMPLETION_KINDS),
    eq(taskActivity.toIsTerminal, true),
  );
  const [windowCompletions, [completedBaselineRow]] = (await Promise.all([
    db.select({
      id: taskActivity.id,
      taskId: taskActivity.taskId,
      occurredAt: taskActivity.occurredAt,
      actorType: taskActivity.actorType,
    })
      .from(taskActivity)
      .where(and(completionWhere, gte(taskActivity.occurredAt, axisStart))),
    db.select({ n: sql<number>`count(*)` })
      .from(taskActivity)
      .where(and(completionWhere, lt(taskActivity.occurredAt, axisStart))),
  ])) as [{ id: string; taskId: string; occurredAt: Date; actorType: string }[], { n: number }[]];

  const completionsByDay = new Map<string, typeof windowCompletions>();
  for (const c of windowCompletions) {
    const day = dayStr(c.occurredAt);
    if (!completionsByDay.has(day)) completionsByDay.set(day, []);
    completionsByDay.get(day)!.push(c);
  }
  const completedCumulative = cumulate(
    axisDates,
    new Map([...completionsByDay].map(([day, list]) => [day, list.length])),
    Number(completedBaselineRow?.n ?? 0),
  );

  // ── recent completions ────────────────────────────────────────────────────
  // Soft-deleted tasks are skipped: this strip links to tasks, and a Bin
  // entry is not somewhere to send a reader. (The cumulative counts above
  // deliberately keep them - a completion happened even if its task was
  // archived since.) One query per completion kind: each descends its own
  // (project_id, kind, occurred_at) index and stops after a handful of rows,
  // where a `kind IN` disjunction would sort the whole match set.
  const recentPerKind = await Promise.all(COMPLETION_KINDS.map((kind) =>
    db.select({
      activityId: taskActivity.id,
      taskId: taskActivity.taskId,
      occurredAt: taskActivity.occurredAt,
      actorType: taskActivity.actorType,
      assigneeAgentId: taskActivity.assigneeAgentId,
      assigneeUserId: taskActivity.assigneeUserId,
      taskDisplayId: tasks.displayId,
      taskTitle: tasks.title,
    })
      .from(taskActivity)
      .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
      .where(and(
        eq(taskActivity.projectId, projectId),
        eq(taskActivity.kind, kind),
        eq(taskActivity.toIsTerminal, true),
        notDeleted(tasks),
      ))
      .orderBy(desc(taskActivity.occurredAt), desc(taskActivity.id))
      .limit(PANEL_LIMIT),
  ));
  const recentCompletions = recentPerKind
    .flat()
    .sort((a: any, b: any) =>
      b.occurredAt.getTime() - a.occurredAt.getTime() || String(b.activityId).localeCompare(String(a.activityId)))
    .slice(0, PANEL_LIMIT)
    .map((r: any) => ({
      taskId: r.taskId,
      taskDisplayId: r.taskDisplayId,
      taskTitle: r.taskTitle,
      completedAt: iso(r.occurredAt) ?? "",
      byAgent: completionByAgent(r),
    }));

  // ── autonomy & rework day rates ──────────────────────────────────────────

  // Anchors (claimed/assigned) and user touches, window-bounded - the same
  // accepted approximation as the scorecard's autonomy column. Two narrow
  // fetches rather than one broad one, so the row count stays proportional
  // to claims and completions, not to the project's whole intake.
  let supportByTask = new Map<string, any[]>();
  if (windowCompletions.length > 0) {
    const supportColumns = {
      id: taskActivity.id,
      taskId: taskActivity.taskId,
      kind: taskActivity.kind,
      occurredAt: taskActivity.occurredAt,
      actorType: taskActivity.actorType,
    };
    const [anchorRows, touchRows] = await Promise.all([
      db.select(supportColumns).from(taskActivity).where(and(
        eq(taskActivity.projectId, projectId),
        inArray(taskActivity.kind, ["claimed", "assigned"]),
        gte(taskActivity.occurredAt, axisStart),
      )),
      (() => {
        // Driven from the completed-task set (each task probes its own
        // (task_id, occurred_at) range) - completions are the smaller side.
        // Not 'created': a creation predates any claim/assign anchor, so it
        // could only count as a "touch" for an anchorless completion - the
        // same edge the scorecard's fetch accepts (see SCORECARD_KINDS).
        const completedTasks = db
          .selectDistinct({ taskId: taskActivity.taskId })
          .from(taskActivity)
          .where(and(completionWhere, gte(taskActivity.occurredAt, axisStart)))
          .as("completed_tasks");
        return db.select(supportColumns)
          .from(completedTasks)
          .innerJoin(taskActivity, eq(taskActivity.taskId, completedTasks.taskId))
          .where(and(
            gte(taskActivity.occurredAt, axisStart),
            eq(taskActivity.actorType, "user"),
            ne(taskActivity.kind, "created"),
          ));
      })(),
    ]);
    // A user-actor claim/assignment appears in both fetches - dedupe by id.
    const seen = new Set<string>();
    const supportRows = [...anchorRows, ...touchRows].filter((r: any) =>
      seen.has(r.id) ? false : (seen.add(r.id), true),
    );
    supportByTask = groupByTask(supportRows);
  }

  // Reopenings over the whole table - regressions are scarce by nature, and
  // only recorded ones can count: a reopening that predates collection (or
  // was purged with its task) is invisible, stated rather than invented.
  const regressionsByTask = groupByTask(
    windowCompletions.length === 0
      ? []
      : ((await db
          .select({ taskId: taskActivity.taskId, occurredAt: taskActivity.occurredAt })
          .from(taskActivity)
          .where(and(
            eq(taskActivity.projectId, projectId),
            eq(taskActivity.kind, "status_changed"),
            eq(taskActivity.fromIsTerminal, true),
            eq(taskActivity.toIsTerminal, false),
          ))) as { taskId: string; occurredAt: Date }[]),
  );

  const dailyRate = (isCounted: (c: (typeof windowCompletions)[number]) => boolean) =>
    axisDates.map((date) => {
      const dayCompletions = completionsByDay.get(date) ?? [];
      const counted = dayCompletions.filter(isCounted).length;
      return {
        date,
        // A day with no completions has no rate to state: 0 with
        // sampleSize 0, which the UI dims rather than reads.
        rate: dayCompletions.length === 0 ? 0 : counted / dayCompletions.length,
        sampleSize: BigInt(dayCompletions.length),
      };
    });

  const autonomyRate = dailyRate((c) => isAutonomousCompletion(c, supportByTask.get(c.taskId) ?? [], axisStart));
  // "Later" = same second or after: within one sqlite-second the true order
  // is unrecorded, and a completion undone in its own second is still rework.
  // (A completion row is never its own regression - terminality differs.)
  const reworkRate = dailyRate((c) =>
    (regressionsByTask.get(c.taskId) ?? []).some((rg) => rg.occurredAt >= c.occurredAt),
  );

  return {
    collectedSince,
    createdCumulative,
    completedCumulative,
    recentCompletions,
    autonomyRate,
    reworkRate,
    cfdBands,
    cfdTaskTypeId: scope,
    taskTypeOptions: options.map((o) => ({ id: o.id, name: o.name, taskCount: BigInt(o.taskCount) })),
  };
}
