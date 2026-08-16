import { type ConnectRouter, ConnectError, Code } from "@connectrpc/connect";
import { SearchService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { sql } from "drizzle-orm";
import { requireUser, assertOrgMember } from "../../lib/authz";

// -------------------------------------------------------------------------
// Full-text search. SQLite reads the FTS5 tables M07-T05/T08 maintain with
// triggers; MySQL reads the InnoDB FULLTEXT indexes added in
// `drizzle-mysql/0012` and `0013`. See ADR-0010.
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
 * Search merges several independently-paginated entity types into one result
 * list (not a single globally-sorted feed), so the cursor holds one offset per
 * type.
 *
 * Keyed by type name rather than by position: adding a sixth entity type would
 * otherwise shift every offset in a cursor already in flight, silently paging
 * one type from another type's position.
 */
function encodeSearchCursor(offsets: Record<string, number>): string | undefined {
  const live = Object.entries(offsets).filter(([, v]) => v > 0);
  if (live.length === 0) return undefined;
  return Buffer.from(JSON.stringify(Object.fromEntries(live))).toString("base64");
}

function decodeSearchCursor(cursor: string | undefined): Record<string, number> {
  if (!cursor) return {};
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const n = Number(value);
      if (Number.isSafeInteger(n) && n > 0) out[key] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Splits caller text into the words the index will actually match on.
 *
 * Deliberately keeps letters and digits only. That is the whole injection
 * defence: both dialects take a query *language* — FTS5 has `AND`, `OR`, `NOT`,
 * `*`, `^`, `:` and quotes; MySQL boolean mode has `+ - > < ( ) ~ * "` — and in
 * FTS5 an unbalanced quote is not a no-op but a hard `unterminated string`
 * error. Extracting alphanumeric runs means no operator character can survive
 * to be interpreted.
 */
function searchTokens(raw: string): string[] {
  return raw.match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * FTS5: every word required, the last one a prefix so that "find" matches
 * "findable" while someone is still typing.
 */
function toMatchExpression(tokens: string[]): string {
  return tokens
    .map((t, i) => `"${t}"` + (i === tokens.length - 1 ? "*" : ""))
    .join(" AND ");
}

/**
 * The same in MySQL boolean-mode syntax: `+` is "required", `*` is prefix.
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

/**
 * One searchable entity type: how to fetch a ranked page of it, how to count
 * it, and how to turn a row into a result.
 *
 * Everything *around* these — trimming to the page size, advancing offsets,
 * deciding when to stop — is shared across every type and both dialects. That
 * logic is where this milestone's one High finding lived (an exhausted type
 * restarting at zero and repeating its rows), and copies of it would drift.
 */
interface SearchEntity {
  type: string;
  rows(db: any, match: string, orgId: string, limit: number, offset: number): any;
  count(db: any, match: string, orgId: string): any;
  toResult(row: any, tokens: string[]): any;
}

interface SearchDialect {
  expression(tokens: string[]): string;
  entities: SearchEntity[];
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

/** Ranked search over whichever full-text index the dialect provides. */
async function fullTextSearch(db: any, orgId: string, rawQuery: string, page: any, dialect: SearchDialect) {
  const totalLimit = Math.min(Math.max(page?.limit || 20, 1), 100);
  const offsets = decodeSearchCursor(page?.cursor);

  const tokens = searchTokens(rawQuery);
  // Punctuation only ("???"). The query was non-empty, so this is a search that
  // legitimately matches nothing rather than a bad request.
  if (tokens.length === 0) return { results: [], page: { totalCount: 0, nextCursor: undefined } };
  const match = dialect.expression(tokens);

  // Each type is asked for a whole page, not for its even share of one.
  //
  // Dividing the limit evenly up front looks fair and quietly under-fills every
  // page: with five types and a limit of 20, a term matching only tasks
  // returned four results and a next cursor. The even share is applied when
  // *allocating* below instead, where it can be redistributed to the types that
  // actually matched.
  const fetched = await Promise.all(
    dialect.entities.map(async (entity) => {
      const offset = offsets[entity.type] ?? 0;
      const [rowsRaw, countRaw] = await Promise.all([
        entity.rows(db, match, orgId, totalLimit, offset),
        entity.count(db, match, orgId),
      ]);
      return {
        entity,
        offset,
        rows: rowsOf(rowsRaw),
        total: Number(rowsOf(countRaw)[0]?.count ?? 0),
      };
    }),
  );

  // Round-robin: one row per type per pass, until the page is full or nothing
  // is left. Fair in the same way an even split is — no type can crowd out
  // another while that other still has rows — but it hands the unused capacity
  // of a type that did not match to the types that did.
  const kept = fetched.map(() => 0);
  let room = totalLimit;
  for (let progress = true; room > 0 && progress; ) {
    progress = false;
    for (let i = 0; i < fetched.length && room > 0; i++) {
      if (kept[i]! < fetched[i]!.rows.length) {
        kept[i]!++;
        room--;
        progress = true;
      }
    }
  }

  // Allocation is round-robin; presentation stays grouped by type, so results
  // read as "the tasks, then the artifacts" rather than interleaved.
  const results: any[] = [];
  const nextOffsets: Record<string, number> = {};
  let more = false;

  fetched.forEach((f, i) => {
    for (let n = 0; n < kept[i]!; n++) results.push(f.entity.toResult(f.rows[n], tokens));

    // The next offset counts what this type actually *kept*, not what it
    // fetched, or a row trimmed off the end is skipped on every later page too.
    const next = f.offset + kept[i]!;
    nextOffsets[f.entity.type] = next;
    // The cap bounds what is *served*. `totalCount` below still reports what
    // actually matched, because a total that shrank to the cap would misstate
    // the size of the result set.
    if (next < Math.min(f.total, MAX_SEARCH_DEPTH)) more = true;
  });

  return {
    results,
    page: {
      totalCount: fetched.reduce((sum, f) => sum + f.total, 0),
      // Every offset is carried, and paging stops only once every type is
      // exhausted. Omitting an exhausted type's offset is indistinguishable
      // from "this type has no cursor yet", so it would restart at zero and
      // return its rows again on every page the other types kept alive.
      nextCursor: more ? encodeSearchCursor(nextOffsets) : undefined,
    },
  };
}

// -------------------------------------------------------------------------
// SQLite: contentless FTS5 tables joined back on `rowid`, ranked by `bm25()`.
// -------------------------------------------------------------------------

const sqliteDialect: SearchDialect = {
  expression: toMatchExpression,
  entities: [
    {
      type: "task",
      rows: (db, match, orgId, limit, offset) => db.all(sql`
        SELECT t.id AS id, t.title AS title, t.description AS description
        FROM tasks_fts
        JOIN tasks t ON t.rowid = tasks_fts.rowid
        JOIN projects p ON p.id = t.project_id
        WHERE tasks_fts MATCH ${match} AND p.org_id = ${orgId} AND t.deleted_at IS NULL
        ORDER BY bm25(tasks_fts), t.id
        LIMIT ${limit} OFFSET ${offset}
      `),
      count: (db, match, orgId) => db.all(sql`
        SELECT count(*) AS count
        FROM tasks_fts
        JOIN tasks t ON t.rowid = tasks_fts.rowid
        JOIN projects p ON p.id = t.project_id
        WHERE tasks_fts MATCH ${match} AND p.org_id = ${orgId} AND t.deleted_at IS NULL
      `),
      toResult: (r, tokens) => ({ id: r.id, type: "task", title: r.title, snippet: buildSnippet(r.description, tokens) }),
    },
    {
      type: "artifact",
      rows: (db, match, orgId, limit, offset) => db.all(sql`
        SELECT a.id AS id, a.name AS name, a.description AS description
        FROM artifacts_fts
        JOIN artifacts a ON a.rowid = artifacts_fts.rowid
        JOIN folders f ON f.id = a.folder_id
        JOIN projects p ON p.id = f.project_id
        WHERE artifacts_fts MATCH ${match} AND p.org_id = ${orgId} AND a.deleted_at IS NULL
        ORDER BY bm25(artifacts_fts), a.id
        LIMIT ${limit} OFFSET ${offset}
      `),
      count: (db, match, orgId) => db.all(sql`
        SELECT count(*) AS count
        FROM artifacts_fts
        JOIN artifacts a ON a.rowid = artifacts_fts.rowid
        JOIN folders f ON f.id = a.folder_id
        JOIN projects p ON p.id = f.project_id
        WHERE artifacts_fts MATCH ${match} AND p.org_id = ${orgId} AND a.deleted_at IS NULL
      `),
      toResult: (r, tokens) => ({ id: r.id, type: "artifact", title: r.name, snippet: buildSnippet(r.description, tokens) }),
    },
    {
      type: "project",
      rows: (db, match, orgId, limit, offset) => db.all(sql`
        SELECT p.id AS id, p.name AS name
        FROM projects_fts
        JOIN projects p ON p.rowid = projects_fts.rowid
        WHERE projects_fts MATCH ${match} AND p.org_id = ${orgId} AND p.deleted_at IS NULL
        ORDER BY bm25(projects_fts), p.id
        LIMIT ${limit} OFFSET ${offset}
      `),
      count: (db, match, orgId) => db.all(sql`
        SELECT count(*) AS count
        FROM projects_fts
        JOIN projects p ON p.rowid = projects_fts.rowid
        WHERE projects_fts MATCH ${match} AND p.org_id = ${orgId} AND p.deleted_at IS NULL
      `),
      toResult: (r) => ({ id: r.id, type: "project", title: r.name, snippet: "" }),
    },
    {
      type: "agent",
      rows: (db, match, orgId, limit, offset) => db.all(sql`
        SELECT ag.id AS id, ag.name AS name
        FROM agents_fts
        JOIN agents ag ON ag.rowid = agents_fts.rowid
        WHERE agents_fts MATCH ${match} AND ag.org_id = ${orgId} AND ag.deleted_at IS NULL
        ORDER BY bm25(agents_fts), ag.id
        LIMIT ${limit} OFFSET ${offset}
      `),
      count: (db, match, orgId) => db.all(sql`
        SELECT count(*) AS count
        FROM agents_fts
        JOIN agents ag ON ag.rowid = agents_fts.rowid
        WHERE agents_fts MATCH ${match} AND ag.org_id = ${orgId} AND ag.deleted_at IS NULL
      `),
      toResult: (r) => ({ id: r.id, type: "agent", title: r.name, snippet: "" }),
    },
    {
      // Comments hang off a task or an artifact, so the org comes from the
      // parent and so does the destination — a comment has no screen of its
      // own. The parent joins are LEFT because only one of them applies to any
      // given row; the `deleted_at IS NULL` checks then hold trivially for the
      // side that did not join, which is what makes one query enough.
      type: "comment",
      rows: (db, match, orgId, limit, offset) => db.all(sql`
        SELECT c.id AS id, c.content AS content, c.entity_type AS parent_type,
               c.entity_id AS parent_id, coalesce(t.title, a.name) AS parent_title
        FROM comments_fts
        JOIN comments c ON c.rowid = comments_fts.rowid
        LEFT JOIN tasks t ON c.entity_type = 'task' AND t.id = c.entity_id
        LEFT JOIN artifacts a ON c.entity_type = 'artifact' AND a.id = c.entity_id
        LEFT JOIN folders f ON f.id = a.folder_id
        JOIN projects p ON p.id = coalesce(t.project_id, f.project_id)
        WHERE comments_fts MATCH ${match} AND p.org_id = ${orgId}
          AND t.deleted_at IS NULL AND a.deleted_at IS NULL
        ORDER BY bm25(comments_fts), c.id
        LIMIT ${limit} OFFSET ${offset}
      `),
      count: (db, match, orgId) => db.all(sql`
        SELECT count(*) AS count
        FROM comments_fts
        JOIN comments c ON c.rowid = comments_fts.rowid
        LEFT JOIN tasks t ON c.entity_type = 'task' AND t.id = c.entity_id
        LEFT JOIN artifacts a ON c.entity_type = 'artifact' AND a.id = c.entity_id
        LEFT JOIN folders f ON f.id = a.folder_id
        JOIN projects p ON p.id = coalesce(t.project_id, f.project_id)
        WHERE comments_fts MATCH ${match} AND p.org_id = ${orgId}
          AND t.deleted_at IS NULL AND a.deleted_at IS NULL
      `),
      toResult: (r, tokens) => ({
        id: r.id,
        type: "comment",
        title: r.parent_title ?? "Comment",
        snippet: buildSnippet(r.content, tokens),
        parentType: r.parent_type,
        parentId: r.parent_id,
      }),
    },
  ],
};

// -------------------------------------------------------------------------
// MySQL: InnoDB FULLTEXT on the same columns.
//
// The relevance sort runs the other way. SQLite's `bm25()` is negative and
// *falls* as a match improves; MySQL's relevance is positive and *rises*, so
// these order descending. Getting this backwards ranks the worst match first
// while every membership assertion still passes.
// -------------------------------------------------------------------------

/** `MATCH(cols) AGAINST (expr IN BOOLEAN MODE)`, used as both filter and sort. */
const against = (cols: any, match: string) => sql`MATCH(${cols}) AGAINST (${match} IN BOOLEAN MODE)`;

const mysqlDialect: SearchDialect = {
  expression: toBooleanModeExpression,
  entities: [
    {
      type: "task",
      rows: (db, match, orgId, limit, offset) => db.execute(sql`
        SELECT t.id AS id, t.title AS title, t.description AS description
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        WHERE ${against(sql`t.title, t.description`, match)}
          AND p.org_id = ${orgId} AND t.deleted_at IS NULL
        ORDER BY ${against(sql`t.title, t.description`, match)} DESC, t.id
        LIMIT ${limit} OFFSET ${offset}
      `),
      count: (db, match, orgId) => db.execute(sql`
        SELECT count(*) AS count
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        WHERE ${against(sql`t.title, t.description`, match)}
          AND p.org_id = ${orgId} AND t.deleted_at IS NULL
      `),
      toResult: (r, tokens) => ({ id: r.id, type: "task", title: r.title, snippet: buildSnippet(r.description, tokens) }),
    },
    {
      type: "artifact",
      rows: (db, match, orgId, limit, offset) => db.execute(sql`
        SELECT a.id AS id, a.name AS name, a.description AS description
        FROM artifacts a
        JOIN folders f ON f.id = a.folder_id
        JOIN projects p ON p.id = f.project_id
        WHERE ${against(sql`a.name, a.description`, match)}
          AND p.org_id = ${orgId} AND a.deleted_at IS NULL
        ORDER BY ${against(sql`a.name, a.description`, match)} DESC, a.id
        LIMIT ${limit} OFFSET ${offset}
      `),
      count: (db, match, orgId) => db.execute(sql`
        SELECT count(*) AS count
        FROM artifacts a
        JOIN folders f ON f.id = a.folder_id
        JOIN projects p ON p.id = f.project_id
        WHERE ${against(sql`a.name, a.description`, match)}
          AND p.org_id = ${orgId} AND a.deleted_at IS NULL
      `),
      toResult: (r, tokens) => ({ id: r.id, type: "artifact", title: r.name, snippet: buildSnippet(r.description, tokens) }),
    },
    {
      type: "project",
      rows: (db, match, orgId, limit, offset) => db.execute(sql`
        SELECT p.id AS id, p.name AS name
        FROM projects p
        WHERE ${against(sql`p.name`, match)} AND p.org_id = ${orgId} AND p.deleted_at IS NULL
        ORDER BY ${against(sql`p.name`, match)} DESC, p.id
        LIMIT ${limit} OFFSET ${offset}
      `),
      count: (db, match, orgId) => db.execute(sql`
        SELECT count(*) AS count
        FROM projects p
        WHERE ${against(sql`p.name`, match)} AND p.org_id = ${orgId} AND p.deleted_at IS NULL
      `),
      toResult: (r) => ({ id: r.id, type: "project", title: r.name, snippet: "" }),
    },
    {
      type: "agent",
      rows: (db, match, orgId, limit, offset) => db.execute(sql`
        SELECT ag.id AS id, ag.name AS name
        FROM agents ag
        WHERE ${against(sql`ag.name`, match)} AND ag.org_id = ${orgId} AND ag.deleted_at IS NULL
        ORDER BY ${against(sql`ag.name`, match)} DESC, ag.id
        LIMIT ${limit} OFFSET ${offset}
      `),
      count: (db, match, orgId) => db.execute(sql`
        SELECT count(*) AS count
        FROM agents ag
        WHERE ${against(sql`ag.name`, match)} AND ag.org_id = ${orgId} AND ag.deleted_at IS NULL
      `),
      toResult: (r) => ({ id: r.id, type: "agent", title: r.name, snippet: "" }),
    },
    {
      type: "comment",
      rows: (db, match, orgId, limit, offset) => db.execute(sql`
        SELECT c.id AS id, c.content AS content, c.entity_type AS parent_type,
               c.entity_id AS parent_id, coalesce(t.title, a.name) AS parent_title
        FROM comments c
        LEFT JOIN tasks t ON c.entity_type = 'task' AND t.id = c.entity_id
        LEFT JOIN artifacts a ON c.entity_type = 'artifact' AND a.id = c.entity_id
        LEFT JOIN folders f ON f.id = a.folder_id
        JOIN projects p ON p.id = coalesce(t.project_id, f.project_id)
        WHERE ${against(sql`c.content`, match)} AND p.org_id = ${orgId}
          AND t.deleted_at IS NULL AND a.deleted_at IS NULL
        ORDER BY ${against(sql`c.content`, match)} DESC, c.id
        LIMIT ${limit} OFFSET ${offset}
      `),
      count: (db, match, orgId) => db.execute(sql`
        SELECT count(*) AS count
        FROM comments c
        LEFT JOIN tasks t ON c.entity_type = 'task' AND t.id = c.entity_id
        LEFT JOIN artifacts a ON c.entity_type = 'artifact' AND a.id = c.entity_id
        LEFT JOIN folders f ON f.id = a.folder_id
        JOIN projects p ON p.id = coalesce(t.project_id, f.project_id)
        WHERE ${against(sql`c.content`, match)} AND p.org_id = ${orgId}
          AND t.deleted_at IS NULL AND a.deleted_at IS NULL
      `),
      toResult: (r, tokens) => ({
        id: r.id,
        type: "comment",
        title: r.parent_title ?? "Comment",
        snippet: buildSnippet(r.content, tokens),
        parentType: r.parent_type,
        parentId: r.parent_id,
      }),
    },
  ],
};

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
