# M24 — Progress Journal

Append-only. Newest entry at the bottom. One entry per task attempt.

## M24-T01 — Save the design record (spec, ADR-0020, ADR-0021)

- **Status**: done
- **Date**: 2026-08-22
- **Changed**: `.specs/specs/2026-08-22-2100-project-reports-and-agent-insights/`
  (shape.md, references.md, plan.md, standards.md), `.specs/adr/ADR-0020-*.md`,
  `.specs/adr/ADR-0021-*.md`, this milestone's MILESTONE.md refinements,
  STATE.md.
- **Verified**: all files exist; `moon run tasker:docs-lint` clean (247
  files). A docs-consistency review subagent additionally spot-checked the
  load-bearing code claims (all four verified true against the handlers/
  schema) and returned APPROVED with fixes — all six FIX findings applied
  before this commit: (1) backfill now excludes soft-deleted tasks (an
  unpaired `+1` would sit in the CFD stack forever — the exact bug the
  `archived` kind prevents); (2) day-one-value claim made honest by
  carrying existing task_notes/comments history into the backfill; (3) the
  scorecard's "median cycle" column cut — it contradicted the deliberate
  cycle-time cut; (4) the authoritative `kind` vocabulary written into
  ADR-0020; (5) archived/restored row semantics (`from`/`to` NULL sides)
  specified for the CFD algebra; (6) T01's verify line corrected (no "ADR
  README index" exists to update).
- **Notes**: The three design-review subagent verdicts are preserved in
  references.md — they changed the feature materially (exception lists
  lead, trust-over-volume scorecard, no tabs, richer activity schema).
  Skipped a separate test plan: docs-only task, nothing executable.
- **Next**: M24-T02 (contract).

## M24-T02 — Contract: ReportService (getReportExceptions, getReportTrends)

- **Status**: done
- **Date**: 2026-08-22
- **Approach**: Add the service + messages to `main.tsp` and mirror them by
  hand into `health.proto` (buf generates from the proto; the two are kept
  in sync manually), matching the Dashboard service's documented style.
  Counts over precomputed percentages where possible; daily-rate points
  carry `sampleSize` so the UI can dim sparse days; the trends response
  names the collection-start date and which task type the CFD was scoped
  to. Regenerate and let the descriptor-enumerated round-trip suite pick
  the new messages up.
- **Changed**: `packages/shared-contract/main.tsp` (+180),
  `tasker/health/v1/health.proto` (+158, hand-mirrored), regenerated
  `gen/ts` + `apps/cli/gen`, `apps/gui/scripts/rpc-coverage.mjs` (two
  temporary EXCEPTIONS entries, removed in T09).
- **Verified**: `moon run shared-contract:compile` clean; round-trip suite
  840 pass (descriptor-enumerated, new messages picked up automatically);
  `moon run gui:typecheck` + `apps/cli` `go build ./...` both clean (both
  consumers compile against the generated code); `gui:rpc-coverage` red
  without the exceptions, green with (proving the gate sees the new RPCs).
- **Notes**: proto uses proto3 `optional` for optional fields (matching
  PingResponse/User precedent — presence is meaningful); exception reason
  text expanded past the gate's own 40-char minimum. Implemented via a
  delegated subagent from a fully-pinned message spec; diff reviewed
  before commit.
- **Next**: M24-T03 (task_activity schema + migrations + backfill).

## M24-T03 — task_activity schema, migrations, truthful backfill

- **Status**: done
- **Date**: 2026-08-22
- **Approach**: Add the table to both hand-maintained schema modules
  exactly as ADR-0020 specifies, generate per-dialect migrations, append
  the hand-written idempotent backfill (created rows for non-archived
  tasks carrying current status; note/handoff/comment rows carried over
  from task_notes and task-scoped comments), regenerate embedded
  migrations, register the report query shapes in indexCoverage, verify
  against live MySQL via docker compose.
- **Changed**: `schema.sqlite.ts`/`schema.mysql.ts` (taskActivity table),
  `drizzle-sqlite/0045+0046`, `drizzle-mysql/0032+0033` (DDL + hand-written
  idempotent backfill), regenerated `embeddedMigrations.generated.ts` (47/34),
  new `taskActivity.migration.test.ts` (10 tests proving the shipped SQL:
  per-case terminality incl. max-position ties, soft-deleted exclusion,
  note/handoff/comment carry-over, double-run idempotency), 2 new
  indexCoverage HOT_QUERIES (covering-index plans confirmed).
