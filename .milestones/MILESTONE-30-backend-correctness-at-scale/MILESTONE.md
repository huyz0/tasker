---
id: M30
title: Backend Correctness at Scale
status: in-progress
goal: Every report and dashboard read works on MySQL, nothing a caller cannot read leaks through search, a claim means what the agent API says it means, and the hot paths an agent fleet hits on every call stop scaling with the size of the fleet or the history.
depends_on: []
surfaces: [backend, specs]
exit_criteria_met: false
started_at: 2026-10-02
completed_at: null
---

# M30 — Backend Correctness at Scale

## 1. Goal

The dashboard and the three project-report RPCs return correct timestamps on
both dialects. Universal search returns a team-scoped belief only to a caller
who could open it with `GetBelief`. A done task cannot be claimed, and the
agent's "find unassigned work" filter does not offer one. Running two backend
replicas does not send the same stalled-claim alert twice. The task list query,
the retention sweep, agent-token bookkeeping and the live event feed each do
work bounded by the request, not by the size of the table, the history or the
fleet.

## 2. Why Now

A deep review on 2026-10-02 (three parallel read-only reviews of backend, GUI
and CLI, findings re-verified in code before planning) found these as live
defects. Two are production-severity on the MySQL deployment the architecture
names as primary:

1. `dashboard.handler.ts:210`, `reports/trends.ts:90`, `reports/exceptions.ts:116,277`
   and `reports/scorecard.ts:139` decode raw `MAX`/`MIN` aggregates as SQLite
   epoch seconds. drizzle's mysql2 driver returns them as
   `"YYYY-MM-DD HH:MM:SS"` strings — `lib/stalledClaims.ts:35-88` documents
   this and decodes correctly, the reports never got the fix. `Number("2026-…")`
   is `NaN`, `toISOString()` on it throws: **GetDashboard fails on MySQL once
   any agent token has been used, GetReportTrends fails for any project with
   activity.** SQLite tests cannot see it.
2. `search.handler.ts` returns every active belief in the org to any caller
   with org-level `search:read`, while `GetBelief` authorizes on the belief's
   own scope and `can()` does not climb from team to org. An org viewer not on
   team T reads T's beliefs through search.

The rest are scale defects against the mission's declared 20K agents: one
`UPDATE api_tokens` per authenticated agent call, a NATS firehose subscription
and an unbounded queue per event-feed client, and a `tasks` table with no index
for the list query every board load and agent poll runs.

## 3. Exit Criteria

- [x] A raw MySQL aggregate string (`"2026-08-22 14:08:50"`) fed through the
  dashboard and every report decode path yields the right UTC instant — pinned
  by unit tests that exercise the mysql branch, not only sqlite. (Every site
  now goes through `decodeSqlTimestamp`; a structural test forbids a raw
  timestamp aggregate typed as a number.)
- [ ] `UniversalSearch` by an org member who holds no grant on team T returns
  none of T's beliefs; a member of T still finds them.
- [ ] `ClaimTask` on a task in a terminal status fails with
  `FailedPrecondition`, and `ListTasks(assigneeFilter="unassigned")` excludes
  terminal tasks.
- [ ] A stalled-claim candidate whose dedup row already exists (another
  replica alerted it) is neither published, notified nor emailed.
- [ ] `tasks` carries an index serving `project_id + deleted_at` ordered by
  `created_at, id`, on both dialects, with `indexCoverage.test.ts` green.
- [ ] An agent token used N times within a minute is written at most once.
- [ ] One slow event-feed client holds a bounded queue; the oldest events are
  dropped and counted, never unbounded growth.
- [ ] `moon run backend:typecheck backend:test` green, and CI green on `main`.

## 4. Scope

**In scope:** the defects listed in §2 and the task breakdown below.

**Out of scope:**

- Atomic claim-next, agent self-release and a cross-project "my work" list —
  new agent-facing API, owned by **M33**.
- Per-org NATS subject partitioning — changes the publish side and every
  consumer; this milestone bounds the per-client cost without changing subjects.
- A MySQL service in CI — the decode paths are pinned with driver-shaped
  strings, the way M25-T06 pinned `stalledClaims`.

## 5. Task Breakdown

- [x] **M30-T01** — One dialect-aware aggregate decoder serves the dashboard and every report.
  - **Files**: `apps/backend/src/lib/sqlTime.ts` (new), `lib/stalledClaims.ts`,
    `modules/reports/{common,trends,exceptions,scorecard}.ts`,
    `modules/dashboard/dashboard.handler.ts`
  - **Verify**: new `sqlTime.test.ts`; report/dashboard tests with a mysql-shaped value.
- [ ] **M30-T02** — Universal search filters beliefs to scopes the caller can read.
  - **Files**: `modules/search/search.handler.ts`
  - **Verify**: search test with a team-scoped belief and a non-member caller.
- [ ] **M30-T03** — Terminal tasks are not claimable and not offered as unassigned work.
  - **Files**: `modules/tasks/tasks.handler.ts`
  - **Verify**: tasks handler tests.
- [ ] **M30-T04** — The stalled-claim sweep skips candidates another replica already recorded.
  - **Files**: `lib/stalledClaimAlerts.ts`
  - **Verify**: `stalledClaimAlerts.test.ts` dedup-conflict case.
- [ ] **M30-T05** — Indexes for the task list and the retention sweep, both dialects.
  - **Files**: `db/schema.{mysql,sqlite}.ts`, new migrations, `db/embeddedMigrations.generated.ts`
  - **Verify**: `indexCoverage.test.ts`, migration tests.
- [ ] **M30-T06** — Agent token `lastUsedAt` is written at most once a minute per token.
  - **Files**: `lib/agentToken.ts`, `lib/authenticate.ts`
  - **Verify**: `agentToken.test.ts`.
- [ ] **M30-T07** — The retention sweep reads ids only, never artifact content.
  - **Files**: `lib/retentionSweep.ts`
  - **Verify**: `retentionSweep.test.ts`.
- [ ] **M30-T08** — Event-feed clients share one NATS subscription and hold a bounded, drop-oldest queue.
  - **Files**: `modules/events/events.handler.ts`
  - **Verify**: events handler tests.
- [ ] **M30-T09** — Idempotency keys bind to their request; `purgeTask` is atomic; dashboard open-task counts are one terminal-aware query.
  - **Files**: `lib/idempotency.ts`, `modules/tasks/tasks.handler.ts`, `modules/dashboard/dashboard.handler.ts`
  - **Verify**: respective tests.
- [ ] **M30-T10** — Documentation and close.
  - **Files**: `.specs/product/architecture.md`, `.milestones/STATE.md`
  - **Verify**: `moon run :doc-drift :spec-drift`.

## 6. Verification

```
moon run backend:typecheck backend:test backend:lint
moon run :knip :doc-drift :spec-drift
```

## 7. Risks

- **New indexes on a large MySQL `tasks` table** lock briefly during migration
  on older MySQL; MySQL 8 builds them online. Rollback is dropping the index.
- **Bounded event queues drop events** for a client too slow to read them. That
  is the documented contract ("would rather drop than block"); clients already
  reconcile through `resumeFrom`.
- **Stricter claim semantics** reject a claim on a done task that used to
  succeed. No documented flow relies on it.
