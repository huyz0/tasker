import { type ConnectRouter, ConnectError, Code } from "@connectrpc/connect";
import { SearchService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { like, or, and, eq, desc, sql } from "drizzle-orm";
import { requireUserId, assertOrgMember } from "../../lib/authz";
import { notDeleted } from "../../db/query-builder";

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
      const searchPattern = `%${query}%`;

      // Split the caller's overall limit evenly between the two entity
      // types, so a single result type can't crowd out the other - a real,
      // caller-controlled limit instead of a hardcoded 10 per type.
      const totalLimit = Math.min(Math.max(page?.limit || 20, 1), 100);
      const perTypeLimit = Math.max(Math.ceil(totalLimit / 2), 1);

      const taskCondition = and(
        eq(projects.orgId, orgId),
        notDeleted(tasks),
        or(
          like(tasks.title, searchPattern),
          like(tasks.description, searchPattern)
        )
      );

      // Search tasks, scoped to this org via their project
      const [matchedTasks, [taskCountRow]] = await Promise.all([
        db
          .select({ id: tasks.id, title: tasks.title, description: tasks.description })
          .from(tasks)
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .where(taskCondition)
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
          like(artifacts.name, searchPattern),
          like(artifacts.content, searchPattern)
        )
      );

      // Search artifacts, scoped to this org via their folder -> project
      const [matchedArtifacts, [artifactCountRow]] = await Promise.all([
        db
          .select({ id: artifacts.id, name: artifacts.name, content: artifacts.content })
          .from(artifacts)
          .innerJoin(folders, eq(folders.id, artifacts.folderId))
          .innerJoin(projects, eq(projects.id, folders.projectId))
          .where(artifactCondition)
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

      return {
        results,
        page: { totalCount },
      };
    },
  });
};
