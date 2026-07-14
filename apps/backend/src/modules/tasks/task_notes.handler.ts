import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq } from "drizzle-orm";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";
import { requireUserId, assertOrgMember, getTaskOrgId } from "../../lib/authz";
import { ConnectError, Code } from "@connectrpc/connect";

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
    async createTaskNote(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = CreateTaskNoteSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await assertOrgMember(db, userId, orgId);

      const agents = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const agentRows = await db.select().from(agents).where(eq((agents as any).id, parsed.agentId)).limit(1);
      if (!agentRows || agentRows.length === 0) {
        throw new ConnectError("agent not found", Code.NotFound);
      }
      if (agentRows[0].orgId !== orgId) {
        throw new ConnectError("agent belongs to a different organization", Code.InvalidArgument);
      }

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
      publishDomainEvent(nc, "domain.tasknote.created", noteResp);
      return { taskNote: noteResp };
    },
    async listTaskNotes(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      if (!req.taskId) throw new ConnectError("taskId is required", Code.InvalidArgument);
      const orgId = await getTaskOrgId(db, req.taskId);
      await assertOrgMember(db, userId, orgId);

      const notes = isStandalone ? schemaSqlite.taskNotes : schemaMysql.taskNotes;
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, notes, eq((notes as any).taskId, req.taskId), req.page);

      return {
        taskNotes: items.map((n: any) => ({
          ...n,
          createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
  };
};
