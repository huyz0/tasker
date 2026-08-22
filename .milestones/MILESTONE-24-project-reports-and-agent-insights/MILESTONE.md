---
id: M24
title: Project Reports & Agent Insights
status: in-progress
goal: A manager overseeing a project of AI agents can open one project-scoped Reports screen and see where work is stuck, which agents need attention, and how work is flowing over time — every panel answering a concrete intervention decision from real recorded history, in Jira's project-report role but built for an agent fleet.
depends_on: []
surfaces: [backend, gui, contract, specs]
exit_criteria_met: false
started_at: 2026-08-22
completed_at: null
---

# M24 — Project Reports & Agent Insights

## 1. Goal

Tasker's Dashboard answers "what needs ME right now". Nothing answers the
project-level monitoring question the product's own mission assigns to humans
on the loop: **how is work performed in this project, and are the agents
carrying it?** This milestone ships `/reports` — one project-scoped screen,
ordered by urgency: stalled work a human should free today, work that went
backwards after an agent completed it, tasks churning between agents, a
per-agent/per-role trust scorecard, and three honest time-series charts
(autonomy & rework, created vs completed, cumulative flow) powered by a new
first-class `task_activity` history table — the substrate the audit log
cannot provide (no project scoping, projector-clock timestamps, absent
entirely in the standalone binary).

Designed against the repo's own anti-vanity bar: every panel names the
decision it feeds, exception lists lead trend charts (agents fail discretely,
not gradually), and no invented history — time-series charts label their
collection-start date instead of drawing a false past.

## 2. Why Now

