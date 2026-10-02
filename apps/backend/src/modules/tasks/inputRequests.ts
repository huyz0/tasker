/**
 * Input requests (M38-T03, ADR-0031): an agent asks a question on a task, the
 * right people are told, and a person answers. The answer reaches the asker
 * through the event feed, a webhook (`task.input_answered`) or GetInputRequest.
 */
import { z } from "zod/v4";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ConnectError, Code } from "@connectrpc/connect";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { executePaginatedQuery } from "../../db/query-builder";
import { requirePrincipal, requireUser, getTaskOrgId, authorizePrincipal } from "../../lib/authz";
import { assertCan, can } from "../../lib/policy";
import { publishDomainEvent } from "../../lib/natsCorrelation";
import { resolveTaskAlertRecipients } from "../../lib/resolveTaskAlertRecipients";
import { writeNotifications, type InputRequestedPayload } from "../../lib/notificationRegistry";
import { logger } from "../../lib/logger";

const RequestSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  question: z.string().trim().min(1, "question is required").max(4000),
  options: z.array(z.string().trim().min(1).max(200)).max(10, "at most 10 options").optional().default([]),
});
const AnswerSchema = z.object({
  id: z.string().min(1, "id is required"),
  answer: z.string().trim().min(1, "answer is required").max(4000),
});
const IdSchema = z.object({ id: z.string().min(1, "id is required") });
const STATUSES = ["open", "answered", "cancelled", "all"] as const;
const ListSchema = z.object({
  orgId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  taskId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  status: z.preprocess((v) => (v === "" ? undefined : v), z.enum(STATUSES).optional().default("open")),
  page: z.any().optional(),
});

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? String(d) : undefined);

