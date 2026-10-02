/**
 * Agent usage and cost (M40, ADR-0033): what a principal reports a piece of
 * work on a task cost, in tokens and integer micro-dollars. Append-only, and
 * idempotent by key so a retried report never double-counts spend.
 */
import { z } from "zod/v4";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { ConnectError, Code } from "@connectrpc/connect";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { executePaginatedQuery } from "../../db/query-builder";
import { requirePrincipal, getTaskOrgId, authorizePrincipal } from "../../lib/authz";
import { publishDomainEvent } from "../../lib/natsCorrelation";

/** Per report: a billion tokens, or USD 1,000. Anything larger is a units bug, not a report. */
const MAX_TOKENS_PER_REPORT = 1_000_000_000;
const MAX_COST_MICROS_PER_REPORT = 1_000_000_000;

// int64 fields arrive as bigint from the Connect codec, as numbers or strings
// from JSON callers; all must be whole and in range.
const count = (field: string, max: number) =>
  z.union([z.bigint(), z.number(), z.string()]).optional().transform((v, ctx) => {
    const n = v === undefined || v === "" ? 0 : Number(v);
    if (!Number.isSafeInteger(n) || n < 0 || n > max) {
      ctx.addIssue({ code: "custom", message: `${field} must be a whole number from 0 to ${max}` });
      return z.NEVER;
    }
    return n;
  });

const ReportSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  modelName: z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(100, "modelName is at most 100 characters")),
  inputTokens: count("inputTokens", MAX_TOKENS_PER_REPORT),
  outputTokens: count("outputTokens", MAX_TOKENS_PER_REPORT),
  costMicros: count("costMicros", MAX_COST_MICROS_PER_REPORT),
  idempotencyKey: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(256).optional()),
}).refine((r) => r.inputTokens + r.outputTokens + r.costMicros > 0, { message: "a report must carry tokens or cost" });

const ListSchema = z.object({ taskId: z.string().min(1, "taskId is required"), page: z.any().optional() });

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? String(d) : undefined);

export interface UsageSums {
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  reports: number;
}

/** The SUM columns every usage aggregate selects. */
export function usageSumColumns(isStandalone: boolean) {
  const u = (isStandalone ? schemaSqlite : schemaMysql).usageRecords as any;
  return {
    inputTokens: sql<string>`coalesce(sum(${u.inputTokens}), 0)`,
    outputTokens: sql<string>`coalesce(sum(${u.outputTokens}), 0)`,
    costMicros: sql<string>`coalesce(sum(${u.costMicros}), 0)`,
    reports: sql<string>`count(*)`,
  };
}

/** A SUM row (MySQL returns DECIMAL strings) -> plain numbers. */
export function toSums(row: any): UsageSums {
  return {
    inputTokens: Number(row?.inputTokens ?? 0),
    outputTokens: Number(row?.outputTokens ?? 0),
    costMicros: Number(row?.costMicros ?? 0),
    reports: Number(row?.reports ?? 0),
  };
}

/** UsageTotals on the wire: int64 fields as bigint. */
export function sumsToWire(s: UsageSums) {
  return { inputTokens: BigInt(s.inputTokens), outputTokens: BigInt(s.outputTokens), costMicros: BigInt(s.costMicros), reports: BigInt(s.reports) };
}

async function usageTotals(db: any, isStandalone: boolean, where: SQL | undefined): Promise<UsageSums> {
  const u = (isStandalone ? schemaSqlite : schemaMysql).usageRecords as any;
  const [row] = await db.select(usageSumColumns(isStandalone)).from(u).where(where);
  return toSums(row);
}

/** One task's totals - what GetTask shows. */
export async function taskUsageTotals(db: any, isStandalone: boolean, taskId: string) {
  const u = (isStandalone ? schemaSqlite : schemaMysql).usageRecords as any;
  return sumsToWire(await usageTotals(db, isStandalone, eq(u.taskId, taskId)));
}

function isDuplicateKey(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e);
  return msg.includes("UNIQUE constraint failed") || msg.includes("Duplicate entry");
}

