import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq } from "drizzle-orm";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";

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

// --- Handler Factories ---

export const createTasksHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async getTaskType(req: unknown) {
      const parsed = GetTaskTypeSchema.parse(req);
      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const result = await db.select().from(types).where(eq((types as any).id, parsed.id)).limit(1);
      if (!result || result.length === 0) throw new Error("unauthenticated or not found");

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
    async createTaskType(req: unknown) {
      const parsed = CreateTaskTypeSchema.parse(req);
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
    async createTask(req: unknown) {
      const parsed = CreateTaskSchema.parse(req);
      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const newId = `tsk-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        projectId: parsed.projectId,
        title: parsed.title,
        status: parsed.status,
        description: parsed.description,
      };

      await insertRecord(db, tasks, payload, isStandalone, true);

      if (nc) nc.publish("domain.task.created", Buffer.from(JSON.stringify(payload)));
      return { task: payload };
    },
    async listTasks(req: any) {
      if (!req.projectId) throw new Error("projectId is required");
      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const { items, nextCursor } = await executePaginatedQuery(db, tasks, eq((tasks as any).projectId, req.projectId), req.page);

      return {
        tasks: items.map((t: any) => ({
          ...t,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
        })),
        page: { nextCursor },
      };
    },
    async assignTask(req: unknown) {
      const parsed = AssignTaskSchema.parse(req);
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
  };
};
