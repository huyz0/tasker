import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and } from "drizzle-orm";
import { decodeCursor, encodeCursor, buildCursorPaginationWhere, buildPaginationOrderBy } from "../../db/query-builder";

// --- Zod Request Schema ---

const CreateTaskNoteSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  agentId: z.string().min(1, "agentId is required"),
  content: z.string().min(1, "content is required").max(8192),
});

// --- Dual-mode Insert Helper ---

const insertRecord = async (
  db: any,
  table: any,
  payload: Record<string, unknown>,
  isStandalone: boolean,
) => {
  if (isStandalone) {
    await db.insert(table).values({ ...payload, createdAt: new Date() });
  } else {
    await db.insert(table).values(payload);
  }
};

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
      const page = req.page || {};
      const limit = Math.min(page.limit || 50, 100);
      const cursorData = decodeCursor(page.cursor);

      const notes = isStandalone ? schemaSqlite.taskNotes : schemaMysql.taskNotes;
      let query = db.select().from(notes).where(eq((notes as any).taskId, req.taskId)).limit(limit) as any;

      query = query.orderBy(...buildPaginationOrderBy(notes.createdAt as any, notes.id as any));
      const whereClause = buildCursorPaginationWhere(cursorData, notes.createdAt as any, notes.id as any);
      if (whereClause) {
        query = db.select().from(notes).where(and(eq((notes as any).taskId, req.taskId), whereClause)).limit(limit).orderBy(...buildPaginationOrderBy(notes.createdAt as any, notes.id as any)) as any;
      }

      const result = await query;
      const lastItem = result[result.length - 1];
      const nextCursor = lastItem && result.length === limit ? encodeCursor((lastItem.createdAt instanceof Date ? lastItem.createdAt : new Date(lastItem.createdAt)).getTime(), lastItem.id) : undefined;

      return {
        taskNotes: result.map((n: any) => ({
          ...n,
          createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
        })),
        page: { nextCursor },
      };
    },
  };
};