export function createUsageHandlers(db: any, nc: any, isStandalone: boolean) {
  const S = isStandalone ? schemaSqlite : schemaMysql;
  const usage = S.usageRecords as any;
  const tasks = S.tasks as any;

  /** Rows -> wire, with the reporter's name, in at most two extra queries. */
  async function toWire(rows: any[]) {
    if (rows.length === 0) return [];
    const agentIds = [...new Set(rows.map((r) => r.agentId).filter(Boolean))] as string[];
    const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[];
    const [agentRows, userRows] = await Promise.all([
      agentIds.length ? db.select({ id: (S.agents as any).id, name: (S.agents as any).name }).from(S.agents).where(inArray((S.agents as any).id, agentIds)) : [],
      userIds.length ? db.select({ id: (S.users as any).id, name: (S.users as any).name, email: (S.users as any).email }).from(S.users).where(inArray((S.users as any).id, userIds)) : [],
    ]);
    const agentName = new Map<string, string>(agentRows.map((a: any) => [a.id, a.name]));
    const userName = new Map<string, string>(userRows.map((u: any) => [u.id, u.name || u.email || u.id]));
    return rows.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      projectId: r.projectId,
      ...(r.agentId ? { agentId: r.agentId } : {}),
      ...(r.userId ? { userId: r.userId } : {}),
      reportedByName: r.agentId ? (agentName.get(r.agentId) ?? r.agentId) : (userName.get(r.userId) ?? r.userId ?? ""),
      modelName: r.modelName ?? "",
      inputTokens: BigInt(r.inputTokens ?? 0),
      outputTokens: BigInt(r.outputTokens ?? 0),
      costMicros: BigInt(r.costMicros ?? 0),
      createdAt: iso(r.createdAt),
    }));
  }

  async function byKey(taskId: string, key: string) {
    const [row] = await db.select().from(usage).where(and(eq(usage.taskId, taskId), eq(usage.idempotencyKey, key))).limit(1);
    return row;
  }

  return {
    async reportUsage(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = ReportSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:write", permission: "task:write" });

      const replay = async (row: any) => ({
        record: (await toWire([row]))[0],
        totals: await taskUsageTotals(db, isStandalone, parsed.taskId),
        replayed: true,
      });
      if (parsed.idempotencyKey) {
        const existing = await byKey(parsed.taskId, parsed.idempotencyKey);
        if (existing) return replay(existing);
      }

      const [task] = await db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, parsed.taskId)).limit(1);
      const row = {
        id: `use-${crypto.randomUUID()}`,
        taskId: parsed.taskId,
        orgId,
        projectId: task.projectId,
        agentId: principal.kind === "agent" ? principal.agentId : null,
        userId: principal.kind === "user" ? principal.userId : null,
        modelName: parsed.modelName,
        inputTokens: parsed.inputTokens,
        outputTokens: parsed.outputTokens,
        costMicros: parsed.costMicros,
        idempotencyKey: parsed.idempotencyKey ?? null,
        createdAt: new Date(),
      };
      try {
        await db.insert(usage).values(row);
      } catch (e) {
        // Two retries racing on one key: the loser returns the winner's record.
        if (!parsed.idempotencyKey || !isDuplicateKey(e)) throw e;
        const winner = await byKey(parsed.taskId, parsed.idempotencyKey);
        if (!winner) throw e;
        return replay(winner);
      }
      publishDomainEvent(nc, "domain.task.usage_reported", {
        taskId: row.taskId, projectId: row.projectId, agentId: row.agentId, modelName: row.modelName,
        inputTokens: row.inputTokens, outputTokens: row.outputTokens, costMicros: row.costMicros,
      });
      return {
        record: (await toWire([row]))[0],
        totals: await taskUsageTotals(db, isStandalone, parsed.taskId),
        replayed: false,
      };
    },

    async listUsageRecords(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = ListSchema.parse(req);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:read", permission: "task:read" });
      const scope = eq(usage.taskId, parsed.taskId);
      const [{ items, nextCursor, totalCount }, totals] = await Promise.all([
        executePaginatedQuery(db, usage, scope, parsed.page, {
          sortableColumns: { createdAt: usage.createdAt },
          select: {
            id: usage.id, taskId: usage.taskId, projectId: usage.projectId, agentId: usage.agentId, userId: usage.userId,
            modelName: usage.modelName, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
            costMicros: usage.costMicros, createdAt: usage.createdAt,
          },
          extraCacheKey: parsed.taskId,
        }),
        taskUsageTotals(db, isStandalone, parsed.taskId),
      ]);
      return { records: await toWire(items), totals, page: { nextCursor, totalCount } };
    },
  };
}
