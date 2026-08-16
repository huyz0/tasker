import type { ConnectRouter } from "@connectrpc/connect";
import { ConnectError, Code } from "@connectrpc/connect";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { DashboardService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import * as schema from "../../db/schema.sqlite";
import { requireUser } from "../../lib/authz";
import { assertCan } from "../../lib/policy";
import { notDeleted } from "../../db/query-builder";

/**
 * The home screen's data, in one call.
 *
 * Every panel here answers a question a supervisor of agent work actually has.
 * The screen it replaces showed four entity counts and the database's latency,
 * which answer none.
 *
 * `requireUser`, not `requirePrincipal`: this is a human's supervision console.
 * An agent has no use for "what is waiting on your review", and refusing them
 * outright is also what keeps this method out of the agent scope map — absence
 * there means denial, and the sweep checks that every method is one or the
 * other.
 */

/** Short on purpose. A place to notice something, not to work through it. */
const PANEL_LIMIT = 8;

/** Enough of a note to recognise it; the task is one click away. */
const EXCERPT_LENGTH = 140;

const iso = (v: unknown): string | undefined =>
  v instanceof Date ? v.toISOString() : (v as string | undefined) ?? undefined;

export default (router: ConnectRouter, db: any) => {
  router.service(DashboardService as any, {
    async getDashboard(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      if (!req?.orgId) throw new ConnectError("orgId is required", Code.InvalidArgument);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: req.orgId }, "dashboard:read");

      const { tasks, projects, taskReviewers, taskAssignments, remotePullRequests, agents, taskNotes, comments, apiTokens } = schema;

      // Every panel is scoped through `projects.orgId`. A task does not carry
      // an org of its own, so the join is what keeps one organization's home
      // screen from showing another's work.
      const inOrg = req.projectId
        ? and(eq(projects.orgId, req.orgId), eq(projects.id, req.projectId))
        : eq(projects.orgId, req.orgId);

      const taskColumns = {
        id: tasks.id,
        displayId: tasks.displayId,
        title: tasks.title,
        status: tasks.status,
        projectId: tasks.projectId,
      };

      // ── Waiting on you ────────────────────────────────────────────────────
      // Reviews have no outcome of their own, so "not done" is the drain
      // condition. It gives a queue that empties, at the cost of not
      // distinguishing "approved" from "not looked at" — the follow-up is an
      // outcome column on `task_reviewers`.
      const reviewWhere = and(inOrg, notDeleted(tasks), ne(tasks.status, "done"), eq(taskReviewers.userId, userId));
      const reviewQuery = db
        .select(taskColumns)
        .from(taskReviewers)
        .innerJoin(tasks, eq(tasks.id, taskReviewers.taskId))
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .where(reviewWhere);

      // ── Claimed done, pull request still open ─────────────────────────────
      // The one place the product can catch agent work that looks finished and
      // is not. Both tables already exist and are already linked by taskId;
      // nothing was comparing them.
      const disagreementWhere = and(
        inOrg,
        notDeleted(tasks),
        eq(tasks.status, "done"),
        inArray(remotePullRequests.status, ["open", "draft"]),
      );
      const disagreementQuery = db
        .select({
          ...taskColumns,
          pullRequestId: remotePullRequests.remotePrId,
          pullRequestTitle: remotePullRequests.title,
          pullRequestStatus: remotePullRequests.status,
          pullRequestUrl: remotePullRequests.url,
        })
        .from(remotePullRequests)
        .innerJoin(tasks, eq(tasks.id, remotePullRequests.taskId))
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .where(disagreementWhere);

      const [awaitingReview, awaitingReviewCount, disagreements, disagreementCount, agentRows, noteRows, commentRows] =
        await Promise.all([
          reviewQuery.orderBy(desc(tasks.createdAt), desc(tasks.id)).limit(PANEL_LIMIT),
          db
            .select({ count: sql<number>`count(*)` })
            .from(taskReviewers)
            .innerJoin(tasks, eq(tasks.id, taskReviewers.taskId))
            .innerJoin(projects, eq(projects.id, tasks.projectId))
            .where(reviewWhere)
            .then((r: any[]) => Number(r[0]?.count ?? 0)),
          disagreementQuery.orderBy(desc(tasks.createdAt), desc(tasks.id)).limit(PANEL_LIMIT),
          db
            .select({ count: sql<number>`count(*)` })
            .from(remotePullRequests)
            .innerJoin(tasks, eq(tasks.id, remotePullRequests.taskId))
            .innerJoin(projects, eq(projects.id, tasks.projectId))
            .where(disagreementWhere)
            .then((r: any[]) => Number(r[0]?.count ?? 0)),

          // ── Agent liveness ────────────────────────────────────────────────
          // `max(lastUsedAt)` across an agent's tokens: an agent may hold
          // several, and the fleet question is when it was last heard from at
          // all. Ordered so the silent ones surface first — nulls last, because
          // an agent that has never called is a deployment that never started,
          // which is a different problem from one that stopped.
          db
            .select({
              id: agents.id,
              name: agents.name,
              lastUsedAt: sql<number | null>`max(${apiTokens.lastUsedAt})`,
            })
            .from(agents)
            .leftJoin(apiTokens, and(eq(apiTokens.agentId, agents.id), isNull(apiTokens.revokedAt)))
            .where(and(eq(agents.orgId, req.orgId), notDeleted(agents)))
            .groupBy(agents.id, agents.name)
            .orderBy(sql`max(${apiTokens.lastUsedAt}) IS NULL`, sql`max(${apiTokens.lastUsedAt}) ASC`)
            .limit(PANEL_LIMIT),

          // ── Recent agent activity ─────────────────────────────────────────
          // Read from what the system already records rather than waiting for
          // an event log. Two sources, merged and re-sorted below: a UNION
          // across differently-shaped tables buys nothing when both sides are
          // already bounded to a single short page.
          db
            .select({
              taskId: tasks.id,
              taskDisplayId: tasks.displayId,
              taskTitle: tasks.title,
              agentId: taskNotes.agentId,
              agentName: agents.name,
              excerpt: taskNotes.content,
              createdAt: taskNotes.createdAt,
            })
            .from(taskNotes)
            .innerJoin(tasks, eq(tasks.id, taskNotes.taskId))
            .innerJoin(projects, eq(projects.id, tasks.projectId))
            .innerJoin(agents, eq(agents.id, taskNotes.agentId))
            .where(and(inOrg, notDeleted(tasks)))
            .orderBy(desc(taskNotes.createdAt))
            .limit(PANEL_LIMIT),
          db
            .select({
              taskId: tasks.id,
              taskDisplayId: tasks.displayId,
              taskTitle: tasks.title,
              agentId: comments.agentId,
              agentName: agents.name,
              excerpt: comments.content,
              createdAt: comments.createdAt,
            })
            .from(comments)
            .innerJoin(tasks, eq(tasks.id, comments.entityId))
            .innerJoin(projects, eq(projects.id, tasks.projectId))
            .innerJoin(agents, eq(agents.id, comments.agentId))
            .where(and(inOrg, notDeleted(tasks), eq(comments.entityType, "task")))
            .orderBy(desc(comments.createdAt))
            .limit(PANEL_LIMIT),
        ]);

      const recentActivity = [
        ...noteRows.map((r: any) => ({ ...r, kind: "note" })),
        ...commentRows.map((r: any) => ({ ...r, kind: "comment" })),
      ]
        .map((r: any) => ({
          taskId: r.taskId,
          taskDisplayId: r.taskDisplayId,
          taskTitle: r.taskTitle,
          agentId: r.agentId,
          agentName: r.agentName,
          kind: r.kind,
          excerpt: String(r.excerpt ?? "").slice(0, EXCERPT_LENGTH),
          createdAt: iso(r.createdAt) ?? "",
          sortKey: r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt ?? 0),
        }))
        .sort((a, b) => b.sortKey - a.sortKey)
        .slice(0, PANEL_LIMIT)
        .map(({ sortKey, ...rest }) => rest);

      return {
        awaitingReview,
        awaitingReviewCount: BigInt(awaitingReviewCount),
        disagreements: disagreements.map((d: any) => ({
          task: { id: d.id, displayId: d.displayId, title: d.title, status: d.status, projectId: d.projectId },
          pullRequestId: String(d.pullRequestId ?? ""),
          pullRequestTitle: d.pullRequestTitle ?? "",
          pullRequestStatus: d.pullRequestStatus ?? "",
          pullRequestUrl: d.pullRequestUrl ?? "",
        })),
        disagreementCount: BigInt(disagreementCount),
        agents: await Promise.all(
          agentRows.map(async (a: any) => ({
            id: a.id,
            name: a.name,
            // `max()` returns the raw column, so drizzle's timestamp decoding is
            // bypassed and the value arrives as the stored integer. That column
            // is `mode: "timestamp"` — **seconds**, not milliseconds — so
            // treating it as ms reported every agent as last seen in 1970.
            lastUsedAt: a.lastUsedAt == null ? undefined : new Date(Number(a.lastUsedAt) * 1000).toISOString(),
            openTaskCount: BigInt(
              await db
                .select({ count: sql<number>`count(*)` })
                .from(taskAssignments)
                .innerJoin(tasks, eq(tasks.id, taskAssignments.taskId))
                .where(and(eq(taskAssignments.agentId, a.id), notDeleted(tasks), ne(tasks.status, "done")))
                .then((r: any[]) => Number(r[0]?.count ?? 0)),
            ),
          })),
        ),
        recentActivity,
      };
    },
  });
};
