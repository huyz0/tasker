import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, desc, isNull } from "drizzle-orm";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";
import { requirePrincipal, authorizePrincipal, getTaskOrgId, getProjectOrgId } from "../../lib/authz";
import { recordTaskActivity, currentAssignee } from "./taskActivity";
import type { Principal } from "../auth/session";
import { ConnectError, Code } from "@connectrpc/connect";

// --- Zod Request Schema ---

// No agentId: a task note is the agent's own record of its work, so the author
// is the authenticated agent. Zod strips the key, so an old client still
// sending it is refused for the right reason (not being an agent) rather than
// for sending an unknown field.
//
// M22-T04 (ADR-0017): noteType defaults to 'comment' when omitted - existing
// callers that have never heard of "handoff" keep working unchanged.
const CreateTaskNoteSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  content: z.string().min(1, "content is required").max(8192),
  noteType: z.enum(["comment", "handoff"]).default("comment"),
});

const ListHandoffNotesSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  page: z.object({ limit: z.number().optional(), cursor: z.string().optional() }).optional(),
});

const UpdateTaskNoteSchema = z.object({
  taskNoteId: z.string().min(1, "taskNoteId is required"),
  content: z.string().min(1, "content is required").max(8192),
});

const DeleteTaskNoteSchema = z.object({
  taskNoteId: z.string().min(1, "taskNoteId is required"),
});

/**
 * A task note may only be edited or deleted by the agent that authored it.
 *
 * M19-T01: updateTaskNote/deleteTaskNote used to check only that the caller
 * held tasknote:write in the note's organization - an ordinary permission,
 * not admin-gated - so any member, or any other agent's token, could rewrite
 * or delete an agent's own record of its work. createTaskNote already
 * restricted authorship to the calling agent; this closes the same gap on
 * its sibling RPCs. Mirrors comments.handler.ts's assertCommentAuthor
 * (M04, ADR-0008) - the identical bug, already fixed once for comments.
 */
function assertTaskNoteAuthor(note: any, principal: Principal) {
  const isAuthor = principal.kind === "agent" && note.agentId === principal.agentId;
  if (!isAuthor) {
    throw new ConnectError("only the note's author can edit or delete it", Code.PermissionDenied);
  }
}

/**
 * The most recent handoff-typed TaskNote for one task, if any.
 *
 * Used by claimTask/getTask (tasks.handler.ts, M22-T04) so the exact moment
 * an agent claims or inspects a task, prior handoff context arrives with it
 * - the point of this milestone (ADR-0017).
 */
export async function getLatestHandoffNote(db: any, taskId: string, isStandalone: boolean) {
  const notes = isStandalone ? schemaSqlite.taskNotes : schemaMysql.taskNotes;
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq((notes as any).taskId, taskId), eq((notes as any).noteType, "handoff")))
    .orderBy(desc((notes as any).createdAt), desc((notes as any).id))
    .limit(1);
  if (!rows || rows.length === 0) return null;
  const n = rows[0];
  return { ...n, createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt };
}

