import { describe, it, expect } from "bun:test";
import { describeCadence, nextRunAfter } from "./cadence";

const at = (s: string) => new Date(s);

describe("schedule cadence (M43)", () => {
  it("daily: today's slot if it is still ahead, else tomorrow's", () => {
    const spec = { cadence: "daily" as const, weekdays: [], dayOfMonth: 1, hourUtc: 9 };
    expect(nextRunAfter(spec, at("2026-10-02T08:59:59Z")).toISOString()).toBe("2026-10-02T09:00:00.000Z");
    // Exactly at the slot counts as past: the next one is tomorrow.
    expect(nextRunAfter(spec, at("2026-10-02T09:00:00Z")).toISOString()).toBe("2026-10-03T09:00:00.000Z");
  });

  it("weekly: the next chosen weekday, wrapping over the weekend", () => {
    // 2026-10-02 is a Friday.
    const spec = { cadence: "weekly" as const, weekdays: [1, 4], dayOfMonth: 1, hourUtc: 0 };
    expect(nextRunAfter(spec, at("2026-10-02T12:00:00Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(nextRunAfter(spec, at("2026-10-05T00:00:00Z")).toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(nextRunAfter({ ...spec, weekdays: [5], hourUtc: 23 }, at("2026-10-02T22:00:00Z")).toISOString()).toBe("2026-10-02T23:00:00.000Z");
  });

  it("monthly: the day this month if ahead, else next month - across a year end", () => {
    const spec = { cadence: "monthly" as const, weekdays: [], dayOfMonth: 28, hourUtc: 6 };
    expect(nextRunAfter(spec, at("2026-10-02T00:00:00Z")).toISOString()).toBe("2026-10-28T06:00:00.000Z");
    expect(nextRunAfter(spec, at("2026-12-28T06:00:00Z")).toISOString()).toBe("2027-01-28T06:00:00.000Z");
    expect(nextRunAfter({ ...spec, dayOfMonth: 1 }, at("2027-02-01T07:00:00Z")).toISOString()).toBe("2027-03-01T06:00:00.000Z");
  });

  it("describes itself", () => {
    expect(describeCadence({ cadence: "daily", weekdays: [], dayOfMonth: 1, hourUtc: 9 })).toBe("Every day at 09:00 UTC");
    expect(describeCadence({ cadence: "weekly", weekdays: [4, 1], dayOfMonth: 1, hourUtc: 14 })).toBe("Every Mon, Thu at 14:00 UTC");
    expect(describeCadence({ cadence: "monthly", weekdays: [], dayOfMonth: 15, hourUtc: 0 })).toBe("Monthly on day 15 at 00:00 UTC");
    expect(() => nextRunAfter({ cadence: "weekly", weekdays: [], dayOfMonth: 1, hourUtc: 0 }, new Date())).toThrow(/no slot/);
  });
});
