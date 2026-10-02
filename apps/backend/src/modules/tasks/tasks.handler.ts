import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, asc, not, isNull, inArray, sql } from "drizzle-orm";
import type { Principal } from "../auth/session";
import { insertRecord, executePaginatedQuery, notDeleted, softDeleteById, restoreById } from "../../db/query-builder";
import { requireUser, getProjectOrgId, getTaskOrgId, requirePrincipal, authorizePrincipal } from "../../lib/authz";
import { assertCan } from "../../lib/policy";
import { withIdempotency } from "../../lib/idempotency";
import { getLatestHandoffNote, recordTaskNote } from "./task_notes.handler";
import { recordTaskActivity, isTerminalStatus, currentAssignee, actorFromPrincipal, terminalStatusSql } from "./taskActivity";
import { purgeTaskCascade } from "../../lib/cascadePurge";
import { createInputRequestHandlers, openInputRequestCounts } from "./inputRequests";
import { MAX_PRIORITY, priorityRankSql, LINK_KINDS, assertLinkAllowed, openBlockerCounts, hasOpenBlockerSql, newlyUnblocked, assertParentAllowed, insertLink, deleteLink, listLinks } from "./taskGraph";
import { ConnectError, Code } from "@connectrpc/connect";

// Distinguishes a real DB-level unique-constraint violation (a concurrent
// createTaskStatus/addTaskReviewer call won the race for the same unique
// key) from any other insert failure, so only the former is treated as a
// benign duplicate rather than a raw DB error reaching the caller (M19-T03,
// same pattern as artifacts.handler.ts/labels.handler.ts).
function isUniqueConstraintConflict(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e);
  return (
    msg.includes("task_statuses_task_type_id_name_idx") ||
    msg.includes("task_reviewers_task_id_user_id_idx") ||
    msg.includes("UNIQUE constraint failed") ||
    msg.includes("Duplicate entry")
  );
}

// --- Zod Request Schemas ---

const GetTaskTypeSchema = z.object({
  id: z.string().min(1, "id is required"),
});

const CreateTaskTypeSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  projectId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  name: z.string().min(1, "name is required").max(256),
});

const ListTaskTypesSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  page: z.any().optional(),
});

const UpdateTaskTypeSchema = z.object({
  id: z.string().min(1, "id is required"),
  name: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).max(256).optional()),
  parentId: z.preprocess((v) => (v === "" ? undefined : v), z.string().nullable().optional()),
});

const CreateTaskSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  title: z.string().min(1, "title is required").max(512),
  // Proto3 can't distinguish an omitted string field from an empty one - the
  // CLI/GUI always send status: "" when the caller didn't pick one - so ""
  // must be treated the same as "not provided" for the default to ever apply.
  status: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(256).optional().default("todo")),
  description: z.string().max(4096).optional().default(""),
  taskTypeId: z.string().nullable().optional(),
  // M14-T07. Same "" -> unset treatment as status above: a caller that
  // doesn't set a key sends "" over the wire, and that must mean "no
  // idempotency requested", not "replay whatever the empty string mapped to
  // last time".
  idempotencyKey: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(256).optional()),
  // M35 (ADR-0028). 0 none, 1 urgent .. 4 low.
  priority: z.number().int().min(0).max(MAX_PRIORITY).optional().default(0),
  parentTaskId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  blockedBy: z.array(z.string().min(1)).max(50).optional().default([]),
  discoveredFromTaskId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
});

const TaskLinkSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  linkedTaskId: z.string().min(1, "linkedTaskId is required"),
  kind: z.enum(LINK_KINDS, { message: `kind must be one of ${LINK_KINDS.join(", ")}` }),
});

/** M38 (ADR-0031). */
const PLAN_STEP_STATUSES = ["pending", "in_progress", "done", "skipped"] as const;
const SetTaskPlanSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  steps: z.array(z.object({
    title: z.string().trim().min(1, "a step needs a title").max(500),
    status: z.enum(PLAN_STEP_STATUSES, { message: `step status must be one of ${PLAN_STEP_STATUSES.join(", ")}` }),
  })).max(50, "a plan has at most 50 steps").optional().default([]),
});

const ListTaskLinksSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
});

/** M35: the columns every task list returns - description stays out (M07-T01). */
function taskListSelect(tasks: any) {
  return {
    id: tasks.id,
    projectId: tasks.projectId,
    displayId: tasks.displayId,
    taskTypeId: tasks.taskTypeId,
    createdBy: tasks.createdBy,
    title: tasks.title,
    status: tasks.status,
    createdAt: tasks.createdAt,
    deletedAt: tasks.deletedAt,
    priority: tasks.priority,
    parentTaskId: tasks.parentTaskId,
    // Not on the wire: the sort key for `sort: "priority"`, where "none" ranks
    // after "low". Stripped before the response leaves (see toWireTask).
    priorityRank: priorityRankSql(tasks),
  };
}

/** A task row as the wire `Task` carries it. */
function toWireTask(t: any, extra: Record<string, unknown> = {}) {
  const { priorityRank: _rank, plan, ...rest } = t;
  return {
    ...rest,
    // M38 (ADR-0031): stored as JSON text; lists never select it.
    plan: typeof plan === "string" ? JSON.parse(plan) : [],
    parentTaskId: rest.parentTaskId ?? undefined,
    createdAt: rest.createdAt instanceof Date ? rest.createdAt.toISOString() : rest.createdAt,
    ...extra,
  };
}

const CreateTaskStatusSchema = z.object({
  taskTypeId: z.string().min(1, "taskTypeId is required"),
  name: z.string().min(1, "name is required").max(256),
});

const CreateTaskStatusTransitionSchema = z.object({
  taskTypeId: z.string().min(1, "taskTypeId is required"),
  fromStatusId: z.string().min(1, "fromStatusId is required"),
  toStatusId: z.string().min(1, "toStatusId is required"),
});

// Naming nobody would match the "both null" row shape and delete an assignment
// the caller never named, so at least one is required.
const UnassignTaskSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  agentId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  userId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
}).refine((v) => !!v.agentId || !!v.userId, {
  message: "either agentId or userId is required",
});

const AssignTaskSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  agentId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
}).refine((data) => !!data.agentId || !!data.userId, {
  message: "either agentId or userId is required",
});

const ClaimTaskSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  idempotencyKey: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(256).optional()),
});

const ClaimNextTaskSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  taskTypeId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  idempotencyKey: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(256).optional()),
  labelId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
});

const ListMyTasksSchema = z.object({
  orgId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  includeTerminal: z.boolean().optional(),
  page: z.any().optional(),
});

const ReleaseTaskSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  handoffNote: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(20_000).optional()),
});

/**
 * ClaimNextTask's candidate window (M33-T02). Every agent asks for the oldest
 * work, so all of them would race for the same row; each one instead tries the
 * oldest few in a shuffled order, which spreads concurrent claimers across the
 * window, and moves on when it loses.
 */
const CLAIM_NEXT_WINDOW = 20;
const CLAIM_NEXT_ROUNDS = 3;

/** Fisher-Yates, so each caller walks the candidate window in its own order. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * M35 (ADR-0028): the window shuffled *within* each priority, never across -
 * concurrent claimers still spread out, but no caller takes a low-priority
 * task while an urgent one in its window is free.
 */
function shuffleWithinPriority<T extends { rank: unknown }>(items: T[]): T[] {
  const groups = new Map<number, T[]>();
  for (const it of items) {
    const rank = Number(it.rank);
    groups.set(rank, [...(groups.get(rank) ?? []), it]);
  }
  return [...groups.keys()].sort((a, b) => a - b).flatMap((rank) => shuffle(groups.get(rank)!));
}

const AddTaskReviewerSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  userId: z.string().min(1, "userId is required"),
});

const RemoveTaskReviewerSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  userId: z.string().min(1, "userId is required"),
});

const ListTaskReviewersSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
});

// Tasks with no taskTypeId (or a type with no statuses configured) fall back
// to this fixed enum - the default, zero-setup workflow. A task type with
// statuses configured switches to that type's own state machine instead.
const KNOWN_STATUSES = ["todo", "in-progress", "done"] as const;

const UpdateTaskStatusSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  status: z.string().min(1, "status is required").max(256),
});

const DeleteTaskStatusTransitionSchema = z.object({
  transitionId: z.string().min(1, "transitionId is required"),
  taskTypeId: z.string().min(1, "taskTypeId is required"),
});

const ReorderTaskStatusesSchema = z.object({
  taskTypeId: z.string().min(1, "taskTypeId is required"),
  statusIds: z.array(z.string().min(1)).min(1, "statusIds is required"),
});

const UpdateTaskSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  title: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).max(512).optional()),
  // description has proto3 `optional` presence tracking end to end (the
  // wire distinguishes "field omitted" from "field explicitly set to
  // empty"), so unlike title it must NOT collapse "" into undefined —
  // that would make clearing a description a silent no-op (M14-T01).
  description: z.string().max(4096).optional(),
  taskTypeId: z.preprocess((v) => (v === "" ? undefined : v), z.string().nullable().optional()),
  // M35. Proto3 `optional`, so 0 ("none") is a real value, not "unset".
  priority: z.number().int().min(0).max(MAX_PRIORITY).optional(),
  // M35. "" clears the parent; unset leaves it.
  parentTaskId: z.string().optional(),
});

const DeleteTaskSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
});

const RestoreTaskSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
});

const PurgeTaskSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
});

const GetTaskSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
});

const ListTasksSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  page: z.any().optional(),
  onlyDeleted: z.boolean().optional(),
  status: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(256).optional()),
  assigneeFilter: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  // M35.
  priority: z.number().int().min(0).max(MAX_PRIORITY).optional(),
  ready: z.boolean().optional(),
  labelId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  parentTaskId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
});

/** M35: `EXISTS` the label on the task - label-based routing. */
function hasLabelSql(tasks: any, isStandalone: boolean, labelId: string) {
  const el = isStandalone ? schemaSqlite.entityLabels : schemaMysql.entityLabels;
  return sql`EXISTS (SELECT 1 FROM ${el} WHERE ${(el as any).entityId} = ${tasks.id} AND ${(el as any).entityType} = 'task' AND ${(el as any).labelId} = ${labelId})`;
}

// --- Handler Factories ---

export const createTasksHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async getTaskType(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = GetTaskTypeSchema.parse(req);
      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const result = await db.select().from(types).where(eq((types as any).id, parsed.id)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("task type not found", Code.NotFound);
      await authorizePrincipal(db, principal, result[0].orgId, { scope: 'tasks:read', permission: 'tasktype:read' });

      const taskType = result[0];
      const statusesSchema = isStandalone ? schemaSqlite.taskStatuses : schemaMysql.taskStatuses;
      // Ordered, because statuses are a pipeline: the board renders them as
      // columns, and "whatever the database returns" is not an order (M05-T09).
      const statuses = await db
        .select()
        .from(statusesSchema)
        .where(eq((statusesSchema as any).taskTypeId, parsed.id))
        .orderBy((statusesSchema as any).position, (statusesSchema as any).id);

      const transitionsSchema = isStandalone ? schemaSqlite.taskStatusTransitions : schemaMysql.taskStatusTransitions;
      const transitions = await db.select().from(transitionsSchema).where(eq((transitionsSchema as any).taskTypeId, parsed.id));

      return {
        taskType: { ...taskType, createdAt: taskType.createdAt instanceof Date ? taskType.createdAt.toISOString() : taskType.createdAt },
        statuses: statuses,
        transitions: transitions,
      };
    },
    async createTaskType(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = CreateTaskTypeSchema.parse(req);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: parsed.orgId }, "tasktype:write");

      if (parsed.projectId) {
        const orgIdForProject = await getProjectOrgId(db, parsed.projectId);
        if (orgIdForProject !== parsed.orgId) {
          throw new ConnectError("project belongs to a different organization", Code.InvalidArgument);
        }
      }

      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;

      if (parsed.parentId) {
        const parentRows = await db.select().from(types).where(eq((types as any).id, parsed.parentId)).limit(1);
        if (!parentRows || parentRows.length === 0) throw new ConnectError("parent task type not found", Code.NotFound);
        if (parentRows[0].orgId !== parsed.orgId) {
          throw new ConnectError("parent task type belongs to a different organization", Code.InvalidArgument);
        }
        // A project-scoped parent must stay within its own project's type
        // tree; an org-wide parent (projectId null) is reusable across
        // any project, so only enforce the match when the parent itself
        // is project-scoped.
        if (parentRows[0].projectId && parentRows[0].projectId !== (parsed.projectId || null)) {
          throw new ConnectError("parent task type belongs to a different project", Code.InvalidArgument);
        }
      }

      const newId = `tt-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        orgId: parsed.orgId,
        projectId: parsed.projectId || null,
        parentId: parsed.parentId || null,
        name: parsed.name,
      };

      await insertRecord(db, types, payload, isStandalone);

      const taskTypeResp = { ...payload, createdAt: new Date().toISOString() };

      publishDomainEvent(nc, "domain.task_type.created", payload);
      return { taskType: taskTypeResp };
    },
    async listTaskTypes(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      if (!(req as any)?.orgId) throw new ConnectError("orgId is required", Code.InvalidArgument);
      const parsed = ListTaskTypesSchema.parse(req);
      await authorizePrincipal(db, principal, parsed.orgId, { scope: 'tasks:read', permission: 'tasktype:read' });

      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const { items, nextCursor, totalCount } = await executePaginatedQuery(
        db, types, eq((types as any).orgId, parsed.orgId), parsed.page,
        {
          filterColumn: (types as any).name,
          sortableColumns: { name: (types as any).name, createdAt: (types as any).createdAt },
          select: {
            id: (types as any).id,
            orgId: (types as any).orgId,
            projectId: (types as any).projectId,
            parentId: (types as any).parentId,
            name: (types as any).name,
            createdAt: (types as any).createdAt,
          },
        },
      );

      return {
        taskTypes: items.map((t: any) => ({
          ...t,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
    async updateTaskType(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = UpdateTaskTypeSchema.parse(req);

      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const existing = await db.select().from(types).where(eq((types as any).id, parsed.id)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("task type not found", Code.NotFound);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: existing[0].orgId }, "tasktype:write");

      if (parsed.parentId) {
        if (parsed.parentId === parsed.id) {
          throw new ConnectError("a task type cannot be its own parent", Code.InvalidArgument);
        }
        const parentRows = await db.select().from(types).where(eq((types as any).id, parsed.parentId)).limit(1);
        if (!parentRows || parentRows.length === 0) throw new ConnectError("parent task type not found", Code.NotFound);
        if (parentRows[0].orgId !== existing[0].orgId) {
          throw new ConnectError("parent task type belongs to a different organization", Code.InvalidArgument);
        }
        // M19-T03: same project-scope rule createTaskType already enforces on
        // create - a project-scoped parent must stay within its own
        // project's type tree; an org-wide parent (projectId null) is
        // reusable by any project. Reparenting had never checked this.
        if (parentRows[0].projectId && parentRows[0].projectId !== (existing[0].projectId || null)) {
          throw new ConnectError("parent task type belongs to a different project", Code.InvalidArgument);
        }

        // M19-T03: createTaskType can never introduce a cycle - every type it
        // creates is brand new, so it can't already be its own ancestor.
        // Reparenting an *existing* type can: walk the new parent's ancestor
        // chain and reject if it leads back to the type being updated,
        // otherwise the tree stops being a tree - anything that walks "up to
        // the root" (a breadcrumb, a depth computation) loops forever.
        let cursor: any = parentRows[0];
        const visited = new Set<string>([parsed.id]);
        while (cursor.parentId) {
          if (cursor.parentId === parsed.id) {
            throw new ConnectError("this parent is a descendant of the task type being updated - would create a cycle", Code.InvalidArgument);
          }
          if (visited.has(cursor.parentId)) break; // pre-existing cycle in stored data; do not loop forever here.
          visited.add(cursor.parentId);
          const nextRows = await db.select().from(types).where(eq((types as any).id, cursor.parentId)).limit(1);
          if (!nextRows || nextRows.length === 0) break;
          cursor = nextRows[0];
        }
      }

      const updates: Record<string, unknown> = {};
      if (parsed.name !== undefined) updates.name = parsed.name;
      if (parsed.parentId !== undefined) updates.parentId = parsed.parentId;

      await db.update(types).set(updates).where(eq((types as any).id, parsed.id));

      const updated = { ...existing[0], ...updates };
      const taskTypeResp = { ...updated, createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt };
      publishDomainEvent(nc, "domain.task_type.updated", updated);
      return { taskType: taskTypeResp };
    },
    async createTaskStatus(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = CreateTaskStatusSchema.parse(req);

      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.taskTypeId)).limit(1);
      if (!typeRows || typeRows.length === 0) throw new ConnectError("task type not found", Code.NotFound);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: typeRows[0].orgId }, "tasktype:write");

      const statuses = isStandalone ? schemaSqlite.taskStatuses : schemaMysql.taskStatuses;
      // Two statuses with the same name under one task type would make
      // validateStatusForTaskType's name-based lookup silently pick
      // whichever row comes first, hiding transition edges configured
      // against the "other" duplicate.
      const existing = await db.select().from(statuses)
        .where(and(eq((statuses as any).taskTypeId, parsed.taskTypeId), eq((statuses as any).name, parsed.name)))
        .limit(1);
      if (existing.length > 0) {
        throw new ConnectError("a status with this name already exists for this task type", Code.AlreadyExists);
      }

      // Appended, not inserted: a new status arriving in the middle of an
      // existing pipeline would silently reorder the board.
      const siblings = await db.select().from(statuses).where(eq((statuses as any).taskTypeId, parsed.taskTypeId));
      const position = siblings.reduce((max: number, r: any) => Math.max(max, Number(r.position ?? 0) + 1), 0);

      const newId = `tst-${crypto.randomUUID()}`;
      const payload = { id: newId, taskTypeId: parsed.taskTypeId, name: parsed.name, position };

      // M19-T03: the select-then-insert check above has a race window - fall
      // back to catching the DB's own unique-constraint violation for a
      // concurrent duplicate insert, so it surfaces as AlreadyExists instead
      // of a raw DB error.
      try {
        await insertRecord(db, statuses, payload, isStandalone, false);
      } catch (e) {
        if (!isUniqueConstraintConflict(e)) throw e;
        throw new ConnectError("a status with this name already exists for this task type", Code.AlreadyExists);
      }

      publishDomainEvent(nc, "domain.task_status.created", payload);
      return { status: payload };
    },
    async createTaskStatusTransition(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = CreateTaskStatusTransitionSchema.parse(req);

      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.taskTypeId)).limit(1);
      if (!typeRows || typeRows.length === 0) throw new ConnectError("task type not found", Code.NotFound);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: typeRows[0].orgId }, "tasktype:write");

      const statuses = isStandalone ? schemaSqlite.taskStatuses : schemaMysql.taskStatuses;
      const [fromRows, toRows] = await Promise.all([
        db.select().from(statuses).where(eq((statuses as any).id, parsed.fromStatusId)).limit(1),
        db.select().from(statuses).where(eq((statuses as any).id, parsed.toStatusId)).limit(1),
      ]);
      if (!fromRows.length || fromRows[0].taskTypeId !== parsed.taskTypeId) {
        throw new ConnectError("fromStatusId does not belong to this task type", Code.InvalidArgument);
      }
      if (!toRows.length || toRows[0].taskTypeId !== parsed.taskTypeId) {
        throw new ConnectError("toStatusId does not belong to this task type", Code.InvalidArgument);
      }

      const transitions = isStandalone ? schemaSqlite.taskStatusTransitions : schemaMysql.taskStatusTransitions;
      const existingTransition = await db.select().from(transitions)
        .where(and(
          eq((transitions as any).taskTypeId, parsed.taskTypeId),
          eq((transitions as any).fromStatusId, parsed.fromStatusId),
          eq((transitions as any).toStatusId, parsed.toStatusId),
        ))
        .limit(1);
      if (existingTransition.length > 0) return { transition: existingTransition[0] };

      const newId = `tstr-${crypto.randomUUID()}`;
      const payload = { id: newId, taskTypeId: parsed.taskTypeId, fromStatusId: parsed.fromStatusId, toStatusId: parsed.toStatusId };

      await insertRecord(db, transitions, payload, isStandalone, false);

      publishDomainEvent(nc, "domain.task_status_transition.created", payload);
      return { transition: payload };
    },
    async deleteTaskStatusTransition(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = DeleteTaskStatusTransitionSchema.parse(req);

      // Authorized against the *type*, not the edge. Looking the edge up first
      // and returning success when it is missing would answer "yes" to any id
      // at all, from anyone, without an authorization check ever running.
      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.taskTypeId)).limit(1);
      if (!typeRows.length) throw new ConnectError("task type not found", Code.NotFound);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: typeRows[0].orgId }, "tasktype:write");

      // Idempotent on the pair: an edge removed twice is the same end state,
      // and the second ✕ arrives from a stale list often enough to matter.
      const transitions = isStandalone ? schemaSqlite.taskStatusTransitions : schemaMysql.taskStatusTransitions;
      await db.delete(transitions).where(and(
        eq((transitions as any).id, parsed.transitionId),
        eq((transitions as any).taskTypeId, parsed.taskTypeId),
      ));
      publishDomainEvent(nc, "domain.task_status_transition.deleted", { id: parsed.transitionId });
      return { success: true };
    },
    async reorderTaskStatuses(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ReorderTaskStatusesSchema.parse(req);

      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.taskTypeId)).limit(1);
      if (!typeRows.length) throw new ConnectError("task type not found", Code.NotFound);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: typeRows[0].orgId }, "tasktype:write");

      const statuses = isStandalone ? schemaSqlite.taskStatuses : schemaMysql.taskStatuses;
      const current = await db.select().from(statuses).where(eq((statuses as any).taskTypeId, parsed.taskTypeId));

      // The request must name every status of this type exactly once. A partial
      // list would leave the unnamed ones at stale positions - which is how two
      // statuses end up sharing one - and a foreign id would silently do
      // nothing.
      const have = new Set(current.map((r: any) => r.id));
      const want = new Set(parsed.statusIds);
      if (want.size !== parsed.statusIds.length) {
        throw new ConnectError("statusIds contains a duplicate", Code.InvalidArgument);
      }
      if (want.size !== have.size || parsed.statusIds.some((id) => !have.has(id))) {
        throw new ConnectError("statusIds must list every status of this task type exactly once", Code.InvalidArgument);
      }

      for (const [index, id] of parsed.statusIds.entries()) {
        await db.update(statuses).set({ position: index }).where(eq((statuses as any).id, id));
      }

      const reordered = await db
        .select()
        .from(statuses)
        .where(eq((statuses as any).taskTypeId, parsed.taskTypeId))
        .orderBy((statuses as any).position, (statuses as any).id);
      publishDomainEvent(nc, "domain.task_statuses.reordered", { taskTypeId: parsed.taskTypeId });
      return { statuses: reordered };
    },
  };
};

/**
 * Validates a status value against a task's type state machine, falling back
 * to the fixed KNOWN_STATUSES enum whenever there's nothing configured to
 * enforce instead - a task with no taskTypeId, or a type with no statuses
 * defined yet, behaves exactly as it always has.
 */
async function validateStatusForTaskType(
  db: any,
  isStandalone: boolean,
  taskTypeId: string | null,
  currentStatus: string | null,
  newStatus: string
): Promise<void> {
  if (!taskTypeId) {
    if (!(KNOWN_STATUSES as readonly string[]).includes(newStatus)) {
      throw new ConnectError(`invalid status "${newStatus}" - expected one of: ${KNOWN_STATUSES.join(", ")}`, Code.InvalidArgument);
    }
    return;
  }

  const statusesTable = isStandalone ? schemaSqlite.taskStatuses : schemaMysql.taskStatuses;
  const configuredStatuses = await db.select().from(statusesTable).where(eq((statusesTable as any).taskTypeId, taskTypeId));

  if (configuredStatuses.length === 0) {
    if (!(KNOWN_STATUSES as readonly string[]).includes(newStatus)) {
      throw new ConnectError(`invalid status "${newStatus}" - expected one of: ${KNOWN_STATUSES.join(", ")}`, Code.InvalidArgument);
    }
    return;
  }

  const newStatusRow = configuredStatuses.find((s: any) => s.name === newStatus);
  if (!newStatusRow) {
    throw new ConnectError(
      `invalid status "${newStatus}" for this task's type - expected one of: ${configuredStatuses.map((s: any) => s.name).join(", ")}`,
      Code.InvalidArgument
    );
  }

  if (currentStatus === null) return; // Task creation: no prior status, so no transition edge to check.
  if (currentStatus === newStatus) return; // No-op update - always allowed, regardless of configured edges.

  const currentStatusRow = configuredStatuses.find((s: any) => s.name === currentStatus);
  if (!currentStatusRow) return; // Current status predates this type's state machine - allow moving into it.

  const transitionsTable = isStandalone ? schemaSqlite.taskStatusTransitions : schemaMysql.taskStatusTransitions;
  const edges = await db.select().from(transitionsTable).where(eq((transitionsTable as any).taskTypeId, taskTypeId));
  if (edges.length === 0) return; // No transitions configured yet - only status membership is enforced.

  const allowed = edges.some((e: any) => e.fromStatusId === currentStatusRow.id && e.toStatusId === newStatusRow.id);
  if (!allowed) {
    throw new ConnectError(`transition from "${currentStatus}" to "${newStatus}" is not allowed for this task's type`, Code.InvalidArgument);
  }
}