Requested directly by the user via `/goal` ("add chart/diagram for a specific
project on how things are performed in that project, a bit similar to Jira's
project-level reports … especially provide views on agents aspect"), with the
chart set and data design reviewed by three independent subagent lenses
(product value, agents dimension, technical feasibility) before planning —
their reports are preserved in the spec folder (M24-T01). Every numbered
milestone in the ledger is `done`, CI is green, and the working tree is
clean; no dependency edge exists. Sequenced by explicit user priority, the
same way M21–M23 were.

The design decisions and their arguments live in the spec
(`.specs/specs/2026-08-22-*-project-reports-and-agent-insights/`) and two
ADRs: ADR-0020 (task activity substrate) and ADR-0021 (hand-rolled SVG chart
kit). Headline choices: exception lists over trend charts; trust over volume
(scorecard sorted by worst reopen rate, not a completions leaderboard); one
page, no tabs; `task_activity` written synchronously in handlers (works in
standalone mode, unlike anything NATS-derived); truthful backfill (each
existing task's *current* status becomes its day-0 baseline row — no invented
transitions); terminality stamped at write time so mutable status config
cannot rewrite history; assignee-at-event columns because `task_assignments`
keeps no history and attribution is otherwise unrecoverable.

## 3. Exit Criteria

- [ ] From a seeded project, `/reports` renders all seven panels with real
      data: stalled work (claimed-and-silent with per-row Unassign, and
      oldest-unclaimed), went-backwards regressions, churning tasks (≥2
      handoffs, claim-still-held flag), fleet scorecard (agent⇄role toggle,
      reopen/handoff/taken-away/autonomy columns, agent-share header stat),
      autonomy & rework trend, created vs completed (cumulative), and CFD
      (per-task-type selector) — verified by a Playwright e2e test that
      drives real RPCs, not mocks.
- [ ] Clicking Unassign on a stalled claim frees the task (the row leaves the
      list; the task becomes claimable) — covered by a feature test against
      the real `unassignTask` wire call via MSW, and exercised in e2e.
- [ ] A task creation, status change, claim, assignment, unassignment,
      archive/restore, note, comment and handoff each produce exactly one
      correct `task_activity` row (correct kind, from/to status, terminality
      flags, actor, assignee-at-event), and a replayed idempotent
      `claimTask` does not double-count — proven by backend tests including
      a race/replay test.
- [ ] Purging a task, a project, and the retention sweep leave zero orphaned
      `task_activity` rows — proven by cascade tests.
- [ ] The backfill migration gives every pre-existing non-archived task
      exactly one `created` activity row carrying its current status
      (soft-deleted tasks excluded — no unpaired `+1` in the CFD algebra),
      plus one activity row per pre-existing task note, handoff and
      task-scoped comment at its real timestamp, in both dialects,
      idempotently (re-running it inserts nothing) — proven by migration
      tests against SQLite and live MySQL.
- [ ] Both report RPCs refuse agent principals structurally
      (`agent-scope-sweep` and `viewer-denial` suites pass with the new
      handler registered) and enforce `dashboard:read` cross-tenant.
- [ ] `bun run seed -- --scale large && bun run measure:latency` shows both
      report RPCs inside their named 300 ms p95 budget rows in
      `api-standard.md` §6, with `task_activity` seeded at scale.
- [ ] The CFD balances: for a task history replayed through the handlers, the
      chart's final-day stack equals the project's live per-status counts,
      and archived tasks leave the stack — proven by a backend test on the
      daily-delta + prefix-sum series.
- [ ] `moon check --all` clean; `gui:storybook-test` clean (0 axe violations,
      no 375 px overflow) including the new chart and card stories in both
      themes; `gui:design-lint` passes with chart colors as `--chart-*`
      tokens only.
- [ ] `moon run :spec-drift` and `moon run tasker:docs-lint` pass:
      NAVIGATION.md shows the Reports route, roadmap names M24, and no
      dependency was added (charts are hand-rolled — ADR-0021).

## 4. Scope

**In Scope**: `task_activity` table (both dialects) + backfill + purge/
retention integration; activity writes in task, task-note and comment
handlers; `ReportService` with `getReportExceptions` and `getReportTrends`
(contract-first, humans-only, `dashboard:read`); dialect-split UTC date
bucketing helper; a two-component SVG chart kit (`LineChart`,
`StackedAreaChart`) with `--chart-1..6` tokens, sr-only data tables and
hover/focus readout; `features/Reports/` screen with seven cards, window
selector (7/30/90d), nav entry, Dashboard cross-link, live invalidation via
`eventQueryKeys`; e2e coverage; spec + ADR-0020 + ADR-0021.

**Out of Scope** (recorded, each with its owner): `task_reviewers` outcome
column and review-queue latency (highest-value adjacent work — needs its own
design round; future milestone); claim-latency percentile trends,
handoffs-per-day series, per-agent cycle-time distributions, activity
heatmaps, org-level cross-project rollups (v2 of this surface, on demand);
claim-contention counting (telemetry counter territory — deliberately never a
`task_activity` kind, per ADR-0020); token-expiry alerts (belongs on the
Agents screen); any Dashboard chart or count tile (the Dashboard's own design
note forbids it); any CLI surface for reports (on demand later — the CLI's
users are agents, and reports are the humans-only monitoring surface).

## 5. Task Breakdown

- [x] **M24-T01** — Save the design record: spec folder (problem, the three
      subagent review reports, the agreed panel set with per-panel decision
      statements, data-model rationale), ADR-0020 (task-activity substrate:
      synchronous first-class table over audit_log; terminality stamped at
      write; assignee-at-event denormalized; agent_role joined not
      denormalized; note/comment/handoff kinds included; no claim_rejected
      kind ever; non-transactional accepted drift; purge semantics; truthful
      backfill), ADR-0021 (hand-rolled SVG chart kit over recharts), this
      MILESTONE.md + PROGRESS.md.
      - Files: `.specs/specs/2026-08-22-*-project-reports-and-agent-insights/*`,
        `.specs/adr/ADR-0020-*.md`, `.specs/adr/ADR-0021-*.md`,
        `.milestones/MILESTONE-24-project-reports-and-agent-insights/*`
      - Verify: all named files exist; `moon run tasker:docs-lint` passes.

- [x] **M24-T02** — Contract: `ReportService` in `main.tsp` **and**
      `tasker/health/v1/health.proto` (kept in sync by hand), two methods —
      `getReportExceptions(projectId, windowDays)` returning stalled
      (claimed-silent split never-started/went-quiet + oldest-unclaimed,
      server-capped top-N), regressions, churn rows, scorecard rows (agent
      and role rollups), agent-share stat; `getReportTrends(projectId,
      windowDays)` returning autonomy/rework series, created-vs-completed
      cumulative series, CFD series + task-type options, collection-start
      date. One request/response message per method, permanent field numbers,
      no PageRequest (aggregates, server-capped).
      - Files: `packages/shared-contract/main.tsp`,
        `packages/shared-contract/tasker/health/v1/health.proto`,
        regenerated `gen/`
      - Verify: `moon run shared-contract:compile` clean; buf breaking-change
        gate passes; `contract.roundtrip.test.ts` auto-covers the new
        messages; `moon run gui:rpc-coverage` deferred note (RPCs wired at
        T08/T09 — add temporary EXCEPTIONS entries with a reason if the gate
        runs before then, removed in T09).

- [x] **M24-T03** — Schema: `task_activity` in `schema.sqlite.ts` +
      `schema.mysql.ts` (id, task_id FK, project_id FK, kind, from_status,
      to_status, from_is_terminal, to_is_terminal, actor_type, actor_id — no
      FK, assignee_agent_id, assignee_user_id, occurred_at; indexes
      `(project_id, kind, occurred_at)` and `(task_id, occurred_at)`);
      per-dialect migrations + truthful backfill (deterministic
      `act-`-derived ids → idempotent; `created` rows for non-archived
      tasks only, `to_status = tasks.status`, `occurred_at =
      tasks.created_at`, actor_type `system`, terminality stamped from
      current config, assignee columns NULL; plus `note`/`handoff`/`comment`
      rows carried over from `task_notes` and task-scoped `comments` at
      their real timestamps; sqlite `||` vs mysql `CONCAT`); regenerate
      embedded migrations; add report query shapes to
      `indexCoverage.test.ts` HOT_QUERIES.
      - Files: `apps/backend/src/db/schema.sqlite.ts`, `schema.mysql.ts`,
        `drizzle-sqlite/00NN_task_activity.sql`,
        `drizzle-mysql/00NN_task_activity.sql`,
        `src/db/embeddedMigrations.generated.ts`,
        `src/db/indexCoverage.test.ts`
      - Verify: `moon run backend:test` (embeddedMigrations + indexCoverage
        + migration/backfill tests, incl. idempotent re-run); backfill
        verified against live MySQL via `docker compose`.

- [x] **M24-T04** — Activity writes: a small `recordTaskActivity` helper
      (stamps terminality from the task type's status positions at write
      time; resolves assignee-at-event; fires only after the primary write's
      success/CAS check — accepted non-transactional drift per ADR-0020)
      called from `createTask` (agent creations finally attributable; its
      whole body is already a `withIdempotency` callback — the write stays
      inside it), `updateTaskStatus` (after the `affected` CAS check — the
      single status choke point), `claimTask` (inside the `withIdempotency`
      callback, after the claim-won check), `assignTask` (not on the duplicate no-op path),
      `unassignTask` (handler must first capture affected rows),
      `deleteTask` → `archived` / `restoreTask` → `restored`, task-note
      create (`note`/`handoff`), comment create on tasks (`comment`).
      Purge integration: explicit deletes in `purgeTask`, `purgeTaskCascade`,
      `purgeProjectCascade`.
      - Files: `apps/backend/src/modules/tasks/tasks.handler.ts`,
        `task_notes.handler.ts`, `modules/comments/comments.handler.ts`,
        `src/lib/cascadePurge.ts`, new `src/modules/tasks/taskActivity.ts`
      - Verify: `moon run backend:test` — per-site row-correctness tests,
        claim replay does not double-count, lost claim race writes nothing,
        unassign of nothing writes nothing, purge cascade leaves zero rows.

- [x] **M24-T05** — Exceptions report handler: `getReportExceptions` —
      stalled-claims query (last signal per task from the one activity table,
      id tiebreak on equal seconds; joined with `api_tokens.lastUsedAt`
      per-agent liveness; split never-started vs went-quiet), oldest
      unclaimed, regressions (`from_is_terminal AND NOT to_is_terminal`),
      churn (`GROUP BY task_id HAVING count(handoff) >= 2` + claim-held
      join), scorecard aggregation (per-agent and per-role; "(deleted
      agent)" fallback; autonomy = agent-held completions with zero
      user-actor rows; columns: claimed, completed, reopened, handed off,
      taken away, % autonomous, open now, last active — no cycle-time
      column, cut with the other cycle-time metrics),
      agent-share stat (window vs prior window). `requireUser` +
      `assertCan(dashboard:read)` through `projects.orgId`; registered in
      `index.ts`, `agent-scope-sweep.test.ts` (handlers + REQUESTS) and
      `viewer-denial.test.ts`.
      - Files: `apps/backend/src/modules/reports/reports.handler.ts` (+
        `.test.ts`), `src/index.ts`, `src/lib/agent-scope-sweep.test.ts`,
        `src/lib/viewer-denial.test.ts`
      - Verify: `moon run backend:test` — TDD suite covering every panel's
        rows against handler-driven fixtures, cross-tenant denial, agent
        denial.

