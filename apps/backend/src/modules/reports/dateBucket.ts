import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * M24-T06: the repo's first dialect-split date SQL - one helper, unit-tested
 * on both rendered shapes, because the milestone's own risk register calls
 * this a silent-wrongness hazard.
 *
 * Renders `column` as a `YYYY-MM-DD` day bucket:
 *
 * - **sqlite**: drizzle's `mode: 'timestamp'` stores integer **seconds**
 *   (the dashboard/common.ts `fromSeconds` gotcha), so the bucket is
 *   `strftime('%Y-%m-%d', col, 'unixepoch')` - epoch seconds rendered in
 *   UTC, unconditionally.
 * - **mysql**: `DATE_FORMAT(col, '%Y-%m-%d')`. Honesty note: the column is a
 *   TIMESTAMP written from JS Dates through mysql2, which serialises Dates in
 *   the Node process's local timezone, and MySQL re-reads and re-renders them
 *   in the session timezone. The round trip is lossless, and the bucket is
 *   UTC exactly when both the app process and the MySQL session run UTC -
 *   which the containerised deployment does (docker-compose sets no TZ, and
 *   the images default to UTC). A non-UTC pairing shifts day *boundaries*;
 *   it never corrupts the stored instant.
 */
export function dayBucketSql(isStandalone: boolean, column: SQLWrapper): SQL<string> {
  return isStandalone
    ? sql<string>`strftime('%Y-%m-%d', ${column}, 'unixepoch')`
    : sql<string>`DATE_FORMAT(${column}, '%Y-%m-%d')`;
}

/**
 * The same UTC day bucket as an *epoch-day integer* (days since 1970-01-01),
 * for hot aggregations: grouping an integer division is measurably cheaper
 * than grouping a formatted string when the scan is six figures of rows
 * (M24-T06's CFD measurement). Render with `epochDayToDateStr` on the JS
 * side. SQLite `/` on two integers is integer division; MySQL needs `DIV`.
 * The same UTC honesty note as above applies to the MySQL form -
 * UNIX_TIMESTAMP reads the stored value through the session timezone.
 */
export function epochDaySql(isStandalone: boolean, column: SQLWrapper): SQL<number> {
  return isStandalone
    ? sql<number>`(${column} / 86400)`
    : sql<number>`(UNIX_TIMESTAMP(${column}) DIV 86400)`;
}

/** The `YYYY-MM-DD` string for an `epochDaySql` bucket value. */
export const epochDayToDateStr = (day: number): string =>
  new Date(Number(day) * 86_400_000).toISOString().slice(0, 10);
