/**
 * Task summaries and digests (M41, ADR-0034). An agent writes what a task came
 * to; anyone reading it later gets one bounded document assembled from the
 * live tables - never stored, so never stale, and nothing is deleted.
 */
import { z } from "zod/v4";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ConnectError, Code } from "@connectrpc/connect";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { requirePrincipal, getTaskOrgId, getProjectOrgId, authorizePrincipal } from "../../lib/authz";
import { publishDomainEvent } from "../../lib/natsCorrelation";
import { listLinks } from "./taskGraph";
import { terminalStatusSql } from "./taskActivity";

const SUMMARY_MAX = 4000;
/** Digest caps (ADR-0034). */
const ANSWERED_QUESTIONS_CAP = 20;
const RELATIONS_CAP = 50;

const SetSummarySchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  text: z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(SUMMARY_MAX, `text is at most ${SUMMARY_MAX} characters`)),
});
const DigestSchema = z.object({ taskId: z.string().min(1, "taskId is required") });
const CandidatesSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  olderThanDays: z.preprocess((v) => (v == null ? 30 : v), z.number().int().min(0, "olderThanDays must be from 0 to 3650").max(3650, "olderThanDays must be from 0 to 3650")),
  limit: z.preprocess((v) => (v == null || v === 0 ? 50 : v), z.number().int().min(1, "limit must be from 1 to 100").max(100, "limit must be from 1 to 100")),
});

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? String(d) : undefined);
/** A raw timestamp from a hand-written SQL aggregate: sqlite seconds, or a MySQL Date/string. */
const rawTime = (v: unknown, isStandalone: boolean): Date | undefined =>
  v == null ? undefined : isStandalone ? new Date(Number(v) * 1000) : new Date(v as any);

/** The wire TaskSummary for a full `tasks` row, or undefined when it has none. */
export async function taskSummaryToWire(db: any, isStandalone: boolean, row: any) {
  if (!row?.summary) return undefined;
  const S = isStandalone ? schemaSqlite : schemaMysql;
  let authorName = "";
  if (row.summaryAgentId) {
    const [a] = await db.select({ name: (S.agents as any).name }).from(S.agents).where(eq((S.agents as any).id, row.summaryAgentId)).limit(1);
    authorName = a?.name ?? row.summaryAgentId;
  } else if (row.summaryUserId) {
    const [u] = await db.select({ name: (S.users as any).name, email: (S.users as any).email }).from(S.users).where(eq((S.users as any).id, row.summaryUserId)).limit(1);
    authorName = u?.name || u?.email || row.summaryUserId;
  }
  return {
    text: row.summary,
    authorName,
    ...(row.summaryAgentId ? { agentId: row.summaryAgentId } : {}),
    ...(row.summaryUserId ? { userId: row.summaryUserId } : {}),
    updatedAt: iso(row.summaryUpdatedAt) ?? "",
  };
}

type Handler = (req: unknown, ctx: { values: any }) => Promise<any>;

