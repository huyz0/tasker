import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and } from "drizzle-orm";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";

// --- Zod Request Schema ---

const CreateTaskNoteSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  agentId: z.string().min(1, "agentId is required"),
  content: z.string().min(1, "content is required").max(8192),
});

// --- Handler Factory ---

export const createTaskNotesHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";

  return {
    async createTaskNote(req: unknown) {
      const parsed = CreateTaskNoteSchema.parse(req);
      const notes = isStandalone ? schemaSqlite.taskNotes : schemaMysql.taskNotes;
      const newId = `tnt-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        taskId: parsed.taskId,
        agentId: parsed.agentId,
        content: parsed.content,
      };

      await insertRecord(db, notes, payload, isStandalone);

      const noteResp = { ...payload };
      if (nc) nc.publish("domain.tasknote.created", Buffer.from(JSON.stringify(noteResp)));
      return { taskNote: noteResp };
    },
    async listTaskNotes(req: any) {
      if (!req.taskId) throw new Error("taskId is required");
      const notes = isStandalone ? schemaSqlite.taskNotes : schemaMysql.taskNotes;
      const { items, nextCursor } = await executePaginatedQuery(db, notes, eq((notes as any).taskId, req.taskId), req.page);

      return {
        taskNotes: items.map((n: any) => ({
          ...n,
          createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
        })),
        page: { nextCursor },
      };
    },
  };
};
