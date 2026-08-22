import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { setupIntegrationTest } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import * as schemaMysql from "../../db/schema.mysql";
import { dayBucketSql, epochDaySql, epochDayToDateStr } from "./dateBucket";

/**
 * M24-T06. The repo's first dialect-split date SQL - the milestone's own risk
 * register calls it a silent-wrongness hazard, so the two rendered shapes are
 * pinned exactly, and sqlite (the dialect the whole test suite runs on) is
 * proven with a live round-trip across a UTC midnight boundary.
 */
describe("dayBucketSql", () => {
  it("renders the sqlite shape: strftime over integer seconds with 'unixepoch'", () => {
    const { sql: rendered, params } = new SQLiteSyncDialect().sqlToQuery(
      dayBucketSql(true, schema.taskActivity.occurredAt),
    );
    expect(rendered).toBe(`strftime('%Y-%m-%d', "task_activity"."occurred_at", 'unixepoch')`);
    expect(params).toEqual([]);
  });

  it("renders the mysql shape: DATE_FORMAT over the datetime column", () => {
    const { sql: rendered, params } = new MySqlDialect().sqlToQuery(
      dayBucketSql(false, schemaMysql.taskActivity.occurredAt),
    );
    expect(rendered).toBe("DATE_FORMAT(`task_activity`.`occurred_at`, '%Y-%m-%d')");
    expect(params).toEqual([]);
  });

  it("renders the epoch-day shapes: integer division of seconds, DIV of UNIX_TIMESTAMP", () => {
    expect(new SQLiteSyncDialect().sqlToQuery(epochDaySql(true, schema.taskActivity.occurredAt)).sql)
      .toBe(`("task_activity"."occurred_at" / 86400)`);
    expect(new MySqlDialect().sqlToQuery(epochDaySql(false, schemaMysql.taskActivity.occurredAt)).sql)
      .toBe("(UNIX_TIMESTAMP(`task_activity`.`occurred_at`) DIV 86400)");
    // 2026-01-02T23:30Z is epoch day 20455; its rendered day matches strftime's.
    expect(epochDayToDateStr(Math.floor(Date.parse("2026-01-02T23:30:00Z") / 86_400_000))).toBe("2026-01-02");
  });

  it("buckets live sqlite rows by UTC day, not by anything local", async () => {
    const { db } = await setupIntegrationTest();
    const stamp = crypto.randomUUID();
    const now = new Date();
    const orgId = `org-${stamp}`;
    const userId = `user-${stamp}`;
    const projectId = `proj-${stamp}`;
    const taskId = `tsk-${stamp}`;
    await db.insert(schema.organizations).values({ id: orgId, name: "O", slug: orgId, createdAt: now });
    await db.insert(schema.users).values({ id: userId, email: `${userId}@test.local`, createdAt: now });
    await db.insert(schema.projectTemplates).values({ id: `tmpl-${stamp}`, orgId, name: "T", createdAt: now });
    await db.insert(schema.projects).values({ id: projectId, orgId, templateId: `tmpl-${stamp}`, name: "P", key: "P", ownerId: userId, createdAt: now });
    await db.insert(schema.tasks).values({ id: taskId, projectId, displayId: "P-1", title: "t", status: "todo", createdAt: now });

    // 23:30Z and 00:30Z, 60 minutes apart across a UTC midnight - a local-time
    // bucketing (in any zone but UTC) would merge them or split them elsewhere.
    await db.insert(schema.taskActivity).values([
      { id: `act-${stamp}-1`, taskId, projectId, kind: "note", actorType: "user", actorId: userId, occurredAt: new Date("2026-01-02T23:30:00Z") },
      { id: `act-${stamp}-2`, taskId, projectId, kind: "note", actorType: "user", actorId: userId, occurredAt: new Date("2026-01-03T00:30:00Z") },
    ]);

    const day = dayBucketSql(true, schema.taskActivity.occurredAt);
    const rows = await db
      .select({ day, n: sql<number>`count(*)` })
      .from(schema.taskActivity)
      .where(sql`${schema.taskActivity.projectId} = ${projectId}`)
      .groupBy(day)
      .orderBy(day);
    expect(rows).toEqual([
      { day: "2026-01-02", n: 1 },
      { day: "2026-01-03", n: 1 },
    ]);

    // The integer variant buckets the same rows onto the same UTC days.
    const eday = epochDaySql(true, schema.taskActivity.occurredAt);
    const edayRows = await db
      .select({ day: eday, n: sql<number>`count(*)` })
      .from(schema.taskActivity)
      .where(sql`${schema.taskActivity.projectId} = ${projectId}`)
      .groupBy(eday)
      .orderBy(eday);
    expect(edayRows.map((r: any) => ({ day: epochDayToDateStr(r.day), n: r.n }))).toEqual([
      { day: "2026-01-02", n: 1 },
      { day: "2026-01-03", n: 1 },
    ]);
  });
});
