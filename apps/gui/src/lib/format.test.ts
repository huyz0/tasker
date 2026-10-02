import { describe, it, expect } from 'vitest';
import { formatDateTime, formatStatus } from './format';

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
