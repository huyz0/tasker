/**
 * Recurring work (M43, ADR-0036): schedules that put a task or a workflow on
 * the queue on a cadence. The sweep fires each due schedule exactly once
 * across instances by compare-and-swap on `next_run_at`.
 */
import { z } from "zod/v4";
import { and, eq, isNull, lte, not } from "drizzle-orm";
import { ConnectError, Code, createContextValues } from "@connectrpc/connect";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { executePaginatedQuery } from "../../db/query-builder";
import { requirePrincipal, requireUser, getProjectOrgId, authorizePrincipal } from "../../lib/authz";
import { assertCan } from "../../lib/policy";
import { publishDomainEvent } from "../../lib/natsCorrelation";
import { logger } from "../../lib/logger";
import { currentPrincipalKey, currentUserIdKey, type Principal } from "../auth/session";
import { createTaskManagementHandler } from "../tasks/tasks.handler";
import { terminalStatusSql } from "../tasks/taskActivity";
import { createWorkflowsHandler } from "../workflows/workflows.handler";
import { CADENCES, describeCadence, nextRunAfter, type CadenceSpec } from "./cadence";

const blankToUndefined = (v: unknown) => (v === "" || v == null ? undefined : v);

const ScheduleFields = {
  name: z.string().trim().min(1, "name is required").max(256),
  cadence: z.enum(CADENCES, { message: `cadence must be one of ${CADENCES.join(", ")}` }),
  weekdays: z.preprocess((v) => v ?? [], z.array(z.number().int().min(0, "weekdays are 0 (Sunday) to 6 (Saturday)").max(6, "weekdays are 0 (Sunday) to 6 (Saturday)"))),
  dayOfMonth: z.preprocess((v) => (v == null || v === 0 ? undefined : v), z.number().int().min(1, "dayOfMonth is 1-28").max(28, "dayOfMonth is 1-28").optional()),
  hourUtc: z.preprocess((v) => v ?? 0, z.number().int().min(0, "hourUtc is 0-23").max(23, "hourUtc is 0-23")),
  templateId: z.preprocess(blankToUndefined, z.string().optional()),
  taskTitle: z.preprocess(blankToUndefined, z.string().trim().min(1).max(480).optional()),
  taskDescription: z.preprocess((v) => v ?? undefined, z.string().max(4096).optional()),
  taskPriority: z.preprocess((v) => v ?? 0, z.number().int().min(0, "taskPriority is 0-4").max(4, "taskPriority is 0-4")),
  skipIfOpen: z.preprocess((v) => v ?? true, z.boolean()),
};
const CreateSchema = z.object({ projectId: z.string().min(1, "projectId is required"), ...ScheduleFields });
const UpdateSchema = z.object({
  id: z.string().min(1, "id is required"),
  ...ScheduleFields,
  active: z.preprocess((v) => v ?? undefined, z.boolean().optional()),
});
const IdSchema = z.object({ id: z.string().min(1, "id is required") });
const ListSchema = z.object({
  orgId: z.preprocess(blankToUndefined, z.string().optional()),
  projectId: z.preprocess(blankToUndefined, z.string().optional()),
  page: z.any().optional(),
});
const RunsSchema = z.object({ scheduleId: z.string().min(1, "scheduleId is required"), page: z.any().optional() });

type Fields = z.infer<typeof CreateSchema>;

/** The cadence and target rules the schema cannot express alone. */
function checkShape(f: Omit<Fields, "projectId">): CadenceSpec {
  if (f.cadence === "weekly") {
    if (f.weekdays.length === 0) throw new ConnectError("a weekly schedule needs at least one weekday", Code.InvalidArgument);
    if (new Set(f.weekdays).size !== f.weekdays.length) throw new ConnectError("weekdays contains a duplicate", Code.InvalidArgument);
  }
  if (f.cadence === "monthly" && !f.dayOfMonth) throw new ConnectError("a monthly schedule needs dayOfMonth (1-28)", Code.InvalidArgument);
  if (Boolean(f.templateId) === Boolean(f.taskTitle)) {
    throw new ConnectError("a schedule creates either a workflow (templateId) or one task (taskTitle) - set exactly one", Code.InvalidArgument);
  }
  return {
    cadence: f.cadence,
    weekdays: f.cadence === "weekly" ? [...f.weekdays].sort((a, b) => a - b) : [],
    dayOfMonth: f.cadence === "monthly" ? f.dayOfMonth! : 1,
    hourUtc: f.hourUtc,
  };
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? String(d) : undefined);