- **Verified**: `moon check backend` green (9 tasks; backend:test 1689 pass);
  live MySQL via docker compose — all 34 migrations applied to a fresh db,
  `SHOW CREATE TABLE` confirmed, backfill executed twice with fixture data
  (10 rows, second run inserted nothing).
- **Notes**: drizzle-kit's snapshots had been stale since 0023 — every later
  migration was hand-written — so generated output was trimmed to the new
  DDL and the fresh snapshots keep future generates honest. Journal `when`
  values hand-bumped (drizzle stamped a value BELOW the previous rounded
  entries, which `applyEmbeddedMigrations` would silently never apply); a
  test now asserts the backfill is the max-`when` migration. **Pre-existing
  latent bug found, not fixed (out of scope)**: `0044_audit_log`(sqlite)/
  `0031_audit_log`(mysql) carry raw `when` values smaller than 0041–0043's —
  a db already past 0043 before audit_log landed would never apply them.
- **Next**: M24-T04 (activity writes in handlers + purge cascades).

## M24-T04 — Activity writes in handlers + purge cascades

- **Status**: done
- **Date**: 2026-08-22
- **Approach**: One `recordTaskActivity` helper (terminality stamping,
  assignee-at-event resolution, dialect-aware table pick) called from every
  write site named in the plan, each placed after the primary write's
  success/CAS check; claim insert inside the withIdempotency callback;
  unassignTask gains affected-row capture first; explicit deletes in the
  three purge paths. TDD: per-site row-correctness tests, replay/race
  tests, purge-cascade tests.
- **Changed**: new `modules/tasks/taskActivity.ts` (recordTaskActivity +
  isTerminalStatus + currentAssignee + actorFromPrincipal; insert failure
  logged and swallowed — never fails the mutation, per ADR-0020's accepted
  drift) + `taskActivity.test.ts` (22 tests, 20 red-first TDD, 2 negatives
  validated by deliberate break); call sites in `tasks.handler.ts` (created/
  status_changed/claimed/assigned/unassigned/archived/restored — each after
  its success/CAS check, claim + create inside withIdempotency),
  `task_notes.handler.ts` (note/handoff), `comments.handler.ts` (task
  comments only); purge deletes in `purgeTask`, `purgeTaskCascade`,
  `purgeProjectCascade`.
- **Verified**: `moon check backend` green; backend:test 1683+22 pass;
  replay claims write once, lost claims write nothing, unassign-of-nothing
  writes nothing, double archive writes once, purge fixtures leave zero
  rows.
- **Notes**: unassignTask records the removed holder from the request's
  exact (agentId, userId) pair rather than a pre-delete SELECT — the DELETE
  matches that exact pair (M14 semantics), so a removed row IS that holder,
  race-free. `updateTaskNote`/`deleteTaskNote` deliberately record nothing
  (only creation is a signal). Users can claim too; the claimed row records
  whichever principal won.
- **Next**: M24-T05 (exceptions report handler).

## M24-T05 — Exceptions report handler (getReportExceptions)

- **Status**: done
- **Date**: 2026-08-22
- **Approach**: New `modules/reports/reports.handler.ts` following the
  dashboard handler's shape (requireUser + assertCan(dashboard:read)
  through projects.orgId), TDD against handler-driven fixtures (fixtures
  created through the real task/note/comment handlers so activity rows are
  authentic), registered in index.ts + agent-scope-sweep + viewer-denial.
- **Changed**: new `modules/reports/` — `reports.handler.ts` (88 lines,
  thin service layer: requireUser-first, Zod→InvalidArgument, project→
  NotFound, assertCan(project, dashboard:read), T06 stub), `exceptions.ts`
  (333, panels), `scorecard.ts` (286, fleet rows + headline counts),
  `common.ts` (50), `reports.test.ts` (25 tests, red-first, fixtures driven
  through the real task/note/comment handlers; aging done by updating real
  rows, never inventing shapes); registered in `index.ts`,
  `agent-scope-sweep.test.ts`, `viewer-denial.test.ts`.
