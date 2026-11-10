import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { Code, ConnectError } from '@connectrpc/connect';
import { z } from 'zod/v4';
import * as sqlite from '../../db/schema.sqlite';
import * as mysql from '../../db/schema.mysql';
import { decodeCursor, encodeCursor } from '../../db/query-builder';
import { requireUser } from '../../lib/authz';
import { assertCan } from '../../lib/policy';
import { setRequestOrg, setRequestProject } from '../../lib/requestContext';
import { decodeSqlTimestamp } from '../../lib/sqlTime';
import { contentPrefixSql, decodeContentPrefix } from '../../lib/textPrefix';
import { terminalStatusSql } from '../tasks/taskActivity';

const PREVIEW = 200, HOUR = 3_600_000;
const Request = z.object({
  orgId: z.string().min(1), projectId: z.string().min(1).optional(),
  kind: z.enum(['question', 'approval', 'review', 'stalled_claim']),
  page: z.object({ limit: z.number().int().min(0).optional(), cursor: z.string().max(4096).optional(),
    filter: z.string().optional(), sort: z.string().optional() }).optional(),
});
type Kind = z.infer<typeof Request>['kind'];
interface SourceRow {
  source_id: string; task_id: string; display_id: string | null; task_title: string; task_status: string;
  project_id: string; project_name: string; source_at: unknown;
  actor_id: string | null; actor_kind: 'agent' | 'user' | null;
  reason_prefix: Uint8Array | null; from_status: string | null; to_status: string | null;
}
const sinceKinds: Record<Kind, string> = { question: 'asked_at', approval: 'requested_at', review: 'task_created_at', stalled_claim: 'silent_since' };
const cursorError = () => new ConnectError('Attention cursor does not match this source and scope. Refresh the source.', Code.InvalidArgument);

