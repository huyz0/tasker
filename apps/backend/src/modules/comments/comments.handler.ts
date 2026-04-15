import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and } from "drizzle-orm";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";

// --- Zod Request Schema ---

const CreateCommentSchema = z.object({
  entityId: z.string().min(1, "entityId is required"),
  entityType: z.enum(["task", "artifact"]),
  userId: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
  content: z.string().min(1, "content is required").max(4096),
});

// --- Handler Factory ---

export const createCommentsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";

  return {
    async createComment(req: unknown) {
      const parsed = CreateCommentSchema.parse(req);
      const comments = isStandalone ? schemaSqlite.comments : schemaMysql.comments;
      const newId = `cmt-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        entityId: parsed.entityId,
        entityType: parsed.entityType,
        userId: parsed.userId || null,
        agentId: parsed.agentId || null,
        content: parsed.content,
      };

      await insertRecord(db, comments, payload, isStandalone);

      const commentResp = { ...payload };
      if (nc) nc.publish("domain.comment.created", Buffer.from(JSON.stringify(commentResp)));
      return { comment: commentResp };
    },
    async listComments(req: any) {
      if (!req.entityId || !req.entityType) throw new Error("entityId and entityType are required");
      const cmts = isStandalone ? schemaSqlite.comments : schemaMysql.comments;
      const { items, nextCursor } = await executePaginatedQuery(db, cmts, and(eq((cmts as any).entityId, req.entityId), eq((cmts as any).entityType, req.entityType)), req.page);

      return {
        comments: items.map((c: any) => ({
          ...c,
          createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
        })),
        page: { nextCursor },
      };
    },
  };
};
