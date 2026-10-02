import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { epochDaySql, epochDayToDateStr } from "./dateBucket";
import { sumsToWire, toSums, usageSumColumns } from "../tasks/usage";

/** Agents and projects are ranked by spend and capped - a report to notice, not to page. */
const USAGE_BREAKDOWN_LIMIT = 50;

/** The UTC day `days - 1` days before `now`'s - so the window holds exactly `days` day buckets. */
export function usageWindowStart(now: Date, days: number): Date {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (days - 1) * 86_400_000);
}

/**
 * M40 (ADR-0033): spend over a window for an organization or one project -
 * totals and three breakdowns, one grouped query each, whatever the volume.
 * Days with no reports are filled with zeros so the series is continuous.
 */
export async function buildUsageReport(
  db: any,
  isStandalone: boolean,
  opts: { orgId: string; projectId?: string; days: number; now?: Date },
) {
  const S = isStandalone ? schemaSqlite : schemaMysql;
  const u = S.usageRecords as any;
  const since = usageWindowStart(opts.now ?? new Date(), opts.days);
  const scope = and(eq(u.orgId, opts.orgId), opts.projectId ? eq(u.projectId, opts.projectId) : undefined, gte(u.createdAt, since));
  const sums = usageSumColumns(isStandalone);
  const day = epochDaySql(isStandalone, u.createdAt);

  const [totalsRows, agentRows, projectRows, dayRows] = await Promise.all([
    db.select(sums).from(u).where(scope),
    db.select({ key: u.agentId, ...sums }).from(u).where(scope).groupBy(u.agentId)
      .orderBy(desc(sums.costMicros), desc(sums.reports)).limit(USAGE_BREAKDOWN_LIMIT),
    db.select({ key: u.projectId, ...sums }).from(u).where(scope).groupBy(u.projectId)
      .orderBy(desc(sums.costMicros), desc(sums.reports)).limit(USAGE_BREAKDOWN_LIMIT),
    db.select({ key: sql<number>`${day}`.as("day"), ...sums }).from(u).where(scope).groupBy(sql`day`),
  ]);

  const agentIds = agentRows.map((r: any) => r.key).filter(Boolean) as string[];
  const projectIds = projectRows.map((r: any) => r.key) as string[];
  const [agents, projects] = await Promise.all([
    agentIds.length ? db.select({ id: (S.agents as any).id, name: (S.agents as any).name }).from(S.agents).where(inArray((S.agents as any).id, agentIds)) : [],
    projectIds.length ? db.select({ id: (S.projects as any).id, name: (S.projects as any).name }).from(S.projects).where(inArray((S.projects as any).id, projectIds)) : [],
  ]);
  const agentName = new Map<string, string>(agents.map((a: any) => [a.id, a.name]));
  const projectName = new Map<string, string>(projects.map((p: any) => [p.id, p.name]));
  const bucket = (key: string, label: string, row: any) => ({ key, label, ...sumsToWire(toSums(row)) });

  const byDayKey = new Map<string, any>(dayRows.map((r: any) => [epochDayToDateStr(Number(r.key)), r]));
  const byDay = Array.from({ length: opts.days }, (_, i) => {
    const key = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    return bucket(key, key, byDayKey.get(key));
  });

  return {
    totals: sumsToWire(toSums(totalsRows[0])),
    // Reports a person filed have no agent; they share one row.
    byAgent: agentRows.map((r: any) => r.key
      ? bucket(r.key, agentName.get(r.key) ?? "(deleted agent)", r)
      : bucket("", "People", r)),
    byProject: projectRows.map((r: any) => bucket(r.key, projectName.get(r.key) ?? r.key, r)),
    byDay,
    since: since.toISOString(),
  };
}
