import { type ConnectRouter, ConnectError, Code } from "@connectrpc/connect";
import { SearchService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { or, and, eq, desc, sql } from "drizzle-orm";
import { requireUserId, assertOrgMember } from "../../lib/authz";
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
      const userId = requireUserId(contextValues);
      const { query, orgId, page } = request;
      if (!orgId) throw new ConnectError("orgId is required", Code.InvalidArgument);
      await assertOrgMember(db, userId, orgId);

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

      const lastTask = matchedTasks[matchedTasks.length - 1];
      const nextTaskCursor = lastTask && matchedTasks.length === perTypeLimit
        ? encodeCursor(lastTask.createdAt instanceof Date ? lastTask.createdAt.getTime() : lastTask.createdAt, lastTask.id, "createdAt")
        : undefined;

      const lastArtifact = matchedArtifacts[matchedArtifacts.length - 1];
      const nextArtifactCursor = lastArtifact && matchedArtifacts.length === perTypeLimit
        ? encodeCursor(lastArtifact.createdAt instanceof Date ? lastArtifact.createdAt.getTime() : lastArtifact.createdAt, lastArtifact.id, "createdAt")
        : undefined;

      // perTypeLimit is ceil(totalLimit / 2) per entity type, so the merged
      // total can exceed totalLimit by 1 when totalLimit is odd - trim back
      // down to the page size actually promised to the caller.
      return {
        results: results.slice(0, totalLimit),
        page: { totalCount, nextCursor: encodeSearchCursor(nextTaskCursor, nextArtifactCursor) },
      };
    },
  });
};
