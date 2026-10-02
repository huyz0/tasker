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

## M30-T03 — Terminal tasks are not claimable work

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/tasks/{taskActivity,tasks.handler}.ts`,
  `tasks.test.ts`, `packages/shared-contract/main.tsp` (comments only)
- **Verified**: `bun test src/modules/tasks` — 109 pass; the new test failed
  first (a done task came back from `assigneeFilter="unassigned"`).
- **Notes**: "Terminal" is `isTerminalStatus`'s rule, not a literal `"done"`:
  a typed task is terminal at its type's highest-position status, so the test
  pins a type where `done` is a *middle* status and stays claimable.
  `terminalStatusSql` is that rule as a SQL predicate, so the list filter and
  its `totalCount` stay in the database. The claim checks before its atomic
  insert rather than inside it — a task finishing at the same instant it is
  claimed is benign, and the caller needs to be told *why* it lost.
  Not done here, deliberately: agent self-release and claim leases — new API,
  owned by M33.
- **Next**: M30-T04

## M30-T04 — The stalled sweep alerts once across replicas

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/lib/{stalledClaimAlerts,stalledClaims}.ts`,
  `stalledClaimAlerts.test.ts`
- **Verified**: `bun test src/lib/stalledClaims.test.ts
  src/lib/stalledClaimAlerts.test.ts src/modules/reports` — 76 pass. The new
  two-concurrent-sweeps test failed first: 2 digests sent.
- **Notes**: The dedup insert is now the claim — only the replica whose
  insert wins delivers, and recipient resolution runs only for winners. A
  failed insert of *any* kind now skips the candidate; before, it was logged
  and alerted anyway, which with no record meant re-alerting every hour. The
  held-task query filters terminal tasks in SQL (`terminalStatusSql`, from
  T03), so a finished task's activity history is no longer joined and grouped
  hourly only to be discarded in memory; the in-memory per-type terminality
  pass is gone.
- **Next**: M30-T05

## M30-T05 — Indexes for the task list and the retention sweep

- **Status**: dropped
- **Date**: 2026-10-02
- **Notes**: The review finding behind this task was wrong, and it is worth
  recording why so the next review does not re-raise it. `schema.*.ts`
  declares only `tasks_project_id_idx` and `tasks_task_type_id_idx`, but
  M07-T09 added `tasks_project_created_idx` and
  `tasks_project_status_created_idx` as raw-SQL migrations
  (`drizzle-sqlite/0027_hot_query_indexes.sql`), and `indexCoverage.test.ts`
  already gates that the task list and a board column neither scan nor sort.
  They are SQLite-only on purpose: on MySQL 8.0.46 at 20,000 rows the
  optimiser kept its filesort even with the index forced. A schema file is
  not the whole index set — read the migrations too.
  A `deleted_at` index for the retention sweep was the other half; T07 makes
  that sweep read ids only, and an hourly scan of a narrow projection does
  not justify a write-path index on six tables.
- **Next**: M30-T06
