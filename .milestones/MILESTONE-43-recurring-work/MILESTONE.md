---
id: M43
title: Recurring Work
status: done
goal: Routine work - a weekly triage, a nightly dependency check, a monthly report - appears on the queue by itself on schedule, as a single task or a whole workflow, so agents and people pick it up without anyone remembering to file it.
depends_on: [M42]
surfaces: [contract, backend, cli, gui, specs]
exit_criteria_met: true
started_at: 2026-10-02
completed_at: 2026-10-02
---

# M43 — Recurring Work

## 1. Goal

A **schedule** in a project creates work on a cadence - daily, on chosen
weekdays, or on a day of the month, at a UTC hour - either one task (title,
description, priority, labels) or an instance of a workflow template (M42).
By default a run is skipped while the previous run's task is unfinished, so a
stuck routine does not pile up copies. A server sweep fires due schedules
exactly once across instances; "Run now" fires one on demand.

## 2. Why Now

Second landscape pass: Linear's Loops (Jul–Sep 2026) make recurring agent
work a first-class feature. Tasker does not run agents; its part is putting
the work on the queue on time, where claim-next and webhooks already reach
agents.

## 3. Exit Criteria

- [x] Schedules validate their cadence and target; CRUD needs
  `tasktype:write`; reading and Run now need `tasks:write` (agents may run
  one).
- [x] The sweep fires each due schedule once even with two backends (claimed
  by compare-and-swap on `next_run_at`), records the run, and computes the
  next time; a run is skipped (and recorded as skipped) while the last
  task is open, unless the schedule says otherwise.
- [x] Created tasks say which schedule made them; `task.created` reaches
  webhooks as for any task.
- [x] CLI, MCP tools, GUI schedule list and editor; CI green on `main`.

## 4. Scope

**Out of scope:** arbitrary cron expressions, time zones other than UTC,
event-triggered schedules (webhooks already cover reacting to events).

## 5. Task Breakdown

- [x] **M43-T01** — ADR-0036, contract and schema.
- [x] **M43-T02** — Schedule CRUD and next-run computation.
- [x] **M43-T03** — The sweep, Run now and run history.
- [x] **M43-T04** — CLI and MCP.
- [x] **M43-T05** — GUI.
- [x] **M43-T06** — Docs and close.

## 6. Verification

As M42, plus a sweep test with an injected clock and two concurrent sweeps
proving a single run.

## 7. Risks

- **Double runs** across instances - CAS on `next_run_at` (the webhook
  outbox lease pattern, ADR-0030).
- **Pile-up** after downtime - a sweep fires a late schedule once and moves
  `next_run_at` past now; missed runs are not replayed.
