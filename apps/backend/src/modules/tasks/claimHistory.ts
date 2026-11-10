import { Code, ConnectError } from '@connectrpc/connect';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod/v4';
import * as SQ from '../../db/schema.sqlite';
import * as MY from '../../db/schema.mysql';
import { decodeCursor, encodeCursor } from '../../db/query-builder';
import { authorizePrincipal, getTaskOrgId, requirePrincipal } from '../../lib/authz';

export const reportReadFilters = {
  attemptId: z.string().min(1).max(256).optional(),
  uncorrelatedOnly: z.boolean().optional(),
};
type ReportFilter = { attemptId?: string; uncorrelatedOnly?: boolean };

/** A reader needs ordinary source access, not ownership of the report's receipt. */
export async function reportAssociationWhere(db: any, standalone: boolean, taskId: string, orgId: string,
  column: any, filter: ReportFilter) {
  if (filter.attemptId !== undefined && filter.uncorrelatedOnly) {
    throw new ConnectError('choose a claim receipt or uncorrelated reports, not both', Code.InvalidArgument);
  }
  if (filter.attemptId !== undefined) {
    const attempts = (standalone ? SQ : MY).taskClaimAttempts;
    const [receipt] = await db.select({ id: attempts.id }).from(attempts).where(and(
      eq(attempts.id, filter.attemptId), eq(attempts.taskId, taskId), eq(attempts.orgId, orgId),
    )).limit(1);
    if (!receipt) throw new ConnectError('claim receipt not found for this task', Code.NotFound);
    return eq(column, receipt.id);
  }
  return filter.uncorrelatedOnly ? isNull(column) : undefined;
}

export const reportReadScope = (source: string, taskId: string, orgId: string, filter: ReportFilter, noteType?: string) =>
  JSON.stringify([source, taskId, orgId, filter.attemptId ?? '', filter.uncorrelatedOnly === true, noteType ?? '']);

const ListSchema = z.object({
  taskId: z.string().min(1),
  page: z.object({ limit: z.number().int().min(0).optional(), cursor: z.string().max(4096).optional(),
    filter: z.string().optional(), sort: z.string().optional() }).optional(),
});

export function createClaimHistoryHandlers(db: any, standalone: boolean) {
  const attempts = (standalone ? SQ : MY).taskClaimAttempts;
  return {
    async listTaskAttempts(request: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = ListSchema.parse(request);
      const orgId = await getTaskOrgId(db, parsed.taskId);
      await authorizePrincipal(db, principal, orgId, { scope: 'tasks:read', permission: 'task:read' });
      if (parsed.page?.filter || (parsed.page?.sort && parsed.page.sort !== 'claimedAt:desc')) {
        throw new ConnectError('claim history uses fixed claimedAt descending order without a text filter', Code.InvalidArgument);
      }
      const binding = JSON.stringify(['task-claim-attempts', orgId, parsed.taskId, 'claimedAt:desc']);
      const cursor = decodeCursor(parsed.page?.cursor);
      if (parsed.page?.cursor && (!cursor || cursor.binding !== binding || cursor.field !== 'claimedAt' || !cursor.id
        || typeof cursor.value !== 'number' || !Number.isFinite(cursor.value) || Number.isNaN(new Date(cursor.value).getTime()))) {
        throw new ConnectError('claim history cursor does not match this task; refresh history', Code.InvalidArgument);
      }
      const scope = and(eq(attempts.taskId, parsed.taskId), eq(attempts.orgId, orgId));
      const position = cursor ? or(lt(attempts.claimedAt, new Date(cursor.value as number)),
        and(eq(attempts.claimedAt, new Date(cursor.value as number)), lt(attempts.id, cursor.id))) : undefined;
      const limit = Math.min(parsed.page?.limit || 50, 100);
      const [rows, [count]] = await Promise.all([
        db.select({ id: attempts.id, taskId: attempts.taskId, orgId: attempts.orgId,
          ownerKind: attempts.ownerKind, ownerId: attempts.ownerId, ownerName: attempts.ownerName,
          claimedAt: attempts.claimedAt, externalRunId: attempts.externalRunId, releasedAt: attempts.releasedAt,
          releaseReason: attempts.releaseReason, releasedByKind: attempts.releasedByKind, releasedById: attempts.releasedById,
        }).from(attempts).where(and(scope, position)).orderBy(desc(attempts.claimedAt), desc(attempts.id)).limit(limit + 1),
        db.select({ n: sql<number>`count(*)` }).from(attempts).where(scope),
      ]);
      const selected = rows.slice(0, limit), last = selected.at(-1);
      return { attempts: selected.map((row: any) => ({
        id: row.id, taskId: row.taskId, orgId: row.orgId,
        owner: { kind: row.ownerKind, id: row.ownerId, name: row.ownerName }, claimedAt: row.claimedAt.toISOString(),
        ...(row.externalRunId != null ? { externalRunId: row.externalRunId } : {}),
        ...(row.releasedAt != null ? { releasedAt: row.releasedAt.toISOString() } : {}),
        ...(row.releaseReason != null ? { releaseReason: row.releaseReason } : {}),
        ...(row.releasedByKind != null ? { releasedBy: { kind: row.releasedByKind,
          ...(row.releasedById != null ? { id: row.releasedById } : {}) } } : {}),
      })), page: { totalCount: Number(count?.n ?? 0), nextCursor: rows.length > limit
        ? encodeCursor(last.claimedAt.getTime(), last.id, 'claimedAt', undefined, undefined, binding) : '' } };
    },
  };
}