export function createInputRequestHandlers(db: any, nc: any, isStandalone: boolean) {
  const S = isStandalone ? schemaSqlite : schemaMysql;
  const requests = S.inputRequests as any;
  const tasks = S.tasks as any;

  /** Rows -> wire, with task labels and asker/answerer names in a fixed number of queries. */
  async function toWire(rows: any[]) {
    if (rows.length === 0) return [];
    const taskIds = [...new Set(rows.map((r) => r.taskId))];
    const agentIds = [...new Set(rows.map((r) => r.askedByAgentId).filter(Boolean))] as string[];
    const userIds = [...new Set(rows.flatMap((r) => [r.askedByUserId, r.answeredByUserId]).filter(Boolean))] as string[];
    const [taskRows, agentRows, userRows] = await Promise.all([
      db.select({ id: tasks.id, displayId: tasks.displayId, title: tasks.title }).from(tasks).where(inArray(tasks.id, taskIds)),
      agentIds.length ? db.select({ id: (S.agents as any).id, name: (S.agents as any).name }).from(S.agents).where(inArray((S.agents as any).id, agentIds)) : [],
      userIds.length ? db.select({ id: (S.users as any).id, name: (S.users as any).name, email: (S.users as any).email }).from(S.users).where(inArray((S.users as any).id, userIds)) : [],
    ]);
    const taskById = new Map<string, any>(taskRows.map((t: any) => [t.id, t]));
    const agentName = new Map<string, string>(agentRows.map((a: any) => [a.id, a.name]));
    const userName = new Map<string, string>(userRows.map((u: any) => [u.id, u.name || u.email || u.id]));
    return rows.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      taskDisplayId: taskById.get(r.taskId)?.displayId ?? "",
      taskTitle: taskById.get(r.taskId)?.title ?? "",
      projectId: r.projectId,
      question: r.question,
      options: JSON.parse(r.options ?? "[]"),
      status: r.status,
      ...(r.askedByAgentId ? { askedByAgentId: r.askedByAgentId } : {}),
      ...(r.askedByUserId ? { askedByUserId: r.askedByUserId } : {}),
      askedByName: r.askedByAgentId ? (agentName.get(r.askedByAgentId) ?? r.askedByAgentId) : (userName.get(r.askedByUserId) ?? r.askedByUserId ?? ""),
      ...(r.answer != null ? { answer: r.answer } : {}),
      ...(r.answeredByUserId ? { answeredByUserId: r.answeredByUserId, answeredByName: userName.get(r.answeredByUserId) ?? r.answeredByUserId } : {}),
      createdAt: iso(r.createdAt),
      ...(r.answeredAt ? { answeredAt: iso(r.answeredAt) } : {}),
    }));
  }

  async function load(id: string) {
    const [row] = await db.select().from(requests).where(eq(requests.id, id)).limit(1);
    if (!row) throw new ConnectError("input request not found", Code.NotFound);
    return row;
  }

  /** Moves an open request to `status`; false when it was no longer open (someone else got there first). */
  async function closeIfOpen(id: string, values: Record<string, unknown>): Promise<boolean> {
    const res = await db.update(requests).set(values).where(and(eq(requests.id, id), eq(requests.status, "open")));
    return Boolean(isStandalone ? res.changes : res[0]?.affectedRows);
  }

  return {
    async requestInput(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = RequestSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:write", permission: "task:write" });
      const [task] = await db.select({ projectId: tasks.projectId, displayId: tasks.displayId, title: tasks.title }).from(tasks).where(eq(tasks.id, parsed.taskId)).limit(1);
      const row = {
        id: `ir-${crypto.randomUUID()}`,
        taskId: parsed.taskId,
        orgId,
        projectId: task.projectId,
        question: parsed.question,
        options: JSON.stringify(parsed.options),
        status: "open",
        askedByAgentId: principal.kind === "agent" ? principal.agentId : null,
        askedByUserId: principal.kind === "user" ? principal.userId : null,
        createdAt: new Date(),
      };
      await db.insert(requests).values(row);
      publishDomainEvent(nc, "domain.task.input_requested", {
        inputRequestId: row.id, taskId: row.taskId, question: row.question, options: parsed.options,
        askedByAgentId: row.askedByAgentId, askedByUserId: row.askedByUserId,
      });
      const [wire] = await toWire([row]);
      // Best-effort, like every notification: a failed write must not undo
      // the question, which the asker already has an id for.
      try {
        const recipients = (await resolveTaskAlertRecipients(db, isStandalone, { taskId: row.taskId, orgId }))
          .filter((r) => r.userId !== row.askedByUserId);
        const payload: InputRequestedPayload = {
          orgId, projectId: row.projectId, taskId: row.taskId, inputRequestId: row.id,
          taskDisplayId: task.displayId, question: row.question, askedByName: wire!.askedByName,
        };
        await writeNotifications(db, isStandalone, "task.input_requested", payload, recipients);
      } catch (err) {
        logger.error({ err, inputRequestId: row.id }, "input_request.notify_failed");
      }
      return { inputRequest: wire };
    },

    /** People only (ADR-0031): an agent answering would approve its own decision. */
    async answerInputRequest(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = AnswerSchema.parse(req);
      const row = await load(parsed.id);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: row.orgId }, "task:write");
      if (!(await closeIfOpen(row.id, { status: "answered", answer: parsed.answer, answeredByUserId: userId, answeredAt: new Date() }))) {
        throw new ConnectError(`this question is already ${(await load(row.id)).status}`, Code.FailedPrecondition);
      }
      publishDomainEvent(nc, "domain.task.input_answered", {
        inputRequestId: row.id, taskId: row.taskId, answer: parsed.answer, answeredByUserId: userId,
        askedByAgentId: row.askedByAgentId, askedByUserId: row.askedByUserId,
      });
      return { inputRequest: (await toWire([await load(row.id)]))[0] };
    },

    /** The asker withdraws its question, or an admin closes it. */
    async cancelInputRequest(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = IdSchema.parse(req);
      const row = await load(parsed.id);
      await authorizePrincipal(db, principal, row.orgId, { scope: "tasks:write", permission: "task:write" });
      const isAsker = principal.kind === "agent" ? row.askedByAgentId === principal.agentId : row.askedByUserId === principal.userId;
      const isAdmin = principal.kind === "user" && await can(db, { kind: "user", userId: principal.userId }, { type: "organization", id: row.orgId }, "org:admin");
      if (!isAsker && !isAdmin) throw new ConnectError("only the asker or an organization admin can cancel this question", Code.PermissionDenied);
      if (!(await closeIfOpen(row.id, { status: "cancelled" }))) {
        throw new ConnectError(`this question is already ${(await load(row.id)).status}`, Code.FailedPrecondition);
      }
      publishDomainEvent(nc, "domain.task.input_cancelled", { inputRequestId: row.id, taskId: row.taskId });
      return { inputRequest: (await toWire([await load(row.id)]))[0] };
    },

    async getInputRequest(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = IdSchema.parse(req);
      const row = await load(parsed.id);
      await authorizePrincipal(db, principal, row.orgId, { scope: "tasks:read", permission: "task:read" });
      return { inputRequest: (await toWire([row]))[0] };
    },

    /** One task's questions, or the organization's queue of agents waiting on people. */
    async listInputRequests(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = ListSchema.parse(req);
      const orgId = parsed.taskId ? await getTaskOrgId(db, parsed.taskId)
        : parsed.orgId ?? (principal.kind === "agent" ? principal.orgId : undefined);
      if (!orgId) throw new ConnectError("orgId or taskId is required", Code.InvalidArgument);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:read", permission: "task:read" });
      const scope = and(
        eq(requests.orgId, orgId),
        parsed.taskId ? eq(requests.taskId, parsed.taskId) : undefined,
        parsed.status === "all" ? undefined : eq(requests.status, parsed.status),
      );
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, requests, scope, parsed.page, {
        sortableColumns: { createdAt: requests.createdAt },
        select: {
          id: requests.id, taskId: requests.taskId, projectId: requests.projectId, question: requests.question, options: requests.options,
          status: requests.status, askedByAgentId: requests.askedByAgentId, askedByUserId: requests.askedByUserId, answer: requests.answer,
          answeredByUserId: requests.answeredByUserId, createdAt: requests.createdAt, answeredAt: requests.answeredAt,
        },
        extraCacheKey: [orgId, parsed.taskId ?? "", parsed.status].join("|"),
      });
      return { inputRequests: await toWire(items), page: { nextCursor, totalCount } };
    },
  };
}

/** Open questions per task, for a page of tasks, in one grouped query. */
export async function openInputRequestCounts(db: any, isStandalone: boolean, taskIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (taskIds.length === 0) return out;
  const requests = (isStandalone ? schemaSqlite.inputRequests : schemaMysql.inputRequests) as any;
  const rows = await db.select({ taskId: requests.taskId, n: sql`count(*)` }).from(requests)
    .where(and(inArray(requests.taskId, taskIds), eq(requests.status, "open"))).groupBy(requests.taskId);
  for (const r of rows) out.set(r.taskId, Number(r.n));
  return out;
}

