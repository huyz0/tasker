# M30 — Progress Journal

## M30-T01 — One dialect-aware aggregate decoder

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/lib/sqlTime.ts` (new), `lib/stalledClaims.ts`,
  `modules/reports/{common,trends,exceptions,scorecard,dateBucket}.ts`,
  `modules/dashboard/dashboard.handler.ts`
- **Verified**: `bun test src/lib/sqlTime.test.ts src/lib/stalledClaims.test.ts
  src/modules/reports src/modules/dashboard` — 69 pass; `tsc --noEmit` clean.
- **Notes**: The decoder decides by the value's *shape*, not a dialect flag:
  SQLite hands back an integer (epoch seconds), mysql2 a `"YYYY-MM-DD
  HH:MM:SS"` UTC string, and the two never overlap. That removed the
  `isStandalone` parameter callers could get wrong, and `stalledClaims.ts`'s
  private copy (its M25-T06 regression tests moved to `sqlTime.test.ts`,
  including the non-UTC host zone). The raw aggregates were typed
  `sql<number>`, which is what let every reader believe the SQLite shape; they
  are `sql<unknown>` now, and a structural test fails if a raw `max`/`min` of
  an `…At` column is typed as a number again. `reports/common.ts`'s
  `fromSeconds` is gone rather than aliased — its name was the bug.
- **Next**: M30-T02
