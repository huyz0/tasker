import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, inArray } from "drizzle-orm";
import { insertRecord, executePaginatedQuery } from "../../db/query-builder";
import { requireUser, requirePrincipal, assertOrgMember, assertOrgWriter, getTaskOrgId, getArtifactOrgId } from "../../lib/authz";
import type { Principal } from "../auth/session";
import { ConnectError, Code } from "@connectrpc/connect";

// Resolves each comment's userId/agentId to a display name in two batched
// queries (not one query per comment) so a long thread doesn't turn into an
// N+1 fan-out. Falls back to null (GUI shows the raw id) if the referenced
// user/agent was since deleted.
async function attachAuthorNames(db: any, isStandalone: boolean, items: any[]): Promise<any[]> {
  const userIds = [...new Set(items.filter((c) => c.userId).map((c) => c.userId))];
  const agentIds = [...new Set(items.filter((c) => c.agentId).map((c) => c.agentId))];

  const users = isStandalone ? schemaSqlite.users : schemaMysql.users;
  const agents = isStandalone ? schemaSqlite.agents : schemaMysql.agents;

  const [userRows, agentRows] = await Promise.all([
    userIds.length ? db.select().from(users).where(inArray((users as any).id, userIds)) : [],
    agentIds.length ? db.select().from(agents).where(inArray((agents as any).id, agentIds)) : [],
  ]);

  const userNameById = new Map(userRows.map((u: any) => [u.id, u.name || u.email]));
  const agentNameById = new Map(agentRows.map((a: any) => [a.id, a.name]));

  return items.map((c) => ({
    ...c,
    authorName: c.agentId ? (agentNameById.get(c.agentId) ?? null) : c.userId ? (userNameById.get(c.userId) ?? null) : null,
  }));
}

// --- Zod Request Schema ---

// No userId or agentId: attribution is the authenticated principal's, and a
// field the server ignores is worse than no field - it reads as though the
// caller can choose. Zod strips unlisted keys, so an old client still sending
// them is attributed correctly rather than being rejected.
const CreateCommentSchema = z.object({
  entityId: z.string().min(1, "entityId is required"),
  entityType: z.enum(["task", "artifact"]),
  content: z.string().min(1, "content is required").max(4096),
});

const UpdateCommentSchema = z.object({
  commentId: z.string().min(1, "commentId is required"),
  content: z.string().min(1, "content is required").max(4096),
});

const DeleteCommentSchema = z.object({
  commentId: z.string().min(1, "commentId is required"),
});

/**
 * A comment may only be edited or deleted by whoever authored it, decided
 * against the authenticated principal.
 *
 * This used to compare the stored agentId against one taken from the *request
 * body*, which meant any organization member could edit or delete any
 * agent-authored comment by naming the agent. Closing that is M04's reason for
 * existing (ADR-0008).
 */
function assertCommentAuthor(comment: any, principal: Principal) {
  const isAuthor = comment.agentId
    ? principal.kind === "agent" && comment.agentId === principal.agentId
    : principal.kind === "user" && comment.userId === principal.userId;
  if (!isAuthor) {
    throw new ConnectError("only the comment's author can edit or delete it", Code.PermissionDenied);
  }
}

/**
 * Authorizes the principal against the organization owning the commented-on
 * entity, and returns the attribution columns for a new row.
 *
 * A human must be an org writer, as before. An agent's authorization is its
 * token's org binding: the credential was issued for one organization and
 * cannot reach another (ADR-0008). Scope checks arrive in M04-T07.
 */
async function authorizeAndAttribute(db: any, principal: Principal, orgId: string) {
  if (principal.kind === "agent") {
    if (principal.orgId !== orgId) {
      throw new ConnectError("this token cannot act in that organization", Code.PermissionDenied);
    }
    return { userId: null, agentId: principal.agentId };
  }
  await assertOrgWriter(db, principal.userId, orgId);
  return { userId: principal.userId, agentId: null };
}

// --- Handler Factory ---

export const createCommentsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";

  return {
    async createComment(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = CreateCommentSchema.parse(req);
      const orgId = parsed.entityType === "task"
        ? await getTaskOrgId(db, parsed.entityId)
        : await getArtifactOrgId(db, parsed.entityId);
      const attribution = await authorizeAndAttribute(db, principal, orgId);

      // Attribution is a property of the credential, never of the request. The
      // agent-existence and agent-org checks this used to do are gone because
      // there is nothing left to check: the agent id comes from a token the
      // server issued and validated on the way in.
      const comments = isStandalone ? schemaSqlite.comments : schemaMysql.comments;
      const newId = `cmt-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        entityId: parsed.entityId,
        entityType: parsed.entityType,
        ...attribution,
        content: parsed.content,
      };

      await insertRecord(db, comments, payload, isStandalone);

      const [withName] = await attachAuthorNames(db, isStandalone, [payload]);
      const commentResp = { ...withName, createdAt: new Date().toISOString() };
      publishDomainEvent(nc, "domain.comment.created", commentResp);
      return { comment: commentResp };
    },
    async updateComment(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = UpdateCommentSchema.parse(req);

      const comments = isStandalone ? schemaSqlite.comments : schemaMysql.comments;
      const existing = await db.select().from(comments).where(eq((comments as any).id, parsed.commentId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("comment not found", Code.NotFound);
      const orgId = existing[0].entityType === "task"
        ? await getTaskOrgId(db, existing[0].entityId)
        : await getArtifactOrgId(db, existing[0].entityId);
      await authorizeAndAttribute(db, principal, orgId);
      assertCommentAuthor(existing[0], principal);

      await db.update(comments).set({ content: parsed.content }).where(eq((comments as any).id, parsed.commentId));

      const [withName] = await attachAuthorNames(db, isStandalone, [{ ...existing[0], content: parsed.content }]);
      const commentResp = { ...withName, createdAt: withName.createdAt instanceof Date ? withName.createdAt.toISOString() : withName.createdAt };
      publishDomainEvent(nc, "domain.comment.updated", commentResp);
      return { comment: commentResp };
    },
    async deleteComment(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = DeleteCommentSchema.parse(req);

      const comments = isStandalone ? schemaSqlite.comments : schemaMysql.comments;
      const existing = await db.select().from(comments).where(eq((comments as any).id, parsed.commentId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("comment not found", Code.NotFound);
      const orgId = existing[0].entityType === "task"
        ? await getTaskOrgId(db, existing[0].entityId)
        : await getArtifactOrgId(db, existing[0].entityId);
      await authorizeAndAttribute(db, principal, orgId);
      assertCommentAuthor(existing[0], principal);

      await db.delete(comments).where(eq((comments as any).id, parsed.commentId));

      publishDomainEvent(nc, "domain.comment.deleted", { commentId: parsed.commentId });
      return { success: true };
    },
    async listComments(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      if (!req.entityId || !req.entityType) throw new ConnectError("entityId and entityType are required", Code.InvalidArgument);
      const orgId = req.entityType === "task"
        ? await getTaskOrgId(db, req.entityId)
        : await getArtifactOrgId(db, req.entityId);
      await assertOrgMember(db, userId, orgId);

      const cmts = isStandalone ? schemaSqlite.comments : schemaMysql.comments;
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, cmts, and(eq((cmts as any).entityId, req.entityId), eq((cmts as any).entityType, req.entityType)), req.page);

      const withNames = await attachAuthorNames(db, isStandalone, items);

      return {
        comments: withNames.map((c: any) => ({
          ...c,
          createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
  };
};
