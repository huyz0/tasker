import { TaskTypeService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq } from "drizzle-orm";

export const createTasksHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async getTaskType(req: any) {
      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const result = await db.select().from(types).where(eq((types as any).id, req.id)).limit(1);
      if (!result || result.length === 0) throw new Error("unauthenticated or not found");

      const taskType = result[0];
      const statusesSchema = isStandalone ? schemaSqlite.taskStatuses : schemaMysql.taskStatuses;
      const statuses = await db.select().from(statusesSchema).where(eq((statusesSchema as any).taskTypeId, req.id));

      const transitionsSchema = isStandalone ? schemaSqlite.taskStatusTransitions : schemaMysql.taskStatusTransitions;
      const transitions = await db.select().from(transitionsSchema).where(eq((transitionsSchema as any).taskTypeId, req.id));

      return {
        taskType: { ...taskType, createdAt: taskType.createdAt instanceof Date ? taskType.createdAt.toISOString() : taskType.createdAt },
        statuses: statuses,
        transitions: transitions
      };
    },
    async createTaskType(req: any) {
      const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const newId = "tt-" + Date.now().toString();
      const payload = {
        id: newId,
        orgId: req.orgId,
        projectId: req.projectId || null,
        name: req.name
      };

      if (isStandalone) {
        await db.insert(types).values({ ...payload, createdAt: new Date() });
      } else {
        await db.insert(types).values(payload);
      }

      const taskTypeResp = { ...payload, createdAt: new Date().toISOString() };

      if (nc) nc.publish("domain.task_type.created", Buffer.from(JSON.stringify(payload)));
      return { taskType: taskTypeResp };
    }
  };
};

export const createTaskManagementHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async createTask(req: any) {
      const tasks = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const newId = "tsk-" + Date.now().toString();
      const payload = {
        id: newId,
        projectId: req.projectId,
        title: req.title,
        status: req.status || "todo",
        description: req.description || ""
      };

      await db.insert(tasks).values(payload);

      if (nc) nc.publish("domain.task.created", Buffer.from(JSON.stringify(payload)));
      return { task: payload };
    },
    async assignTask(req: any) {
      const assignments = isStandalone ? schemaSqlite.taskAssignments : schemaMysql.taskAssignments;
      const newId = "ta-" + Date.now().toString();
      const payload = {
        id: newId,
        taskId: req.taskId,
        agentId: req.agentId || null,
        userId: req.userId || null,
      };

      await db.insert(assignments).values(payload);
      return { success: true };
    }
  };
};