function toWire(row: any) {
  return {
    id: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    name: row.name,
    cadence: row.cadence,
    weekdays: typeof row.weekdays === "string" ? JSON.parse(row.weekdays) : row.weekdays ?? [],
    dayOfMonth: Number(row.dayOfMonth ?? 1),
    hourUtc: Number(row.hourUtc ?? 0),
    ...(row.templateId ? { templateId: row.templateId } : {}),
    ...(row.taskTitle ? { taskTitle: row.taskTitle } : {}),
    ...(row.taskDescription ? { taskDescription: row.taskDescription } : {}),
    taskPriority: Number(row.taskPriority ?? 0),
    skipIfOpen: Boolean(row.skipIfOpen),
    active: Boolean(row.active),
    nextRunAt: iso(row.nextRunAt) ?? "",
    ...(row.lastRunAt ? { lastRunAt: iso(row.lastRunAt) } : {}),
    ...(row.lastTaskId ? { lastTaskId: row.lastTaskId } : {}),
    ...(row.lastOutcome ? { lastOutcome: row.lastOutcome } : {}),
    createdAt: iso(row.createdAt) ?? "",
  };
}

function runToWire(r: any) {
  return {
    id: r.id, scheduleId: r.scheduleId, ranAt: iso(r.ranAt) ?? "", outcome: r.outcome,
    ...(r.taskId ? { taskId: r.taskId } : {}),
    ...(r.detail ? { detail: r.detail } : {}),
    trigger: r.trigger,
  };
}

const specOf = (row: any): CadenceSpec => ({
  cadence: row.cadence,
  weekdays: typeof row.weekdays === "string" ? JSON.parse(row.weekdays) : row.weekdays ?? [],
  dayOfMonth: Number(row.dayOfMonth ?? 1),
  hourUtc: Number(row.hourUtc ?? 0),
});

/** Request context acting as `principal` - the schedule's creator for the sweep. */
function contextFor(principal: Principal) {
  const values = createContextValues();
  values.set(currentPrincipalKey, principal);
  values.set(currentUserIdKey, principal.kind === "user" ? principal.userId : null);
  return { values } as any;
}

