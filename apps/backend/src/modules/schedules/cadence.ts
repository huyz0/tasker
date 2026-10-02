/**
 * Schedule cadences (M43, ADR-0036): a small fixed vocabulary in UTC rather
 * than cron - daily, chosen weekdays, or a day of the month (1-28, so every
 * month has it) - always at `hourUtc`:00.
 */
export const CADENCES = ["daily", "weekly", "monthly"] as const;
type Cadence = (typeof CADENCES)[number];

export interface CadenceSpec {
  cadence: Cadence;
  /** 0 = Sunday .. 6 = Saturday; weekly only. */
  weekdays: number[];
  /** 1-28; monthly only. */
  dayOfMonth: number;
  hourUtc: number;
}

const DAY_MS = 86_400_000;

/** The first slot strictly after `after`. */
export function nextRunAfter(spec: CadenceSpec, after: Date): Date {
  const start = Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate());
  // 62 days always contains a matching day for any valid spec: a weekday
  // within 7, a day of the month (≤ 28) within two month starts.
  for (let d = 0; d <= 62; d++) {
    const day = new Date(start + d * DAY_MS);
    const slot = new Date(start + d * DAY_MS + spec.hourUtc * 3_600_000);
    if (slot.getTime() <= after.getTime()) continue;
    if (spec.cadence === "daily") return slot;
    if (spec.cadence === "weekly" && spec.weekdays.includes(day.getUTCDay())) return slot;
    if (spec.cadence === "monthly" && day.getUTCDate() === spec.dayOfMonth) return slot;
  }
  throw new Error(`no slot within 62 days for ${JSON.stringify(spec)}`);
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Every Mon, Thu at 09:00 UTC" - for logs, the CLI and the GUI's server-side twin. */
export function describeCadence(spec: CadenceSpec): string {
  const at = `at ${String(spec.hourUtc).padStart(2, "0")}:00 UTC`;
  if (spec.cadence === "daily") return `Every day ${at}`;
  if (spec.cadence === "weekly") return `Every ${[...spec.weekdays].sort().map((d) => WEEKDAY_NAMES[d]).join(", ")} ${at}`;
  return `Monthly on day ${spec.dayOfMonth} ${at}`;
}
