/**
 * The task graph (M35, ADR-0028): priority ordering, blocking links, parents
 * and discovered-from origins.
 *
 * Kept out of `tasks.handler.ts` so the rules - what makes a task ready, which
 * links are legal - are each written once and shared by ClaimNextTask,
 * ListTasks, CreateTask, UpdateTask and the link RPCs.
 */
import { ConnectError, Code } from "@connectrpc/connect";
import { and, eq, inArray, isNull, sql, desc } from "drizzle-orm";
import { alias as sqliteAlias } from "drizzle-orm/sqlite-core";
import { alias as mysqlAlias } from "drizzle-orm/mysql-core";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { getTaskOrgId } from "../../lib/authz";
import { terminalStatusSql } from "./taskActivity";

export const LINK_KINDS = ["blocked_by", "discovered_from"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
export const MAX_PRIORITY = 4;

/** Most-important-first rank: urgent (1) .. low (4), then none (0) as 5. */
export function priorityRankSql(tasks: any) {
  return sql<number>`(CASE WHEN ${tasks.priority} = 0 THEN 5 ELSE ${tasks.priority} END)`;
}

/** Cap on how many tasks a cycle check may visit before refusing (ADR-0028). */
const CYCLE_WALK_LIMIT = 1000;

/** Cap on each relation list ListTaskLinks returns. */
const LINK_LIST_LIMIT = 200;

const tables = (isStandalone: boolean) => ({
  tasks: isStandalone ? schemaSqlite.tasks : schemaMysql.tasks,
  links: isStandalone ? schemaSqlite.taskLinks : schemaMysql.taskLinks,
});

/**
 * `EXISTS` an unfinished, undeleted task blocking `tasks.id`. A deleted blocker
 * no longer blocks: binning a task must not strand its dependents (ADR-0028).
 */
export function hasOpenBlockerSql(tasks: any, isStandalone: boolean) {
  const { links, tasks: tasksTable } = tables(isStandalone);
  const blocker = isStandalone ? sqliteAlias(schemaSqlite.tasks, "blocker") : mysqlAlias(schemaMysql.tasks, "blocker");
  // In a raw template an alias renders as its bare name, so the FROM item is
  // spelled out; the alias's columns then render as "blocker"."col".
  return sql`EXISTS (
    SELECT 1 FROM ${links}
    JOIN ${tasksTable} AS ${sql.identifier("blocker")} ON ${(blocker as any).id} = ${(links as any).linkedTaskId}
    WHERE ${(links as any).taskId} = ${tasks.id}
      AND ${(links as any).kind} = 'blocked_by'
      AND ${(blocker as any).deletedAt} IS NULL
      AND NOT ${terminalStatusSql(blocker, isStandalone)}
  )`;
}

/** Open-blocker counts for a page of tasks, in one grouped query. */
export async function openBlockerCounts(db: any, isStandalone: boolean, taskIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (taskIds.length === 0) return counts;
  const { links } = tables(isStandalone);
  const blocker = isStandalone ? sqliteAlias(schemaSqlite.tasks, "blocker") : mysqlAlias(schemaMysql.tasks, "blocker");
  const rows: { taskId: string; n: unknown }[] = await db
    .select({ taskId: (links as any).taskId, n: sql`count(*)` })
    .from(links)
    .innerJoin(blocker, eq((blocker as any).id, (links as any).linkedTaskId))
    .where(and(
      inArray((links as any).taskId, taskIds),
      eq((links as any).kind, "blocked_by"),
      isNull((blocker as any).deletedAt),
      sql`NOT ${terminalStatusSql(blocker, isStandalone)}`,
    ))
    .groupBy((links as any).taskId);
  for (const r of rows) counts.set(r.taskId, Number(r.n));
  return counts;
}

async function taskRow(db: any, isStandalone: boolean, id: string) {
  const { tasks } = tables(isStandalone);
  const [row] = await db.select({ id: (tasks as any).id, projectId: (tasks as any).projectId, parentTaskId: (tasks as any).parentTaskId })
    .from(tasks).where(eq((tasks as any).id, id)).limit(1);
  return row as { id: string; projectId: string; parentTaskId: string | null } | undefined;
}

/**
 * True when `to` is reachable from `from` by following `next`. Breadth-first
 * and bounded: a walk that would visit more than CYCLE_WALK_LIMIT tasks is
 * refused rather than finished.
 */
async function reaches(from: string, to: string, next: (ids: string[]) => Promise<string[]>): Promise<boolean> {
  const seen = new Set<string>([from]);
  let frontier = [from];
  while (frontier.length > 0) {
    const found = await next(frontier);
    frontier = [];
    for (const id of found) {
      if (id === to) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      if (seen.size > CYCLE_WALK_LIMIT) {
        throw new ConnectError(`the task graph here is deeper than ${CYCLE_WALK_LIMIT} tasks - refusing to walk it`, Code.FailedPrecondition);
      }
      frontier.push(id);
    }
  }
  return false;
}

/**
 * Refuses a link that is to the task itself, to a task in another
 * organization, to a missing task, or - for `blocked_by` - that closes a
 * cycle. `orgId` is the (already authorized) organization of `taskId`;
 * `taskId` is null for a task about to be created.
 */
export async function assertLinkAllowed(
  db: any, isStandalone: boolean, orgId: string, taskId: string | null, linkedTaskId: string, kind: LinkKind,
): Promise<void> {
  if (taskId === linkedTaskId) throw new ConnectError("a task cannot be linked to itself", Code.InvalidArgument);
  let linkedOrg: string;
  try {
    linkedOrg = await getTaskOrgId(db, linkedTaskId);
  } catch (e) {
    if (e instanceof ConnectError && e.code === Code.NotFound) throw new ConnectError("linked task not found", Code.InvalidArgument);
    throw e;
  }
  if (linkedOrg !== orgId) throw new ConnectError("linked task belongs to a different organization", Code.InvalidArgument);
  // A task being created has nothing pointing at it yet, so cannot close a cycle.
  if (kind !== "blocked_by" || taskId === null) return;

  // taskId blocked by linkedTaskId closes a cycle when taskId already blocks
  // linkedTaskId, i.e. taskId is reachable from linkedTaskId along blocked_by.
  const { links } = tables(isStandalone);
  const cycle = await reaches(linkedTaskId, taskId, async (ids) => {
    const rows = await db.select({ next: (links as any).linkedTaskId }).from(links)
      .where(and(inArray((links as any).taskId, ids), eq((links as any).kind, "blocked_by")));
    return rows.map((r: any) => r.next);
  });
  if (cycle) throw new ConnectError("that link would make the tasks block each other", Code.InvalidArgument);
}

/** Refuses a parent that is missing, in another project, the task itself, or one of its descendants. */
export async function assertParentAllowed(
  db: any, isStandalone: boolean, taskId: string | null, projectId: string, parentTaskId: string,
): Promise<void> {
  if (taskId && parentTaskId === taskId) throw new ConnectError("a task cannot be its own parent", Code.InvalidArgument);
  const parent = await taskRow(db, isStandalone, parentTaskId);
  if (!parent) throw new ConnectError("parent task not found", Code.InvalidArgument);
  if (parent.projectId !== projectId) throw new ConnectError("parent task belongs to a different project", Code.InvalidArgument);
  if (!taskId) return;
  // Walking *up* from the new parent: reaching taskId means the parent is
  // one of taskId's descendants.
  const { tasks } = tables(isStandalone);
  const cycle = await reaches(parentTaskId, taskId, async (ids) => {
    const rows = await db.select({ next: (tasks as any).parentTaskId }).from(tasks).where(inArray((tasks as any).id, ids));
    return rows.map((r: any) => r.next).filter(Boolean);
  });
  if (cycle) throw new ConnectError("that parent is one of this task's own subtasks", Code.InvalidArgument);
}

/**
 * Inserts a link. Idempotent: an existing identical link is success. A second
 * `discovered_from` for the same task is refused - a task has one origin.
 */
export async function insertLink(
  db: any, isStandalone: boolean, link: { taskId: string; linkedTaskId: string; kind: LinkKind; createdBy: string | null },
): Promise<boolean> {
  const { links } = tables(isStandalone);
  if (link.kind === "discovered_from") {
    const [existing] = await db.select({ linkedTaskId: (links as any).linkedTaskId }).from(links)
      .where(and(eq((links as any).taskId, link.taskId), eq((links as any).kind, "discovered_from"))).limit(1);
    if (existing && existing.linkedTaskId !== link.linkedTaskId) {
      throw new ConnectError("this task already records where it was discovered - remove that link first", Code.FailedPrecondition);
    }
    if (existing) return false;
  }
  try {
    await db.insert(links).values({ id: `tl-${crypto.randomUUID()}`, ...link, createdAt: new Date() });
    return true;
  } catch (e) {
    const msg = String((e as any)?.message ?? e);
    if (msg.includes("UNIQUE constraint failed") || msg.includes("Duplicate entry")) return false;
    throw e;
  }
}

export async function deleteLink(db: any, isStandalone: boolean, taskId: string, linkedTaskId: string, kind: LinkKind): Promise<boolean> {
  const { links } = tables(isStandalone);
  const res = await db.delete(links).where(and(
    eq((links as any).taskId, taskId), eq((links as any).linkedTaskId, linkedTaskId), eq((links as any).kind, kind),
  ));
  return Boolean(isStandalone ? (res as any).changes : (res as any)[0]?.affectedRows);
}

/** TaskRef rows for a set of ids, keyed by id. Deleted tasks are omitted. */
async function refs(db: any, isStandalone: boolean, ids: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  if (ids.length === 0) return out;
  const { tasks } = tables(isStandalone);
  const rows = await db.select({
    id: (tasks as any).id,
    displayId: (tasks as any).displayId,
    title: (tasks as any).title,
    status: (tasks as any).status,
    projectId: (tasks as any).projectId,
    terminal: sql<unknown>`CASE WHEN ${terminalStatusSql(tasks, isStandalone)} THEN 1 ELSE 0 END`,
  }).from(tasks).where(and(inArray((tasks as any).id, ids), isNull((tasks as any).deletedAt)));
  for (const r of rows) out.set(r.id, { ...r, terminal: Number(r.terminal) === 1 });
  return out;
}

/** Every relation of one task, for ListTaskLinks. */
export async function listLinks(db: any, isStandalone: boolean, taskId: string) {
  const { tasks, links } = tables(isStandalone);
  const [self] = await db.select({ parentTaskId: (tasks as any).parentTaskId }).from(tasks).where(eq((tasks as any).id, taskId)).limit(1);
  const [outgoing, incoming, children] = await Promise.all([
    db.select().from(links).where(eq((links as any).taskId, taskId)).orderBy(desc((links as any).createdAt)).limit(LINK_LIST_LIMIT * 2),
    db.select().from(links).where(eq((links as any).linkedTaskId, taskId)).orderBy(desc((links as any).createdAt)).limit(LINK_LIST_LIMIT * 2),
    db.select({ id: (tasks as any).id }).from(tasks)
      .where(and(eq((tasks as any).parentTaskId, taskId), isNull((tasks as any).deletedAt)))
      .orderBy(desc((tasks as any).createdAt)).limit(LINK_LIST_LIMIT),
  ]);
  const ids = new Set<string>([
    ...outgoing.map((l: any) => l.linkedTaskId),
    ...incoming.map((l: any) => l.taskId),
    ...children.map((c: any) => c.id),
    ...(self?.parentTaskId ? [self.parentTaskId] : []),
  ]);
  const byId = await refs(db, isStandalone, [...ids]);
  const pick = (rows: any[], key: string, kind: LinkKind) =>
    rows.filter((l) => l.kind === kind).map((l) => byId.get(l[key])).filter(Boolean).slice(0, LINK_LIST_LIMIT);
  const [discoveredFrom] = pick(outgoing, "linkedTaskId", "discovered_from");
  const parent = self?.parentTaskId ? byId.get(self.parentTaskId) : undefined;
  return {
    blockedBy: pick(outgoing, "linkedTaskId", "blocked_by"),
    blocks: pick(incoming, "taskId", "blocked_by"),
    discovered: pick(incoming, "taskId", "discovered_from"),
    children: children.map((c: any) => byId.get(c.id)).filter(Boolean),
    ...(discoveredFrom ? { discoveredFrom } : {}),
    ...(parent ? { parent } : {}),
  };
}

/**
 * The tasks `taskId` blocked that now have no unfinished blocker - called
 * after `taskId` reaches a terminal status, to announce them (ADR-0028).
 */
export async function newlyUnblocked(db: any, isStandalone: boolean, taskId: string): Promise<string[]> {
  const { tasks, links } = tables(isStandalone);
  const rows: { id: string }[] = await db.select({ id: (tasks as any).id }).from(tasks)
    .where(and(
      sql`${(tasks as any).id} IN (SELECT ${(links as any).taskId} FROM ${links} WHERE ${(links as any).linkedTaskId} = ${taskId} AND ${(links as any).kind} = 'blocked_by')`,
      isNull((tasks as any).deletedAt),
      sql`NOT ${hasOpenBlockerSql(tasks, isStandalone)}`,
    ));
  return rows.map((r) => r.id);
}
