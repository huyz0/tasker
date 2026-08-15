import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq } from "drizzle-orm";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";
import { requireUser, requirePrincipal, assertOrgMember, assertOrgWriter, getTaskOrgId } from "../../lib/authz";
import { ConnectError, Code } from "@connectrpc/connect";

// --- Zod Request Schema ---

// No agentId: a task note is the agent's own record of its work, so the author
// is the authenticated agent. Zod strips the key, so an old client still
// sending it is refused for the right reason (not being an agent) rather than
// for sending an unknown field.
const CreateTaskNoteSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  content: z.string().min(1, "content is required").max(8192),
});

const UpdateTaskNoteSchema = z.object({
  taskNoteId: z.string().min(1, "taskNoteId is required"),
  content: z.string().min(1, "content is required").max(8192),
});

const DeleteTaskNoteSchema = z.object({
  taskNoteId: z.string().min(1, "taskNoteId is required"),
});

// --- Handler Factory ---

export const createTaskNotesHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";

  return {
    async createTaskNote(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = CreateTaskNoteSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);

      // task_notes.agent_id is NOT NULL, so a note has no meaningful human
      // author. Before M04 a human supplied the agentId and the note was filed
      // under a worker that never wrote it.
      if (principal.kind !== "agent") {
        throw new ConnectError(
          "task notes are authored by an agent - authenticate with an agent token",
          Code.PermissionDenied,
        );
      }
      if (principal.orgId !== orgId) {
        throw new ConnectError("this token cannot act in that organization", Code.PermissionDenied);
      }

      const notes = isStandalone ? schemaSqlite.taskNotes : schemaMysql.taskNotes;
      const newId = `tnt-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        taskId: parsed.taskId,
        agentId: principal.agentId,
        content: parsed.content,
      };

      await insertRecord(db, notes, payload, isStandalone);

      const noteResp = { ...payload };
      publishDomainEvent(nc, "domain.tasknote.created", noteResp);
      return { taskNote: noteResp };
    },
    async updateTaskNote(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = UpdateTaskNoteSchema.parse(req);

      const notes = isStandalone ? schemaSqlite.taskNotes : schemaMysql.taskNotes;
      const existing = await db.select().from(notes).where(eq((notes as any).id, parsed.taskNoteId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("task note not found", Code.NotFound);
      const orgId = await getTaskOrgId(db, existing[0].taskId);
      await assertOrgWriter(db, userId, orgId);

      await db.update(notes).set({ content: parsed.content }).where(eq((notes as any).id, parsed.taskNoteId));

      const updated = { ...existing[0], content: parsed.content };
      publishDomainEvent(nc, "domain.tasknote.updated", updated);
      return { taskNote: updated };
    },
    async deleteTaskNote(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = DeleteTaskNoteSchema.parse(req);

      const notes = isStandalone ? schemaSqlite.taskNotes : schemaMysql.taskNotes;
      const existing = await db.select().from(notes).where(eq((notes as any).id, parsed.taskNoteId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("task note not found", Code.NotFound);
      const orgId = await getTaskOrgId(db, existing[0].taskId);
      await assertOrgWriter(db, userId, orgId);

      await db.delete(notes).where(eq((notes as any).id, parsed.taskNoteId));

      publishDomainEvent(nc, "domain.tasknote.deleted", { taskNoteId: parsed.taskNoteId });
      return { success: true };
    },
    async listTaskNotes(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
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
