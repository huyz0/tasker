---
id: ADR-0020
status: accepted
date: 2026-08-22
milestone: M24
---

# Task activity is a first-class table written synchronously in the handlers

## Context

M24's Reports screen needs history: when did a task change status, who held
it at the time, when did an agent last signal on a claimed task. The row
tables cannot answer any of this — `tasks` has no `updated_at` or
`completed_at`, `task_assignments` has no timestamps and keeps no history —
and every over-time or duration panel (CFD, created-vs-completed, autonomy &
rework, stalled-claims silence, reopen detection) depends on it.

An event history already exists: M08's `audit_log`, projected from NATS
JetStream. It is the obvious candidate and it was evaluated first.

## Options

**A. Derive reports from `audit_log`.** No new writes; one history. But:
`audit_log` has no `project_id` column or filter (project scoping would be
an unindexed `json_extract` over payloads); `occurred_at` is the
*projector's* clock, not the event's; payloads never record the previous
status, so transitions must be reconstructed by walking each task's whole
sequence; and — decisive — `publishDomainEvent` no-ops without NATS, which
is the normal `STANDALONE=true` configuration, so the single-binary
deployment would simply have no reports. The JetStream delivery buffer is
also 7 days: a projector that wasn't running loses history silently.

**B. Publish new richer events and project them into a reports table.**
Keeps the event-driven shape but inherits every deployment property of A
(no NATS → no data), adds a second projector to operate, and makes the
report substrate eventually-consistent with the screen that queries it.

**C. A first-class `task_activity` table written synchronously by the same
handlers that perform the mutation.** Works identically in standalone and
clustered deployments, is queryable with ordinary indexed SQL, and needs no
broker. Cost: one insert per mutation and the discipline to cover every
write site.

## Decision

Build `task_activity` as a first-class table, written synchronously in the
task, task-note and comment handlers, immediately after each mutation's
existing success/CAS check.

The authoritative `kind` vocabulary is: `created` | `status_changed` |
`claimed` | `assigned` | `unassigned` | `archived` | `restored` | `note` |
`comment` | `handoff`. Row semantics: `status_changed` carries
`from_status`/`to_status`; `archived` carries `from_status = <status at
archive>`, `to_status = NULL`; `restored` carries `from_status = NULL`,
`to_status = <status at restore>` — this is what lets the CFD's
+1-to/−1-from algebra remove archived tasks from the stack and re-admit
restored ones. Terminality flags are computed on the non-null side and
false on the null side. "Terminal" means the status's `position` equals the
type's maximum `position` (ties: every status sharing the max position is
terminal; `position` has no uniqueness constraint), or `done` for untyped
tasks.

## Schema decisions inside the decision

Each of these had a real alternative; recording them here is the point:

- **Terminality is stamped at write time** (`from_is_terminal`,
  `to_is_terminal`, from the task type's status positions — max `position`
  is terminal; `done` for untyped tasks). The alternative — deriving
  "completed" at read time — silently rewrites last quarter's completion
  counts whenever someone reorders a status list. Stamping makes history
  stable and "reopened" a pure column predicate
  (`from_is_terminal AND NOT to_is_terminal`). Consequence: a status-config
  change affects only future stamping — stated, not hidden.
- **Assignee-at-event is denormalized** (`assignee_agent_id` /
  `assignee_user_id`, XOR like `task_assignments`). Assignment history is
  not reconstructible from anything else, and attribution by
  *actor*-at-completion is wrong in the common case where an agent does the
  work and a human clicks Done. Unrecoverable if not captured now.
- **`agent_role_id` is NOT denormalized** — joined via `agents.agentRoleId`
  at read time. Re-roling an agent therefore retroactively re-attributes
  its history to the new role. Accepted: roles change rarely, and a stale
  denormalized role is worse than a re-attributed one. The same trade is
  accepted for task types: the CFD scopes by the *current*
  `tasks.task_type_id`, so re-typing a task moves its history between CFD
  charts rather than leaving it attributed to a type it no longer has.
- **Notes, comments and handoffs are activity kinds too** (`note`,
  `comment`, `handoff`). The stalled-claims panel's core query is "last
  signal per task"; with signals spread over three tables that is a 3-way
  UNION at 50k-task scale, with one table it is a single scan of
  `(task_id, occurred_at)`. Write amplification is negligible — these are
  human/agent-rate events.
- **`claim_rejected` will never be a kind.** A losing `claimTask` throws
  `FailedPrecondition` and is deliberately recorded nowhere: a polling
  fleet of 100 agents would make rejections the largest table in the
  database. Claim contention is telemetry-counter territory
  (`modules/telemetry`), recorded here so nobody adds it later.
- **Writes are NOT transactional with the primary mutation.** This
  codebase's handlers issue sequential awaited statements (the task path's
  only transaction is the task-number claim's, and SQLite's is synchronous —
  `insertRecord` is async and cannot join it). The activity insert runs
  after the primary write's success check; a crash between the two loses
  one activity row. Accepted drift: the table powers charts, never task
  correctness, and the CFD balance test (T06) detects systematic loss.
  Do not describe this table as transaction-consistent.
- **Truthful backfill only.** Each pre-existing **non-archived** task gets
  one `created` row carrying its *current* status (the honest "as of
  collection start" baseline — backfilling the initial default would show
  every pre-existing done task as todo forever), `occurred_at =
  created_at`, `actor_type = 'system'`, terminality stamped from current
  config at backfill time, assignee columns NULL (holder-at-creation is
  unknown — never invented), deterministic id (idempotent re-run).
  Soft-deleted tasks are excluded — a backfilled `created` with no
  `archived` pair would sit in the CFD stack forever, the exact bug the
  `archived` kind exists to prevent; restoring one from the Bin re-enters
  the stack through its live `restored` row. The backfill also carries
  the *existing* recorded history over: one `note`/`handoff` row per
  `task_notes` row and one `comment` row per task-scoped comment (their
  `created_at` timestamps are real), so the stalled-work and churn panels
  are truthful on day one rather than degraded to `created_at`. No
  synthetic transitions; charts label their collection-start date.
- **Purge deletes activity explicitly.** No FK cascades exist anywhere in
  this codebase; `purgeTask`, `purgeTaskCascade` and `purgeProjectCascade`
  gain explicit deletes (the retention sweep reuses them). A purged task
  thus leaves historical chart days — accepted and stated. A purged agent
  leaves dangling `actor_id` text (no FK, matching `audit_log` precedent);
  readers render "(deleted agent)".
- **Indexes**: `(project_id, kind, occurred_at)` — every report query
  filters by kind before bucketing — and `(task_id, occurred_at)` for
  per-task last-signal; both registered in `indexCoverage.test.ts`.
  SQLite timestamp columns store seconds: date bucketing uses
  `'unixepoch'`, and same-second ordering ties break on `id`.

## Consequences

Easier: every M24 panel is an indexed SQL aggregation that works in every
deployment mode; agent-created tasks become attributable for the first time
(`created` rows carry the agent actor — `tasks.createdBy` is users-only);
future surfaces (per-task history timeline, SLA alerts) inherit the
substrate. Harder: every future task-mutation handler must remember its
activity write — the T06 balance test and per-site tests in T04 are the
guard. Foreclosed: `audit_log` stays what M08 built it as (a compliance
trail, org-scoped), and no reports feature may grow a NATS dependency.
