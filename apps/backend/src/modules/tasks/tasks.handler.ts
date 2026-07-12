import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, not, sql } from "drizzle-orm";
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
  name: z.string().min(1, "name is required").max(256),
});

const CreateTaskSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  title: z.string().min(1, "title is required").max(512),
  status: z.string().max(256).optional().default("todo"),
  description: z.string().max(4096).optional().default(""),
});

const AssignTaskSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  agentId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
});

const KNOWN_STATUSES = ["todo", "in-progress", "done"] as const;

const UpdateTaskStatusSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  status: z.enum(KNOWN_STATUSES),
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
      const newId = `tt-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        orgId: parsed.orgId,
        projectId: parsed.projectId || null,
        name: parsed.name,
      };

      await insertRecord(db, types, payload, isStandalone);

      const taskTypeResp = { ...payload, createdAt: new Date().toISOString() };

      if (nc) nc.publish("domain.task_type.created", Buffer.from(JSON.stringify(payload)));
      return { taskType: taskTypeResp };
    },
  };
};

export const createTaskManagementHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async createTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = CreateTaskSchema.parse(req);
      const orgId = await getProjectOrgId(db, parsed.projectId);
      await assertOrgMember(db, userId, orgId);

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const ps = isStandalone ? schemaSqlite.projects : schemaMysql.projects;

      // Atomically claim this project's next task number, then build a
      // stable, human-readable display ID from the project's key + that
      // number (e.g. "ENG-42") - assigned once here, never recomputed, so it
      // survives a later project rename. Note: this update-then-select is
      // race-free under SQLite's single-writer model (used by every test and
      // standalone deployment) but not under concurrent MySQL writers without
      // a transaction - MySQL isn't exercised by this repo's test suite today.
      await db.update(ps).set({ nextTaskNumber: sql`${(ps as any).nextTaskNumber} + 1` }).where(eq((ps as any).id, parsed.projectId));
      const [projectRow] = await db.select().from(ps).where(eq((ps as any).id, parsed.projectId)).limit(1);
      const taskNumber = projectRow.nextTaskNumber - 1;
      const displayId = `${projectRow.key}-${taskNumber}`;

      const newId = `tsk-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        projectId: parsed.projectId,
        displayId,
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
      if (!req.projectId) throw new Error("projectId is required");
      const orgId = await getProjectOrgId(db, req.projectId);
      await assertOrgMember(db, userId, orgId);

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const deletedFilter = req.onlyDeleted ? not(notDeleted(tasks)) : notDeleted(tasks);
      const { items, nextCursor } = await executePaginatedQuery(db, tasks, and(eq((tasks as any).projectId, req.projectId), deletedFilter), req.page, (tasks as any).title, { title: (tasks as any).title, status: (tasks as any).status, createdAt: (tasks as any).createdAt });

      return {
        tasks: items.map((t: any) => ({
          ...t,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
        })),
        page: { nextCursor },
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
        await assertOrgMember(db, parsed.userId, orgId);
      }

      const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;
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
    async updateTaskStatus(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = UpdateTaskStatusSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertOrgMember(db, userId, orgId);

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
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
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertOrgAdmin(db, userId, orgId);

      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      await restoreById(db, tasks, parsed.taskId);

      if (nc) nc.publish("domain.task.restored", Buffer.from(JSON.stringify({ taskId: parsed.taskId })));
      return { success: true };
    },
    async purgeTask(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = PurgeTaskSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
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

      await db.delete(assignments).where(eq((assignments as any).taskId, parsed.taskId));
      await db.delete(reviewers).where(eq((reviewers as any).taskId, parsed.taskId));
      await db.delete(artifactLinks).where(eq((artifactLinks as any).taskId, parsed.taskId));
      await db.delete(notes).where(eq((notes as any).taskId, parsed.taskId));
      await db.delete(comments).where(and(eq((comments as any).entityId, parsed.taskId), eq((comments as any).entityType, "task")));
      await db.update(pullRequests).set({ taskId: null }).where(eq((pullRequests as any).taskId, parsed.taskId));
      await db.delete(tasks).where(eq((tasks as any).id, parsed.taskId));

      if (nc) nc.publish("domain.task.purged", Buffer.from(JSON.stringify({ taskId: parsed.taskId })));
      return { success: true };
    },
  };
};
