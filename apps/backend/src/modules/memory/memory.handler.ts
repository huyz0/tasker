import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, or, inArray } from "drizzle-orm";
import { insertRecord, executePaginatedQuery, notDeleted, softDeleteById, restoreById } from "../../db/query-builder";
import { requireUser, requirePrincipal, authorizePrincipal, getProjectOrgId, getTeamOrgId } from "../../lib/authz";
import { assertCan } from "../../lib/policy";
import { lexicalBeliefRetriever } from "./retrieval";
import { ConnectError, Code } from "@connectrpc/connect";

/**
 * The shared belief system (M21, ADR-0014/0015/0016). `scopeType` is
 * literally `lib/policy.ts`'s `Scope['type']` ('organization' | 'team' |
 * 'project') - no fourth, memory-only tier - so every RPC below authorizes
 * with the exact same `assertCan`/`authorizePrincipal` calls every other
 * scoped resource in this codebase uses, at a scope named directly by the
 * belief (or by the request, for endpoints that don't yet have a belief to
 * read one off).
 *
 * Permission tiers follow the same *:read/*:write/*:admin split every other
 * family already has (ADR-0014's migration seeded the description): reading
 * a belief is `memory:read`, writing or correcting one is `memory:write`,
 * and everything that changes a belief's *lifecycle* - promoting it to a
 * wider scope, archiving, restoring, or permanently purging it - is
 * `memory:admin`. `memory:admin` has no agent-token form at all (ADR-0015),
 * so those four RPCs call `requireUser` rather than `requirePrincipal`,
 * refusing a token outright rather than checking a scope that can never be
 * held. This mirrors the precedent already set by every other entity's own
 * lifecycle ops - `archiveProject`/`restoreProject`/`purgeProject`,
 * `archiveArtifact`/`restoreArtifact`/`purgeArtifact`,
 * `deleteTask`/`restoreTask`/`purgeTask` - none of which appear in
 * `AGENT_RPC_SCOPES` either, not just `promoteBelief`/`purgeBelief` as an
 * earlier note on this milestone's own task breakdown had assumed before
 * this handler was written; see this task's `PROGRESS.md` entry.
 */

const SCOPE_TYPES = ["organization", "team", "project"] as const;
const ScopeTypeSchema = z.enum(SCOPE_TYPES);
const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
const ConfidenceSchema = z.enum(CONFIDENCE_LEVELS);
const STATUSES = ["active", "superseded", "retracted"] as const;
const StatusSchema = z.enum(STATUSES);
const RELATION_TYPES = ["relates_to", "supports", "contradicts", "duplicates"] as const;
const RelationTypeSchema = z.enum(RELATION_TYPES);

const MAX_STATEMENT_LENGTH = 4096;
const MAX_NOTE_LENGTH = 1024;

// --- Zod Request Schemas ---

const RecordBeliefSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  scopeType: ScopeTypeSchema,
  scopeId: z.string().min(1, "scopeId is required"),
  statement: z.string().min(1, "statement is required").max(MAX_STATEMENT_LENGTH),
  confidence: ConfidenceSchema.optional(),
  sourceTaskId: z.string().min(1).optional(),
  sourceCommentId: z.string().min(1).optional(),
  sourceTaskNoteId: z.string().min(1).optional(),
  sourceArtifactId: z.string().min(1).optional(),
  embedding: z.array(z.number()).optional().default([]),
});

const GetBeliefSchema = z.object({
  id: z.string().min(1, "id is required"),
});

const ListBeliefsSchema = z.object({
  scopeType: ScopeTypeSchema,
  scopeId: z.string().min(1, "scopeId is required"),
  page: z.any().optional(),
  status: StatusSchema.optional(),
  confidence: ConfidenceSchema.optional(),
});

const SearchBeliefsSchema = z.object({
  scopeType: ScopeTypeSchema,
  scopeId: z.string().min(1, "scopeId is required"),
  query: z.string().min(1, "query is required"),
  taskId: z.string().min(1).optional(),
  status: StatusSchema.optional(),
  confidence: ConfidenceSchema.optional(),
  queryEmbedding: z.array(z.number()).optional().default([]),
  limit: z.number().int().positive().optional(),
});

const UpdateBeliefSchema = z.object({
  id: z.string().min(1, "id is required"),
  statement: z.string().min(1, "statement cannot be empty").max(MAX_STATEMENT_LENGTH).optional(),
  confidence: ConfidenceSchema.optional(),
});