export function createDigestHandlers(db: any, nc: any, isStandalone: boolean, deps: { getTask: Handler; listInputRequests: Handler }) {
  const S = isStandalone ? schemaSqlite : schemaMysql;
  const tasks = S.tasks as any;
  const activity = S.taskActivity as any;

  /** When the task last moved into a terminal status, from the activity log. */
  async function finishedAt(taskId: string): Promise<Date | undefined> {
    const [row] = await db.select({ at: sql<unknown>`max(${activity.occurredAt})` }).from(activity)
      .where(and(eq(activity.taskId, taskId), eq(activity.kind, "status_changed"), eq(activity.toIsTerminal, true)));
    return rawTime(row?.at, isStandalone);
  }

  return {
    async setTaskSummary(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = SetSummarySchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:write", permission: "task:write" });
      const cleared = parsed.text === "";
      const values_ = cleared
        ? { summary: null, summaryUpdatedAt: null, summaryAgentId: null, summaryUserId: null }
        : {
          summary: parsed.text,
          summaryUpdatedAt: new Date(),
          summaryAgentId: principal.kind === "agent" ? principal.agentId : null,
          summaryUserId: principal.kind === "user" ? principal.userId : null,
        };
      await db.update(tasks).set(values_).where(eq(tasks.id, parsed.taskId));
      publishDomainEvent(nc, "domain.task.summary_updated", { taskId: parsed.taskId, cleared, length: parsed.text.length });
      const summary = await taskSummaryToWire(db, isStandalone, values_);
      return summary ? { summary } : {};
    },

    /**
     * Fixed cost whatever the task's size: GetTask's own reads, one page of
     * answered questions, the capped relation lists and one activity lookup.
     */
    async getTaskDigest(req: unknown, ctx: { values: any }) {
      requirePrincipal(ctx.values);
      const parsed = DigestSchema.parse(req);
      const got = await deps.getTask({ taskId: parsed.taskId }, ctx);
      const [questions, links, finished] = await Promise.all([
        deps.listInputRequests({ taskId: parsed.taskId, status: "answered", page: { limit: ANSWERED_QUESTIONS_CAP } }, ctx),
        listLinks(db, isStandalone, parsed.taskId, RELATIONS_CAP + 1),
        finishedAt(parsed.taskId),
      ]);
      let truncated = (questions.page?.totalCount ?? 0) > ANSWERED_QUESTIONS_CAP;
      const capped = (list: any[]) => {
        if (list.length > RELATIONS_CAP) truncated = true;
        return list.slice(0, RELATIONS_CAP);
      };
      const relations = {
        ...links,
        blockedBy: capped(links.blockedBy),
        blocks: capped(links.blocks),
        discovered: capped(links.discovered),
        children: capped(links.children),
      };
      return {
        digest: {
          task: got.task,
          ...(got.latestHandoffNote ? { latestHandoffNote: got.latestHandoffNote } : {}),
          answeredQuestions: questions.inputRequests,
          relations,
          ...(finished ? { finishedAt: finished.toISOString() } : {}),
          truncated,
        },
      };
    },

    /** A project's finished, unsummarized tasks, oldest first - a maintenance agent's work list. */
    async listCompactionCandidates(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = CandidatesSchema.parse(req);
      const orgId = await getProjectOrgId(db, parsed.projectId);
      if (!orgId) throw new ConnectError("project not found", Code.NotFound);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:read", permission: "task:read" });

      const cutoff = new Date(Date.now() - parsed.olderThanDays * 86_400_000);
      const cutoffParam = isStandalone ? Math.floor(cutoff.getTime() / 1000) : cutoff;
      // When it finished: the last move into a terminal status, else (no
      // activity recorded, e.g. created done) when it was created.
      // Nested on purpose: drizzle qualifies columns inside a nested fragment
      // but not at the top of a select list, where "task_id" = "id" would
      // resolve both sides to task_activity.
      const lastTerminalMove = sql`(
        SELECT max(${activity.occurredAt}) FROM ${activity}
        WHERE ${activity.taskId} = ${tasks.id} AND ${activity.kind} = 'status_changed' AND ${activity.toIsTerminal} = ${isStandalone ? 1 : true}
      )`;
      const finished = sql<unknown>`coalesce(${lastTerminalMove}, ${tasks.createdAt})`;
      const scope = and(
        eq(tasks.projectId, parsed.projectId),
        isNull(tasks.deletedAt),
        isNull(tasks.summary),
        terminalStatusSql(tasks, isStandalone),
        sql`${finished} < ${cutoffParam}`,
      );
      const [rows, [count]] = await Promise.all([
        db.select({ id: tasks.id, displayId: tasks.displayId, title: tasks.title, status: tasks.status, finishedAt: finished })
          .from(tasks).where(scope).orderBy(sql`${finished}`, tasks.id).limit(parsed.limit),
        db.select({ n: sql<number>`count(*)` }).from(tasks).where(scope),
      ]);
      return {
        candidates: rows.map((r: any) => ({
          taskId: r.id, displayId: r.displayId, title: r.title, status: r.status,
          finishedAt: rawTime(r.finishedAt, isStandalone)?.toISOString() ?? "",
        })),
        totalCount: Number(count?.n ?? 0),
      };
    },
  };
}

// Exported for tests that pin the caps.
export const DIGEST_CAPS = { answeredQuestions: ANSWERED_QUESTIONS_CAP, relations: RELATIONS_CAP, summary: SUMMARY_MAX };