- [ ] **M24-T06** — Trends report handler + measurement: shared
      dialect-split UTC date-bucket helper (`strftime(..., 'unixepoch')` vs
      `DATE_FORMAT`, unit-tested on both shapes); CFD as one SQL daily-delta
      pass over full project history (+1 `to_status` / −1 `from_status`,
      GROUP BY day+status) + JS prefix-sum, task-type scoping; created vs
      completed cumulative series clipped to collection start; autonomy &
      rework series; collection-start date in the response. Seed
      `task_activity` in `scripts/seed.ts` (seed bypasses handlers); add
      both RPCs to `measure-latency.ts`; add named 300 ms budget rows to
      `api-standard.md` §6.
      - Files: `apps/backend/src/modules/reports/reports.handler.ts` (+
        `.test.ts`), new `src/modules/reports/dateBucket.ts`,
        `apps/backend/scripts/seed.ts`,
        `apps/backend/scripts/measure-latency.ts`,
        `.specs/standards/api-standard.md`
      - Verify: `moon run backend:test` (CFD balance test: replayed history's
        final stack == live per-status counts; archived tasks leave the
        stack); `bun run seed -- --scale large && bun run measure:latency`
        inside budget.

- [ ] **M24-T07** — Chart kit: `apps/gui/src/components/charts/` —
      `LineChart.tsx` (multi-series, cumulative-friendly),
      `StackedAreaChart.tsx`, pure helpers `scale.ts` (domains, nice ticks,
      degenerate single-point/empty cases), shared `ChartShell` (role="img"
      + aria-label, sr-only data table as the queryable truth, hover/focus
      readout line, explicit viewBox, `overflow-x-auto` wrapper, legend =
      swatch + text label); `--chart-1..6` tokens in `index.css` for both
      themes (no `-foreground` pairs — chart colors never carry text,
      decided in ADR-0021). Stories for every state (empty, sparse,
      populated, dark).
      - Files: `apps/gui/src/components/charts/*` (+ `.test.tsx` +
        `.stories.tsx`), `apps/gui/src/index.css`
      - Verify: `moon run gui:test` (95% gate holds — pure helpers fully
        covered), `gui:design-lint`, `gui:lint`, `gui:typecheck`.

