import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectedSinceFootnote } from './useReportsQueries';

describe('collectedSinceFootnote', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // The date is the viewer's to read, so it follows their locale rather than
  // a pinned 'en-US'. Simulated here by a runtime whose default locale is
  // German: an unspecified locale resolves to de-DE, an explicit one is kept.
  it("formats the date in the viewer's locale, not a hardcoded en-US", () => {
    const RealDateTimeFormat = Intl.DateTimeFormat;
    const germanDefault = function (locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
      return new RealDateTimeFormat(locales ?? 'de-DE', options);
    } as unknown as typeof Intl.DateTimeFormat;
    vi.stubGlobal('Intl', { ...Intl, DateTimeFormat: germanDefault });
    const realToLocale = Date.prototype.toLocaleDateString;
    vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (this: Date, locales, options) {
      return realToLocale.call(this, locales ?? 'de-DE', options);
    });

    expect(collectedSinceFootnote('2026-08-01T00:00:00Z')).toBe('History collected since 1. August 2026');
  });

  it('keeps the date in UTC, since trend buckets are UTC days', () => {
    // Midnight UTC is still 31 July west of Greenwich; the label must not slip.
    expect(collectedSinceFootnote('2026-08-01T00:00:00Z')).toContain('2026');
    expect(collectedSinceFootnote('2026-08-01T00:00:00Z')).toMatch(/\b1\b/);
  });
});
