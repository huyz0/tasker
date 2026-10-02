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

## M30-T02 — Search filters beliefs to scopes the caller can read

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/search/search.handler.ts`, `search.test.ts`
- **Verified**: `bun test src/modules/search` — 36 pass (6 MySQL-only skip);
  the new "hidden from an org member with no standing" test failed first,
  reproducing the leak.
- **Notes**: Search now asks `can(team, "memory:read")` — the exact check
  `GetBelief` makes — for each team that holds an active belief in the org,
  and filters both the rows and the count to those teams, so a hidden belief
  does not leak through `totalCount` either. Project-scoped beliefs need no
  filter: `can()` climbs project→org, so org-level `search:read` already
  implies them. The per-team loop costs one grant read in total because
  `can()` memoizes a user's grants per request.
- **Next**: M30-T03
