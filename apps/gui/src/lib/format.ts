/**
 * Display formatting shared across screens (M32-T06). Six screens each built
 * the same `Intl.DateTimeFormat`, and none of them guarded a missing time.
 */

/** The reader's own locale, date and time to the minute; seconds are noise. */
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * A timestamp for display. Empty for a missing or unparseable value rather
 * than throwing: `format(new Date(''))` raises a RangeError, which takes down
 * the whole list rendering the row, not just the row.
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateTimeFormat.format(date);
}

/**
 * A status id as words: `in_progress` and `in-progress` both read "In
 * progress". CSS `capitalize` on the raw id rendered "In_progress".
 */
export function formatStatus(status: string): string {
  const words = status.replace(/[-_]+/g, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : '';
}

/**
 * Integer micro-dollars (M40, ADR-0033) as dollars, keeping only significant
 * fractional digits but at least cents: 15000n -> "$0.015", 1500000n -> "$1.50".
 * Integer arithmetic throughout - no float ever touches the amount.
 */
export function formatMicros(micros: bigint): string {
  const negative = micros < 0n;
  const abs = negative ? -micros : micros;
  const whole = (abs / 1_000_000n).toLocaleString('en-US');
  let frac = (abs % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  if (frac.length < 2) frac = frac.padEnd(2, '0');
  return `${negative ? '-' : ''}$${whole}.${frac}`;
}

/** A token count, grouped: 1234567n -> "1,234,567". */
export function formatCount(n: bigint): string {
  return n.toLocaleString('en-US');
}
