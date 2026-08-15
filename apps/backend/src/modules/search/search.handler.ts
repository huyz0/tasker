import { type ConnectRouter, ConnectError, Code } from "@connectrpc/connect";
import { SearchService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { or, and, eq, desc, sql } from "drizzle-orm";
import { requireUser, assertOrgMember } from "../../lib/authz";
import { notDeleted, encodeCursor, decodeCursor, buildCursorPaginationWhere } from "../../db/query-builder";

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
// Full-text search (standalone / SQLite). See ADR-0010.
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
 * The SQLite branch: ranked by `bm25()` out of the FTS5 indexes T05 maintains.
 *
 * Written as raw SQL rather than through the query builder because the join is
 * `tasks_fts.rowid = tasks.rowid` — an implicit SQLite column the drizzle
 * schema does not model — and because `bm25()` has to appear in both the
 * projection and the `ORDER BY`.
 */
async function fullTextSearch(db: any, orgId: string, rawQuery: string, page: any) {
  const totalLimit = Math.min(Math.max(page?.limit || 20, 1), 100);
  const perTypeLimit = Math.max(Math.ceil(totalLimit / 2), 1);
  const { taskCursor, artifactCursor } = decodeSearchCursor(page?.cursor);
  const taskOffset = decodeOffset(taskCursor);
  const artifactOffset = decodeOffset(artifactCursor);

  const tokens = searchTokens(rawQuery);
  // Punctuation only ("???"). The query was non-empty, so this is a search that
  // legitimately matches nothing rather than a bad request.
  if (tokens.length === 0) return { results: [], page: { totalCount: 0, nextCursor: undefined } };
  const match = toMatchExpression(tokens);

  const [matchedTasks, [taskCountRow], matchedArtifacts, [artifactCountRow]] = await Promise.all([
    db.all(sql`
      SELECT t.id AS id, t.title AS title, t.description AS description
      FROM tasks_fts
      JOIN tasks t ON t.rowid = tasks_fts.rowid
      JOIN projects p ON p.id = t.project_id
      WHERE tasks_fts MATCH ${match} AND p.org_id = ${orgId} AND t.deleted_at IS NULL
      ORDER BY bm25(tasks_fts), t.id
      LIMIT ${perTypeLimit} OFFSET ${taskOffset}
    `),
    db.all(sql`
      SELECT count(*) AS count
      FROM tasks_fts
      JOIN tasks t ON t.rowid = tasks_fts.rowid
      JOIN projects p ON p.id = t.project_id
      WHERE tasks_fts MATCH ${match} AND p.org_id = ${orgId} AND t.deleted_at IS NULL
    `),
    db.all(sql`
      SELECT a.id AS id, a.name AS name, a.description AS description
      FROM artifacts_fts
      JOIN artifacts a ON a.rowid = artifacts_fts.rowid
      JOIN folders f ON f.id = a.folder_id
      JOIN projects p ON p.id = f.project_id
      WHERE artifacts_fts MATCH ${match} AND p.org_id = ${orgId} AND a.deleted_at IS NULL
      ORDER BY bm25(artifacts_fts), a.id
      LIMIT ${perTypeLimit} OFFSET ${artifactOffset}
    `),
    db.all(sql`
      SELECT count(*) AS count
      FROM artifacts_fts
      JOIN artifacts a ON a.rowid = artifacts_fts.rowid
      JOIN folders f ON f.id = a.folder_id
      JOIN projects p ON p.id = f.project_id
      WHERE artifacts_fts MATCH ${match} AND p.org_id = ${orgId} AND a.deleted_at IS NULL
    `),
  ]);

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
  const schema = isStandalone ? schemaSqlite : schemaMysql;

  router.service(SearchService as any, {
    async universalSearch(request: any, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const { query, orgId, page } = request;
      if (!orgId) throw new ConnectError("orgId is required", Code.InvalidArgument);
      if (!query || !query.trim()) throw new ConnectError("query is required", Code.InvalidArgument);
      await assertOrgMember(db, userId, orgId);

      // SQLite reads the FTS5 index T05 maintains and ranks by relevance
      // (ADR-0010). MySQL still runs the `LIKE` scan below; its `FULLTEXT`
      // branch is M07-T07.
      if (isStandalone) return await fullTextSearch(db, orgId, query, page);

      const { tasks, artifacts, projects, folders } = schema;
      const results: any[] = [];
      const searchPattern = `%${escapeLikePattern(query)}%`;

      // Split the caller's overall limit evenly between the two entity
      // types, so a single result type can't crowd out the other - a real,
      // caller-controlled limit instead of a hardcoded 10 per type.
      const totalLimit = Math.min(Math.max(page?.limit || 20, 1), 100);
      const perTypeLimit = Math.max(Math.ceil(totalLimit / 2), 1);
      const { taskCursor, artifactCursor } = decodeSearchCursor(page?.cursor);

      const taskCondition = and(
        eq(projects.orgId, orgId),
        notDeleted(tasks),
        or(
          likeEscaped(tasks.title, searchPattern),
          likeEscaped(tasks.description, searchPattern)
        )
      );
      const taskCursorWhere = buildCursorPaginationWhere(decodeCursor(taskCursor), tasks.createdAt as any, tasks.id as any, "createdAt", "desc");
      const taskWhere = taskCursorWhere ? and(taskCondition, taskCursorWhere) : taskCondition;

      // Search tasks, scoped to this org via their project
      const [matchedTasks, [taskCountRow]] = await Promise.all([
        db
          .select({ id: tasks.id, title: tasks.title, description: tasks.description, createdAt: tasks.createdAt })
          .from(tasks)
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .where(taskWhere)
          .orderBy(desc(tasks.createdAt), desc(tasks.id))
          .limit(perTypeLimit),
        db
          .select({ count: sql<number>`count(*)` })
          .from(tasks)
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .where(taskCondition),
      ]);

      for (const t of matchedTasks) {
        results.push({
          id: t.id,
          type: "task",
          title: t.title,
          snippet: t.description?.substring(0, 100) || "",
        });
      }

      const artifactCondition = and(
        eq(projects.orgId, orgId),
        notDeleted(artifacts),
        or(
          likeEscaped(artifacts.name, searchPattern),
          likeEscaped(artifacts.content, searchPattern)
        )
      );
      const artifactCursorWhere = buildCursorPaginationWhere(decodeCursor(artifactCursor), artifacts.createdAt as any, artifacts.id as any, "createdAt", "desc");
      const artifactWhere = artifactCursorWhere ? and(artifactCondition, artifactCursorWhere) : artifactCondition;

      // Search artifacts, scoped to this org via their folder -> project
      const [matchedArtifacts, [artifactCountRow]] = await Promise.all([
        db
          .select({ id: artifacts.id, name: artifacts.name, content: artifacts.content, createdAt: artifacts.createdAt })
          .from(artifacts)
          .innerJoin(folders, eq(folders.id, artifacts.folderId))
          .innerJoin(projects, eq(projects.id, folders.projectId))
          .where(artifactWhere)
          .orderBy(desc(artifacts.createdAt), desc(artifacts.id))
          .limit(perTypeLimit),
        db
          .select({ count: sql<number>`count(*)` })
          .from(artifacts)
          .innerJoin(folders, eq(folders.id, artifacts.folderId))
          .innerJoin(projects, eq(projects.id, folders.projectId))
          .where(artifactCondition),
      ]);

      for (const a of matchedArtifacts) {
        results.push({
          id: a.id,
          type: "artifact",
          title: a.name,
          snippet: a.content?.substring(0, 100) || "",
        });
      }

      const totalCount = Number(taskCountRow?.count ?? 0) + Number(artifactCountRow?.count ?? 0);

      // perTypeLimit is ceil(totalLimit / 2) per entity type, so the merged
      // total can exceed totalLimit by 1 when totalLimit is odd - trim back
      // down to the page size actually promised to the caller. Tasks are
      // always pushed before artifacts, so trimming only ever drops
      // artifacts; cursors must be derived from the last *kept* row of each
      // type, not the last *fetched* one, or a trimmed-off row is skipped
      // over forever (never returned on this page or any later one).
      const keptResults = results.slice(0, totalLimit);
      const keptTaskCount = Math.min(matchedTasks.length, totalLimit);
      const keptArtifactCount = keptResults.length - keptTaskCount;

      const lastKeptTask = matchedTasks[keptTaskCount - 1];
      const moreTasksBeyondFetch = matchedTasks.length === perTypeLimit;
      const nextTaskCursor = lastKeptTask && (keptTaskCount < matchedTasks.length || moreTasksBeyondFetch)
        ? encodeCursor(lastKeptTask.createdAt instanceof Date ? lastKeptTask.createdAt.getTime() : lastKeptTask.createdAt, lastKeptTask.id, "createdAt")
        : undefined;

      const lastKeptArtifact = matchedArtifacts[keptArtifactCount - 1];
      const moreArtifactsBeyondFetch = matchedArtifacts.length === perTypeLimit;
      const nextArtifactCursor = lastKeptArtifact && (keptArtifactCount < matchedArtifacts.length || moreArtifactsBeyondFetch)
        ? encodeCursor(lastKeptArtifact.createdAt instanceof Date ? lastKeptArtifact.createdAt.getTime() : lastKeptArtifact.createdAt, lastKeptArtifact.id, "createdAt")
        : undefined;

      return {
        results: keptResults,
        page: { totalCount, nextCursor: encodeSearchCursor(nextTaskCursor, nextArtifactCursor) },
      };
    },
  });
};
