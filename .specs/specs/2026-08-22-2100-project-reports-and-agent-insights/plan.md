# Project Reports & Agent Insights — Plan

## Task 1 (this document) — Save the design record

Write this spec folder (`shape.md`, `references.md`, `plan.md`,
`standards.md`), two ADRs (`ADR-0020` task-activity substrate, `ADR-0021`
hand-rolled SVG chart kit), and the formal milestone spec — the
`MILESTONE.md` and `PROGRESS.md` under
`.milestones/MILESTONE-24-project-reports-and-agent-insights/`. No product
code changes in this task.

## Tasks 2 onward — tracked in `MILESTONE-24`, not duplicated here

Per `milestone-standard.md`, `MILESTONE.md`'s Task Breakdown (stable
`M24-T<NN>` ids, `Files:`, `Verify:` per task) is the single source of
truth. Summary, for orientation:

- **M24-T02** — Contract: `ReportService` (`getReportExceptions`,
  `getReportTrends`) in `main.tsp` + `health.proto`, regenerated.
- **M24-T03** — `task_activity` schema (both dialects) + migrations +
  truthful backfill + embedded-migrations regen + index coverage.
- **M24-T04** — Activity writes at every mutation site (tasks, notes,
  comments) + purge-cascade integration + race/replay tests.
- **M24-T05** — `getReportExceptions` handler (stalled, unclaimed,
  regressions, churn, scorecard, share stat) + authz gates.
- **M24-T06** — `getReportTrends` handler (date-bucket helper, CFD
  delta+prefix-sum, created-vs-completed, autonomy & rework) + seed +
  latency measurement + budget rows.
- **M24-T07** — SVG chart kit (`LineChart`, `StackedAreaChart`, scale
  helpers, ChartShell a11y wrapper) + `--chart-*` tokens + stories.
- **M24-T08** — Reports screen: route, nav, guards, exception cards 1–4
  (incl. Unassign mutation) + tests + stories.
- **M24-T09** — Reports screen: trend cards 5–7, window selector, live
  invalidation, Dashboard cross-link.
- **M24-T10** — Playwright e2e + NAVIGATION.md/roadmap updates + full
  verification + closeout.

Each executes one at a time, one commit per task, TDD-first, with a
review pass before each commit and `moon check --all` clean throughout.

## Where the design lives

The agreed panel set, data-model rationale and their arguments are in
`shape.md` and the two ADRs; the review verdicts that shaped them are in
`references.md` — one place authoritative per decision, not restated here.