- **Verified**: backend:test 1708 pass / 0 fail; `moon check backend` green.
  Review-before-commit caught the handler at 655 lines against
  coding-standard's hard 400 cap — split into the four files above before
  committing, suite unchanged.
- **Notes**: semantics decided beyond the plan, all in code comments:
  neverStarted anchors on max(claimed, assigned); autonomy additionally
  requires the completing actor to be an agent; reopened attribution
  resolves the task's prior terminal transition (<= for same-second);
  windowDays is rejected (7|30|90) rather than clamped; header counts skip
  the task join so purged work doesn't rewrite throughput; scorecard rows
  cap at PANEL_LIMIT with completed→claimed→name ordering; index shapes
  already pinned by T03's HOT_QUERIES (EXPLAIN-checked, no new entries
  needed).
- **Next**: M24-T06 (trends handler + seed + latency measurement).

## M24-T06 — Trends report handler + seed + latency measurement

- **Status**: done
- **Date**: 2026-08-22
- **Approach**: `trends.ts` sibling implementing getReportTrends (dialect-
  split UTC date-bucket helper; CFD as one SQL daily-delta pass + JS
  prefix-sum; created/completed cumulative clipped to collection start;
  autonomy & rework daily rates with sampleSize), task_activity seeding in
  scripts/seed.ts, both RPCs in measure-latency.ts, named 300ms rows in
  api-standard §6. TDD; CFD balance test is the load-bearing one.
- **Changed**: new `trends.ts` (CFD single-scan daily-delta + JS prefix-sum;
  created/completed cumulative; autonomy & rework daily rates), new
  `dateBucket.ts` (+ tests — the repo's first dialect-split date SQL, both
  shapes unit-tested plus a live sqlite round-trip), `reports.handler.ts`
  wired, shared `isAutonomousCompletion` extracted, seed.ts now seeds
  task_activity (~2.3× tasks; created-at spread widened to ~180 days so a
  90-day window has a real baseline), measure-latency.ts + api-standard §6
  rows ("ten measured").
- **Verified**: reports module 45 pass (17 trends red-first); backend suite
  green; `moon check backend` green. **Measured at the 50k-task scale
  target: getReportExceptions p95 240.6 ms, getReportTrends p95 274.7 ms —
  both inside their named 300 ms budgets.** First measurements were 548/494
  ms; fixed by algorithm (CASE-form single-scan CFD, integer epoch-day
  bucketing on the hot path, scalar baselines, completed-task-driven
  anchor joins, IN-list removal), not by raising the budget. CFD balance
  test: replayed history's final-day stack equals a live GROUP BY, exact at
  50k (16667/16667/16666).
- **Notes**: created-directly-into-terminal counts as a completion
  (tested); cumulative counts keep archived tasks' completions; unknown
  taskTypeId → NotFound after assertCan; config-removed statuses render
  after configured ones, never terminal; MySQL UTC honesty documented in
  dateBucket.ts (buckets are UTC exactly when both processes run UTC, as
  the compose deployment does).
- **Next**: M24-T07 (SVG chart kit + tokens).

## M24-T07 — SVG chart kit + chart tokens

- **Status**: done
- **Date**: 2026-08-22
- **Approach**: `components/charts/` per ADR-0021 — pure scale/tick/path
  helpers under full unit test, a ChartShell carrying the a11y contract
  (role=img + aria-label + sr-only data table as the queryable truth +
  hover/focus readout), LineChart + StackedAreaChart on top, `--chart-1..6`
  tokens in index.css for both themes, stories for every state.
- **Changed**: new `components/charts/` — `scale.ts` (pure helpers incl.
  chartColor cycling, tick sparsification, nearest-index readout math),
  `ChartShell.tsx` (figure → overflow-x-auto → role=img wrapper; sr-only
  table with caption/scoped headers as THE test surface; aria-live output
  readout; ChartLegend swatch+text), `LineChart.tsx`,
  `StackedAreaChart.tsx`; `--chart-1..6` HSL tokens (both themes) in
  index.css with an ADR-0021 no-foreground-pairs comment; 6 stories.
- **Verified**: 69 chart tests (red-first TDD), all role/accessible-name
  queries, expectNoA11yViolations on populated+empty; chart files at
  100/100/100/100 coverage, aggregate 98.47/95.22/97.4/98.8; gui:test,
  gui:lint, gui:typecheck, gui:design-lint (0 findings), knip all green.
