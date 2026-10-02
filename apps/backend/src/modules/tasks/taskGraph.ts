/**
 * The task graph (M35, ADR-0028): priority ordering, blocking links, parents
 * and discovered-from origins.
 *
 * Kept out of `tasks.handler.ts` so the rules - what makes a task ready, which
 * links are legal - are each written once and shared by ClaimNextTask,
 * ListTasks, CreateTask, UpdateTask and the link RPCs.
 */
import { sql } from "drizzle-orm";

/** 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
export const MAX_PRIORITY = 4;

/** Most-important-first rank: urgent (1) .. low (4), then none (0) as 5. */
export function priorityRankSql(tasks: any) {
  return sql<number>`(CASE WHEN ${tasks.priority} = 0 THEN 5 ELSE ${tasks.priority} END)`;
}
