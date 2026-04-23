import { type ConnectRouter } from "@connectrpc/connect";
import { SearchService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { tasks, artifacts } from "../../db/schema.sqlite";
import { like, or } from "drizzle-orm";

export default (router: ConnectRouter, db: any) => {
  router.service(SearchService as any, {
    async universalSearch(request: any) {
      const { query } = request;
      const results: any[] = [];
      const searchPattern = `%${query}%`;

      // Search tasks
      const matchedTasks = await db
        .select()
        .from(tasks)
        .where(
          or(
            like(tasks.title, searchPattern),
            like(tasks.description, searchPattern)
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

      // Search artifacts
      const matchedArtifacts = await db
        .select()
        .from(artifacts)
        .where(
          or(
            like(artifacts.name, searchPattern),
            like(artifacts.content, searchPattern)
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
