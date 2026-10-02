import { describe, it, expect } from 'vitest';
import { formatDateTime, formatStatus, formatMicros, formatCount } from './format';

describe('formatDateTime', () => {
  it("formats in the reader's locale, to the minute", () => {
    const iso = '2026-10-02T09:30:00.000Z';
    expect(formatDateTime(iso)).toBe(
      new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)),
    );
  });

  it('accepts a Date', () => {
    const d = new Date('2026-10-02T09:30:00.000Z');
    expect(formatDateTime(d)).toBe(formatDateTime(d.toISOString()));
  });

  it('returns an empty string instead of throwing for a missing or unparseable time', () => {
    // Intl.DateTimeFormat#format(new Date('')) throws a RangeError, which took
    // down whatever list was rendering the row.
    expect(formatDateTime('')).toBe('');
    expect(formatDateTime(undefined)).toBe('');
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime('not a date')).toBe('');
  });
});

describe('formatStatus', () => {
  it('turns a status id into words, not CSS-capitalized underscores', () => {
    expect(formatStatus('in_progress')).toBe('In progress');
    expect(formatStatus('in-progress')).toBe('In progress');
    expect(formatStatus('todo')).toBe('Todo');
    expect(formatStatus('')).toBe('');
  });
});

describe('formatMicros (M40)', () => {
  it('shows dollars with only significant fractional digits, at least cents', () => {
    expect(formatMicros(0n)).toBe('$0.00');
    expect(formatMicros(15000n)).toBe('$0.015');
    expect(formatMicros(1_500_000n)).toBe('$1.50');
    expect(formatMicros(1n)).toBe('$0.000001');
    expect(formatMicros(1_234_567_890_000n)).toBe('$1,234,567.89');
    expect(formatMicros(-2_500_000n)).toBe('-$2.50');
  });

  it('groups token counts', () => {
    expect(formatCount(1234567n)).toBe('1,234,567');
  });
});
