import { runWithRequestContext } from "../../lib/requestContext";
import { createScheduleExecutor } from "./occurrenceExecution";
import { transactionConflict } from "../../db/errors";
import { withUnitOfWork } from '../../db/access';
/**
 * Recurring work (M43, ADR-0036): schedules that put a task or a workflow on
 * the queue on a cadence. Durable admission and leased atomic work receipts
 * preserve each original UTC slot across process failure (ADR-0041).
 */
import { z } from "zod/v4";
import { and, eq, isNull, lte, sql, inArray } from "drizzle-orm";
import { ConnectError, Code } from "@connectrpc/connect";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { executePaginatedQuery } from "../../db/query-builder";
import { requirePrincipal, requireUser, getProjectOrgId, authorizePrincipal } from "../../lib/authz";
import { assertCan } from "../../lib/policy";
import { publishDomainEvent } from "../../lib/natsCorrelation";
import { logger } from "../../lib/logger";
import type { Principal } from "../auth/session";
import { createWorkflowOperations } from "../workflows/workflows.handler";
import { CADENCES, nextRunAfter, type CadenceSpec } from "./cadence";

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

function runToWire(r: any, now: Date) {
  const expired = r.outcome === "running" && r.claimedUntil && new Date(r.claimedUntil).getTime() <= now.getTime();
  const detail = r.detail ?? (expired ? "Creation was interrupted; recovery is eligible." : undefined);
  const nextAttemptAt = expired ? r.claimedUntil : r.nextAttemptAt;
  return {
    id: r.id, scheduleId: r.scheduleId, ranAt: iso(r.ranAt) ?? "", outcome: expired ? "interrupted" : r.outcome,
    ...(r.taskId ? { taskId: r.taskId } : {}),
    ...(detail ? { detail } : {}),
    trigger: r.trigger,
    ...(r.slotKey ? { attempts: Number(r.attempts ?? 0) } : {}),
    ...(r.dueAt ? { dueAt: iso(r.dueAt) } : {}),
    ...(nextAttemptAt ? { nextAttemptAt: iso(nextAttemptAt) } : {}),
    ...(r.completedAt ? { completedAt: iso(r.completedAt) } : {}),
    ...(r.claimedUntil ? { claimedUntil: iso(r.claimedUntil) } : {}),
    ...(r.startedAt ? { startedAt: iso(r.startedAt) } : {}),
  };
}

const specOf = (row: any): CadenceSpec => ({
  cadence: row.cadence,
  weekdays: typeof row.weekdays === "string" ? JSON.parse(row.weekdays) : row.weekdays ?? [],
  dayOfMonth: Number(row.dayOfMonth ?? 1),
  hourUtc: Number(row.hourUtc ?? 0),
});