const SupersedeBeliefSchema = z.object({
  id: z.string().min(1, "id is required"),
  statement: z.string().min(1, "statement is required").max(MAX_STATEMENT_LENGTH),
  confidence: ConfidenceSchema.optional(),
  sourceTaskId: z.string().min(1).optional(),
  sourceCommentId: z.string().min(1).optional(),
  sourceTaskNoteId: z.string().min(1).optional(),
  sourceArtifactId: z.string().min(1).optional(),
  embedding: z.array(z.number()).optional().default([]),
});

const PromoteBeliefSchema = z.object({
  id: z.string().min(1, "id is required"),
  toScopeType: ScopeTypeSchema,
  toScopeId: z.string().min(1, "toScopeId is required"),
  note: z.string().max(MAX_NOTE_LENGTH).optional(),
});

const RelateBeliefsSchema = z.object({
  beliefAId: z.string().min(1, "beliefAId is required"),
  beliefBId: z.string().min(1, "beliefBId is required"),
  relationType: RelationTypeSchema,
});

const UnrelateBeliefsSchema = z.object({
  relationId: z.string().min(1, "relationId is required"),
});

const ListBeliefRelationsSchema = z.object({
  beliefId: z.string().min(1, "beliefId is required"),
});

const ListBeliefPromotionsSchema = z.object({
  beliefId: z.string().min(1, "beliefId is required"),
});

const ArchiveBeliefSchema = z.object({
  id: z.string().min(1, "id is required"),
});

const RestoreBeliefSchema = z.object({
  id: z.string().min(1, "id is required"),
});

const PurgeBeliefSchema = z.object({
  id: z.string().min(1, "id is required"),
});

// --- Handler Factory ---