// listHandoffNotes's own tiny index cursor, not query-builder.ts's keyset
// encodeCursor/decodeCursor - this endpoint paginates an already-fetched,
// already-ordered, deduped-to-latest-per-task array in memory (see the
// comment on RAW_FETCH_CAP below), so a plain "resume at this index" cursor
// is the honest shape rather than repurposing keyset semantics that don't
// apply here.
function encodeIndexCursor(index: number): string {
  return Buffer.from(JSON.stringify({ index })).toString("base64");
}
function decodeIndexCursor(cursor?: string): number {
  if (!cursor) return 0;
  try {
    const data = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
    return typeof data.index === "number" && data.index >= 0 ? data.index : 0;
  } catch {
    return 0;
  }
}

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
      await authorizePrincipal(db, principal, orgId, { scope: "comments:write", permission: "tasknote:write" });

      const notes = isStandalone ? schemaSqlite.taskNotes : schemaMysql.taskNotes;
      const newId = `tnt-${crypto.randomUUID()}`;
      // M19-T02: set explicitly rather than left to insertRecord's default -
      // that default only fires in standalone/sqlite mode, and either way it
      // was never added to the object returned below, only to the copy
      // insertRecord wrote to the DB.
      const payload = {
        id: newId,
        taskId: parsed.taskId,
        agentId: principal.agentId,
        content: parsed.content,
        createdAt: new Date(),
        noteType: parsed.noteType,
      };

      await insertRecord(db, notes, payload, isStandalone, false);

      // M24-T04 (ADR-0020): a note's creation is a signal for the
      // stalled-claims "last signal per task" query, recorded as 'note' or
      // 'handoff' per its type. Only creation is a signal -
      // updateTaskNote/deleteTaskNote deliberately record no activity.
      // projectId isn't in scope here - one small lookup.
      const tasksTable = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const taskRows = await db.select().from(tasksTable).where(eq((tasksTable as any).id, parsed.taskId)).limit(1);
      await recordTaskActivity(db, isStandalone, {
        taskId: parsed.taskId,
        projectId: taskRows[0].projectId,
        kind: parsed.noteType === "handoff" ? "handoff" : "note",
        actorType: "agent",
        actorId: principal.agentId,
        ...(await currentAssignee(db, isStandalone, parsed.taskId)),
      });

      const noteResp = { ...payload, createdAt: payload.createdAt.toISOString() };
      publishDomainEvent(nc, "domain.tasknote.created", noteResp);
      return { taskNote: noteResp };
    },
    async updateTaskNote(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = UpdateTaskNoteSchema.parse(req);

      const notes = isStandalone ? schemaSqlite.taskNotes : schemaMysql.taskNotes;
      const existing = await db.select().from(notes).where(eq((notes as any).id, parsed.taskNoteId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("task note not found", Code.NotFound);
      const orgId = await getTaskOrgId(db, existing[0].taskId);
      await authorizePrincipal(db, principal, orgId, { scope: 'comments:write', permission: 'tasknote:write' });
      assertTaskNoteAuthor(existing[0], principal);

      await db.update(notes).set({ content: parsed.content }).where(eq((notes as any).id, parsed.taskNoteId));

      const updated = {
        ...existing[0],
        content: parsed.content,
        createdAt: existing[0].createdAt instanceof Date ? existing[0].createdAt.toISOString() : existing[0].createdAt,
      };
      publishDomainEvent(nc, "domain.tasknote.updated", updated);
      return { taskNote: updated };
    },
    async deleteTaskNote(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = DeleteTaskNoteSchema.parse(req);

      const notes = isStandalone ? schemaSqlite.taskNotes : schemaMysql.taskNotes;
      const existing = await db.select().from(notes).where(eq((notes as any).id, parsed.taskNoteId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("task note not found", Code.NotFound);
      const orgId = await getTaskOrgId(db, existing[0].taskId);
      await authorizePrincipal(db, principal, orgId, { scope: 'comments:write', permission: 'tasknote:write' });
      assertTaskNoteAuthor(existing[0], principal);

      await db.delete(notes).where(eq((notes as any).id, parsed.taskNoteId));

      publishDomainEvent(nc, "domain.tasknote.deleted", { taskNoteId: parsed.taskNoteId });
      return { success: true };
    },
    async listTaskNotes(req: any, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      if (!req.taskId) throw new ConnectError("taskId is required", Code.InvalidArgument);
      const orgId = await getTaskOrgId(db, req.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: 'tasks:read', permission: 'tasknote:read' });

      const notes = isStandalone ? schemaSqlite.taskNotes : schemaMysql.taskNotes;
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, notes, eq((notes as any).taskId, req.taskId), req.page, {
        // `content` is the note. Same reasoning as comments: projecting it out
        // would leave a list of empty rows.
        select: {
          id: (notes as any).id,
          taskId: (notes as any).taskId,
          agentId: (notes as any).agentId,
          content: (notes as any).content,
          createdAt: (notes as any).createdAt,
          noteType: (notes as any).noteType,
        },
      });

      return {
        taskNotes: items.map((n: any) => ({
          ...n,
          createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
    /**
     * One row per task - the latest handoff note only, project-scoped.
     * Backs the top-level Handoffs screen and `tasker tasks handoffs`
     * (M22-T05/T06): "which tasks currently have pending handoff context
     * waiting", not a full history browse.
     */
    async listHandoffNotes(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = ListHandoffNotesSchema.parse(req);
      const orgId = await getProjectOrgId(db, parsed.projectId);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:read", permission: "task:read" });

      const notes = isStandalone ? schemaSqlite.taskNotes : schemaMysql.taskNotes;
      const tasksTable = isStandalone ? schemaSqlite.tasks : schemaMysql.tasks;
      const limit = Math.min(Math.max(parsed.page?.limit || 50, 1), 100);

      // Bounded by distinct handoff notes ever recorded in this project, not
      // by task count - handoff notes are meant to be actively resolved
      // (superseded by a later handoff, or the task closing), so this stays
      // small in practice. If a project ever has more than this many
      // *distinct tasks* simultaneously carrying an unresolved handoff note,
      // the least-recent of them silently fall off this page - named here
      // rather than hidden, same "measure before optimizing" bias this
      // repo's own ADR-0002/0003 already established, not expected to
      // matter until there's evidence it does.
      const RAW_FETCH_CAP = 1000;

      const rows = await db
        .select({
          note: notes,
          taskTitle: (tasksTable as any).title,
          taskStatus: (tasksTable as any).status,
        })
        .from(notes)
        .innerJoin(tasksTable, eq((tasksTable as any).id, (notes as any).taskId))
        .where(and(
          eq((notes as any).noteType, "handoff"),
          eq((tasksTable as any).projectId, parsed.projectId),
          isNull((tasksTable as any).deletedAt),
        ))
        .orderBy(desc((notes as any).createdAt), desc((notes as any).id))
        .limit(RAW_FETCH_CAP);

      // Rows already arrive ordered by recency, so the first occurrence of a
      // given taskId is that task's latest handoff note.
      const seenTaskIds = new Set<string>();
      const deduped: typeof rows = [];
      for (const row of rows) {
        if (seenTaskIds.has(row.note.taskId)) continue;
        seenTaskIds.add(row.note.taskId);
        deduped.push(row);
      }

      const startIndex = decodeIndexCursor(parsed.page?.cursor);
      const page = deduped.slice(startIndex, startIndex + limit);
      const nextCursor = startIndex + limit < deduped.length ? encodeIndexCursor(startIndex + limit) : undefined;

      return {
        entries: page.map((row) => ({
          note: {
            ...row.note,
            createdAt: row.note.createdAt instanceof Date ? row.note.createdAt.toISOString() : row.note.createdAt,
          },
          taskTitle: row.taskTitle,
          taskStatus: row.taskStatus,
        })),
        page: { nextCursor, totalCount: deduped.length },
      };
    },
  };
};