function scheduleCore(db: any, nc: any, clock: () => Date) {
  const isStandalone = process.env.STANDALONE === "true";
  const S = isStandalone ? schemaSqlite : schemaMysql;
  const schedules = S.schedules as any;
  const runs = S.scheduleRuns as any;
  const templates = S.workflowTemplates as any;
  const workflowOperations = createWorkflowOperations(db, nc);
  const executor = createScheduleExecutor(db, nc, clock);

  async function load(id: string, includeDeleted = false) {
    const [row] = await db.select().from(schedules).where(and(eq(schedules.id, id), includeDeleted ? undefined : isNull(schedules.deletedAt))).limit(1);
    if (!row) throw new ConnectError("schedule not found", Code.NotFound);
    return row;
  }

  async function lockProject(projectId: string, includeArchived = false) {
    let query = db.select().from(S.projects).where(eq(S.projects.id, projectId));
    if (!isStandalone) query = query.for("update");
    const [project] = await query.limit(1);
    if (!project || (!includeArchived && project.deletedAt)) throw new ConnectError("project not found", Code.NotFound);
    return project;
  }

  /** Routing is read outside the unit; all decisions follow current locking reads. */
  async function mutateSchedule<T>(id: string, mutate: (row: any) => Promise<T>) {
    const routing = await load(id);
    return withUnitOfWork(db, async () => {
      await lockProject(routing.projectId, true);
      let query = db.select().from(schedules).where(eq(schedules.id, id));
      if (!isStandalone) query = query.for("update");
      const [row] = await query.limit(1);
      if (!row || row.deletedAt) throw new ConnectError("schedule not found", Code.NotFound);
      return mutate(row);
    });
  }

  async function checkTemplate(templateId: string | undefined, orgId: string, projectId: string) {
    if (!templateId) return;
    const [t] = await db.select({ orgId: templates.orgId, projectId: templates.projectId }).from(templates).where(eq(templates.id, templateId)).limit(1);
    if (!t || t.orgId !== orgId) throw new ConnectError("workflow template not found", Code.InvalidArgument);
    if (t.projectId && t.projectId !== projectId) throw new ConnectError("that workflow template belongs to another project", Code.InvalidArgument);
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
      return withUnitOfWork(db, async () => {
        await lockProject(parsed.projectId);
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
      });
    },

    /** Replaces the cadence and target; the editor becomes the schedule's author (ADR-0036). */
    async updateSchedule(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = UpdateSchema.parse(req);
      return mutateSchedule(parsed.id, async row => {
        await assertCan(db, { kind: "user", userId }, { type: "organization", id: row.orgId }, "tasktype:write");
        const spec = checkShape(parsed);
        await checkTemplate(parsed.templateId, row.orgId, row.projectId);
        const changes = { revision: sql`${schedules.revision} + 1`, ...rowValues(parsed, spec), ...(parsed.active !== undefined ? { active: parsed.active } : {}), createdBy: userId };
        await db.update(schedules).set(changes).where(eq(schedules.id, row.id));
        publishDomainEvent(nc, "domain.schedule.updated", { id: row.id, projectId: row.projectId });
        return { schedule: toWire({ ...row, ...changes }) };
      });
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
      const scope = and(eq(schedules.orgId, orgId), isNull(schedules.deletedAt), parsed.projectId ? eq(schedules.projectId, parsed.projectId) : undefined);
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
      const { id } = IdSchema.parse(req);
      return mutateSchedule(id, async row => {
        await assertCan(db, { kind: "user", userId }, { type: "organization", id: row.orgId }, "tasktype:write");
        const now = clock();
        await db.update(schedules).set({ active: false, deletedAt: now, revision: sql`${schedules.revision} + 1` })
          .where(eq(schedules.id, row.id));
        await db.update(runs).set({ outcome: "cancelled", completedAt: now,
          detail: "The schedule was deleted before work creation committed.", frozenInputs: null,
          leaseToken: null, claimedUntil: null, nextAttemptAt: null,
        }).where(and(eq(runs.scheduleId, row.id), inArray(runs.outcome, ["queued", "running", "interrupted"])));
        publishDomainEvent(nc, "domain.schedule.deleted", { id: row.id, projectId: row.projectId });
        return { success: true };
      });
    },

    /** Fire now, as the caller, without moving the next slot. Paused schedules can still be run by hand. */
    async runSchedule(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const { id } = IdSchema.parse(req);
      const run = await admitManualSchedule(id, principal);
      if (run.outcome !== "queued") return { run: runToWire(run, clock()) };
      try {
        const lease = await executor.claim(run.id);
        if (lease) await executor.execute(lease);
        const result = await executor.loadRun(run.id);
        if (!result) throw new ConnectError("schedule run no longer exists", Code.NotFound);
        return { run: runToWire(result, clock()) };
      } catch (error) {
        if (!transactionConflict(error)) throw error;
        logger.warn({ occurrenceId: run.id, failure: "manual_execution_conflict" }, "schedule.manual_deferred");
        return { run: runToWire(run, clock()) };
      }
    },

    async listScheduleRuns(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = RunsSchema.parse(req);
      const row = await load(parsed.scheduleId, true);
      await authorizePrincipal(db, principal, row.orgId, { scope: "tasks:read", permission: "task:read" });
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, runs, eq(runs.scheduleId, row.id), parsed.page, {
        sortableColumns: { ranAt: runs.ranAt },
        defaultSort: { field: "ranAt", column: runs.ranAt },
        select: { id: runs.id, scheduleId: runs.scheduleId, ranAt: runs.ranAt, outcome: runs.outcome, taskId: runs.taskId, detail: runs.detail, trigger: runs.trigger,
          slotKey: runs.slotKey, dueAt: runs.dueAt, attempts: runs.attempts, nextAttemptAt: runs.nextAttemptAt,
          completedAt: runs.completedAt, claimedUntil: runs.claimedUntil, startedAt: runs.startedAt },
        extraCacheKey: row.id,
      });
      return { runs: items.map((row: any) => runToWire(row, clock())), page: { nextCursor, totalCount } };
    },
  };

  function inOccurrenceScope<T>(row: any, principal: Principal, action: () => T): T {
    return runWithRequestContext({ requestId: `schedule-${row.id}-${crypto.randomUUID()}`,
      orgId: row.orgId, projectId: row.projectId,
      actor: principal.kind === "user" ? { kind: "user", userId: principal.userId }
        : { kind: "agent", agentId: principal.agentId },
    }, action);
  }

  /** Called only while the project and schedule locks belong to the admission. */
  async function prepareOccurrence(row: any, principal: Principal, trigger: "schedule" | "manual", now: Date) {
    const title = `${row.taskTitle ?? row.name} — ${now.toISOString().slice(0, 10)}`;
    let frozenInputs: string | null = null;
    let detail: string | null = null;
    try {
      if (await getProjectOrgId(db, row.projectId) !== row.orgId) throw new ConnectError("project unavailable", Code.NotFound);
      await authorizePrincipal(db, principal, row.orgId, { scope: "tasks:write", permission: "task:write" });
      const workflow = row.templateId ? await workflowOperations.freezeWorkflow(row.templateId, row.projectId, title) : undefined;
      frozenInputs = JSON.stringify({ version: 1, projectId: row.projectId, orgId: row.orgId,
        title, description: row.taskDescription ?? "", priority: Number(row.taskPriority ?? 0),
        skipIfOpen: Boolean(row.skipIfOpen), ...(workflow ? { workflow } : {}) });
      if (Buffer.byteLength(frozenInputs, "utf8") > 1_048_576) {
        throw new ConnectError("schedule inputs exceed the size limit", Code.ResourceExhausted);
      }
    } catch (error) {
      if (!(error instanceof ConnectError) || ![Code.NotFound, Code.InvalidArgument, Code.FailedPrecondition,
        Code.PermissionDenied, Code.Unauthenticated, Code.ResourceExhausted].includes(error.code)) throw error;
      frozenInputs = null;
      detail = error.code === Code.PermissionDenied || error.code === Code.Unauthenticated
        ? "The run author no longer has permission to create this work."
        : "The scheduled target is unavailable or its inputs are invalid.";
    }
    const run: any = {
      id: `srun-${crypto.randomUUID()}`, scheduleId: row.id, ranAt: now,
      slotKey: trigger === "schedule" ? `scheduled:${new Date(row.nextRunAt).toISOString()}` : `manual:${crypto.randomUUID()}`,
      dueAt: trigger === "schedule" ? row.nextRunAt : null,
      outcome: detail ? "failed" : "queued", trigger, attempts: 0,
      nextAttemptAt: detail ? null : now, completedAt: detail ? now : null, detail,
      actorJson: JSON.stringify(principal.kind === "user" ? { kind: "user", userId: principal.userId }
        : { kind: "agent", agentId: principal.agentId, orgId: principal.orgId, tokenId: principal.tokenId }),
      targetKind: row.templateId ? "workflow" : "task", targetId: row.templateId ?? null,
      frozenInputs,
    };
    return run;
  }

  async function admitManualSchedule(id: string, principal: Principal) {
    return mutateSchedule(id, row => inOccurrenceScope(row, principal, async () => {
      const fresh = await executor.authorizeActor(principal, row.orgId);
      const prepared = await prepareOccurrence(row, fresh, "manual", clock());
      await db.insert(runs).values(prepared);
      if (prepared.outcome === "failed") {
        await db.update(schedules).set({ lastRunAt: prepared.completedAt, lastOutcome: "failed" }).where(eq(schedules.id, row.id));
      }
      admissionEvent(row, prepared);
      return prepared;
    }));
  }

  function admissionEvent(row: any, run: any) {
    publishDomainEvent(nc, run.outcome === "failed" ? "domain.schedule.ran" : "domain.schedule.queued", {
      scheduleId: row.id, runId: run.id, projectId: row.projectId, outcome: run.outcome, trigger: run.trigger,
    });
  }

  /** Both the claimed intent and advancement survive, or neither does. */
  async function admitDueSchedules(limit = 20) {
    const now = clock();
    let due: any[];
    try {
      due = await db.select().from(schedules)
      .where(and(eq(schedules.active, true), isNull(schedules.deletedAt), lte(schedules.nextRunAt, now)))
      .orderBy(schedules.nextRunAt).limit(limit);
    } catch (error) {
      if (!transactionConflict(error)) throw error;
      logger.warn({ failure: "occurrence_admission_scan_conflict" }, "schedule.admission_deferred");
      return [];
    }
    const admitted: Array<{ row: any; run: any }> = [];
    for (const candidate of due) {
      try {
        const result = await withUnitOfWork(db, async () => {
          let projectQuery = db.select().from(S.projects).where(eq(S.projects.id, candidate.projectId));
          if (!isStandalone) projectQuery = projectQuery.for("update");
          const [project] = await projectQuery.limit(1);
          if (!project) return null;
          let query = db.select().from(schedules).where(eq(schedules.id, candidate.id));
          if (!isStandalone) query = query.for("update");
          const [row] = await query.limit(1);
          if (!row || !row.active || row.deletedAt || row.revision !== candidate.revision
            || new Date(row.nextRunAt).getTime() !== new Date(candidate.nextRunAt).getTime()) return null;
          return inOccurrenceScope(row, { kind: "user", userId: row.createdBy }, async () => {
            const run = await prepareOccurrence(row, { kind: "user", userId: row.createdBy }, "schedule", now);
            await db.insert(runs).values(run);
            await db.update(schedules).set({ nextRunAt: nextRunAfter(specOf(row), now),
              ...(run.outcome === "failed" ? { lastRunAt: now, lastOutcome: "failed" } : {}) })
              .where(and(eq(schedules.id, row.id), eq(schedules.revision, row.revision), eq(schedules.active, true), isNull(schedules.deletedAt)));
            admissionEvent(row, run);
            return { row, run };
          });
        });
        if (result) admitted.push(result);
      } catch {
        logger.warn({ scheduleId: candidate.id, failure: "occurrence_admission_failed" }, "schedule.admission_failed");
      }
    }
    return admitted;
  }

  async function runDueSchedules(limit = 20): Promise<number> {
    const admitted = await admitDueSchedules(limit);
    await executor.runPending(limit);
    return admitted.length;
  }

  return { handlers, runDueSchedules, admitDueSchedules, admitManualSchedule };
}

export function createSchedulesHandler(db: any, nc: any = null, clock: () => Date = () => new Date()) {
  return scheduleCore(db, nc, clock).handlers;
}

/** The sweep `index.ts` runs every minute (and tests drive with a fixed clock). */
export function createScheduleSweep(db: any, nc: any = null, clock: () => Date = () => new Date()) {
  return scheduleCore(db, nc, clock).runDueSchedules;
}

/** Internal admission boundary; leased execution is composed by the sweep. */
export function createScheduleAdmission(db: any, nc: any = null, clock: () => Date = () => new Date()) {
  return scheduleCore(db, nc, clock).admitDueSchedules;
}

/** Internal admitted-intent boundary shared by manual RPC and recovery proofs. */
export function createManualScheduleAdmission(db: any, nc: any = null, clock: () => Date = () => new Date()) {
  return scheduleCore(db, nc, clock).admitManualSchedule;
}
