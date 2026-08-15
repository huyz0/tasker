import { type ConnectRouter, ConnectError, Code } from "@connectrpc/connect";
import { SearchService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { sql } from "drizzle-orm";
import { requireUser, assertOrgMember } from "../../lib/authz";

// Search merges two independently-paginated entity types into one result
// list (not a single globally-sorted feed), so the outer cursor is a pair of
// inner cursors - one per entity type - each continuing exactly where that
// type's own sub-query left off.
function encodeSearchCursor(taskCursor: string | undefined, artifactCursor: string | undefined): string | undefined {
  if (!taskCursor && !artifactCursor) return undefined;
  return Buffer.from(JSON.stringify({ taskCursor, artifactCursor })).toString("base64");
}

function decodeSearchCursor(cursor: string | undefined): { taskCursor?: string; artifactCursor?: string } {
  if (!cursor) return {};
  try {
    return JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
  } catch {
    return {};
  }
}

// -------------------------------------------------------------------------
// Full-text search. SQLite reads the FTS5 tables M07-T05 maintains with
// triggers; MySQL reads the InnoDB FULLTEXT indexes added in
// `drizzle-mysql/0012_fulltext_search_index.sql`. See ADR-0010.
// -------------------------------------------------------------------------

/**
 * How deep a ranked search will page before it stops offering a next page.
 *
 * Ordering by relevance re-sorts the whole match set on every page (the query
 * plan is `SCAN … VIRTUAL TABLE` + `USE TEMP B-TREE FOR ORDER BY`), so offset
 * is not free. Past this depth search refuses rather than answers slowly:
 * someone asking for result 5,000 wants a filter, not a search box.
 */
const MAX_SEARCH_DEPTH = 200;

/** How much text either side of the matched word a snippet carries. */
const SNIPPET_RADIUS = 60;

/**
 * Splits caller text into the words FTS5 will actually match on.
 *
 * Deliberately keeps letters and digits only. That is the whole injection
 * defence: FTS5's `MATCH` takes a query *language* — `AND`, `OR`, `NOT`, `*`,
 * `^`, `:` and quotes are all operators — and an unbalanced quote is not a
 * no-op but a hard `unterminated string` error. Extracting alphanumeric runs
 * means no operator character can survive to be interpreted, so each token can
 * then be safely wrapped in quotes as a literal phrase.
 */
function searchTokens(raw: string): string[] {
  return raw.match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Builds the `MATCH` expression: every word required, the last one treated as
 * a prefix so that "find" matches "findable" while someone is still typing.
 */
function toMatchExpression(tokens: string[]): string {
  return tokens
    .map((t, i) => `"${t}"` + (i === tokens.length - 1 ? "*" : ""))
    .join(" AND ");
}

/**
 * The same expression in MySQL boolean-mode syntax: `+` is "required" and `*`
 * is the prefix operator.
 *
 * Boolean mode rather than natural-language mode on purpose. Natural language
 * mode drops any word appearing in more than half the rows — the "50% rule" —
 * which on a small table silently returns nothing for a perfectly good search
 * term, and reads as a broken index rather than a documented behaviour.
 */
function toBooleanModeExpression(tokens: string[]): string {
  return tokens
    .map((t, i) => `+${t}` + (i === tokens.length - 1 ? "*" : ""))
    .join(" ");
}

/**
 * A window of text around the first matched word.
 *
 * FTS5 ships `snippet()` for exactly this, and it cannot be used here: on a
 * contentless table (`content=''`) it returns **NULL** rather than erroring, so
 * a handler built on it would have shipped silently empty snippets. The index
 * stores no text to snippet from, so the text comes from the base row instead.
 */
function buildSnippet(text: string | null | undefined, tokens: string[]): string {
  if (!text) return "";
  const haystack = text.toLowerCase();
  let at = -1;
  for (const token of tokens) {
    const found = haystack.indexOf(token.toLowerCase());
    if (found !== -1 && (at === -1 || found < at)) at = found;
  }
  // The match may be in the title rather than the body, in which case the
  // opening of the body is still the most useful thing to show.
  if (at === -1) return text.slice(0, SNIPPET_RADIUS * 2);

  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(text.length, at + SNIPPET_RADIUS);
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}

/** Reads an offset back out of a per-type cursor, ignoring anything malformed. */
function decodeOffset(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * What differs between SQLite and MySQL: the query language of the match
 * expression, and the four statements. Everything after the rows come back —
 * trimming, offsets, when to stop paging — is shared deliberately. That logic
 * is where the one High finding of this milestone lived (an exhausted entity
 * type restarting at zero), and two copies of it would drift.
 */
interface SearchDialect {
  expression(tokens: string[]): string;
  taskRows(db: any, match: string, orgId: string, limit: number, offset: number): any;
  taskCount(db: any, match: string, orgId: string): any;
  artifactRows(db: any, match: string, orgId: string, limit: number, offset: number): any;
  artifactCount(db: any, match: string, orgId: string): any;
}

/**
 * Normalises what a driver hands back for a raw query.
 *
 * drizzle's bun-sqlite returns the rows; mysql2 returns `[rows, fields]`. The
 * shape is checked rather than assumed because the wrong branch would surface
 * as an empty result set, not as an error.
 */
function rowsOf(result: any): any[] {
  if (!result) return [];
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  return Array.isArray(result) ? result : [];
}

/**
 * Ranked search over whichever full-text index the dialect provides.
 *
 * Raw SQL rather than the query builder in both dialects: SQLite joins on
 * `rowid`, an implicit column the drizzle schema does not model, and both
 * dialects need the relevance expression in the `ORDER BY`.
 */
async function fullTextSearch(db: any, orgId: string, rawQuery: string, page: any, dialect: SearchDialect) {
  const totalLimit = Math.min(Math.max(page?.limit || 20, 1), 100);
  const perTypeLimit = Math.max(Math.ceil(totalLimit / 2), 1);
  const { taskCursor, artifactCursor } = decodeSearchCursor(page?.cursor);
  const taskOffset = decodeOffset(taskCursor);
  const artifactOffset = decodeOffset(artifactCursor);

  const tokens = searchTokens(rawQuery);
  // Punctuation only ("???"). The query was non-empty, so this is a search that
  // legitimately matches nothing rather than a bad request.
  if (tokens.length === 0) return { results: [], page: { totalCount: 0, nextCursor: undefined } };
  const match = dialect.expression(tokens);

  const [taskRowsRaw, taskCountRaw, artifactRowsRaw, artifactCountRaw] = await Promise.all([
    dialect.taskRows(db, match, orgId, perTypeLimit, taskOffset),
    dialect.taskCount(db, match, orgId),
    dialect.artifactRows(db, match, orgId, perTypeLimit, artifactOffset),
    dialect.artifactCount(db, match, orgId),
  ]);

  const matchedTasks = rowsOf(taskRowsRaw);
  const matchedArtifacts = rowsOf(artifactRowsRaw);
  const taskCountRow = rowsOf(taskCountRaw)[0];
  const artifactCountRow = rowsOf(artifactCountRaw)[0];

  const results = [
    ...matchedTasks.map((t: any) => ({
      id: t.id,
      type: "task",
      title: t.title,
      snippet: buildSnippet(t.description, tokens),
    })),
    ...matchedArtifacts.map((a: any) => ({
      id: a.id,
      type: "artifact",
      title: a.name,
      snippet: buildSnippet(a.description, tokens),
    })),
  ];

  // Tasks are pushed before artifacts, so trimming an odd limit only ever drops
  // artifacts - the next artifact offset must therefore count what was *kept*,
  // not what was fetched, or the trimmed row is skipped on every later page.
  const keptResults = results.slice(0, totalLimit);
  const keptTaskCount = Math.min(matchedTasks.length, totalLimit);
  const keptArtifactCount = keptResults.length - keptTaskCount;

  const taskTotal = Number(taskCountRow?.count ?? 0);
  const artifactTotal = Number(artifactCountRow?.count ?? 0);

  const nextTaskOffset = taskOffset + keptTaskCount;
  const nextArtifactOffset = artifactOffset + keptArtifactCount;
  // The cap bounds what is *served*. `totalCount` below still reports what
  // actually matched, because a total that shrank to the cap would misstate the
  // size of the result set.
  const moreTasks = nextTaskOffset < Math.min(taskTotal, MAX_SEARCH_DEPTH);
  const moreArtifacts = nextArtifactOffset < Math.min(artifactTotal, MAX_SEARCH_DEPTH);

  // BOTH offsets are always carried, and paging stops only once BOTH types are
  // exhausted. Omitting the exhausted type's offset would be indistinguishable
  // from "this type has no cursor yet", so it would restart at zero and return
  // its rows again on every page the other type kept alive.
  return {
    results: keptResults,
    page: {
      totalCount: taskTotal + artifactTotal,
      nextCursor: moreTasks || moreArtifacts
        ? encodeSearchCursor(String(nextTaskOffset), String(nextArtifactOffset))
        : undefined,
    },
  };
}

/** SQLite: contentless FTS5 tables joined back on `rowid`, ranked by `bm25()`. */
const sqliteDialect: SearchDialect = {
  expression: toMatchExpression,
  taskRows: (db, match, orgId, limit, offset) => db.all(sql`
    SELECT t.id AS id, t.title AS title, t.description AS description
    FROM tasks_fts
    JOIN tasks t ON t.rowid = tasks_fts.rowid
    JOIN projects p ON p.id = t.project_id
    WHERE tasks_fts MATCH ${match} AND p.org_id = ${orgId} AND t.deleted_at IS NULL
    ORDER BY bm25(tasks_fts), t.id
    LIMIT ${limit} OFFSET ${offset}
  `),
  taskCount: (db, match, orgId) => db.all(sql`
    SELECT count(*) AS count
    FROM tasks_fts
    JOIN tasks t ON t.rowid = tasks_fts.rowid
    JOIN projects p ON p.id = t.project_id
    WHERE tasks_fts MATCH ${match} AND p.org_id = ${orgId} AND t.deleted_at IS NULL
  `),
  artifactRows: (db, match, orgId, limit, offset) => db.all(sql`
    SELECT a.id AS id, a.name AS name, a.description AS description
    FROM artifacts_fts
    JOIN artifacts a ON a.rowid = artifacts_fts.rowid
    JOIN folders f ON f.id = a.folder_id
    JOIN projects p ON p.id = f.project_id
    WHERE artifacts_fts MATCH ${match} AND p.org_id = ${orgId} AND a.deleted_at IS NULL
    ORDER BY bm25(artifacts_fts), a.id
    LIMIT ${limit} OFFSET ${offset}
  `),
  artifactCount: (db, match, orgId) => db.all(sql`
    SELECT count(*) AS count
    FROM artifacts_fts
    JOIN artifacts a ON a.rowid = artifacts_fts.rowid
    JOIN folders f ON f.id = a.folder_id
    JOIN projects p ON p.id = f.project_id
    WHERE artifacts_fts MATCH ${match} AND p.org_id = ${orgId} AND a.deleted_at IS NULL
  `),
};

/**
 * MySQL: InnoDB `FULLTEXT` on the same columns, ranked by the relevance score
 * `MATCH … AGAINST` returns.
 *
 * The score is *descending* here — MySQL's relevance rises with a better match,
 * where SQLite's `bm25()` is a negative value that falls. Two dialects, two
 * directions, the same resulting order; getting this backwards would rank the
 * worst match first while every test that only checks membership still passed.
 */
const mysqlDialect: SearchDialect = {
  expression: toBooleanModeExpression,
  taskRows: (db, match, orgId, limit, offset) => db.execute(sql`
    SELECT t.id AS id, t.title AS title, t.description AS description
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE MATCH(t.title, t.description) AGAINST (${match} IN BOOLEAN MODE)
      AND p.org_id = ${orgId} AND t.deleted_at IS NULL
    ORDER BY MATCH(t.title, t.description) AGAINST (${match} IN BOOLEAN MODE) DESC, t.id
    LIMIT ${limit} OFFSET ${offset}
  `),
  taskCount: (db, match, orgId) => db.execute(sql`
    SELECT count(*) AS count
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE MATCH(t.title, t.description) AGAINST (${match} IN BOOLEAN MODE)
      AND p.org_id = ${orgId} AND t.deleted_at IS NULL
  `),
  artifactRows: (db, match, orgId, limit, offset) => db.execute(sql`
    SELECT a.id AS id, a.name AS name, a.description AS description
    FROM artifacts a
    JOIN folders f ON f.id = a.folder_id
    JOIN projects p ON p.id = f.project_id
    WHERE MATCH(a.name, a.description) AGAINST (${match} IN BOOLEAN MODE)
      AND p.org_id = ${orgId} AND a.deleted_at IS NULL
    ORDER BY MATCH(a.name, a.description) AGAINST (${match} IN BOOLEAN MODE) DESC, a.id
    LIMIT ${limit} OFFSET ${offset}
  `),
  artifactCount: (db, match, orgId) => db.execute(sql`
    SELECT count(*) AS count
    FROM artifacts a
    JOIN folders f ON f.id = a.folder_id
    JOIN projects p ON p.id = f.project_id
    WHERE MATCH(a.name, a.description) AGAINST (${match} IN BOOLEAN MODE)
      AND p.org_id = ${orgId} AND a.deleted_at IS NULL
  `),
};

// Escapes LIKE's special characters (\, %, _) in caller-supplied query text
// so a search for e.g. "100%" or "foo_bar" matches those literal characters
// instead of "%"/"_" acting as SQL wildcards and matching unrelated rows.
function escapeLikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function likeEscaped(column: any, pattern: string) {
  return sql`${column} LIKE ${pattern} ESCAPE '\\'`;
}

export default (router: ConnectRouter, db: any) => {
  const isStandalone = process.env.STANDALONE === "true";

  router.service(SearchService as any, {
    async universalSearch(request: any, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const { query, orgId, page } = request;
      if (!orgId) throw new ConnectError("orgId is required", Code.InvalidArgument);
      if (!query || !query.trim()) throw new ConnectError("query is required", Code.InvalidArgument);
      await assertOrgMember(db, userId, orgId);

      // The `LIKE '%term%'` scan both dialects used is gone: it could not use
      // an index, and it ordered by creation date rather than relevance.
      return await fullTextSearch(db, orgId, query, page, isStandalone ? sqliteDialect : mysqlDialect);
    },
  });
};
