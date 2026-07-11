import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and } from "drizzle-orm";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";
import { requireUserId, assertOrgMember, getTaskOrgId, getArtifactOrgId } from "../../lib/authz";

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
    async createComment(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const parsed = CreateCommentSchema.parse(req);
      const orgId = parsed.entityType === "task"
        ? await getTaskOrgId(db, parsed.entityId)
        : await getArtifactOrgId(db, parsed.entityId);
      await assertOrgMember(db, userId, orgId);

      // Attribution is derived from the authenticated caller, not trusted from
      // the request body: agentId (if present) marks it as an AI note, otherwise
      // it's attributed to whoever is actually logged in - never a client-supplied userId.
      const comments = isStandalone ? schemaSqlite.comments : schemaMysql.comments;
      const newId = `cmt-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        entityId: parsed.entityId,
        entityType: parsed.entityType,
        userId: parsed.agentId ? null : userId,
        agentId: parsed.agentId || null,
        content: parsed.content,
      };

      await insertRecord(db, comments, payload, isStandalone);

      const commentResp = { ...payload };
      if (nc) nc.publish("domain.comment.created", Buffer.from(JSON.stringify(commentResp)));
      return { comment: commentResp };
    },
    async listComments(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      if (!req.entityId || !req.entityType) throw new Error("entityId and entityType are required");
      const orgId = req.entityType === "task"
        ? await getTaskOrgId(db, req.entityId)
        : await getArtifactOrgId(db, req.entityId);
      await assertOrgMember(db, userId, orgId);

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
