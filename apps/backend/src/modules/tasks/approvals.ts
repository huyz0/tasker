/**
 * Approval gates (M39, ADR-0032): an agent's move across a transition flagged
 * `requires_approval` is held here until a person approves - the move is
 * then applied as the approver - or rejects it.
 */
import { z } from "zod/v4";
import { and, eq, inArray } from "drizzle-orm";
import { ConnectError, Code } from "@connectrpc/connect";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { executePaginatedQuery } from "../../db/query-builder";
import { requirePrincipal, requireUser, getTaskOrgId, authorizePrincipal } from "../../lib/authz";
import { assertCan } from "../../lib/policy";
import { publishDomainEvent } from "../../lib/natsCorrelation";
import { resolveTaskAlertRecipients } from "../../lib/resolveTaskAlertRecipients";
import { writeNotifications, type ApprovalRequestedPayload } from "../../lib/notificationRegistry";
import { logger } from "../../lib/logger";
import type { Principal } from "../auth/session";

const DecideSchema = z.object({
  id: z.string().min(1, "id is required"),
  approve: z.boolean({ message: "approve is required" }),
  reason: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(2000).optional()),
});
const IdSchema = z.object({ id: z.string().min(1, "id is required") });
const STATUSES = ["pending", "approved", "rejected", "stale", "all"] as const;
const ListSchema = z.object({
  orgId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  taskId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  status: z.preprocess((v) => (v === "" ? undefined : v), z.enum(STATUSES).optional().default("pending")),
  page: z.any().optional(),
});

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? String(d) : undefined);

/** True when the type's edge from `from` to `to` (by status name) requires approval. */
export async function isGatedTransition(db: any, isStandalone: boolean, taskTypeId: string, from: string, to: string): Promise<boolean> {
  const S = isStandalone ? schemaSqlite : schemaMysql;
  const statuses = S.taskStatuses as any;
  const edges = S.taskStatusTransitions as any;
  const rows = await db.select({ id: statuses.id, name: statuses.name }).from(statuses)
    .where(and(eq(statuses.taskTypeId, taskTypeId), inArray(statuses.name, [from, to])));
  const fromId = rows.find((r: any) => r.name === from)?.id;
  const toId = rows.find((r: any) => r.name === to)?.id;
  if (!fromId || !toId) return false;
  const [edge] = await db.select({ gated: edges.requiresApproval }).from(edges)
    .where(and(eq(edges.taskTypeId, taskTypeId), eq(edges.fromStatusId, fromId), eq(edges.toStatusId, toId))).limit(1);
  return Boolean(edge?.gated);
}

type ApplyStatusChange = (currentTask: any, newStatus: string, principal: Principal) => Promise<any>;

