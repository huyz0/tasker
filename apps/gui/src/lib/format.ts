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
