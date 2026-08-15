import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, not, isNull, inArray } from "drizzle-orm";
import { insertRecord, executePaginatedQuery, notDeleted, softDeleteById, restoreById } from "../../db/query-builder";
import { requireUser, assertOrgMember, assertOrgWriter, assertOrgAdmin, getProjectOrgId, getTaskOrgId, requirePrincipal, authorizePrincipal } from "../../lib/authz";
import { ConnectError, Code } from "@connectrpc/connect";

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
});

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
  description: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(4096).optional()),
  taskTypeId: z.preprocess((v) => (v === "" ? undefined : v), z.string().nullable().optional()),
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
      await authorizePrincipal(db, principal, result[0].orgId, { scope: 'tasks:read' });

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
      await assertOrgWriter(db, userId, parsed.orgId);

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
      await authorizePrincipal(db, principal, parsed.orgId, { scope: 'tasks:read' });

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
      await assertOrgWriter(db, userId, existing[0].orgId);

      if (parsed.parentId) {
        if (parsed.parentId === parsed.id) {
          throw new ConnectError("a task type cannot be its own parent", Code.InvalidArgument);
        }
        const parentRows = await db.select().from(types).where(eq((types as any).id, parsed.parentId)).limit(1);
        if (!parentRows || parentRows.length === 0) throw new ConnectError("parent task type not found", Code.NotFound);
        if (parentRows[0].orgId !== existing[0].orgId) {
          throw new ConnectError("parent task type belongs to a different organization", Code.InvalidArgument);
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
      await assertOrgWriter(db, userId, typeRows[0].orgId);

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

      await insertRecord(db, statuses, payload, isStandalone, false);

      publishDomainEvent(nc, "domain.task_status.created", payload);
      return { status: payload };
    },
    async createTaskStatusTransition(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = CreateTaskStatusTransitionSchema.parse(req);

      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.taskTypeId)).limit(1);
      if (!typeRows || typeRows.length === 0) throw new ConnectError("task type not found", Code.NotFound);
      await assertOrgWriter(db, userId, typeRows[0].orgId);

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
      await assertOrgWriter(db, userId, typeRows[0].orgId);

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
      await assertOrgWriter(db, userId, typeRows[0].orgId);

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

  return {
    async createTask(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = CreateTaskSchema.parse(req);
      const orgId = await getProjectOrgId(db, parsed.projectId);
      await authorizePrincipal(db, principal, orgId, { scope: 'tasks:write', write: true });

      if (parsed.taskTypeId) {
        const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
        const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.taskTypeId)).limit(1);
        if (!typeRows || typeRows.length === 0) throw new ConnectError("task type not found", Code.NotFound);
        if (typeRows[0].orgId !== orgId) throw new ConnectError("task type belongs to a different organization", Code.InvalidArgument);
      }
      await validateStatusForTaskType(db, isStandalone, parsed.taskTypeId || null, null, parsed.status);

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
      const payload = {
        id: newId,
        projectId: parsed.projectId,
        displayId,
        taskTypeId: parsed.taskTypeId || null,
        createdBy: principal.kind === 'user' ? principal.userId : null,
        title: parsed.title,
        status: parsed.status,
        description: parsed.description,
      };

      await insertRecord(db, tasks, payload, isStandalone, true);

      publishDomainEvent(nc, "domain.task.created", payload);
      return { task: payload };
    },
    /**
     * One task, including the fields `listTasks` projects away.
     *
     * `description` is unbounded free text that no list renders, so it is not
     * selected there (M07-T01). This is where the detail view reads it back.
     */
    async getTask(req: any, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      if (!req?.taskId) throw new ConnectError("taskId is required", Code.InvalidArgument);
      const orgId = await getTaskOrgId(db, req.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: 'tasks:read' });

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const rows = await db.select().from(tasks).where(eq((tasks as any).id, req.taskId)).limit(1);
      if (!rows || rows.length === 0) throw new ConnectError("task not found", Code.NotFound);

      const t = rows[0];
      const assignees = await assigneesByTask([t.id]);
      return {
        task: {
          ...t,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
          assignees: assignees.get(t.id) ?? [],
        },
      };
    },
    async listTasks(req: any, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      if (!req.projectId) throw new ConnectError("projectId is required", Code.InvalidArgument);
      const orgId = await getProjectOrgId(db, req.projectId);
      await authorizePrincipal(db, principal, orgId, { scope: 'tasks:read' });

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const deletedFilter = req.onlyDeleted ? not(notDeleted(tasks)) : notDeleted(tasks);
      // One board column, when asked for. The count that comes back is then
      // that column's real count, computed by the database over the whole
      // project rather than by counting one page's worth in the browser
      // (M07-T03).
      const statusFacet = req.status ? eq((tasks as any).status, req.status) : undefined;
      const scope = statusFacet
        ? and(eq((tasks as any).projectId, req.projectId), deletedFilter, statusFacet)
        : and(eq((tasks as any).projectId, req.projectId), deletedFilter);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, tasks, scope, req.page, {
        filterColumn: (tasks as any).title,
        sortableColumns: { title: (tasks as any).title, status: (tasks as any).status, createdAt: (tasks as any).createdAt },
        // `description` is free text with no length bound and the list renders
        // only the title. It is read back by `getTask` on the detail view.
        select: {
          id: (tasks as any).id,
          projectId: (tasks as any).projectId,
          displayId: (tasks as any).displayId,
          taskTypeId: (tasks as any).taskTypeId,
          createdBy: (tasks as any).createdBy,
          title: (tasks as any).title,
          status: (tasks as any).status,
          createdAt: (tasks as any).createdAt,
          deletedAt: (tasks as any).deletedAt,
        },
      });
      // Sorting by displayId is deliberately not offered: it is a string, so
      // "SEED-100" sorts before "SEED-99". Ids are assigned in creation order,
      // so createdAt is the same ordering done correctly (M05-T11).

      const assignees = await assigneesByTask(items.map((t: any) => t.id));

      return {
        tasks: items.map((t: any) => ({
          ...t,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
          assignees: assignees.get(t.id) ?? [],
        })),
        page: { nextCursor, totalCount },
      };
    },
    async assignTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = AssignTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertOrgWriter(db, userId, orgId);

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
        // assertOrgMember reports PermissionDenied - correct when it's the
        // *caller* who lacks access, but here parsed.userId is the assignee,
        // not the caller. An invalid/foreign assignee id is the caller's
        // own bad argument, so report it as InvalidArgument instead of
        // implying the caller's own auth is broken.
        try {
          await assertOrgWriter(db, parsed.userId, orgId);
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
      return { success: true };
    },
    async unassignTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = UnassignTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertOrgWriter(db, userId, orgId);

      const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;
      // Matched on the exact (agentId, userId) pair the assignment was created
      // with, the same shape assignTask's duplicate check uses. Deleting on
      // taskId plus whichever id happens to be set would remove a *different*
      // assignment that shares the task.
      await db.delete(assignments).where(and(
        eq((assignments as any).taskId, parsed.taskId),
        parsed.agentId ? eq((assignments as any).agentId, parsed.agentId) : isNull((assignments as any).agentId),
        parsed.userId ? eq((assignments as any).userId, parsed.userId) : isNull((assignments as any).userId),
      ));

      // Idempotent: removing an assignment that is not there is the state the
      // caller asked for, not an error.
      return { success: true };
    },
    async addTaskReviewer(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = AddTaskReviewerSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertOrgWriter(db, userId, orgId);
      try {
        await assertOrgWriter(db, parsed.userId, orgId);
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
      await db.insert(reviewers).values({ id: newId, taskId: parsed.taskId, userId: parsed.userId });
      return { success: true };
    },
    async removeTaskReviewer(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RemoveTaskReviewerSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertOrgWriter(db, userId, orgId);

      const reviewers = isStandalone ? schemaSqlite.taskReviewers : schemaMysql.taskReviewers;
      await db.delete(reviewers).where(and(eq((reviewers as any).taskId, parsed.taskId), eq((reviewers as any).userId, parsed.userId)));
      return { success: true };
    },
    async listTaskReviewers(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = ListTaskReviewersSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: 'tasks:read' });

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
      await authorizePrincipal(db, principal, orgId, { scope: 'tasks:write', write: true });

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const existing = await db.select().from(tasks).where(eq((tasks as any).id, parsed.taskId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("task not found", Code.NotFound);

      if (parsed.taskTypeId) {
        const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
        const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.taskTypeId)).limit(1);
        if (!typeRows || typeRows.length === 0) throw new ConnectError("task type not found", Code.NotFound);
        if (typeRows[0].orgId !== orgId) throw new ConnectError("task type belongs to a different organization", Code.InvalidArgument);
      }

      const updates: Record<string, unknown> = {};
      if (parsed.title !== undefined) updates.title = parsed.title;
      if (parsed.description !== undefined) updates.description = parsed.description;
      if (parsed.taskTypeId !== undefined) updates.taskTypeId = parsed.taskTypeId;

      await db.update(tasks).set(updates).where(eq((tasks as any).id, parsed.taskId));

      const result = await db.select().from(tasks).where(eq((tasks as any).id, parsed.taskId)).limit(1);
      const task = result[0];

      publishDomainEvent(nc, "domain.task.updated", task);
      return { task };
    },
    async updateTaskStatus(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = UpdateTaskStatusSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: 'tasks:write', write: true });

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const existingRows = await db.select().from(tasks).where(eq((tasks as any).id, parsed.taskId)).limit(1);
      if (!existingRows || existingRows.length === 0) throw new ConnectError("task not found", Code.NotFound);
      const currentTask = existingRows[0];

      await validateStatusForTaskType(db, isStandalone, currentTask.taskTypeId || null, currentTask.status, parsed.status);

      await db.update(tasks).set({ status: parsed.status }).where(eq((tasks as any).id, parsed.taskId));

      const result = await db.select().from(tasks).where(eq((tasks as any).id, parsed.taskId)).limit(1);
      const task = result[0];

      publishDomainEvent(nc, "domain.task.status_updated", task);
      return { task };
    },
    async deleteTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = DeleteTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertOrgAdmin(db, userId, orgId);

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      await softDeleteById(db, tasks, parsed.taskId);

      publishDomainEvent(nc, "domain.task.deleted", { taskId: parsed.taskId });
      return { success: true };
    },
    async restoreTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RestoreTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId, true);
      await assertOrgAdmin(db, userId, orgId);

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      await restoreById(db, tasks, parsed.taskId);

      publishDomainEvent(nc, "domain.task.restored", { taskId: parsed.taskId });
      return { success: true };
    },
    async purgeTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = PurgeTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId, true);
      await assertOrgAdmin(db, userId, orgId);

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const existing = await db.select().from(tasks).where(eq((tasks as any).id, parsed.taskId)).limit(1);
      if (!existing[0]?.deletedAt) {
        throw new ConnectError("task must be archived before it can be purged", Code.FailedPrecondition);
      }

      const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;
      const reviewers = isStandalone ? schemaSqlite.taskReviewers : schemaMysql.taskReviewers;
      const artifactLinks = isStandalone ? schemaSqlite.taskArtifactLinks : schemaMysql.taskArtifactLinks;
      const notes = isStandalone ? schemaSqlite.taskNotes : schemaMysql.taskNotes;
      const comments = isStandalone ? schemaSqlite.comments : schemaMysql.comments;
      const pullRequests = isStandalone ? schemaSqlite.remotePullRequests : schemaMysql.remotePullRequests;
      const entityLabels = isStandalone ? schemaSqlite.entityLabels : schemaMysql.entityLabels;

      await db.delete(assignments).where(eq((assignments as any).taskId, parsed.taskId));
      await db.delete(reviewers).where(eq((reviewers as any).taskId, parsed.taskId));
      await db.delete(artifactLinks).where(eq((artifactLinks as any).taskId, parsed.taskId));
      await db.delete(notes).where(eq((notes as any).taskId, parsed.taskId));
      await db.delete(comments).where(and(eq((comments as any).entityId, parsed.taskId), eq((comments as any).entityType, "task")));
      await db.delete(entityLabels).where(and(eq((entityLabels as any).entityId, parsed.taskId), eq((entityLabels as any).entityType, "task")));
      await db.update(pullRequests).set({ taskId: null }).where(eq((pullRequests as any).taskId, parsed.taskId));
      await db.delete(tasks).where(eq((tasks as any).id, parsed.taskId));

      publishDomainEvent(nc, "domain.task.purged", { taskId: parsed.taskId });
      return { success: true };
    },
  };
};
