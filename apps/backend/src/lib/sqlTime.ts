/**
 * Decodes a timestamp that bypassed drizzle's own column decoding — a raw
 * `MAX`/`MIN`/`CASE` aggregate over a timestamp column.
 *
 * The two dialects hand it back in different shapes, and the shape alone says
 * which one it is:
 *
 * - **SQLite** returns the stored integer: epoch **seconds** (`mode:
 *   "timestamp"`), not milliseconds. Treating it as ms reads as 1970.
 * - **MySQL** returns a `"YYYY-MM-DD HH:MM:SS[.fff]"` string, because
 *   drizzle-orm's mysql2 driver installs a `typeCast` that stringifies every
 *   TIMESTAMP/DATETIME field (confirmed against MySQL 8 in M25-T05). The text
 *   is UTC wall-clock, but `new Date(v)` on a space-separated string with no
 *   offset parses it as the *host's* local zone, so it is parsed by hand.
 *
 * Deciding by shape instead of by dialect means a caller cannot pass the
 * wrong flag — M30-T01 found the reports and dashboard decoding the SQLite
 * shape only, so on MySQL `Number("2026-…")` was NaN and `toISOString()`
 * threw.
 */
const MYSQL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z?$/;
const NUMERIC_RE = /^-?\d+(?:\.\d+)?$/;

export function decodeSqlTimestamp(v: unknown): Date | undefined {
  if (v == null) return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  if (typeof v === "number" || typeof v === "bigint") return new Date(Number(v) * 1000);
  const s = String(v).trim();
  if (NUMERIC_RE.test(s)) return new Date(Number(s) * 1000);
  const m = MYSQL_DATETIME_RE.exec(s);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, sec, frac] = m as unknown as string[];
  const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec), ms));
}