/** Human triage reads only. Existing task handlers remain the mutation boundary. */
export function createAttentionHandler(db: any, clock: () => Date = () => new Date()) {
  const standalone = process.env.STANDALONE === 'true', S = standalone ? sqlite : mysql;
  const t = S.tasks, p = S.projects, orgs = S.organizations;
  const readRows = async <T>(query: SQL): Promise<T[]> => standalone ? await db.all(query) : (await db.execute(query))[0];
  const dateValue = (date: Date) => standalone ? date.getTime() / 1000 : date.toISOString().replace('T', ' ').replace('Z', '');

  return {
    async listAttention(request: unknown, { values }: { values: any }) {
      const userId = requireUser(values), req = Request.parse(request);
      await assertCan(db, { kind: 'user', userId }, { type: 'organization', id: req.orgId }, 'task:read');
      const [org] = await db.select({ id: orgs.id }).from(orgs).where(and(eq(orgs.id, req.orgId), isNull(orgs.deletedAt))).limit(1);
      if (!org) throw new ConnectError('Organization is unavailable', Code.NotFound);
      if (req.projectId) {
        const [project] = await db.select({ id: p.id }).from(p).where(and(eq(p.id, req.projectId), eq(p.orgId, req.orgId), isNull(p.deletedAt))).limit(1);
        if (!project) throw new ConnectError('Project is unavailable in this scope', Code.NotFound);
      }
      setRequestOrg(req.orgId); if (req.projectId) setRequestProject(req.projectId);
      if (req.page?.filter || req.page?.sort) throw new ConnectError('Attention pages use fixed oldest-first ordering without filters', Code.InvalidArgument);
      const limit = Math.min(req.page?.limit || 20, 100), observed = clock();
      const binding = JSON.stringify(['attention-v1', userId, req.orgId, req.projectId ?? '', req.kind, 'source_at:asc', 24]);
      const cursor = decodeCursor(req.page?.cursor);
      if (req.page?.cursor && (!cursor || cursor.binding !== binding || cursor.field !== 'source_at'
        || !cursor.id || typeof cursor.value !== 'number' || !Number.isFinite(cursor.value) || Number.isNaN(new Date(cursor.value).getTime()))) throw cursorError();

      const baseConditions: SQL[] = [eq(p.orgId, req.orgId), isNull(t.deletedAt), isNull(p.deletedAt), isNull(orgs.deletedAt)];
      if (req.projectId) baseConditions.push(eq(p.id, req.projectId));
      let source: SQL;
      const common = sql`${t.id} AS task_id, ${t.displayId} AS display_id, ${t.title} AS task_title,
        ${t.status} AS task_status, ${p.id} AS project_id, ${p.name} AS project_name`;
      // Explicit joins below keep every source's actual task/project authoritative.
      if (req.kind === 'question') {
        const q = S.inputRequests;
        source = sql`SELECT ${q.id} AS source_id, ${common}, ${q.createdAt} AS source_at,
          coalesce(${q.askedByAgentId}, ${q.askedByUserId}) AS actor_id,
          case when ${q.askedByAgentId} is not null then 'agent' when ${q.askedByUserId} is not null then 'user' else null end AS actor_kind,
          ${contentPrefixSql(q.question, standalone, PREVIEW)} AS reason_prefix, null AS from_status, null AS to_status
          FROM ${q} INNER JOIN ${t} ON ${q.taskId} = ${t.id}
          INNER JOIN ${p} ON ${t.projectId} = ${p.id} INNER JOIN ${orgs} ON ${p.orgId} = ${orgs.id}
          WHERE ${and(...baseConditions, eq(q.orgId, req.orgId), eq(q.projectId, p.id), eq(q.status, 'open'))}`;
      } else if (req.kind === 'approval') {
        const a = S.transitionApprovals;
        source = sql`SELECT ${a.id} AS source_id, ${common}, ${a.createdAt} AS source_at,
          ${a.requestedByAgentId} AS actor_id, 'agent' AS actor_kind, null AS reason_prefix,
          ${a.fromStatus} AS from_status, ${a.toStatus} AS to_status
          FROM ${a} INNER JOIN ${t} ON ${a.taskId} = ${t.id}
          INNER JOIN ${p} ON ${t.projectId} = ${p.id} INNER JOIN ${orgs} ON ${p.orgId} = ${orgs.id}
          WHERE ${and(...baseConditions, eq(a.orgId, req.orgId), eq(a.projectId, p.id), eq(a.status, 'pending'))}`;
      } else if (req.kind === 'review') {
        const r = S.taskReviewers;
        source = sql`SELECT ${r.id} AS source_id, ${common}, ${t.createdAt} AS source_at,
          ${r.userId} AS actor_id, 'user' AS actor_kind, null AS reason_prefix, null AS from_status, null AS to_status
          FROM ${r} INNER JOIN ${t} ON ${r.taskId} = ${t.id}
          INNER JOIN ${p} ON ${t.projectId} = ${p.id} INNER JOIN ${orgs} ON ${p.orgId} = ${orgs.id}
          WHERE ${and(...baseConditions, eq(r.userId, userId), sql`not(${terminalStatusSql(t, standalone)})`)}`;
      } else {
        const a = S.taskAssignments, activity = S.taskActivity;
        // claimed is itself non-created activity, so the old claim fallback is
        // redundant when the latest qualifying signal is absent. Indexed latest
        // reads avoid transferring or grouping full task histories in the driver.
        const since = sql`coalesce((select ${activity.occurredAt} from ${activity}
          where ${activity.taskId} = ${t.id} and ${activity.kind} != 'created'
          order by ${activity.occurredAt} desc limit 1), ${t.createdAt})`;
        source = sql`SELECT ${a.id} AS source_id, ${common}, ${since} AS source_at,
          ${a.agentId} AS actor_id, 'agent' AS actor_kind, null AS reason_prefix, null AS from_status, null AS to_status
          FROM ${a} INNER JOIN ${t} ON ${a.taskId} = ${t.id}
          INNER JOIN ${p} ON ${t.projectId} = ${p.id} INNER JOIN ${orgs} ON ${p.orgId} = ${orgs.id}
          WHERE ${and(...baseConditions, sql`${a.agentId} is not null`, sql`not(${terminalStatusSql(t, standalone)})`)}`;
      }
      const eligibility = req.kind === 'stalled_claim'
        ? sql`source_at < ${dateValue(new Date(observed.getTime() - 24 * HOUR))}` : sql`1 = 1`;
      const position = cursor ? sql`and (source_at > ${dateValue(new Date(cursor.value as number))}
        or (source_at = ${dateValue(new Date(cursor.value as number))} and source_id > ${cursor.id}))` : sql``;
      const [raw, counts] = await Promise.all([
        readRows<SourceRow>(sql`SELECT * FROM (${source}) attention_source WHERE ${eligibility} ${position}
          ORDER BY source_at ASC, source_id ASC LIMIT ${limit + 1}`),
        readRows<{ n: number | string }>(sql`SELECT count(*) AS n FROM (${source}) attention_count WHERE ${eligibility}`),
      ]);
      const selected = raw.slice(0, limit), agentIds = [...new Set(selected.filter(row => row.actor_kind === 'agent' && row.actor_id).map(row => row.actor_id!))];
      const userIds = [...new Set(selected.filter(row => row.actor_kind === 'user' && row.actor_id).map(row => row.actor_id!))];
      const [agentNames, userNames] = await Promise.all([
        agentIds.length ? db.select({ id: S.agents.id, name: S.agents.name }).from(S.agents)
          .where(and(inArray(S.agents.id, agentIds), eq(S.agents.orgId, req.orgId))) : [],
        userIds.length ? db.select({ id: S.users.id, name: S.users.name }).from(S.users)
          .leftJoin(S.organizationMembers, and(eq(S.organizationMembers.userId, S.users.id), eq(S.organizationMembers.orgId, req.orgId)))
          .where(and(inArray(S.users.id, userIds), or(eq(S.users.id, userId), eq(S.organizationMembers.orgId, req.orgId)))) : [],
      ]);
      const names = new Map<string, string | null>([...agentNames, ...userNames].map(row => [row.id, row.name]));
      const items = selected.map(row => {
        const preview = req.kind === 'question' ? decodeContentPrefix(row.reason_prefix, PREVIEW + 1) : '';
        const points = Array.from(preview);
        return {
          kind: req.kind, sourceId: row.source_id, taskId: row.task_id, taskDisplayId: row.display_id ?? '', taskTitle: row.task_title,
          taskStatus: row.task_status, projectId: row.project_id, projectName: row.project_name,
          reason: req.kind === 'question' ? points.slice(0, PREVIEW).join('') : req.kind === 'approval'
            ? `Requested move ${row.from_status} → ${row.to_status}` : req.kind === 'review'
              ? 'You are a reviewer on this open task' : 'No task activity for more than 24 hours',
          reasonTruncated: req.kind === 'question' ? points.length > PREVIEW : false,
          since: decodeSqlTimestamp(row.source_at)?.toISOString(), sinceKind: sinceKinds[req.kind],
          actorId: row.actor_id ?? undefined, actorKind: row.actor_kind ?? undefined, actorName: row.actor_id ? names.get(row.actor_id) ?? undefined : undefined,
        };
      });
      const last = selected.at(-1), lastAt = last ? decodeSqlTimestamp(last.source_at) : undefined;
      return { items, observedAt: observed.toISOString(), page: { totalCount: Number(counts[0]?.n ?? 0),
        nextCursor: raw.length > limit && last && lastAt ? encodeCursor(lastAt.getTime(), last.source_id, 'source_at', undefined, undefined, binding) : '' } };
    },
  };
}
