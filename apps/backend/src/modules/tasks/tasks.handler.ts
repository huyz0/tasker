import { TaskTypeService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { setupDatabase } from "../../db/db";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { connect as natsConnect } from "nats";
import { eq } from "drizzle-orm";

const isStandalone = process.env.STANDALONE === "true";
const db = await setupDatabase(isStandalone ? "sqlite" : "mysql");

let nc: any = null;
try {
  nc = await natsConnect({ servers: process.env.NATS_URL || "nats://localhost:4222" });
} catch (e) {
  // handled
}

export const tasksHandler = {
  async getTaskType(req: any) {
    const types = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
    const result = await (db as any).select().from(types).where(eq((types as any).id, req.id)).limit(1);
    if (!result || result.length === 0) throw new Error("unauthenticated or not found");

    const taskType = result[0];
    const statusesSchema = isStandalone ? schemaSqlite.taskStatuses : schemaMysql.taskStatuses;
    const statuses = await (db as any).select().from(statusesSchema).where(eq((statusesSchema as any).taskTypeId, req.id));

    const transitionsSchema = isStandalone ? schemaSqlite.taskStatusTransitions : schemaMysql.taskStatusTransitions;
    const transitions = await (db as any).select().from(transitionsSchema).where(eq((transitionsSchema as any).taskTypeId, req.id));

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
      await (db as any).insert(types).values({ ...payload, createdAt: new Date() });
    } else {
      await (db as any).insert(types).values(payload);
    }

    const taskTypeResp = { ...payload, createdAt: new Date().toISOString() };

    if (nc) nc.publish("domain.task_type.created", Buffer.from(JSON.stringify(payload)));
    return { taskType: taskTypeResp };
  }
};