- **Notes**: hues anchored to the existing palette (violet brand, info
  blue, success green) and machine-validated for adjacent-pair colorblind
  separation in both themes; keyboard/hover readout lives on the named
  role=img wrapper (the svg itself is aria-hidden decoration) so the
  focusable element is the announced one; single-point series render dots/
  bars (a one-day path is invisible); empty state says "No data for this
  period yet."
- **Next**: M24-T08 (Reports screen — exception cards).

## M24-T08 — Reports screen: route, nav, exception cards

- **Status**: done
- **Date**: 2026-08-22
- **Approach**: `features/Reports/` decomposed from the start (composition
  root + one file per card + a shared query hook), lazy route + Workspace
  nav entry, org/project guards per the Handoffs convention, ListState on
  the query, cards 1–4 with the Unassign mutation on stalled claims. MSW
  feature tests; stories per card state.
- **Changed**: new `features/Reports/` (index 125, StalledWorkCard 147,
  WentBackwardsCard 47, ChurningTasksCard 57, FleetScorecardCard 108,
  ReportPanel 45, useReportsQueries 28 — all far under the 400 cap), lazy
  `/reports` route + Workspace nav entry (BarChart3, after Dashboard);
  `sinceLabel` extracted to `lib/sinceLabel.ts` on its third copy
  (Dashboard + Agents now import it, −28 lines there); rpc-coverage
  exception for getReportExceptions removed (the screen now calls it).
- **Verified**: red-first TDD; 26 screen tests + card suite + App route
  case; gui:test 1074 pass with branches 95.26% (first run tripped the
  gate at 94.98% — fixed by covering the new branches, not by excluding);
  gui:lint/typecheck/design-lint (0 findings)/query-error-coverage/
  rpc-coverage/knip all green; axe clean on the populated screen.
- **Notes**: Unassign sends `{taskId, agentId}` (the generated request's
  optional pair), confirm-gated, per-row pending via mutation.variables
  matching (the M20 shared-mutation lesson), invalidates the `['reports']`
  prefix; header stat shows numerator/denominator and refuses to fake 0%
  on empty windows; cards take narrow local row types with presentational
  stories (no MSW in Storybook — the Dashboard/Handoffs convention); h2
  panel shell because CardTitle is h3 and would break axe heading order.
- **Next**: M24-T09 (trend cards + live invalidation + Dashboard link).

## M24-T09 — Trend cards, live invalidation, Dashboard cross-link

- **Status**: done
- **Date**: 2026-08-22
- **Approach**: Three trend cards on the T07 chart kit beneath the
  exception cards (autonomy & rework LineChart; created vs completed
  cumulative LineChart + recent-completions strip; CFD StackedAreaChart
  with task-type selector), driven by getReportTrends on the shared window
  selector; honest collection-start footnotes; `['reports']` root wired
  into eventQueryKeys under task/tasknote/comment; Dashboard "View project
  reports" cross-link; remove the last rpc-coverage exception.
- **Changed**: new `TrendCards.tsx` (202, presentational) +
  `TrendsSection.tsx` (44, thin query container with its own ListState —
  trends failure leaves the exception cards alive), mounted beneath the
  exception cards; `['reports']` wired into eventQueryKeys under task/
  tasknote/comment; Dashboard header gains "View project reports →" when a
  project is active (one link, no counts — the file's own rule);
  getReportTrends rpc-coverage exception removed; 2 trend stories.
- **Verified**: 14 tests red-first then green; 60/60 across affected
  files; branches 95.33% (gate 95); gui:lint/typecheck/design-lint (0
  findings)/query-error-coverage/rpc-coverage/knip all green.
- **Notes**: zero-sample honesty — rate lines keep every day (no torn
  lines), a subtitle counts days-with-completions, and an all-zero window
  renders the kit's empty state rather than a lying 0% line; CFD terminal
  band is always the success-anchored green (matches Completed/Autonomy
  lines), non-terminal bands cycle tokens 1–5 so no collision; footnote
  dates pinned en-US/UTC so labels can't shift under the runner's locale.
- **Next**: M24-T10 (e2e + docs + closeout).
