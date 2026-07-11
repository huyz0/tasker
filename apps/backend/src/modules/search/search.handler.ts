import { type ConnectRouter } from "@connectrpc/connect";
import { SearchService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { like, or, and, eq } from "drizzle-orm";
import { requireUserId, assertOrgMember } from "../../lib/authz";

export default (router: ConnectRouter, db: any) => {
  const isStandalone = process.env.STANDALONE === "true";
  const schema = isStandalone ? schemaSqlite : schemaMysql;

  router.service(SearchService as any, {
    async universalSearch(request: any, { values: contextValues }: { values: any }) {
      const userId = requireUserId(contextValues);
      const { query, orgId } = request;
      if (!orgId) throw new Error("orgId is required");
      await assertOrgMember(db, userId, orgId);

      const { tasks, artifacts, projects, folders } = schema;
      const results: any[] = [];
      const searchPattern = `%${query}%`;

      // Search tasks, scoped to this org via their project
      const matchedTasks = await db
        .select({ id: tasks.id, title: tasks.title, description: tasks.description })
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .where(
          and(
            eq(projects.orgId, orgId),
            or(
              like(tasks.title, searchPattern),
              like(tasks.description, searchPattern)
            )
          )
        )
        .limit(10);

      for (const t of matchedTasks) {
        results.push({
          id: t.id,
          type: "task",
          title: t.title,
          snippet: t.description?.substring(0, 100) || "",
        });
      }

      // Search artifacts, scoped to this org via their folder -> project
      const matchedArtifacts = await db
        .select({ id: artifacts.id, name: artifacts.name, content: artifacts.content })
        .from(artifacts)
        .innerJoin(folders, eq(folders.id, artifacts.folderId))
        .innerJoin(projects, eq(projects.id, folders.projectId))
        .where(
          and(
            eq(projects.orgId, orgId),
            or(
              like(artifacts.name, searchPattern),
              like(artifacts.content, searchPattern)
            )
          )
        )
        .limit(10);

      for (const a of matchedArtifacts) {
        results.push({
          id: a.id,
          type: "artifact",
          title: a.name,
          snippet: a.content?.substring(0, 100) || "",
        });
      }

      return {
        results,
      };
    },
  });
};
