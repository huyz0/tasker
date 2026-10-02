---
id: ADR-0036
status: accepted
date: 2026-10-02
milestone: M43
---

# Recurring work is a schedule that puts tasks on the queue, fired once by CAS

## Context

Routine work - a weekly triage, a nightly dependency check, a monthly report -
is filed by hand today, or not at all. Linear's Loops (Jul–Sep 2026) run such
jobs on a schedule (second landscape pass). Tasker does not run agents: its
part of a loop is to put the work on the queue on time, where claim-next
(M33) and webhooks (M37) already reach the agents that do it.

## Options

**Cadence.** Full cron is expressive and error-prone, and needs a time zone
story. A small fixed vocabulary - daily, chosen weekdays, a day of the month
(1-28, so every month has it), at an hour, in UTC - covers routine work and
can be validated and explained in one sentence.

**Firing exactly once.** Several backend instances may run the sweep. A
dedicated lock table, or a lease like the webhook outbox (ADR-0030), or a
compare-and-swap on the schedule's own `next_run_at`: the sweep that moves it
from the value it read owns the run. The last needs nothing new.

**Who creates the work.** The task needs an author for authorization,
attribution and audit. The schedule's creator is the natural one; if they lose
access, runs should fail visibly rather than run as nobody.

**Pile-up.** A routine that is not getting done should not stack copies.

## Decision

- `schedules`: project, name, cadence (`daily` | `weekly` + weekdays |
  `monthly` + day 1-28), hour UTC, and a target - a workflow template (M42)
  or a single task's title/description/priority, exactly one - plus
  `skip_if_open` (default on), `active`, `next_run_at`, the last run's time,
  task and outcome, and `created_by`. `schedule_runs` records every firing:
  created / skipped / failed, the task, a reason, and whether the sweep or a
  person triggered it.
- A sweep every minute selects due active schedules and, for each, moves
  `next_run_at` to the next slot *after now* with `WHERE next_run_at = <read
  value>`; only the sweep whose update changed a row runs it. Missed slots
  after downtime are not replayed - the schedule fires once and moves on.
- The run creates the work as the schedule's creator, through `CreateTask` /
  `InstantiateWorkflow`, and stamps `tasks.schedule_id`. With `skip_if_open`,
  a run whose previous task is still unfinished records `skipped` and creates
  nothing. Any error records `failed` with its message.
- CRUD needs `tasktype:write` (people). Reading, and `RunSchedule` (fire now,
  as the caller, without moving the next slot), need `tasks:read` /
  `tasks:write`, so an agent can trigger a routine.

## Consequences

- Times are UTC; a team in another zone picks the UTC hour.
- A schedule whose creator leaves keeps failing, visibly, until someone
  edits it (which makes them its creator) - never silently runs as someone
  else.
