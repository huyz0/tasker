import { describe, it, expect } from "bun:test";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { hasOpenBlockerSql } from "./taskGraph";

/**
 * M35-T04. CI has no MySQL service, so the ready-work predicate's MySQL text is
 * pinned here. The first version passed a drizzle alias straight into a raw
 * template, which renders as the bare alias name - "no such table: blocker" -
 * and only SQLite's suite caught it.
 */
describe("hasOpenBlockerSql", () => {
  it("joins tasks under the blocker alias on both dialects", () => {
    const mysql = new MySqlDialect().sqlToQuery(hasOpenBlockerSql(schemaMysql.tasks, false)).sql;
    expect(mysql).toContain("JOIN `tasks` AS `blocker`");
    expect(mysql).toContain("`blocker`.`deleted_at` IS NULL");
    expect(mysql).toContain("`task_links`.`task_id` = `tasks`.`id`");

    const sqlite = new SQLiteSyncDialect().sqlToQuery(hasOpenBlockerSql(schemaSqlite.tasks, true)).sql;
    expect(sqlite).toContain('JOIN "tasks" AS "blocker"');
    expect(sqlite).toContain('"blocker"."status"');
  });
});