function scheduleCore(db: any, nc: any, clock: () => Date) {
  const isStandalone = process.env.STANDALONE === "true";
  const S = isStandalone ? schemaSqlite : schemaMysql;
  const schedules = S.schedules as any;
  const runs = S.scheduleRuns as any;
  const tasks = S.tasks as any;
  const templates = S.workflowTemplates as any;
  const taskHandler = createTaskManagementHandler(db, nc);
  const workflowHandler = createWorkflowsHandler(db, nc);

  async function load(id: string) {
    const [row] = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
    if (!row) throw new ConnectError("schedule not found", Code.NotFound);
    return row;
  }

  async function checkTemplate(templateId: string | undefined, orgId: string, projectId: string) {
    if (!templateId) return;
    const [t] = await db.select({ orgId: templates.orgId, projectId: templates.projectId }).from(templates).where(eq(templates.id, templateId)).limit(1);
    if (!t || t.orgId !== orgId) throw new ConnectError("workflow template not found", Code.InvalidArgument);
    if (t.projectId && t.projectId !== projectId) throw new ConnectError("that workflow template belongs to another project", Code.InvalidArgument);
  }

  /** Why a run should be skipped, or null. */
  async function openPrevious(row: any): Promise<string | null> {
    if (!row.skipIfOpen || !row.lastTaskId) return null;
    const [open] = await db.select({ displayId: tasks.displayId }).from(tasks).where(and(
      eq(tasks.id, row.lastTaskId), eq(tasks.projectId, row.projectId), isNull(tasks.deletedAt),
      not(terminalStatusSql(tasks, isStandalone)),
    )).limit(1);
    return open ? `the previous run's task ${open.displayId || row.lastTaskId} is still open` : null;
  }

  /**
   * One firing: skip, create, or fail - always recorded. Never throws: a
   * failing schedule must not stop the sweep for the others.
   */
  async function fire(row: any, principal: Principal, trigger: "schedule" | "manual") {
    const now = clock();
    const run: any = { id: `srun-${crypto.randomUUID()}`, scheduleId: row.id, ranAt: now, trigger, taskId: null, detail: null };
    try {
      const skip = await openPrevious(row);
      if (skip) {
        run.outcome = "skipped";
        run.detail = skip;
      } else {
        const ctx = contextFor(principal);
        const title = `${row.taskTitle ?? row.name} — ${now.toISOString().slice(0, 10)}`;
        const taskId = row.templateId
          ? (await workflowHandler.instantiateWorkflow({ templateId: row.templateId, projectId: row.projectId, title }, ctx)).parent.id
          : (await taskHandler.createTask({
            projectId: row.projectId, title, status: "todo", description: row.taskDescription ?? "", priority: Number(row.taskPriority ?? 0),
          }, ctx)).task.id;
        await db.update(tasks).set({ scheduleId: row.id }).where(eq(tasks.id, taskId));
        run.outcome = "created";
        run.taskId = taskId;
      }
    } catch (e) {
      run.outcome = "failed";
      run.detail = String((e as any)?.message ?? e).slice(0, 1000);
    }
    await db.insert(runs).values(run);
    await db.update(schedules).set({
      lastRunAt: now, lastOutcome: run.outcome, ...(run.taskId ? { lastTaskId: run.taskId } : {}),
    }).where(eq(schedules.id, row.id));
    publishDomainEvent(nc, "domain.schedule.ran", { scheduleId: row.id, projectId: row.projectId, outcome: run.outcome, taskId: run.taskId, trigger });
    logger.info({ scheduleId: row.id, cadence: describeCadence(specOf(row)), outcome: run.outcome, trigger }, "schedule.ran");
    return run;
  }

  /** Mutations write the fields and recompute the next slot from now. */
  function rowValues(f: Omit<Fields, "projectId">, spec: CadenceSpec) {
    return {
      name: f.name, cadence: spec.cadence, weekdays: JSON.stringify(spec.weekdays), dayOfMonth: spec.dayOfMonth, hourUtc: spec.hourUtc,
      templateId: f.templateId ?? null, taskTitle: f.taskTitle ?? null, taskDescription: f.taskDescription ?? null,
      taskPriority: f.taskPriority, skipIfOpen: f.skipIfOpen, nextRunAt: nextRunAfter(spec, clock()),
    };
  }

  const handlers = {
    async createSchedule(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = CreateSchema.parse(req);
      const orgId = await getProjectOrgId(db, parsed.projectId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "tasktype:write");
      const spec = checkShape(parsed);
      await checkTemplate(parsed.templateId, orgId, parsed.projectId);
      const row = {
        id: `sch-${crypto.randomUUID()}`, orgId, projectId: parsed.projectId, ...rowValues(parsed, spec),
        active: true, createdBy: userId, createdAt: clock(),
      };
      await db.insert(schedules).values(row);
      publishDomainEvent(nc, "domain.schedule.created", { id: row.id, projectId: row.projectId });
      return { schedule: toWire(row) };
    },

    /** Replaces the cadence and target; the editor becomes the schedule's author (ADR-0036). */
    async updateSchedule(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = UpdateSchema.parse(req);
      const row = await load(parsed.id);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: row.orgId }, "tasktype:write");
      const spec = checkShape(parsed);
      await checkTemplate(parsed.templateId, row.orgId, row.projectId);
      const changes = { ...rowValues(parsed, spec), ...(parsed.active !== undefined ? { active: parsed.active } : {}), createdBy: userId };
      await db.update(schedules).set(changes).where(eq(schedules.id, row.id));
      publishDomainEvent(nc, "domain.schedule.updated", { id: row.id, projectId: row.projectId });
      return { schedule: toWire({ ...row, ...changes }) };
    },

    async getSchedule(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const row = await load(IdSchema.parse(req).id);
      await authorizePrincipal(db, principal, row.orgId, { scope: "tasks:read", permission: "task:read" });
      return { schedule: toWire(row) };
    },

    async listSchedules(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = ListSchema.parse(req);
      const projectOrg = parsed.projectId ? await getProjectOrgId(db, parsed.projectId) : undefined;
      if (projectOrg && parsed.orgId && projectOrg !== parsed.orgId) throw new ConnectError("project not found", Code.NotFound);
      const orgId = projectOrg ?? parsed.orgId ?? (principal.kind === "agent" ? principal.orgId : undefined);
      if (!orgId) throw new ConnectError("orgId or projectId is required", Code.InvalidArgument);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:read", permission: "task:read" });
      const scope = and(eq(schedules.orgId, orgId), parsed.projectId ? eq(schedules.projectId, parsed.projectId) : undefined);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, schedules, scope, parsed.page, {
        filterColumn: schedules.name,
        sortableColumns: { createdAt: schedules.createdAt, name: schedules.name, nextRunAt: schedules.nextRunAt },
        cursorFields: { nextRunAt: "date" },
        select: {
          id: schedules.id, orgId: schedules.orgId, projectId: schedules.projectId, name: schedules.name, cadence: schedules.cadence,
          weekdays: schedules.weekdays, dayOfMonth: schedules.dayOfMonth, hourUtc: schedules.hourUtc, templateId: schedules.templateId,
          taskTitle: schedules.taskTitle, taskDescription: schedules.taskDescription, taskPriority: schedules.taskPriority,
          skipIfOpen: schedules.skipIfOpen, active: schedules.active, nextRunAt: schedules.nextRunAt, lastRunAt: schedules.lastRunAt,
          lastTaskId: schedules.lastTaskId, lastOutcome: schedules.lastOutcome, createdAt: schedules.createdAt,
        },
        extraCacheKey: [orgId, parsed.projectId ?? ""].join("|"),
      });
      return { schedules: items.map(toWire), page: { nextCursor, totalCount } };
    },

    async deleteSchedule(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const row = await load(IdSchema.parse(req).id);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: row.orgId }, "tasktype:write");
      await db.delete(runs).where(eq(runs.scheduleId, row.id));
      await db.delete(schedules).where(eq(schedules.id, row.id));
      publishDomainEvent(nc, "domain.schedule.deleted", { id: row.id, projectId: row.projectId });
      return { success: true };
    },

    /** Fire now, as the caller, without moving the next slot. Paused schedules can still be run by hand. */
    async runSchedule(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const row = await load(IdSchema.parse(req).id);
      await authorizePrincipal(db, principal, row.orgId, { scope: "tasks:write", permission: "task:write" });
      return { run: runToWire(await fire(row, principal, "manual")) };
    },

    async listScheduleRuns(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = RunsSchema.parse(req);
      const row = await load(parsed.scheduleId);
      await authorizePrincipal(db, principal, row.orgId, { scope: "tasks:read", permission: "task:read" });
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, runs, eq(runs.scheduleId, row.id), parsed.page, {
        sortableColumns: { ranAt: runs.ranAt },
        defaultSort: { field: "ranAt", column: runs.ranAt },
        select: { id: runs.id, scheduleId: runs.scheduleId, ranAt: runs.ranAt, outcome: runs.outcome, taskId: runs.taskId, detail: runs.detail, trigger: runs.trigger },
        extraCacheKey: row.id,
      });
      return { runs: items.map(runToWire), page: { nextCursor, totalCount } };
    },
  };

  /**
   * The sweep: every due, active schedule fires once. Claiming is a
   * compare-and-swap on `next_run_at` - moved past now - so a second
   * instance reading the same row loses and skips it. Missed slots are not
   * replayed. Returns how many this call fired.
   */
  async function runDueSchedules(limit = 20): Promise<number> {
    const now = clock();
    const due = await db.select().from(schedules)
      .where(and(eq(schedules.active, true), lte(schedules.nextRunAt, now)))
      .orderBy(schedules.nextRunAt).limit(limit);
    let fired = 0;
    for (const row of due) {
      const res = await db.update(schedules).set({ nextRunAt: nextRunAfter(specOf(row), now) })
        .where(and(eq(schedules.id, row.id), eq(schedules.nextRunAt, row.nextRunAt)));
      const claimed = isStandalone ? Number(res.changes) > 0 : Number(res[0]?.affectedRows) > 0;
      if (!claimed) continue;
      await fire(row, { kind: "user", userId: row.createdBy } as Principal, "schedule");
      fired++;
    }
    return fired;
  }

  return { handlers, runDueSchedules };
}

export function createSchedulesHandler(db: any, nc: any = null, clock: () => Date = () => new Date()) {
  return scheduleCore(db, nc, clock).handlers;
}

/** The sweep `index.ts` runs every minute (and tests drive with a fixed clock). */
export function createScheduleSweep(db: any, nc: any = null, clock: () => Date = () => new Date()) {
  return scheduleCore(db, nc, clock).runDueSchedules;
}