export function createApprovalHandlers(db: any, nc: any, isStandalone: boolean, applyStatusChange: ApplyStatusChange) {
  const S = isStandalone ? schemaSqlite : schemaMysql;
  const approvals = S.transitionApprovals as any;
  const tasks = S.tasks as any;

  async function toWire(rows: any[]) {
    if (rows.length === 0) return [];
    const taskIds = [...new Set(rows.map((r) => r.taskId))];
    const agentIds = [...new Set(rows.map((r) => r.requestedByAgentId))];
    const userIds = [...new Set(rows.map((r) => r.decidedByUserId).filter(Boolean))] as string[];
    const [taskRows, agentRows, userRows] = await Promise.all([
      db.select({ id: tasks.id, displayId: tasks.displayId, title: tasks.title }).from(tasks).where(inArray(tasks.id, taskIds)),
      db.select({ id: (S.agents as any).id, name: (S.agents as any).name }).from(S.agents).where(inArray((S.agents as any).id, agentIds)),
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
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      status: r.status,
      requestedByAgentId: r.requestedByAgentId,
      requestedByName: agentName.get(r.requestedByAgentId) ?? r.requestedByAgentId,
      ...(r.decidedByUserId ? { decidedByUserId: r.decidedByUserId, decidedByName: userName.get(r.decidedByUserId) ?? r.decidedByUserId } : {}),
      ...(r.reason ? { reason: r.reason } : {}),
      createdAt: iso(r.createdAt),
      ...(r.decidedAt ? { decidedAt: iso(r.decidedAt) } : {}),
    }));
  }

  async function load(id: string) {
    const [row] = await db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
    if (!row) throw new ConnectError("approval not found", Code.NotFound);
    return row;
  }

  async function closeIfPending(id: string, values: Record<string, unknown>): Promise<boolean> {
    const res = await db.update(approvals).set(values).where(and(eq(approvals.id, id), eq(approvals.status, "pending")));
    return Boolean(isStandalone ? res.changes : res[0]?.affectedRows);
  }

  return {
    /**
     * Records an agent's gated move, or returns the one already pending for
     * the same task and move - an agent retrying must not stack requests.
     */
    async requestApproval(task: any, orgId: string, toStatus: string, agentId: string) {
      const [existing] = await db.select().from(approvals).where(and(
        eq(approvals.taskId, task.id), eq(approvals.status, "pending"),
        eq(approvals.fromStatus, task.status), eq(approvals.toStatus, toStatus),
      )).limit(1);
      if (existing) return (await toWire([existing]))[0];

      const row = {
        id: `apr-${crypto.randomUUID()}`, taskId: task.id, orgId, projectId: task.projectId,
        fromStatus: task.status, toStatus, status: "pending", requestedByAgentId: agentId, createdAt: new Date(),
      };
      await db.insert(approvals).values(row);
      publishDomainEvent(nc, "domain.task.approval_requested", {
        approvalId: row.id, taskId: task.id, fromStatus: row.fromStatus, toStatus, requestedByAgentId: agentId,
      });
      const [wire] = await toWire([row]);
      try {
        const recipients = await resolveTaskAlertRecipients(db, isStandalone, { taskId: task.id, orgId });
        const payload: ApprovalRequestedPayload = {
          orgId, projectId: task.projectId, taskId: task.id, approvalId: row.id, taskDisplayId: task.displayId,
          fromStatus: row.fromStatus, toStatus, requestedByName: wire!.requestedByName,
        };
        await writeNotifications(db, isStandalone, "task.approval_requested", payload, recipients);
      } catch (err) {
        logger.error({ err, approvalId: row.id }, "approval.notify_failed");
      }
      return wire;
    },

    /** People only. Approving applies the move as the approver; a task that moved meanwhile makes it stale. */
    async decideTransitionApproval(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = DecideSchema.parse(req);
      const row = await load(parsed.id);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: row.orgId }, "task:write");
      if (row.status !== "pending") throw new ConnectError(`this approval is already ${row.status}`, Code.FailedPrecondition);
      const decided = { decidedByUserId: userId, decidedAt: new Date(), reason: parsed.reason ?? null };

      if (!parsed.approve) {
        if (!(await closeIfPending(row.id, { ...decided, status: "rejected" }))) {
          throw new ConnectError(`this approval is already ${(await load(row.id)).status}`, Code.FailedPrecondition);
        }
      } else {
        // Claim the decision first, so two approvers cannot both apply it.
        if (!(await closeIfPending(row.id, { ...decided, status: "approved" }))) {
          throw new ConnectError(`this approval is already ${(await load(row.id)).status}`, Code.FailedPrecondition);
        }
        const [task] = await db.select().from(tasks).where(eq(tasks.id, row.taskId)).limit(1);
        try {
          if (!task || task.status !== row.fromStatus) throw new ConnectError("stale", Code.Aborted);
          await applyStatusChange(task, row.toStatus, { kind: "user", userId } as Principal);
        } catch (e) {
          if (!(e instanceof ConnectError) || e.code !== Code.Aborted) throw e;
          await db.update(approvals).set({ status: "stale" }).where(eq(approvals.id, row.id));
          throw new ConnectError(`the task has moved since this was asked (it is now "${task?.status ?? "gone"}") - the request is closed as stale`, Code.FailedPrecondition);
        }
      }
      publishDomainEvent(nc, "domain.task.approval_decided", {
        approvalId: row.id, taskId: row.taskId, approved: parsed.approve, fromStatus: row.fromStatus, toStatus: row.toStatus,
        reason: parsed.reason ?? null, decidedByUserId: userId, requestedByAgentId: row.requestedByAgentId,
      });
      return { approval: (await toWire([await load(row.id)]))[0] };
    },

    async getTransitionApproval(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = IdSchema.parse(req);
      const row = await load(parsed.id);
      await authorizePrincipal(db, principal, row.orgId, { scope: "tasks:read", permission: "task:read" });
      return { approval: (await toWire([row]))[0] };
    },

    async listTransitionApprovals(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = ListSchema.parse(req);
      const orgId = parsed.taskId ? await getTaskOrgId(db, parsed.taskId)
        : parsed.orgId ?? (principal.kind === "agent" ? principal.orgId : undefined);
      if (!orgId) throw new ConnectError("orgId or taskId is required", Code.InvalidArgument);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:read", permission: "task:read" });
      const scope = and(
        eq(approvals.orgId, orgId),
        parsed.taskId ? eq(approvals.taskId, parsed.taskId) : undefined,
        parsed.status === "all" ? undefined : eq(approvals.status, parsed.status),
      );
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, approvals, scope, parsed.page, {
        sortableColumns: { createdAt: approvals.createdAt },
        select: {
          id: approvals.id, taskId: approvals.taskId, projectId: approvals.projectId, fromStatus: approvals.fromStatus,
          toStatus: approvals.toStatus, status: approvals.status, requestedByAgentId: approvals.requestedByAgentId,
          decidedByUserId: approvals.decidedByUserId, reason: approvals.reason, createdAt: approvals.createdAt, decidedAt: approvals.decidedAt,
        },
        extraCacheKey: [orgId, parsed.taskId ?? "", parsed.status].join("|"),
      });
      return { approvals: await toWire(items), page: { nextCursor, totalCount } };
    },
  };
}