export const createMemoryHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  const beliefsTable = () => (isStandalone ? schemaSqlite.beliefs : schemaMysql.beliefs);
  const beliefRelationsTable = () => (isStandalone ? schemaSqlite.beliefRelations : schemaMysql.beliefRelations);
  const beliefPromotionsTable = () => (isStandalone ? schemaSqlite.beliefPromotions : schemaMysql.beliefPromotions);

  /**
   * Resolves which organization actually owns a scope, the same way
   * `roles.handler.ts`'s own `resolveScopeOrgId` does for grants: an
   * 'organization' scope is trusted as-is (the FK on `beliefs.org_id`
   * catches a bad id at insert time, same as grants' own lack of a
   * pre-check here), 'team'/'project' resolve upward through
   * `getTeamOrgId`/`getProjectOrgId`. `includeDeleted: true` throughout -
   * a belief can still be read, related, or promoted off an archived
   * project/team, matching `grantRole`'s own reasoning for the same choice.
   */
  const resolveScopeOrgId = async (scopeType: string, scopeId: string): Promise<string> => {
    if (scopeType === "organization") return scopeId;
    if (scopeType === "project") return getProjectOrgId(db, scopeId, true);
    if (scopeType === "team") return getTeamOrgId(db, scopeId, true);
    throw new ConnectError("scopeType must be 'organization', 'team', or 'project'", Code.InvalidArgument);
  };

  const loadBelief = async (id: string) => {
    const rows = await db.select().from(beliefsTable()).where(eq((beliefsTable() as any).id, id)).limit(1);
    if (!rows || rows.length === 0) throw new ConnectError("belief not found", Code.NotFound);
    return rows[0];
  };

  const loadBeliefs = async (ids: string[]) => {
    if (ids.length === 0) return [];
    const bt = beliefsTable();
    return db.select().from(bt).where(inArray((bt as any).id, ids));
  };

  /**
   * Normalizes a DB row into the wire shape: proto3-optional fields become
   * `undefined` rather than `null` when unset, `Date` columns become ISO
   * strings (the M20-T01 encoding bug class - a `Date` reaching connect's
   * protobuf JSON encoder throws, it does not silently stringify), and
   * `embedding` round-trips through the JSON-serialized text column back
   * into a plain number array (defaulting to `[]`, since `repeated float`
   * has no `null` state on the wire).
   */
  const beliefToProto = (row: any) => ({
    id: row.id,
    orgId: row.orgId,
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    statement: row.statement,
    confidence: row.confidence,
    status: row.status,
    supersedesBeliefId: row.supersedesBeliefId ?? undefined,
    sourceKind: row.sourceKind,
    sourceAgentId: row.sourceAgentId ?? undefined,
    sourceUserId: row.sourceUserId ?? undefined,
    sourceTaskId: row.sourceTaskId ?? undefined,
    sourceCommentId: row.sourceCommentId ?? undefined,
    sourceTaskNoteId: row.sourceTaskNoteId ?? undefined,
    sourceArtifactId: row.sourceArtifactId ?? undefined,
    promotedFromScopeType: row.promotedFromScopeType ?? undefined,
    promotedFromScopeId: row.promotedFromScopeId ?? undefined,
    promotedBy: row.promotedBy ?? undefined,
    promotedAt: row.promotedAt instanceof Date ? row.promotedAt.toISOString() : (row.promotedAt ?? undefined),
    deletedAt: row.deletedAt instanceof Date ? row.deletedAt.toISOString() : (row.deletedAt ?? undefined),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    embedding: row.embedding ? JSON.parse(row.embedding) : [],
  });

  const relationToProto = (row: any) => ({
    id: row.id,
    beliefAId: row.beliefAId,
    beliefBId: row.beliefBId,
    relationType: row.relationType,
    createdBy: row.createdBy,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  });

  const promotionToProto = (row: any) => ({
    id: row.id,
    beliefId: row.beliefId,
    fromScopeType: row.fromScopeType,
    fromScopeId: row.fromScopeId,
    toScopeType: row.toScopeType,
    toScopeId: row.toScopeId,
    promotedBy: row.promotedBy,
    promotedAt: row.promotedAt instanceof Date ? row.promotedAt.toISOString() : row.promotedAt,
    note: row.note ?? undefined,
  });

  return {
    async recordBelief(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = RecordBeliefSchema.parse(req);
      const resolvedOrgId = await resolveScopeOrgId(parsed.scopeType, parsed.scopeId);
      if (resolvedOrgId !== parsed.orgId) {
        throw new ConnectError("orgId does not match the resolved owning organization of scopeId", Code.InvalidArgument);
      }
      await authorizePrincipal(db, principal, resolvedOrgId, { scope: "memory:write", permission: "memory:write" }, { type: parsed.scopeType, id: parsed.scopeId });

      const newId = `blf-${crypto.randomUUID()}`;
      const payload: Record<string, unknown> = {
        id: newId,
        orgId: resolvedOrgId,
        scopeType: parsed.scopeType,
        scopeId: parsed.scopeId,
        statement: parsed.statement,
        confidence: parsed.confidence ?? "medium",
        status: "active",
        // Provenance is derived from the authenticated caller, never taken
        // from the request body - the whole point of "trace back where a
        // fact came from" is that the source can't be spoofed by whoever's
        // recording it.
        sourceKind: principal.kind === "agent" ? "agent" : "user",
        sourceAgentId: principal.kind === "agent" ? principal.agentId : undefined,
        sourceUserId: principal.kind === "user" ? principal.userId : undefined,
        sourceTaskId: parsed.sourceTaskId,
        sourceCommentId: parsed.sourceCommentId,
        sourceTaskNoteId: parsed.sourceTaskNoteId,
        sourceArtifactId: parsed.sourceArtifactId,
        embedding: parsed.embedding.length > 0 ? JSON.stringify(parsed.embedding) : null,
        createdAt: new Date(),
      };
      await insertRecord(db, beliefsTable(), payload, isStandalone, false);
      const belief = beliefToProto(payload);
      publishDomainEvent(nc, "domain.belief.recorded", belief);
      return { belief };
    },

    async getBelief(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = GetBeliefSchema.parse(req);
      const row = await loadBelief(parsed.id);
      await authorizePrincipal(db, principal, row.orgId, { scope: "memory:read", permission: "memory:read" }, { type: row.scopeType, id: row.scopeId });
      return { belief: beliefToProto(row) };
    },

    async listBeliefs(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = ListBeliefsSchema.parse(req);
      const resolvedOrgId = await resolveScopeOrgId(parsed.scopeType, parsed.scopeId);
      await authorizePrincipal(db, principal, resolvedOrgId, { scope: "memory:read", permission: "memory:read" }, { type: parsed.scopeType, id: parsed.scopeId });

      const bt = beliefsTable();
      const conditions = [
        eq((bt as any).scopeType, parsed.scopeType),
        eq((bt as any).scopeId, parsed.scopeId),
        notDeleted(bt),
      ];
      if (parsed.status) conditions.push(eq((bt as any).status, parsed.status));
      if (parsed.confidence) conditions.push(eq((bt as any).confidence, parsed.confidence));

      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, bt, and(...conditions), parsed.page, {
        sortableColumns: { createdAt: (bt as any).createdAt, confidence: (bt as any).confidence },
        select: {
          id: (bt as any).id,
          orgId: (bt as any).orgId,
          scopeType: (bt as any).scopeType,
          scopeId: (bt as any).scopeId,
          statement: (bt as any).statement,
          confidence: (bt as any).confidence,
          status: (bt as any).status,
          supersedesBeliefId: (bt as any).supersedesBeliefId,
          sourceKind: (bt as any).sourceKind,
          sourceAgentId: (bt as any).sourceAgentId,
          sourceUserId: (bt as any).sourceUserId,
          sourceTaskId: (bt as any).sourceTaskId,
          sourceCommentId: (bt as any).sourceCommentId,
          sourceTaskNoteId: (bt as any).sourceTaskNoteId,
          sourceArtifactId: (bt as any).sourceArtifactId,
          promotedFromScopeType: (bt as any).promotedFromScopeType,
          promotedFromScopeId: (bt as any).promotedFromScopeId,
          promotedBy: (bt as any).promotedBy,
          promotedAt: (bt as any).promotedAt,
          embedding: (bt as any).embedding,
          deletedAt: (bt as any).deletedAt,
          createdAt: (bt as any).createdAt,
        },
        // Both facets narrow `scope` (baseCondition), not `filter` -
        // without this a cursor minted under one status/confidence facet
        // would report a stale totalCount if reused after the caller
        // changed either, the same M19-T03/M20-T02 cache-key lesson.
        extraCacheKey: `${parsed.status ?? ""}:${parsed.confidence ?? ""}`,
      });

      return {
        beliefs: items.map(beliefToProto),
        page: { nextCursor, totalCount },
      };
    },

    async searchBeliefs(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = SearchBeliefsSchema.parse(req);
      const resolvedOrgId = await resolveScopeOrgId(parsed.scopeType, parsed.scopeId);
      await authorizePrincipal(db, principal, resolvedOrgId, { scope: "memory:read", permission: "memory:read" }, { type: parsed.scopeType, id: parsed.scopeId });

      const ids = await lexicalBeliefRetriever.search(db, isStandalone, parsed.scopeType, parsed.scopeId, parsed.query, {
        taskId: parsed.taskId,
        status: parsed.status,
        confidence: parsed.confidence,
        queryEmbedding: parsed.queryEmbedding,
        limit: parsed.limit,
      });
      if (ids.length === 0) return { beliefs: [] };

      // `IN (...)` does not preserve order, so the rows are re-sorted back
      // into the relevance order the retriever already computed, rather
      // than whatever order the DB happens to return them in.
      const rows = await loadBeliefs(ids);
      const byId = new Map(rows.map((r: any) => [r.id, r]));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
      return { beliefs: ordered.map(beliefToProto) };
    },

    async updateBelief(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = UpdateBeliefSchema.parse(req);
      const row = await loadBelief(parsed.id);
      await authorizePrincipal(db, principal, row.orgId, { scope: "memory:write", permission: "memory:write" }, { type: row.scopeType, id: row.scopeId });

      const updates: Record<string, unknown> = {};
      if (parsed.statement !== undefined) updates.statement = parsed.statement;
      if (parsed.confidence !== undefined) updates.confidence = parsed.confidence;
      if (Object.keys(updates).length > 0) {
        await db.update(beliefsTable()).set(updates).where(eq((beliefsTable() as any).id, parsed.id));
      }

      const updated = { ...row, ...updates };
      publishDomainEvent(nc, "domain.belief.updated", beliefToProto(updated));
      return { belief: beliefToProto(updated) };
    },

    async supersedeBelief(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = SupersedeBeliefSchema.parse(req);
      const old = await loadBelief(parsed.id);
      await authorizePrincipal(db, principal, old.orgId, { scope: "memory:write", permission: "memory:write" }, { type: old.scopeType, id: old.scopeId });

      const newId = `blf-${crypto.randomUUID()}`;
      const payload: Record<string, unknown> = {
        id: newId,
        orgId: old.orgId,
        scopeType: old.scopeType,
        scopeId: old.scopeId,
        statement: parsed.statement,
        confidence: parsed.confidence ?? old.confidence,
        status: "active",
        supersedesBeliefId: old.id,
        sourceKind: principal.kind === "agent" ? "agent" : "user",
        sourceAgentId: principal.kind === "agent" ? principal.agentId : undefined,
        sourceUserId: principal.kind === "user" ? principal.userId : undefined,
        sourceTaskId: parsed.sourceTaskId,
        sourceCommentId: parsed.sourceCommentId,
        sourceTaskNoteId: parsed.sourceTaskNoteId,
        sourceArtifactId: parsed.sourceArtifactId,
        embedding: parsed.embedding.length > 0 ? JSON.stringify(parsed.embedding) : null,
        createdAt: new Date(),
      };
      await insertRecord(db, beliefsTable(), payload, isStandalone, false);
      await db.update(beliefsTable()).set({ status: "superseded" }).where(eq((beliefsTable() as any).id, old.id));

      const belief = beliefToProto(payload);
      publishDomainEvent(nc, "domain.belief.superseded", { supersededId: old.id, belief });
      return { belief };
    },

    async promoteBelief(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = PromoteBeliefSchema.parse(req);
      const row = await loadBelief(parsed.id);
      // Both ends checked: authority over the belief where it lives today,
      // and authority over the wider scope it's about to become visible in
      // - the same "both sides" shape createProject uses to check both the
      // acting user and the named owner, so promotion can't be used to push
      // a belief into a scope the promoter has no standing in themselves.
      await assertCan(db, { kind: "user", userId }, { type: row.scopeType, id: row.scopeId }, "memory:admin");
      const toOrgId = await resolveScopeOrgId(parsed.toScopeType, parsed.toScopeId);
      await assertCan(db, { kind: "user", userId }, { type: parsed.toScopeType, id: parsed.toScopeId }, "memory:admin");

      const now = new Date();
      const updates = {
        scopeType: parsed.toScopeType,
        scopeId: parsed.toScopeId,
        orgId: toOrgId,
        promotedFromScopeType: row.scopeType,
        promotedFromScopeId: row.scopeId,
        promotedBy: userId,
        promotedAt: now,
      };
      await db.update(beliefsTable()).set(updates).where(eq((beliefsTable() as any).id, row.id));

      const promotionId = `bfp-${crypto.randomUUID()}`;
      const promotionPayload = {
        id: promotionId,
        beliefId: row.id,
        fromScopeType: row.scopeType,
        fromScopeId: row.scopeId,
        toScopeType: parsed.toScopeType,
        toScopeId: parsed.toScopeId,
        promotedBy: userId,
        promotedAt: now,
        note: parsed.note,
      };
      await insertRecord(db, beliefPromotionsTable(), promotionPayload, isStandalone, false);

      const belief = beliefToProto({ ...row, ...updates });
      const promotion = promotionToProto(promotionPayload);
      publishDomainEvent(nc, "domain.belief.promoted", { belief, promotion });
      return { belief, promotion };
    },

    async relateBeliefs(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = RelateBeliefsSchema.parse(req);
      if (parsed.beliefAId === parsed.beliefBId) {
        throw new ConnectError("a belief cannot be related to itself", Code.InvalidArgument);
      }
      const [beliefA, beliefB] = await Promise.all([loadBelief(parsed.beliefAId), loadBelief(parsed.beliefBId)]);
      await authorizePrincipal(db, principal, beliefA.orgId, { scope: "memory:write", permission: "memory:write" }, { type: beliefA.scopeType, id: beliefA.scopeId });
      await authorizePrincipal(db, principal, beliefB.orgId, { scope: "memory:write", permission: "memory:write" }, { type: beliefB.scopeType, id: beliefB.scopeId });

      const newId = `bfr-${crypto.randomUUID()}`;
      const payload = {
        id: newId,
        beliefAId: parsed.beliefAId,
        beliefBId: parsed.beliefBId,
        relationType: parsed.relationType,
        createdBy: principal.kind === "user" ? principal.userId : principal.agentId,
        createdAt: new Date(),
      };
      await insertRecord(db, beliefRelationsTable(), payload, isStandalone, false);
      const relation = relationToProto(payload);
      publishDomainEvent(nc, "domain.belief.related", relation);
      return { relation };
    },

    async unrelateBeliefs(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = UnrelateBeliefsSchema.parse(req);
      const rt = beliefRelationsTable();
      const rows = await db.select().from(rt).where(eq((rt as any).id, parsed.relationId)).limit(1);
      if (!rows || rows.length === 0) throw new ConnectError("belief relation not found", Code.NotFound);
      const relation = rows[0];

      const [beliefA, beliefB] = await Promise.all([loadBelief(relation.beliefAId), loadBelief(relation.beliefBId)]);
      await authorizePrincipal(db, principal, beliefA.orgId, { scope: "memory:write", permission: "memory:write" }, { type: beliefA.scopeType, id: beliefA.scopeId });
      await authorizePrincipal(db, principal, beliefB.orgId, { scope: "memory:write", permission: "memory:write" }, { type: beliefB.scopeType, id: beliefB.scopeId });

      await db.delete(rt).where(eq((rt as any).id, parsed.relationId));
      publishDomainEvent(nc, "domain.belief.unrelated", { relationId: parsed.relationId });
      return { success: true };
    },

    async listBeliefRelations(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = ListBeliefRelationsSchema.parse(req);
      const belief = await loadBelief(parsed.beliefId);
      await authorizePrincipal(db, principal, belief.orgId, { scope: "memory:read", permission: "memory:read" }, { type: belief.scopeType, id: belief.scopeId });

      const rt = beliefRelationsTable();
      const rows = await db.select().from(rt).where(or(eq((rt as any).beliefAId, parsed.beliefId), eq((rt as any).beliefBId, parsed.beliefId)));
      return { relations: rows.map(relationToProto) };
    },

    async listBeliefPromotions(req: unknown, { values: contextValues }: { values: any }) {
      const principal = requirePrincipal(contextValues);
      const parsed = ListBeliefPromotionsSchema.parse(req);
      const belief = await loadBelief(parsed.beliefId);
      await authorizePrincipal(db, principal, belief.orgId, { scope: "memory:read", permission: "memory:read" }, { type: belief.scopeType, id: belief.scopeId });

      const pt = beliefPromotionsTable();
      const rows = await db.select().from(pt).where(eq((pt as any).beliefId, parsed.beliefId));
      return { promotions: rows.map(promotionToProto) };
    },

    async archiveBelief(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ArchiveBeliefSchema.parse(req);
      const row = await loadBelief(parsed.id);
      await assertCan(db, { kind: "user", userId }, { type: row.scopeType, id: row.scopeId }, "memory:admin");

      await softDeleteById(db, beliefsTable(), parsed.id);
      publishDomainEvent(nc, "domain.belief.archived", { beliefId: parsed.id });
      return { success: true };
    },

    async restoreBelief(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RestoreBeliefSchema.parse(req);
      const row = await loadBelief(parsed.id);
      await assertCan(db, { kind: "user", userId }, { type: row.scopeType, id: row.scopeId }, "memory:admin");

      await restoreById(db, beliefsTable(), parsed.id);
      publishDomainEvent(nc, "domain.belief.restored", { beliefId: parsed.id });
      return { success: true };
    },

    async purgeBelief(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = PurgeBeliefSchema.parse(req);
      const row = await loadBelief(parsed.id);
      await assertCan(db, { kind: "user", userId }, { type: row.scopeType, id: row.scopeId }, "memory:admin");
      if (!row.deletedAt) {
        throw new ConnectError("belief must be archived before it can be purged", Code.FailedPrecondition);
      }

      const bt = beliefsTable();
      const rt = beliefRelationsTable();
      const pt = beliefPromotionsTable();
      // A purged belief cannot be left as a dangling supersedesBeliefId/
      // relation/promotion endpoint any more than a purged project can
      // leave a dangling grant behind (M20-T03's own lesson) - clear every
      // reference before the row itself goes.
      await db.update(bt).set({ supersedesBeliefId: null }).where(eq((bt as any).supersedesBeliefId, parsed.id));
      await db.delete(rt).where(or(eq((rt as any).beliefAId, parsed.id), eq((rt as any).beliefBId, parsed.id)));
      await db.delete(pt).where(eq((pt as any).beliefId, parsed.id));
      await db.delete(bt).where(eq((bt as any).id, parsed.id));

      publishDomainEvent(nc, "domain.belief.purged", { beliefId: parsed.id });
      return { success: true };
    },
  };
};