- [ ] **M24-T08** — Reports screen, exception cards: `features/Reports/`
      (decomposed well under the 400-line cap: `index.tsx` composition +
      one file per card + `useReportQueries.ts`), route + `React.lazy` in
      `App.tsx`, nav entry (Workspace group, `BarChart3` icon), org/project
      guards (Handoffs convention), `ListState` on every query
      (query-error-coverage), cards 1–4: stalled work (Unassign mutation →
      invalidation + optimistic row handling), went backwards, churning
      tasks (Handoffs cross-link), fleet scorecard (agent⇄role toggle,
      header stat). Feature tests via `mockRpc`; stories for every card
      state; `int64`-as-string decode handled via `Number(...)`.
      - Files: `apps/gui/src/features/Reports/*`, `apps/gui/src/App.tsx`,
        `src/components/layout/AppShell.tsx`
      - Verify: `moon run gui:test` + `gui:query-error-coverage` +
        `gui:design-lint`; App.test.tsx route coverage extended.

- [ ] **M24-T09** — Reports screen, trend cards + wiring: cards 5–7 on the
      chart kit (autonomy & rework, created vs completed with
      recent-completions strip, CFD with task-type selector), window
      selector (7/30/90d) driving both queries, honest sparse-history
      labels ("History collected since <date>"), `['reports']` root in
      `eventQueryKeys.ts` under task/tasknote/comment (+ test), Dashboard
      "View project reports" cross-link, remove any temporary rpc-coverage
      EXCEPTIONS entries.
      - Files: `apps/gui/src/features/Reports/*`,
        `src/lib/eventQueryKeys.ts` (+ `.test.ts`),
        `src/pages/Dashboard.tsx`
      - Verify: `moon run gui:test`; `moon run gui:rpc-coverage` passes with
        no Reports exceptions.

