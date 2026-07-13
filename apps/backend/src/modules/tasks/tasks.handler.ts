import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, not } from "drizzle-orm";
import { insertRecord, executePaginatedQuery, notDeleted, softDeleteById, restoreById } from "../../db/query-builder";
import { requireUserId, assertOrgMember, assertOrgAdmin, getProjectOrgId, getTaskOrgId } from "../../lib/authz";
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

const AssignTaskSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  agentId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
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
      const userId = requireUserId(contextValues);
      const parsed = GetTaskTypeSchema.parse(req);
      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const result = await db.select().from(types).where(eq((types as any).id, parsed.id)).limit(1);
      if (!result || result.length === 0) throw new ConnectError("task type not found", Code.NotFound);
      await assertOrgMember(db, userId, result[0].orgId);

      const taskType = result[0];
      const statusesSchema = isStandalone ? schemaSqlite.taskStatuses : schemaMysql.taskStatuses;
      const statuses = await db.select().from(statusesSchema).where(eq((statusesSchema as any).taskTypeId, parsed.id));

      const transitionsSchema = isStandalone ? schemaSqlite.taskStatusTransitions : schemaMysql.taskStatusTransitions;
      const transitions = await db.select().from(transitionsSchema).where(eq((transitionsSchema as any).taskTypeId, parsed.id));

      return {
        taskType: { ...taskType, createdAt: taskType.createdAt instanceof Date ? taskType.createdAt.toISOString() : taskType.createdAt },
        statuses: statuses,
        transitions: transitions,
      };
    },
    async createTaskType(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = CreateTaskTypeSchema.parse(req);
      await assertOrgMember(db, userId, parsed.orgId);

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

      if (nc) nc.publish("domain.task_type.created", Buffer.from(JSON.stringify(payload)));
      return { taskType: taskTypeResp };
    },
    async listTaskTypes(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = ListTaskTypesSchema.parse(req);
      await assertOrgMember(db, userId, parsed.orgId);

      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const { items, nextCursor, totalCount } = await executePaginatedQuery(
        db, types, eq((types as any).orgId, parsed.orgId), parsed.page,
        (types as any).name, { name: (types as any).name, createdAt: (types as any).createdAt }
      );

      return {
        taskTypes: items.map((t: any) => ({
          ...t,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
    async createTaskStatus(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = CreateTaskStatusSchema.parse(req);

      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.taskTypeId)).limit(1);
      if (!typeRows || typeRows.length === 0) throw new ConnectError("task type not found", Code.NotFound);
      await assertOrgMember(db, userId, typeRows[0].orgId);

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

      const newId = `tst-${crypto.randomUUID()}`;
      const payload = { id: newId, taskTypeId: parsed.taskTypeId, name: parsed.name };

      await insertRecord(db, statuses, payload, isStandalone, false);

      if (nc) nc.publish("domain.task_status.created", Buffer.from(JSON.stringify(payload)));
      return { status: payload };
    },
    async createTaskStatusTransition(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = CreateTaskStatusTransitionSchema.parse(req);

      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.taskTypeId)).limit(1);
      if (!typeRows || typeRows.length === 0) throw new ConnectError("task type not found", Code.NotFound);
      await assertOrgMember(db, userId, typeRows[0].orgId);

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
      const newId = `tstr-${crypto.randomUUID()}`;
      const payload = { id: newId, taskTypeId: parsed.taskTypeId, fromStatusId: parsed.fromStatusId, toStatusId: parsed.toStatusId };

      await insertRecord(db, transitions, payload, isStandalone, false);

      if (nc) nc.publish("domain.task_status_transition.created", Buffer.from(JSON.stringify(payload)));
      return { transition: payload };
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
  return {
    async createTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = CreateTaskSchema.parse(req);
      const orgId = await getProjectOrgId(db, parsed.projectId);
      await assertOrgMember(db, userId, orgId);

      if (parsed.taskTypeId) {
        const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
        const typeRows = await db.select().from(types).where(eq((types as any).id, parsed.taskTypeId)).limit(1);
        if (!typeRows || typeRows.length === 0) throw new ConnectError("task type not found", Code.NotFound);
        if (typeRows[0].orgId !== orgId) throw new ConnectError("task type belongs to a different organization", Code.InvalidArgument);
      }
      await validateStatusForTaskType(db, isStandalone, parsed.taskTypeId || null, null, parsed.status);

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;

      // Atomically claim this project's next task number, then build a
      // stable, human-readable display ID from the project's key + that
      // number (e.g. "ENG-42") - assigned once here, never recomputed, so it
      // survives a later project rename. Under MySQL, `SELECT ... FOR UPDATE`
      // inside a transaction locks the project row so two concurrent creates
      // can't both read the same nextTaskNumber; SQLite's single-writer model
      // makes this atomic without locking (and doesn't support FOR UPDATE).
      const { projectRow, taskNumber } = await db.transaction(async (tx: any) => {
        const rowQuery = tx.select().from(ps).where(eq((ps as any).id, parsed.projectId));
        const [row] = isStandalone ? await rowQuery.limit(1) : await rowQuery.for("update").limit(1);
        const claimedNumber = row.nextTaskNumber;
        await tx.update(ps).set({ nextTaskNumber: claimedNumber + 1 }).where(eq((ps as any).id, parsed.projectId));
        return { projectRow: row, taskNumber: claimedNumber };
      });
      const displayId = `${projectRow.key}-${taskNumber}`;

      const newId = `tsk-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        projectId: parsed.projectId,
        displayId,
        taskTypeId: parsed.taskTypeId || null,
        createdBy: userId,
        title: parsed.title,
        status: parsed.status,
        description: parsed.description,
      };

      await insertRecord(db, tasks, payload, isStandalone, true);

      if (nc) nc.publish("domain.task.created", Buffer.from(JSON.stringify(payload)));
      return { task: payload };
    },
    async listTasks(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      if (!req.projectId) throw new ConnectError("projectId is required", Code.InvalidArgument);
      const orgId = await getProjectOrgId(db, req.projectId);
      await assertOrgMember(db, userId, orgId);

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const deletedFilter = req.onlyDeleted ? not(notDeleted(tasks)) : notDeleted(tasks);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, tasks, and(eq((tasks as any).projectId, req.projectId), deletedFilter), req.page, (tasks as any).title, { title: (tasks as any).title, status: (tasks as any).status, createdAt: (tasks as any).createdAt });

      return {
        tasks: items.map((t: any) => ({
          ...t,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
    async assignTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = AssignTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertOrgMember(db, userId, orgId);

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
          await assertOrgMember(db, parsed.userId, orgId);
        } catch (e) {
          if (e instanceof ConnectError && e.code === Code.PermissionDenied) {
            throw new ConnectError("userId is not a member of this task's organization", Code.InvalidArgument);
          }
          throw e;
        }
      }

      const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;

      const dupCondition = parsed.agentId
        ? and(eq((assignments as any).taskId, parsed.taskId), eq((assignments as any).agentId, parsed.agentId))
        : and(eq((assignments as any).taskId, parsed.taskId), eq((assignments as any).userId, parsed.userId));
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
    async addTaskReviewer(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = AddTaskReviewerSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertOrgMember(db, userId, orgId);
      try {
        await assertOrgMember(db, parsed.userId, orgId);
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
      const userId = requireUserId(contextValues);
      const parsed = RemoveTaskReviewerSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertOrgMember(db, userId, orgId);

      const reviewers = isStandalone ? schemaSqlite.taskReviewers : schemaMysql.taskReviewers;
      await db.delete(reviewers).where(and(eq((reviewers as any).taskId, parsed.taskId), eq((reviewers as any).userId, parsed.userId)));
      return { success: true };
    },
    async listTaskReviewers(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = ListTaskReviewersSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertOrgMember(db, userId, orgId);

      const reviewers = isStandalone ? schemaSqlite.taskReviewers : schemaMysql.taskReviewers;
      const rows = await db.select().from(reviewers).where(eq((reviewers as any).taskId, parsed.taskId));
      return { reviewers: rows };
    },
    async updateTaskStatus(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = UpdateTaskStatusSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertOrgMember(db, userId, orgId);

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const existingRows = await db.select().from(tasks).where(eq((tasks as any).id, parsed.taskId)).limit(1);
      if (!existingRows || existingRows.length === 0) throw new ConnectError("task not found", Code.NotFound);
      const currentTask = existingRows[0];

      await validateStatusForTaskType(db, isStandalone, currentTask.taskTypeId || null, currentTask.status, parsed.status);

      await db.update(tasks).set({ status: parsed.status }).where(eq((tasks as any).id, parsed.taskId));

      const result = await db.select().from(tasks).where(eq((tasks as any).id, parsed.taskId)).limit(1);
      const task = result[0];

      if (nc) nc.publish("domain.task.status_updated", Buffer.from(JSON.stringify(task)));
      return { task };
    },
    async deleteTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = DeleteTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertOrgAdmin(db, userId, orgId);

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      await softDeleteById(db, tasks, parsed.taskId);

      if (nc) nc.publish("domain.task.deleted", Buffer.from(JSON.stringify({ taskId: parsed.taskId })));
      return { success: true };
    },
    async restoreTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = RestoreTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId, true);
      await assertOrgAdmin(db, userId, orgId);

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      await restoreById(db, tasks, parsed.taskId);

      if (nc) nc.publish("domain.task.restored", Buffer.from(JSON.stringify({ taskId: parsed.taskId })));
      return { success: true };
    },
    async purgeTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
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

      if (nc) nc.publish("domain.task.purged", Buffer.from(JSON.stringify({ taskId: parsed.taskId })));
      return { success: true };
    },
  };
};
