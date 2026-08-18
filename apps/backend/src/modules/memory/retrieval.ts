import { sql } from "drizzle-orm";
import { searchTokens, toMatchExpression, toBooleanModeExpression, rowsOf } from "../search/search.handler";

/**
 * ADR-0016: `searchBeliefs` sits behind this interface rather than calling
 * FTS5/`FULLTEXT` directly, so a future vector-backed implementation is a
 * plug-in, not a rewrite of every caller. `LexicalBeliefRetriever` below is
 * the only implementation this milestone builds - a `VectorBeliefRetriever`
 * (LanceDB + a local embedding model) is documented in the ADR, not built.
 *
 * `queryEmbedding` is accepted and threaded through so a caller that already
 * has one (an agent, or a future in-process embedder) has somewhere to put
 * it; `LexicalBeliefRetriever` ignores it entirely.
 */
interface BeliefRetrieverOpts {
  taskId?: string;
  status?: string;
  confidence?: string;
  queryEmbedding?: number[];
  limit?: number;
}

export interface BeliefRetriever {
  /** Returns matching belief ids, ordered relevance-first - see the note on `lexicalBeliefRetriever` below for why not full rows. */
  search(db: any, isStandalone: boolean, scopeType: string, scopeId: string, query: string, opts: BeliefRetrieverOpts): Promise<string[]>;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Confidence orders 'high' before 'medium' before 'low' as a secondary sort
 * key, after relevance and before recency - a tiebreak, not a filter. Used
 * as a `CASE` expression rather than a joined lookup table since there are
 * only three values and they never change.
 */
const CONFIDENCE_RANK = sql`CASE b.confidence WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`;

/**
 * Wraps the exact FTS5 `bm25()` (SQLite) / InnoDB `FULLTEXT` (MySQL)
 * machinery `search.handler.ts` already runs, scoped to `beliefs`/
 * `beliefs_fts` - reusing `searchTokens`/`toMatchExpression`/
 * `toBooleanModeExpression`/`rowsOf` from there rather than a second copy of
 * the same tokenization and injection-defence logic (ADR-0016).
 *
 * Every optional filter is bound as `(<param> IS NULL OR <col> = <param>)`
 * rather than conditionally spliced into the query text - one query shape
 * regardless of which filters the caller passed, instead of relying on
 * `sql` template nesting to compose the WHERE clause correctly.
 *
 * Defaults to `status = 'active'` when the caller doesn't ask for a specific
 * status - a superseded or retracted belief must not surface in a default
 * search (M21's own exit criteria), only when a caller explicitly asks for
 * one by passing `status`.
 *
 * Returns ordered ids only, not full rows: raw `sql` queries bypass
 * drizzle's typed `.select()`, so a raw row's timestamp columns come back
 * as driver-native values (epoch numbers here, not the `Date` objects
 * `.select()` produces via its `mode: "timestamp"` column config) - exactly
 * the Date-vs-string encoding bug class M20-T01 fixed for `Project`. Rather
 * than teach this query a second, parallel row-normalization path, the
 * caller re-fetches the matched ids through the same typed `.select()` (and
 * the same row->proto mapper) every other Belief RPC already uses, and
 * re-applies this order client-side.
 */
export const lexicalBeliefRetriever: BeliefRetriever = {
  async search(db, isStandalone, scopeType, scopeId, query, opts = {}): Promise<string[]> {
    const tokens = searchTokens(query);
    if (tokens.length === 0) return [];

    const limit = Math.min(Math.max(opts.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const status = opts.status ?? "active";
    const taskId = opts.taskId ?? null;
    const confidence = opts.confidence ?? null;

    if (isStandalone) {
      const match = toMatchExpression(tokens);
      const rows = await db.all(sql`
        SELECT b.id AS id
        FROM beliefs_fts
        CROSS JOIN beliefs b ON b.rowid = beliefs_fts.rowid
        WHERE beliefs_fts MATCH ${match}
          AND b.scope_type = ${scopeType} AND b.scope_id = ${scopeId}
          AND b.deleted_at IS NULL
          AND b.status = ${status}
          AND (${taskId} IS NULL OR b.source_task_id = ${taskId})
          AND (${confidence} IS NULL OR b.confidence = ${confidence})
        ORDER BY bm25(beliefs_fts), ${CONFIDENCE_RANK}, b.created_at DESC
        LIMIT ${limit}
      `);
      return rowsOf(rows).map((r: any) => r.id);
    }

    const match = toBooleanModeExpression(tokens);
    const relevance = sql`MATCH(b.statement) AGAINST (${match} IN BOOLEAN MODE)`;
    const rows = await db.execute(sql`
      SELECT b.id AS id
      FROM beliefs b
      WHERE ${relevance}
        AND b.scope_type = ${scopeType} AND b.scope_id = ${scopeId}
        AND b.deleted_at IS NULL
        AND b.status = ${status}
        AND (${taskId} IS NULL OR b.source_task_id = ${taskId})
        AND (${confidence} IS NULL OR b.confidence = ${confidence})
      ORDER BY ${relevance} DESC, ${CONFIDENCE_RANK}, b.created_at DESC
      LIMIT ${limit}
    `);
    return rowsOf(rows).map((r: any) => r.id);
  },
};
