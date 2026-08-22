# Project Reports & Agent Insights — Shaping Notes

## Scope

One project-scoped Reports screen (`/reports`) answering the
manager-on-the-loop question the Dashboard deliberately does not: **how is
work performed in this project, and are the agents carrying it?** The Jira
project-report role (CFD, created-vs-resolved, workload) rebuilt for a
product where the workers are AI agents and there are no sprints, story
points, or versions — plus the agent dimension Jira has no equivalent for.

Full-stack milestone (10 tasks): contract (`ReportService`, 2 RPCs), backend
(a new `task_activity` history table + aggregation handlers), GUI (a
seven-card screen and a two-component SVG chart kit). No CLI surface in v1.

## Design process

Drafted from the real data model (explored first: `tasks` has no
`updated_at`/`completed_at`/priority; `task_assignments` has no timestamps;
the M08 `audit_log` has no project scoping, projector-clock timestamps, and
does not exist in standalone mode). The draft — four trend charts, two
lists, two tabs, a completions leaderboard — was then reviewed by three
independent subagent lenses before planning: **product value** (against the
repo's own anti-vanity bar: "what will you do differently because of this
number?"), **agents dimension** (is the agent view as valuable as it could
be?), and **technical feasibility** (verified claim-by-claim against the
handlers, schema, migration workflow and CI gates). The full review verdicts
are preserved in [references.md](references.md); they changed the design
materially rather than rubber-stamping it.

## Decisions

- **Exception lists lead; trend charts follow.** Agents fail discretely —
  stuck, looping, or marking things done that aren't — not gradually the way
  human teams slow down. The panels a manager acts on daily are lists
  (stalled claims, status regressions, handoff churn); trends (autonomy &
  rework, created vs completed, CFD) are the weekly read. v1 draft had this
  inverted; all three reviews converged on the flip.
- **Trust over volume.** The "agent leaderboard sorted by completions" was
  cut as a vanity metric with a philosophy test stapled to it. The fleet
  table is a scorecard whose columns are outcomes — reopened-after-complete,
  handed off, taken away, % autonomous — sorted worst-first, with an
  agent⇄role toggle because the role (its `systemPrompt`/`capabilities`) is
  the *configurable* unit: a per-role reopen rate is a prompt change, a
  per-agent one is an anecdote.
- **One page, no tabs.** A twice-a-day visitor sees the default tab and
  never learns the second exists; ordering by urgency IS the design. The
  Radix Tabs extraction that tabs would have justified is dropped.
- **`task_activity` as a first-class table, written synchronously in the
  handlers** — not derived from the audit log (rejected: no `project_id`,
  `occurred_at` is the projector's clock, requires NATS so it is absent in
  the standalone binary, 7-day JetStream buffer, no backfill) and not
  event-driven. Full schema rationale in ADR-0020, including: terminality
  stamped at write time (status config is mutable; read-time derivation
  silently rewrites history), assignee-at-event columns (assignment history
  is otherwise unrecoverable — and attribution by actor-at-completion is
  wrong whenever a human clicks Done on an agent's work),
  note/comment/handoff kinds folded in (single-table last-signal query), and
  an explicit refusal to ever record claim rejections (a polling fleet would
  make them the largest table in the database).
- **Truthful backfill, no invented history.** Each pre-existing
  non-archived task gets exactly one `created` activity row carrying its
  *current* status at `created_at` — the honest "as of collection start"
  baseline (soft-deleted tasks are excluded: an unpaired `+1` would sit in
  the CFD stack forever). Real recorded history is carried over — one
  activity row per existing task note, handoff and task comment at its
  true timestamp — so the stalled-work and churn cards are truthful on
  install day. No synthetic transitions; time-series charts label their
  collection-start date instead of drawing a false past.
- **CFD scoped to one task type at a time.** Merging status vocabularies by
  name across task types makes band thickness change when someone adds a
  type — a chart that gets misread is worse than one that gets ignored. A
  selector defaults to the project's most-used type; the untyped
  todo/in-progress/done triple is one of the options.
- **Hand-rolled SVG chart kit** (two components: LineChart,
  StackedAreaChart) over recharts — ADR-0021. The reduced chart set is most
  of the argument: a library's value evaporates when you need two chart
  forms, while its costs (React-19-recent majors, a deep d3 transitive tree
  against `dependency-standard`'s flat-tree rule, `ResponsiveContainer`
  measuring 0×0 in jsdom against a hard 95% coverage gate) remain.
- **Two RPCs split by cost and cadence, not by panel group**:
  `getReportExceptions` (fast, visited daily) and `getReportTrends`
  (heavier, cacheable). Humans only (`requireUser`) — reports are the
  on-the-loop surface, and structural agent denial keeps the agent-scope
  map closed. Permission is the existing `dashboard:read` (precedent: the
  audit service reuses `org:admin` to avoid a seed migration for existing
  installs).
- **The stalled-claims card carries a per-row Unassign action** (the
  existing `unassignTask` RPC). Agents cannot release their own claims —
  `unassignTask`/`assignTask` are `requireUser`; only `claimTask` accepts an
  agent — so every crashed or wandered-off agent claim waits for a human,
  and nothing in the product surfaced that queue. A read-only list would
  just tell the human to go click elsewhere.

## Deliberately not built (recorded, with owners)

- `task_reviewers` outcome column + review-queue latency — the
  highest-value adjacent work (the manager's own SLA to the fleet), blocked
  on a contract change that deserves its own design round. Future milestone.
- Claim-latency percentile trends, handoffs-per-day series, per-agent
  cycle-time distributions, activity heatmap, org-level rollups — v2 of
  this surface, on demand. The percentile trends specifically are the
  direct analogue of Jira's control chart, the canonical rotted report.
- Claim-contention counting — telemetry counter territory (ADR-0020 records
  why it must never be a `task_activity` kind).
- Token-expiry alerts — belongs on the Agents screen; it's an alert, not a
  report.
- Dashboard charts or count tiles — the Dashboard's own design note forbids
  reintroducing them; it gets one "View project reports" link.

## Context

- **Visuals:** none — the card forms are tables/lists plus two chart
  shapes with established conventions; states (empty/sparse/populated,
  light/dark) are covered as Storybook stories per `frontend-standard`.
- **Milestone:** `.milestones/MILESTONE-24-project-reports-and-agent-insights/`
- **ADRs:** ADR-0020 (task-activity substrate), ADR-0021 (SVG chart kit)
