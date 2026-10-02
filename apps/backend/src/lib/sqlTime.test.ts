import { describe, it, expect } from "bun:test";
import { decodeSqlTimestamp } from "./sqlTime";

/**
 * A raw `MAX`/`MIN` over a timestamp column bypasses drizzle's decoding, and
 * the two dialects hand back different shapes: SQLite the stored integer
 * (epoch **seconds**), mysql2 a `"YYYY-MM-DD HH:MM:SS"` UTC string. M30-T01:
 * the reports and dashboard decoded only the first shape, so on MySQL
 * `Number("2026-…")` was NaN and `toISOString()` threw.
 */
function inZone<T>(tz: string, fn: () => T): T {
  const original = process.env.TZ;
  try {
    process.env.TZ = tz;
    return fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

describe("decodeSqlTimestamp", () => {
  it("decodes a mysql2 datetime string as UTC regardless of the host zone", () => {
    inZone("Australia/Sydney", () => {
      expect(decodeSqlTimestamp("2026-08-22 14:08:50")!.getTime()).toBe(Date.UTC(2026, 7, 22, 14, 8, 50));
    });
  });

  it("keeps fractional seconds", () => {
    expect(decodeSqlTimestamp("2026-08-22 14:08:50.500")!.getTime()).toBe(Date.UTC(2026, 7, 22, 14, 8, 50, 500));
  });

  it("decodes SQLite epoch seconds, as a number or a numeric string", () => {
    const s = Math.floor(Date.UTC(2026, 7, 22) / 1000);
    expect(decodeSqlTimestamp(s)!.getTime()).toBe(s * 1000);
    expect(decodeSqlTimestamp(String(s))!.getTime()).toBe(s * 1000);
  });

  it("passes a Date through", () => {
    const d = new Date();
    expect(decodeSqlTimestamp(d)).toBe(d);
  });

  it("returns undefined for null, undefined and anything it cannot read", () => {
    expect(decodeSqlTimestamp(null)).toBeUndefined();
    expect(decodeSqlTimestamp(undefined)).toBeUndefined();
    expect(decodeSqlTimestamp("not a date")).toBeUndefined();
  });
});

describe("raw timestamp aggregates", () => {
  // A `sql<number>` type on a raw MAX/MIN of a timestamp column is what let
  // M30-T01's bug through: it told every reader the value was a number, which
  // it is on SQLite only. Typing them `unknown` forces a decode.
  it("are never typed as a number", async () => {
    const { Glob } = await import("bun");
    const offenders: string[] = [];
    for await (const file of new Glob("src/**/*.ts").scan(".")) {
      if (file.endsWith(".test.ts")) continue;
      const text = await Bun.file(file).text();
      const re = /sql<number[^>]*>`(?:max|min)\(\$\{\w+\.(\w+)\}\)`/g;
      for (const m of text.matchAll(re)) {
        if (m[1]!.endsWith("At")) offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