- [ ] **M24-T10** — E2E + closeout: `tests/e2e/reports.spec.ts` (seeded org
      via `selectSeededOrg.ts`; drive a real claim + note + status change
      through the backend, assert the panels reflect it, exercise Unassign
      end-to-end, assert both RPCs are actually reached); update
      `NAVIGATION.md` + roadmap; full verification suite; re-verify every
      exit criterion; close the milestone.
      - Files: `apps/gui/tests/e2e/reports.spec.ts`,
        `.specs/design/NAVIGATION.md`, `.specs/product/roadmap.md`,
        `.milestones/*`
      - Verify: `moon check --all` clean; `moon run gui:e2e` clean;
        `moon run gui:storybook-test` clean; exit criteria all checked.

## 6. Verification

```bash
moon check --all
moon run gui:e2e
moon run gui:storybook-test
cd apps/backend && bun run seed -- --scale large && bun run measure:latency
```

## 7. Risks

- **Write-site coverage.** Miss one activity write site and every derived
  chart silently drifts from reality — worse than no chart. Mitigation: T04's
  per-site tests plus the T06 CFD balance test (replayed history must equal
  live counts), which catches any missed or double write structurally.
- **Non-transactional drift.** The activity insert can fail after the primary
  write succeeds. Accepted and bounded (same code path, ordered after the
  success check) per ADR-0020; the balance test also detects systematic loss.
  Rollback position: the table is additive — dropping the writes degrades
  charts, never task correctness.
- **First dialect-split date SQL in the repo.** SQLite integer-seconds
  (`'unixepoch'`) vs MySQL datetime is a silent-wrongness hazard; mitigated
  by a dedicated helper with unit tests on both shapes and the live-MySQL
  migration check at T03.
- **Chart kit scope creep.** Hand-rolled SVG stays cheap only while it is two
  components with minimal interactivity (hover/focus readout, no zoom/brush/
  animation). Anything more reopens the ADR-0021 library question rather
  than growing bespoke code.
- **Empty-screen first impression.** History-dependent charts are sparse for
  ~2 weeks after deploy. Mitigated by design: the backfill carries real
  existing history over (task creations, notes, handoffs, comments), so the
  stalled-work and churn cards are truthful on day one and the scorecard is
  partially populated (open now, last active, handoffs; reopen/autonomy
  accrue with new activity); sparse charts label their collection-start
  date instead of looking broken.