export const createTaskManagementHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";

  /**
   * The atomic claim (M14-T06): one `INSERT ... SELECT ... WHERE NOT EXISTS`,
   * so of several callers racing one task exactly one wins, with no gap
   * between check and write on either dialect. Shared by ClaimTask and
   * ClaimNextTask (M33-T02). Records `source = 'claim'` (ADR-0027). True when
   * this call won.
   */
  async function insertClaim(taskId: string, principal: Principal): Promise<boolean> {
    const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;
    const newId = `ta-${crypto.randomUUID()}`;
    const selfAgentId = principal.kind === "agent" ? principal.agentId : null;
    const selfUserId = principal.kind === "user" ? principal.userId : null;
    const insertResult = isStandalone
      ? await db.run(sql`
          INSERT INTO ${assignments} (id, task_id, agent_id, user_id, source)
          SELECT ${newId}, ${taskId}, ${selfAgentId}, ${selfUserId}, 'claim'
          WHERE NOT EXISTS (SELECT 1 FROM ${assignments} WHERE ${(assignments as any).taskId} = ${taskId})
        `)
      : await db.execute(sql`
          INSERT INTO ${assignments} (id, task_id, agent_id, user_id, source)
          SELECT ${newId}, ${taskId}, ${selfAgentId}, ${selfUserId}, 'claim'
          FROM DUAL
          WHERE NOT EXISTS (SELECT 1 FROM ${assignments} WHERE ${(assignments as any).taskId} = ${taskId})
        `);
    return Boolean(isStandalone ? (insertResult as any).changes : (insertResult as any)[0]?.affectedRows);
  }

  /** What a won claim does next - activity, event, and the response with any prior handoff note. */
  async function completeClaim(taskId: string, principal: Principal) {
    const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
    const [task] = await db.select().from(tasks).where(eq((tasks as any).id, taskId)).limit(1);
    const selfAgentId = principal.kind === "agent" ? principal.agentId : null;
    const selfUserId = principal.kind === "user" ? principal.userId : null;
    // M24-T04 (ADR-0020): only a WON claim is recorded - claim_rejected is
    // deliberately not a kind - and inside the caller's withIdempotency
    // callback, so a replayed claim replays the stored response without a
    // second row.
    await recordTaskActivity(db, isStandalone, {
      taskId,
      projectId: task.projectId,
      kind: "claimed",
      ...actorFromPrincipal(principal),
      assigneeAgentId: selfAgentId,
      assigneeUserId: selfUserId,
    });
    publishDomainEvent(nc, "domain.task.claimed", { taskId, agentId: selfAgentId, userId: selfUserId });
    // M22-T04 (ADR-0017): the moment a claim succeeds is when prior handoff
    // context matters most - the new claimant sees it in the same round trip.
    const latestHandoffNote = await getLatestHandoffNote(db, taskId, isStandalone);
    return {
      task: toWireTask(task, { blockedByOpenCount: (await openBlockerCounts(db, isStandalone, [taskId])).get(taskId) ?? 0 }),
      ...(latestHandoffNote ? { latestHandoffNote } : {}),
    };
  }

  /**
   * Resolves assignees for a page of tasks, with display names, in a fixed
   * number of queries regardless of how many tasks there are.
   *
   * task_assignments has stored these since M01 and nothing could read them, so
   * every card rendered a hardcoded avatar instead (M05-T02). One query per
   * task would be correct and would also make a 100-task page cost 100 round
   * trips, growing with the page size - the shape M03 spent a milestone
   * removing elsewhere.
   */
  const assigneesByTask = async (taskIds: string[]): Promise<Map<string, any[]>> => {
    const byTask = new Map<string, any[]>();
    if (taskIds.length === 0) return byTask;

    const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;
    const usersTable = isStandalone ? schemaSqlite.users : schemaMysql.users;
    const agentsTable = isStandalone ? schemaSqlite.agents : schemaMysql.agents;

    const rows = await db.select().from(assignments).where(inArray((assignments as any).taskId, taskIds));
    if (rows.length === 0) return byTask;

    const userIds = [...new Set(rows.map((r: any) => r.userId).filter(Boolean))] as string[];
    const agentIds = [...new Set(rows.map((r: any) => r.agentId).filter(Boolean))] as string[];
    const [userRows, agentRows] = await Promise.all([
      userIds.length ? db.select().from(usersTable).where(inArray((usersTable as any).id, userIds)) : [],
      agentIds.length ? db.select().from(agentsTable).where(inArray((agentsTable as any).id, agentIds)) : [],
    ]);
    const userName = new Map(userRows.map((u: any) => [u.id, u.name || u.email]));
    const agentName = new Map(agentRows.map((a: any) => [a.id, a.name]));

    for (const r of rows) {
      const list = byTask.get(r.taskId) ?? [];
      list.push({
        userId: r.userId ?? "",
        agentId: r.agentId ?? "",
        // Falling back to the id keeps a row visible when the referenced
        // account has gone: "assigned to someone we cannot name" beats
        // silently dropping the assignment and showing the task as unowned.
        name: r.userId ? (userName.get(r.userId) ?? r.userId) : (agentName.get(r.agentId) ?? r.agentId),
      });
      byTask.set(r.taskId, list);
    }
    return byTask;
  };

  async function openBlockerCount(taskId: string): Promise<number> {
    return (await openBlockerCounts(db, isStandalone, [taskId])).get(taskId) ?? 0;
  }

  /**
   * M35 (ADR-0028): after `taskId` finished (or was binned), announce each
   * task it was blocking that now has no unfinished blocker - the signal an
   * idle agent or webhook consumer waits for. Cheap when nothing depends on
   * the task: one indexed lookup.
   */
  async function announceUnblocked(taskId: string): Promise<void> {
    const [row] = await db.select({ status: (taskTable as any).status, taskTypeId: (taskTable as any).taskTypeId, deletedAt: (taskTable as any).deletedAt })
      .from(taskTable).where(eq((taskTable as any).id, taskId)).limit(1);
    if (!row) return;
    if (!row.deletedAt && !(await isTerminalStatus(db, isStandalone, row.taskTypeId ?? null, row.status))) return;
    for (const id of await newlyUnblocked(db, isStandalone, taskId)) {
      publishDomainEvent(nc, "domain.task.unblocked", { taskId: id, unblockedBy: taskId });
    }
  }
  const taskTable = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;

  return {
    // M38 (ADR-0031): questions an agent asks a person, on this same service.
    ...createInputRequestHandlers(db, nc, isStandalone),
    async createTask(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = CreateTaskSchema.parse(req);
      // M14-T07: everything past this point - including the display-id
      // claim below - only runs once per (principal, key). A replay skips
      // straight to the stored response, so a retried create cannot double
      // the project's task counter either.
      return withIdempotency(db, isStandalone, principal, "createTask", parsed.idempotencyKey, parsed, async () => {
        const orgId = await getProjectOrgId(db, parsed.projectId);
        await authorizePrincipal(db, principal, orgId, { scope: 'tasks:write', permission: 'task:write' });

        if (parsed.taskTypeId) {
          const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
          const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.taskTypeId)).limit(1);
          if (!typeRows || typeRows.length === 0) throw new ConnectError("task type not found", Code.NotFound);
          if (typeRows[0].orgId !== orgId) throw new ConnectError("task type belongs to a different organization", Code.InvalidArgument);
          // M19-T03: createTaskType already refuses to let a project-scoped
          // type parent a different project's type (see its own comment) -
          // this closes the matching gap on the task side: a project-scoped
          // type could otherwise be attached to a task in any project in the
          // org, not just the project it was scoped to. An org-wide type
          // (projectId null) stays usable by any project.
          if (typeRows[0].projectId && typeRows[0].projectId !== parsed.projectId) {
            throw new ConnectError("task type belongs to a different project", Code.InvalidArgument);
          }
        }
        await validateStatusForTaskType(db, isStandalone, parsed.taskTypeId || null, null, parsed.status);
        // M35 (ADR-0028): every relation is checked before anything is
        // written, so a bad blocker cannot leave a half-linked task behind.
        // A new task cannot close a cycle - nothing points at it yet.
        if (parsed.parentTaskId) await assertParentAllowed(db, isStandalone, null, parsed.projectId, parsed.parentTaskId);
        const newLinks = [
          ...[...new Set(parsed.blockedBy)].map((id) => ({ linkedTaskId: id, kind: "blocked_by" as const })),
          ...(parsed.discoveredFromTaskId ? [{ linkedTaskId: parsed.discoveredFromTaskId, kind: "discovered_from" as const }] : []),
        ];
        for (const l of newLinks) await assertLinkAllowed(db, isStandalone, orgId, null, l.linkedTaskId, l.kind);

        const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
        const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;

        // Claim this project's next task number, then build a stable,
        // human-readable display ID from the project's key + that number (e.g.
        // "ENG-42") - assigned once here, never recomputed, so it survives a
        // later project rename.
        //
        // The claim must be a single indivisible read-modify-write. It was not:
        // this ran `await db.transaction(async tx => …)` for both dialects, and
        // on bun:sqlite that transaction did nothing at all. Drizzle hands the
        // callback to `client.transaction(fn)`, which commits as soon as `fn`
        // returns; an `async` callback returns a promise immediately, so COMMIT
        // landed before the read had happened. Eight concurrent creates against
        // one project all returned `ENG-1`.
        //
        // The two dialects need different code, and the comment that used to sit
        // here - "SQLite's single-writer model makes this atomic without
        // locking" - was the mistake. Single-writer protects one *statement*.
        // Between an awaited SELECT and an awaited UPDATE the event loop is free
        // to run another request's SELECT, and that is exactly what happened.
        let projectRow: any;
        let taskNumber: number;

        if (isStandalone) {
          // Synchronous throughout: no `await` anywhere inside, so nothing can
          // interleave between the read and the write, and drizzle's sync
          // transaction commits only after both have run.
          const claim = db.transaction((tx: any) => {
            const [row] = tx.select().from(ps).where(eq((ps as any).id, parsed.projectId)).all();
            const claimedNumber = row.nextTaskNumber;
            tx.update(ps).set({ nextTaskNumber: claimedNumber + 1 }).where(eq((ps as any).id, parsed.projectId)).run();
            return { projectRow: row, taskNumber: claimedNumber };
          });
          projectRow = claim.projectRow;
          taskNumber = claim.taskNumber;
        } else {
          // mysql2's transaction is genuinely async and holds one pooled
          // connection, so `SELECT ... FOR UPDATE` locks the project row for the
          // duration and two concurrent creates serialise on it.
          const claim = await db.transaction(async (tx: any) => {
            const [row] = await tx.select().from(ps).where(eq((ps as any).id, parsed.projectId)).for("update").limit(1);
            const claimedNumber = row.nextTaskNumber;
            await tx.update(ps).set({ nextTaskNumber: claimedNumber + 1 }).where(eq((ps as any).id, parsed.projectId));
            return { projectRow: row, taskNumber: claimedNumber };
          });
          projectRow = claim.projectRow;
          taskNumber = claim.taskNumber;
        }

        const displayId = `${projectRow.key}-${taskNumber}`;

        const newId = `tsk-${crypto.randomUUID()}`;
        // M19-T02: set explicitly rather than left to insertRecord's default -
        // that default only fires in standalone/sqlite mode, and either way it
        // was never added to the object returned below, only to the copy
        // insertRecord wrote to the DB.
        const payload = {
          id: newId,
          projectId: parsed.projectId,
          displayId,
          taskTypeId: parsed.taskTypeId || null,
          createdBy: principal.kind === 'user' ? principal.userId : null,
          title: parsed.title,
          status: parsed.status,
          description: parsed.description,
          createdAt: new Date(),
          priority: parsed.priority,
          parentTaskId: parsed.parentTaskId ?? null,
        };

        await insertRecord(db, tasks, payload, isStandalone, false);
        for (const l of newLinks) {
          await insertLink(db, isStandalone, { taskId: newId, ...l, createdBy: principal.kind === "user" ? principal.userId : principal.agentId });
        }

        // M24-T04 (ADR-0020): inside the withIdempotency callback, so a
        // replayed create replays the stored response without re-recording.
        // The actor is the request principal - this is what makes
        // agent-created tasks attributable (tasks.createdBy is users-only).
        // A just-created task has no assignment.
        await recordTaskActivity(db, isStandalone, {
          taskId: newId,
          projectId: parsed.projectId,
          kind: "created",
          toStatus: parsed.status,
          toIsTerminal: await isTerminalStatus(db, isStandalone, parsed.taskTypeId || null, parsed.status),
          ...actorFromPrincipal(principal),
        });

        publishDomainEvent(nc, "domain.task.created", payload);
        return { task: toWireTask(payload, { assignees: [], blockedByOpenCount: parsed.blockedBy.length > 0 ? await openBlockerCount(newId) : 0 }) };
      });
    },
    /**
     * One task, including the fields `listTasks` projects away.
     *
     * `description` is unbounded free text that no list renders, so it is not
     * selected there (M07-T01). This is where the detail view reads it back.
     */
    async getTask(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = GetTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: 'tasks:read', permission: 'task:read' });

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const rows = await db.select().from(tasks).where(eq((tasks as any).id, parsed.taskId)).limit(1);
      if (!rows || rows.length === 0) throw new ConnectError("task not found", Code.NotFound);

      const t = rows[0];
      const assignees = await assigneesByTask([t.id]);
      // M22-T04 (ADR-0017): surfaces prior handoff context the moment a
      // task is inspected, without a separate listTaskNotes call.
      const latestHandoffNote = await getLatestHandoffNote(db, t.id, isStandalone);
      return {
        task: toWireTask(t, {
          assignees: assignees.get(t.id) ?? [],
          blockedByOpenCount: await openBlockerCount(t.id),
          openInputRequestCount: (await openInputRequestCounts(db, isStandalone, [t.id])).get(t.id) ?? 0,
        }),
        ...(latestHandoffNote ? { latestHandoffNote } : {}),
      };
    },
    async listTasks(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = ListTasksSchema.parse(req);
      const orgId = await getProjectOrgId(db, parsed.projectId);
      await authorizePrincipal(db, principal, orgId, { scope: 'tasks:read', permission: 'task:read' });

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const deletedFilter = parsed.onlyDeleted ? not(notDeleted(tasks)) : notDeleted(tasks);
      // One board column, when asked for. The count that comes back is then
      // that column's real count, computed by the database over the whole
      // project rather than by counting one page's worth in the browser
      // (M07-T03).
      const statusFacet = parsed.status ? eq((tasks as any).status, parsed.status) : undefined;

      // Agent self-service (M14-T05): "unassigned" is the query an agent
      // runs to find claimable work; "me" resolves to the *calling*
      // principal server-side (never a caller-supplied id), so nothing lets
      // one principal page through another's queue by naming their id. Both
      // are correlated subqueries against taskAssignments rather than a
      // join, so a task with two assignees isn't returned twice.
      let assigneeFacet: any = undefined;
      if (parsed.assigneeFilter === "unassigned") {
        const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;
        // M30-T03: a finished task is not claimable work.
        assigneeFacet = sql`NOT EXISTS (SELECT 1 FROM ${assignments} WHERE ${(assignments as any).taskId} = ${(tasks as any).id}) AND NOT ${terminalStatusSql(tasks, isStandalone)}`;
      } else if (parsed.assigneeFilter === "me") {
        const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;
        const selfColumn = principal.kind === "user" ? (assignments as any).userId : (assignments as any).agentId;
        const selfId = principal.kind === "user" ? principal.userId : principal.agentId;
        assigneeFacet = sql`EXISTS (SELECT 1 FROM ${assignments} WHERE ${(assignments as any).taskId} = ${(tasks as any).id} AND ${selfColumn} = ${selfId})`;
      } else if (parsed.assigneeFilter) {
        throw new ConnectError(`invalid assigneeFilter "${parsed.assigneeFilter}" - expected "unassigned" or "me"`, Code.InvalidArgument);
      }

      const conditions = [eq((tasks as any).projectId, parsed.projectId), deletedFilter];
      if (statusFacet) conditions.push(statusFacet);
      if (assigneeFacet) conditions.push(assigneeFacet);
      if (parsed.priority !== undefined) conditions.push(eq((tasks as any).priority, parsed.priority));
      if (parsed.labelId) conditions.push(hasLabelSql(tasks, isStandalone, parsed.labelId));
      if (parsed.parentTaskId) conditions.push(eq((tasks as any).parentTaskId, parsed.parentTaskId));
      if (parsed.ready) {
        // ADR-0028: exactly what ClaimNextTask chooses from.
        const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;
        conditions.push(sql`NOT EXISTS (SELECT 1 FROM ${assignments} WHERE ${(assignments as any).taskId} = ${(tasks as any).id})`);
        conditions.push(not(terminalStatusSql(tasks, isStandalone)));
        conditions.push(not(hasOpenBlockerSql(tasks, isStandalone)));
      }
      const scope = and(...conditions);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, tasks, scope, parsed.page, {
        filterColumn: (tasks as any).title,
        sortableColumns: {
          title: (tasks as any).title,
          status: (tasks as any).status,
          createdAt: (tasks as any).createdAt,
          // M35: urgent first, "none" last - `priority:asc` is claim order.
          priority: priorityRankSql(tasks),
        },
        cursorFields: { priority: "priorityRank" },
        // `description` is free text with no length bound and the list renders
        // only the title. It is read back by `getTask` on the detail view.
        select: taskListSelect(tasks),
        // M19-T03: status/assigneeFilter/onlyDeleted all narrow `scope`
        // (baseCondition) just as much as the free-text filter does, but
        // executePaginatedQuery's cached-totalCount guard only ever compared
        // against `filter` - a cursor minted while paging with status="todo"
        // and then reused against a request for status="done" would report
        // "todo"'s count under "done"'s results.
        extraCacheKey: [
          parsed.onlyDeleted ? "1" : "0", parsed.status ?? "", parsed.assigneeFilter ?? "", parsed.priority ?? "",
          parsed.ready ? "1" : "0", parsed.labelId ?? "", parsed.parentTaskId ?? "",
        ].join("|"),
      });
      // Sorting by displayId is deliberately not offered: it is a string, so
      // "SEED-100" sorts before "SEED-99". Ids are assigned in creation order,
      // so createdAt is the same ordering done correctly (M05-T11).

      const assignees = await assigneesByTask(items.map((t: any) => t.id));
      const blockers = await openBlockerCounts(db, isStandalone, items.map((t: any) => t.id));
      const questions = await openInputRequestCounts(db, isStandalone, items.map((t: any) => t.id));

      return {
        tasks: items.map((t: any) => toWireTask(t, { assignees: assignees.get(t.id) ?? [], blockedByOpenCount: blockers.get(t.id) ?? 0, openInputRequestCount: questions.get(t.id) ?? 0 })),
        page: { nextCursor, totalCount },
      };
    },
    /**
     * M33-T04: everything the caller holds, across every live project in the
     * organization - ListTasks needs a project, so an agent could only answer
     * "what am I working on" by walking all of them. An agent's org is its
     * token's; a person names one.
     */
    async listMyTasks(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = ListMyTasksSchema.parse(req);
      const orgId = parsed.orgId ?? (principal.kind === "agent" ? principal.orgId : undefined);
      if (!orgId) throw new ConnectError("orgId is required", Code.InvalidArgument);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:read", permission: "task:read" });

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const projects = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;
      const selfColumn = principal.kind === "user" ? (assignments as any).userId : (assignments as any).agentId;
      const selfId = principal.kind === "user" ? principal.userId : principal.agentId;
      const scope = and(
        notDeleted(tasks),
        sql`${(tasks as any).projectId} IN (SELECT ${(projects as any).id} FROM ${projects} WHERE ${(projects as any).orgId} = ${orgId} AND ${(projects as any).deletedAt} IS NULL)`,
        sql`EXISTS (SELECT 1 FROM ${assignments} WHERE ${(assignments as any).taskId} = ${(tasks as any).id} AND ${selfColumn} = ${selfId})`,
        parsed.includeTerminal ? undefined : not(terminalStatusSql(tasks, isStandalone)),
      );
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, tasks, scope, parsed.page, {
        sortableColumns: { createdAt: (tasks as any).createdAt, status: (tasks as any).status, priority: priorityRankSql(tasks) },
        cursorFields: { priority: "priorityRank" },
        select: taskListSelect(tasks),
        extraCacheKey: [orgId, selfId, parsed.includeTerminal ? "1" : "0"].join("|"),
      });
      const assignees = await assigneesByTask(items.map((t: any) => t.id));
      const blockers = await openBlockerCounts(db, isStandalone, items.map((t: any) => t.id));
      const questions = await openInputRequestCounts(db, isStandalone, items.map((t: any) => t.id));
      return {
        tasks: items.map((t: any) => toWireTask(t, { assignees: assignees.get(t.id) ?? [], blockedByOpenCount: blockers.get(t.id) ?? 0, openInputRequestCount: questions.get(t.id) ?? 0 })),
        page: { nextCursor, totalCount },
      };
    },
    async assignTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = AssignTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "task:write");

      if (parsed.agentId) {
        const agents = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
        const agentRows = await db.select().from(agents).where(eq((agents as any).id, parsed.agentId)).limit(1);
        if (!agentRows || agentRows.length === 0) {
          throw new ConnectError("agent not found", Code.NotFound);
        }
        if (agentRows[0].orgId !== orgId) {
          throw new ConnectError("agent belongs to a different organization", Code.InvalidArgument);
        }
      }

      if (parsed.userId) {
        // assertCan reports PermissionDenied - correct when it's the
        // *caller* who lacks access, but here parsed.userId is the assignee,
        // not the caller. An invalid/foreign assignee id is the caller's
        // own bad argument, so report it as InvalidArgument instead of
        // implying the caller's own auth is broken.
        try {
          await assertCan(db, { kind: "user", userId: parsed.userId }, { type: "organization", id: orgId }, "task:write");
        } catch (e) {
          if (e instanceof ConnectError && e.code === Code.PermissionDenied) {
            throw new ConnectError("userId is not a member of this task's organization", Code.InvalidArgument);
          }
          throw e;
        }
      }

      const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;

      // Must match on the exact (agentId, userId) combination in the
      // payload below, not just whichever of the two happens to be
      // truthy - otherwise a second call with the same agentId but a
      // different userId (or vice versa) is misdetected as a duplicate of
      // the first and its half of the assignment is silently dropped.
      const dupCondition = and(
        eq((assignments as any).taskId, parsed.taskId),
        parsed.agentId ? eq((assignments as any).agentId, parsed.agentId) : isNull((assignments as any).agentId),
        parsed.userId ? eq((assignments as any).userId, parsed.userId) : isNull((assignments as any).userId),
      );
      const existingAssignment = await db.select().from(assignments).where(dupCondition).limit(1);
      if (existingAssignment.length > 0) return { success: true };

      const newId = `ta-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        taskId: parsed.taskId,
        agentId: parsed.agentId || null,
        userId: parsed.userId || null,
      };

      await db.insert(assignments).values(payload);

      // M24-T04 (ADR-0020): after the insert, and never on the duplicate
      // no-op early return above. The assignee is the NEW holder from the
      // request; the actor is the calling user (assignTask is human-only).
      // projectId isn't in scope here - one small lookup.
      const tasksTable = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const taskRows = await db.select().from(tasksTable).where(eq((tasksTable as any).id, parsed.taskId)).limit(1);
      await recordTaskActivity(db, isStandalone, {
        taskId: parsed.taskId,
        projectId: taskRows[0].projectId,
        kind: "assigned",
        actorType: "user",
        actorId: userId,
        assigneeAgentId: parsed.agentId || null,
        assigneeUserId: parsed.userId || null,
      });

      return { success: true };
    },
    async unassignTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = UnassignTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "task:write");

      const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;
      // Matched on the exact (agentId, userId) pair the assignment was created
      // with, the same shape assignTask's duplicate check uses. Deleting on
      // taskId plus whichever id happens to be set would remove a *different*
      // assignment that shares the task.
      // M24-T04: capture whether a row was actually deleted (same
      // changes/affectedRows dialect split updateTaskStatus/claimTask use) -
      // the RPC stays unconditionally idempotent for the caller, but only a
      // real removal is an event worth recording.
      const deleteResult = await db.delete(assignments).where(and(
        eq((assignments as any).taskId, parsed.taskId),
        parsed.agentId ? eq((assignments as any).agentId, parsed.agentId) : isNull((assignments as any).agentId),
        parsed.userId ? eq((assignments as any).userId, parsed.userId) : isNull((assignments as any).userId),
      ));
      const removed = isStandalone ? (deleteResult as any).changes : (deleteResult as any)[0]?.affectedRows;

      if (removed) {
        // The removed holder needs no pre-delete query: the DELETE matches
        // the exact (agentId, userId) pair from the request (see the comment
        // above), so when a row was removed, that pair IS the holder that
        // was just removed - race-free, unlike a separate SELECT would be.
        const tasksTable = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
        const taskRows = await db.select().from(tasksTable).where(eq((tasksTable as any).id, parsed.taskId)).limit(1);
        await recordTaskActivity(db, isStandalone, {
          taskId: parsed.taskId,
          projectId: taskRows[0].projectId,
          kind: "unassigned",
          actorType: "user",
          actorId: userId,
          assigneeAgentId: parsed.agentId || null,
          assigneeUserId: parsed.userId || null,
        });
      }

      // Idempotent: removing an assignment that is not there is the state the
      // caller asked for, not an error.
      return { success: true };
    },
    /**
     * Agent self-service (M14-T06). Unlike `assignTask` - human-only, and
     * able to name any assignee - this claims the task for the *calling*
     * principal, and only if the task currently has no assignee at all.
     *
     * The read-then-write shape `assignTask`/`updateTaskStatus` used to have
     * is exactly the bug this milestone opened with: two callers reading
     * "unassigned" at the same moment and both writing would both "win". A
     * single `INSERT ... SELECT ... WHERE NOT EXISTS` is one statement, not
     * two - there is no gap between the check and the write for a second
     * claim to land in, on either dialect, with no transaction or lock
     * needed for that guarantee. `reuses tasks:write` (`assertCan`'s task
     * update is exactly what a claim is - it is not worth a ninth scope in
     * ADR-0008's closed vocabulary of eight for what "update tasks" already
     * covers).
     */
    async claimTask(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = ClaimTaskSchema.parse(req);
      // M14-T07: a retried claim with the same key replays the original
      // success rather than re-running the atomic insert. Not that it would
      // be unsafe to re-run - the INSERT is self-protecting - but a losing
      // retry would otherwise get FailedPrecondition for a claim it already
      // won on the first attempt, which is exactly the "did my own retry
      // just fail?" confusion idempotency exists to remove.
      return withIdempotency(db, isStandalone, principal, "claimTask", parsed.idempotencyKey, parsed, async () => {
        const orgId = await getTaskOrgId(db, parsed.taskId);
        await authorizePrincipal(db, principal, orgId, { scope: "tasks:write", permission: "task:write" });

        // M30-T03: a finished task is not work. Checked before the insert
        // rather than inside it: a task finishing concurrently with its own
        // claim is a benign race, and the error must say why the claim lost.
        const tasksTable = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
        const [current] = await db.select({ taskTypeId: (tasksTable as any).taskTypeId, status: (tasksTable as any).status })
          .from(tasksTable).where(eq((tasksTable as any).id, parsed.taskId)).limit(1);
        if (current && await isTerminalStatus(db, isStandalone, current.taskTypeId ?? null, current.status)) {
          throw new ConnectError(`task is in terminal status "${current.status}" - only open tasks can be claimed`, Code.FailedPrecondition);
        }

        if (!(await insertClaim(parsed.taskId, principal))) {
          throw new ConnectError("task is already assigned - claim only succeeds on an unassigned task", Code.FailedPrecondition);
        }
        return completeClaim(parsed.taskId, principal);
      });
    },
    /**
     * M33-T02: the next open, unassigned task in the project (M35: ready and
     * most important first, ADR-0028), claimed in one
     * call. An agent no longer lists and then races everyone else for the same
     * rows; a lost race moves on to the next candidate. Nothing to claim is an
     * empty response, not an error - the normal answer for an idle queue.
     */
    async claimNextTask(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = ClaimNextTaskSchema.parse(req);
      return withIdempotency(db, isStandalone, principal, "claimNextTask", parsed.idempotencyKey, parsed, async () => {
        const orgId = await getProjectOrgId(db, parsed.projectId);
        await authorizePrincipal(db, principal, orgId, { scope: "tasks:write", permission: "task:write" });

        const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
        const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;
        for (let round = 0; round < CLAIM_NEXT_ROUNDS; round++) {
          // M35 (ADR-0028): ready work only - no unfinished blocker - most
          // important first, then oldest.
          const candidates: { id: string; rank: unknown }[] = await db
            .select({ id: (tasks as any).id, rank: priorityRankSql(tasks) })
            .from(tasks)
            .where(and(
              eq((tasks as any).projectId, parsed.projectId),
              notDeleted(tasks),
              parsed.taskTypeId ? eq((tasks as any).taskTypeId, parsed.taskTypeId) : undefined,
              parsed.labelId ? hasLabelSql(tasks, isStandalone, parsed.labelId) : undefined,
              sql`NOT EXISTS (SELECT 1 FROM ${assignments} WHERE ${(assignments as any).taskId} = ${(tasks as any).id})`,
              not(terminalStatusSql(tasks, isStandalone)),
              not(hasOpenBlockerSql(tasks, isStandalone)),
            ))
            .orderBy(asc(priorityRankSql(tasks)), asc((tasks as any).createdAt), asc((tasks as any).id))
            .limit(CLAIM_NEXT_WINDOW);
          if (candidates.length === 0) return {};
          for (const c of shuffleWithinPriority(candidates)) {
            if (await insertClaim(c.id, principal)) return completeClaim(c.id, principal);
          }
        }
        // Every candidate in every round went to someone else first: there is
        // work, but this caller lost each race for it. Aborted is the
        // retryable answer; an empty response would wrongly say "no work".
        throw new ConnectError("every open task was claimed by another caller first - retry", Code.Aborted);
      });
    },
    /**
     * M33-T03 (ADR-0027): gives back a task the caller holds by its own
     * claim. An assignment a person made is theirs to change, not the
     * holder's. With a handoff note, the note is written first - so the next
     * claimant sees it - and refused up front if the caller may not write one,
     * before anything is released.
     */
    async releaseTask(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = ReleaseTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:write", permission: "task:write" });
      if (parsed.handoffNote !== undefined) {
        if (principal.kind !== "agent") {
          throw new ConnectError("handoff notes are written by agents - release without one, or comment on the task", Code.InvalidArgument);
        }
        await authorizePrincipal(db, principal, orgId, { scope: "comments:write", permission: "tasknote:write" });
      }

      const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;
      const selfColumn = principal.kind === "agent" ? (assignments as any).agentId : (assignments as any).userId;
      const selfId = principal.kind === "agent" ? principal.agentId : principal.userId;
      const [held] = await db.select().from(assignments)
        .where(and(eq((assignments as any).taskId, parsed.taskId), eq(selfColumn, selfId))).limit(1);
      if (!held) {
        throw new ConnectError("you do not hold this task - only its holder can release it", Code.FailedPrecondition);
      }
      if (held.source !== "claim") {
        throw new ConnectError("this task was assigned to you by a person - ask them to unassign it", Code.PermissionDenied);
      }

      const handoffNote = parsed.handoffNote !== undefined && principal.kind === "agent"
        ? await recordTaskNote(db, isStandalone, nc, { taskId: parsed.taskId, agentId: principal.agentId, content: parsed.handoffNote, noteType: "handoff" })
        : undefined;

      // By row id, so a concurrent release, unassign or re-claim cannot make
      // this delete someone else's assignment.
      const deleted = await db.delete(assignments).where(eq((assignments as any).id, held.id));
      const removed = isStandalone ? (deleted as any).changes : (deleted as any)[0]?.affectedRows;
      if (removed) {
        const tasksTable = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
        const [task] = await db.select({ projectId: (tasksTable as any).projectId }).from(tasksTable).where(eq((tasksTable as any).id, parsed.taskId)).limit(1);
        await recordTaskActivity(db, isStandalone, {
          taskId: parsed.taskId,
          projectId: task.projectId,
          kind: "unassigned",
          ...actorFromPrincipal(principal),
          assigneeAgentId: principal.kind === "agent" ? principal.agentId : null,
          assigneeUserId: principal.kind === "user" ? principal.userId : null,
        });
        publishDomainEvent(nc, "domain.task.released", {
          taskId: parsed.taskId,
          agentId: principal.kind === "agent" ? principal.agentId : null,
          userId: principal.kind === "user" ? principal.userId : null,
        });
      }
      return { success: true, ...(handoffNote ? { handoffNote } : {}) };
    },
    /**
     * M35 (ADR-0028): record that one task blocks another, or where a task was
     * discovered. Idempotent - an existing identical link is success.
     */
    async addTaskLink(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = TaskLinkSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:write", permission: "task:write" });
      await assertLinkAllowed(db, isStandalone, orgId, parsed.taskId, parsed.linkedTaskId, parsed.kind);
      const added = await insertLink(db, isStandalone, {
        taskId: parsed.taskId,
        linkedTaskId: parsed.linkedTaskId,
        kind: parsed.kind,
        createdBy: principal.kind === "user" ? principal.userId : principal.agentId,
      });
      if (added) publishDomainEvent(nc, "domain.task.linked", { taskId: parsed.taskId, linkedTaskId: parsed.linkedTaskId, kind: parsed.kind });
      return { success: true };
    },
    async removeTaskLink(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = TaskLinkSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:write", permission: "task:write" });
      if (await deleteLink(db, isStandalone, parsed.taskId, parsed.linkedTaskId, parsed.kind)) {
        publishDomainEvent(nc, "domain.task.unlinked", { taskId: parsed.taskId, linkedTaskId: parsed.linkedTaskId, kind: parsed.kind });
      }
      return { success: true };
    },
    /**
     * M38 (ADR-0031): replaces the task's plan with the given steps - the
     * whole list, every time, so there is nothing to merge. An empty list
     * clears it.
     */
    async setTaskPlan(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = SetTaskPlanSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:write", permission: "task:write" });
      const steps = parsed.steps.map((s) => ({ title: s.title, status: s.status }));
      await db.update(taskTable).set({ plan: steps.length > 0 ? JSON.stringify(steps) : null }).where(eq((taskTable as any).id, parsed.taskId));
      publishDomainEvent(nc, "domain.task.plan_updated", {
        taskId: parsed.taskId,
        steps: steps.length,
        done: steps.filter((s) => s.status === "done").length,
      });
      return { plan: steps };
    },
    async listTaskLinks(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = ListTaskLinksSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:read", permission: "task:read" });
      return listLinks(db, isStandalone, parsed.taskId);
    },
    async addTaskReviewer(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = AddTaskReviewerSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "task:write");
      try {
        await assertCan(db, { kind: "user", userId: parsed.userId }, { type: "organization", id: orgId }, "task:write");
      } catch (e) {
        if (e instanceof ConnectError && e.code === Code.PermissionDenied) {
          throw new ConnectError("userId is not a member of this task's organization", Code.InvalidArgument);
        }
        throw e;
      }

      const reviewers = isStandalone ? schemaSqlite.taskReviewers : schemaMysql.taskReviewers;
      const existing = await db.select().from(reviewers)
        .where(and(eq((reviewers as any).taskId, parsed.taskId), eq((reviewers as any).userId, parsed.userId)))
        .limit(1);
      if (existing.length > 0) return { success: true };

      const newId = `trv-${crypto.randomUUID()}`;
      // M19-T03: same check-then-insert race as createTaskStatus above - fall
      // back to the DB's own unique-constraint violation for a concurrent
      // duplicate add. A benign no-op either way (the reviewer ends up
      // added), so there is no error to surface, unlike the status case.
      try {
        await db.insert(reviewers).values({ id: newId, taskId: parsed.taskId, userId: parsed.userId });
      } catch (e) {
        if (!isUniqueConstraintConflict(e)) throw e;
      }
      return { success: true };
    },
    async removeTaskReviewer(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RemoveTaskReviewerSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "task:write");

      const reviewers = isStandalone ? schemaSqlite.taskReviewers : schemaMysql.taskReviewers;
      await db.delete(reviewers).where(and(eq((reviewers as any).taskId, parsed.taskId), eq((reviewers as any).userId, parsed.userId)));
      return { success: true };
    },
    async listTaskReviewers(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = ListTaskReviewersSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: 'tasks:read', permission: 'task:read' });

      const reviewers = isStandalone ? schemaSqlite.taskReviewers : schemaMysql.taskReviewers;
      const rows = await db.select().from(reviewers).where(eq((reviewers as any).taskId, parsed.taskId));
      if (rows.length === 0) return { reviewers: [] };

      // One lookup for every name, not one per reviewer. Resolved here rather
      // than by the client for the same reason as Assignee.name: holding the
      // member catalogue client-side is what made the first assignee picker
      // fetch 100,001 rows (M05-T04).
      const usersTable = isStandalone ? schemaSqlite.users : schemaMysql.users;
      const userRows = await db.select().from(usersTable)
        .where(inArray((usersTable as any).id, [...new Set(rows.map((r: any) => r.userId))]));
      const nameById = new Map(userRows.map((u: any) => [u.id, u.name || u.email]));

      return {
        reviewers: rows.map((r: any) => ({
          ...r,
          // Falling back to the id keeps the reviewer visible if the account
          // has gone, rather than dropping them from the list silently.
          name: nameById.get(r.userId) ?? r.userId,
        })),
      };
    },
    async updateTask(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = UpdateTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: 'tasks:write', permission: 'task:write' });

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const existing = await db.select().from(tasks).where(eq((tasks as any).id, parsed.taskId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("task not found", Code.NotFound);

      if (parsed.taskTypeId) {
        const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
        const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.taskTypeId)).limit(1);
        if (!typeRows || typeRows.length === 0) throw new ConnectError("task type not found", Code.NotFound);
        if (typeRows[0].orgId !== orgId) throw new ConnectError("task type belongs to a different organization", Code.InvalidArgument);
        // M19-T03: same project-scope rule as createTask - see its comment.
        if (typeRows[0].projectId && typeRows[0].projectId !== existing[0].projectId) {
          throw new ConnectError("task type belongs to a different project", Code.InvalidArgument);
        }
      }

      const updates: Record<string, unknown> = {};
      if (parsed.title !== undefined) updates.title = parsed.title;
      if (parsed.description !== undefined) updates.description = parsed.description;
      if (parsed.taskTypeId !== undefined) updates.taskTypeId = parsed.taskTypeId;
      if (parsed.priority !== undefined) updates.priority = parsed.priority;
      if (parsed.parentTaskId !== undefined) {
        if (parsed.parentTaskId) await assertParentAllowed(db, isStandalone, parsed.taskId, existing[0].projectId, parsed.parentTaskId);
        updates.parentTaskId = parsed.parentTaskId || null;
      }

      await db.update(tasks).set(updates).where(eq((tasks as any).id, parsed.taskId));

      const result = await db.select().from(tasks).where(eq((tasks as any).id, parsed.taskId)).limit(1);
      const task = result[0];

      publishDomainEvent(nc, "domain.task.updated", task);
      return { task: toWireTask(task) };
    },
    async updateTaskStatus(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = UpdateTaskStatusSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: 'tasks:write', permission: 'task:write' });

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const existingRows = await db.select().from(tasks).where(eq((tasks as any).id, parsed.taskId)).limit(1);
      if (!existingRows || existingRows.length === 0) throw new ConnectError("task not found", Code.NotFound);
      const currentTask = existingRows[0];

      await validateStatusForTaskType(db, isStandalone, currentTask.taskTypeId || null, currentTask.status, parsed.status);

      // Compare-and-swap on the status just read, not an unconditional
      // write: two callers can both read the same stale status, both pass
      // validation against it, and without this WHERE clause both writes
      // would "succeed" - whichever commits last wins with no error to
      // either caller, and the loser's own response (the re-select below)
      // would silently report the *winner's* status as if it were its own
      // (M14-T02). If the status has genuinely not moved since the read
      // above, this matches exactly one row, same as before.
      const updateResult = await db.update(tasks)
        .set({ status: parsed.status })
        .where(and(eq((tasks as any).id, parsed.taskId), eq((tasks as any).status, currentTask.status)));
      const affected = isStandalone ? (updateResult as any).changes : (updateResult as any)[0]?.affectedRows;
      if (!affected) {
        throw new ConnectError(
          "task status changed concurrently - refetch and retry",
          Code.Aborted,
        );
      }

      const result = await db.select().from(tasks).where(eq((tasks as any).id, parsed.taskId)).limit(1);
      const task = result[0];

      // M24-T04 (ADR-0020): after the CAS `affected` check - the single
      // status choke point. fromStatus is the CAS-verified previous status
      // (the WHERE clause proved it was still current when the write won),
      // terminality is stamped from the type's status positions at write
      // time, and the assignee is whoever holds the task as the status moves
      // - a status change does not touch the assignment.
      await recordTaskActivity(db, isStandalone, {
        taskId: parsed.taskId,
        projectId: currentTask.projectId,
        kind: "status_changed",
        fromStatus: currentTask.status,
        toStatus: parsed.status,
        fromIsTerminal: await isTerminalStatus(db, isStandalone, currentTask.taskTypeId || null, currentTask.status),
        toIsTerminal: await isTerminalStatus(db, isStandalone, currentTask.taskTypeId || null, parsed.status),
        ...actorFromPrincipal(principal),
        ...(await currentAssignee(db, isStandalone, parsed.taskId)),
      });

      publishDomainEvent(nc, "domain.task.status_updated", task);
      await announceUnblocked(parsed.taskId);
      return { task: toWireTask(task) };
    },
    async deleteTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = DeleteTaskSchema.parse(req);
      // includeDeleted=true here, deliberately: archiveProject only soft-
      // deletes the project row and never touches its tasks, so archiving a
      // project that still has live tasks used to leave no way forward -
      // deleteTask's default (false) propagates through to the project
      // lookup and reports "Project not found" for a perfectly live task,
      // while purgeProject refuses to run while any task remains. Cleaning
      // up a task is exactly the operation an admin needs *after* archiving
      // a project, not one the project's own archived state should block
      // (M14-T03). A task that no longer exists at all still 404s below;
      // only the project's archived state is now tolerated.
      const orgId = await getTaskOrgId(db, parsed.taskId, true);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "task:admin");

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      // M24-T04: softDeleteById stamps deletedAt unconditionally, so the
      // task's pre-archive state (status for the row, deletedAt for the
      // already-archived guard) must be read before the write - a second
      // archive of an already-archived task changes nothing and records
      // nothing.
      const existingRows = await db.select().from(tasks).where(eq((tasks as any).id, parsed.taskId)).limit(1);
      const wasLive = existingRows.length > 0 && !existingRows[0].deletedAt;
      await softDeleteById(db, tasks, parsed.taskId);

      if (wasLive) {
        // ADR-0020: `archived` carries fromStatus = <status at archive>,
        // toStatus = NULL - this is what lets the CFD's -1-from algebra
        // remove archived tasks from the stack.
        await recordTaskActivity(db, isStandalone, {
          taskId: parsed.taskId,
          projectId: existingRows[0].projectId,
          kind: "archived",
          fromStatus: existingRows[0].status,
          fromIsTerminal: await isTerminalStatus(db, isStandalone, existingRows[0].taskTypeId || null, existingRows[0].status),
          actorType: "user",
          actorId: userId,
          ...(await currentAssignee(db, isStandalone, parsed.taskId)),
        });
      }

      publishDomainEvent(nc, "domain.task.deleted", { taskId: parsed.taskId });
      // A binned blocker no longer blocks (ADR-0028). One that had already
      // finished unblocked its dependents then - announce only a live one.
      if (wasLive && !(await isTerminalStatus(db, isStandalone, existingRows[0].taskTypeId || null, existingRows[0].status))) {
        await announceUnblocked(parsed.taskId);
      }
      return { success: true };
    },
    async restoreTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RestoreTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId, true);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "task:admin");

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      // M24-T04: same read-before-write guard as deleteTask - restoreById
      // nulls deletedAt unconditionally, so only a task that really was
      // archived records a 'restored' event.
      const existingRows = await db.select().from(tasks).where(eq((tasks as any).id, parsed.taskId)).limit(1);
      const wasArchived = existingRows.length > 0 && !!existingRows[0].deletedAt;
      await restoreById(db, tasks, parsed.taskId);

      if (wasArchived) {
        // ADR-0020: `restored` carries fromStatus = NULL, toStatus =
        // <status at restore> - the +1-to side that re-admits the task into
        // the CFD stack.
        await recordTaskActivity(db, isStandalone, {
          taskId: parsed.taskId,
          projectId: existingRows[0].projectId,
          kind: "restored",
          toStatus: existingRows[0].status,
          toIsTerminal: await isTerminalStatus(db, isStandalone, existingRows[0].taskTypeId || null, existingRows[0].status),
          actorType: "user",
          actorId: userId,
          ...(await currentAssignee(db, isStandalone, parsed.taskId)),
        });
      }

      publishDomainEvent(nc, "domain.task.restored", { taskId: parsed.taskId });
      return { success: true };
    },
    async purgeTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = PurgeTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId, true);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "task:admin");

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const existing = await db.select().from(tasks).where(eq((tasks as any).id, parsed.taskId)).limit(1);
      if (!existing[0]?.deletedAt) {
        throw new ConnectError("task must be archived before it can be purged", Code.FailedPrecondition);
      }

      // M30-T09: one cascade, shared with the retention sweep. This handler
      // used to carry its own copy, and it drifted: M25's alert ledger was
      // added to the shared one only. On MySQL it runs in a transaction; on
      // SQLite (whose drizzle transactions must be synchronous) it stays
      // retry-safe - every step is idempotent and the task row goes last, so
      // a purge that fails part-way leaves an archived task a retry finishes.
      if (isStandalone) await purgeTaskCascade(db, parsed.taskId);
      else await db.transaction(async (tx: any) => purgeTaskCascade(tx, parsed.taskId));

      publishDomainEvent(nc, "domain.task.purged", { taskId: parsed.taskId });
      return { success: true };
    },
  };
};
