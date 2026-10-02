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

## M30-T06 — Agent token bookkeeping writes at most once a minute

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/lib/agentToken.ts`, `agentToken.test.ts`
- **Verified**: `bun test` — 1850 pass, 0 fail; the throttle test failed first
  (5 writes for 5 calls).
- **Notes**: Per-process, in memory: N replicas write at most N times a
  minute per token, which is the bound that matters. A clock that steps
  backwards writes rather than suppressing. The map clears at 50,000 tokens
  instead of tracking LRU order — clearing costs one extra write per token,
  an LRU costs bookkeeping on every call. `authenticate.ts` is unchanged; the
  throttle lives where the write does.
- **Next**: M30-T07

## M30-T07 — The retention sweep reads ids, not rows

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/lib/retentionSweep.ts`, `retentionSweep.test.ts`
- **Verified**: `bun test src/lib/retentionSweep.test.ts src/lib/cascadePurge.test.ts`
  — 16 pass; the new "projects columns on every read" test failed first.
- **Notes**: Every read now projects the two or three columns it uses, so the
  hourly scan of binned artifacts no longer holds their base64 content in
  memory. A project's org and an org's retention period are memoized for the
  length of one sweep (`sweepLookups`) instead of re-queried per row. The
  per-row `catch {}` blocks that silently ate *every* error — they were
  written to absorb "parent already purged", which is now an explicit `null`
  from the lookup — log what they catch, so a real failure is visible.
- **Next**: M30-T08

## M30-T08 — One broker subscription, bounded client queues

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/events/events.handler.ts`,
  `events.handler.test.ts`
- **Verified**: `bun test src/modules/events` — 47 pass; the shared-subscription
  and bounded-queue tests failed first (a second `nc.subscribe`, and all ten
  events held for a client that never read).
- **Notes**: A hub owns the single `domain.>` subscription — opened with the
  first client, closed with the last — decodes each message once and offers
  the envelope to every listener. A listener pre-filters synchronously with
  `shouldDeliver` against its scope, so another org's traffic never occupies
  its queue; membership events always pass, because the generator re-resolves
  scope from them before its own (authoritative) `shouldDeliver`. The queue
  holds 1,000 and drops the oldest; a client that fell behind is logged with
  its drop count when it disconnects. Ordering per client is preserved: the
  only `await` is in the client's own generator. Per-org NATS subjects would
  also remove the decode-and-offer work per process, but they change every
  publisher and the audit projector — out of scope, recorded in §4.
- **Next**: M30-T09

## M30-T09 — Idempotency bound to its request; one purge cascade; dashboard by terminal status

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/lib/idempotency.ts` (+ new test),
  `drizzle-sqlite/0050_idempotency_request_hash.sql`,
  `drizzle-mysql/0037_idempotency_request_hash.sql`, both journals,
  `db/schema.{sqlite,mysql}.ts`, `db/embeddedMigrations.generated.ts`,
  `src/index.ts`, `modules/tasks/tasks.handler.ts`,
  `modules/dashboard/dashboard.handler.ts`, their tests
- **Verified**: `bun test` — 1859 pass, 0 fail. Each new test failed first.
- **Notes**:
  - **Idempotency.** A key now stores a sha256 of its request (keys sorted
    at every depth, the key itself excluded); reusing it with a different
    request is `InvalidArgument` and does not run, instead of replaying an
    unrelated response. Rows stored before have no hash and keep replaying.
    Keys expire after 24h, deleted hourly beside the retention sweep, through
    a new `created_at` index. Migrations are hand-written with journal
    entries, as 0048/0049 were — the drizzle snapshots stop at 0047, so
    `drizzle-kit generate` would re-emit two migrations.
  - **purgeTask** carried its own copy of the task cascade, and it had
    drifted: M25's `stalled_claim_alerts` was added to `purgeTaskCascade`
    only, so purging a task from the Bin orphaned its alert rows. It now
    calls the shared cascade — in a transaction on MySQL; on SQLite (whose
    drizzle transactions must be synchronous) it relies on the cascade being
    idempotent with the task row deleted last, so a failed purge is retried,
    not half-applied and lost.
  - **Dashboard.** Held-work counts are one grouped query instead of one per
    agent. Held work, the review queue, and "claimed done, PR still open" all
    used the literal `"done"`, which is wrong for any custom pipeline — a
    reviewer's queue never drained on a type ending in "shipped". All three
    use `terminalStatusSql` now.
- **Next**: M30-T10

## M30-T10 — Documentation and close

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `docs/agent-integration.md` (new §11 — claiming work and
  retrying safely; `last used` precision), `.specs/product/architecture.md`
  (event feed fan-out)
- **Verified**: `moon run :knip :doc-drift :spec-drift :docs-lint
  :skills-check backend:typecheck backend:build-standalone` green;
  `scripts/smoke-standalone.sh` ok (the binary applies migration 0050 to a
  fresh database); `bun test` 1859 pass.
- **Notes**: `docs/quickstart.md` has said "idempotency … are in
  agent-integration.md" since M14, and they were not — §11 is the first place
  they are documented at all.

## Milestone closed

- **Date**: 2026-10-02
- **Exit criteria**: 8/8. The task-index criterion is met by M07-T09's
  existing SQLite composites, with the MySQL decision unchanged (T05).
- **Found on the way, beyond the review**: `purgeTask`'s drifted copy of the
  cascade (orphaned alert rows); the review queue and "claimed done" panel
  keyed on the literal `"done"`; the missing idempotency documentation.
- **Not done, deliberately**: per-org NATS subjects; a MySQL service in CI;
  claim-next, self-release and claim leases (M33).
