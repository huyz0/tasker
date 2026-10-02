# M43 — Progress Journal

## M43-T01 — ADR-0036, contract and schema

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `.specs/adr/ADR-0036-recurring-work.md`,
  `packages/shared-contract/*` (new `ScheduleService`, `Task.scheduleId`) and
  generated code, `apps/backend/src/db/schema.{sqlite,mysql}.ts`
  (`schedules`, `schedule_runs`, `tasks.schedule_id`), migrations
  `0059_schedules` / mysql `0046`, `src/db/schedules.migration.test.ts`,
  `tasks.handler.ts` (`scheduleId` on the wire and in lists).
- **Verified**: backend `bun test` 2022 pass; `backend:typecheck`,
  `gui:typecheck`, `:knip`, `:spec-drift`, contract round-trip green.
- **Notes**: ADR-0036: a small cadence vocabulary in UTC rather than cron;
  exactly-once firing by compare-and-swap on the schedule's own
  `next_run_at`; work created as the schedule's creator; skip while the last
  run's task is open; missed slots after downtime are not replayed.
- **Next**: M43-T02

## M43-T02 — Schedule CRUD and next-run computation

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `src/modules/schedules/cadence.ts` (new: `nextRunAfter`,
  `describeCadence`) with `cadence.test.ts`; `schedules.handler.ts` (new:
  create/update/get/list/delete); `index.ts` (ScheduleService), `lib/scopes.ts`
  (`schedules` section), both gate sweeps with a real schedule fixture,
  `lib/cascadePurge.ts` (a project's schedules, runs and own workflow
  templates; an org's templates).
- **Verified**: see M43-T03 (one commit).
- **Notes**: Same commit as T03 for the same reason as M42-T02/T03: one
  module, one test file. Validation: cadence vocabulary, ≥1 unique weekday
  for weekly, day 1-28 for monthly, hour 0-23, exactly one target (template
  in the org and allowed in the project, or a task title). The next slot is
  always strictly after now, so "exactly at 09:00" means tomorrow's. An edit
  makes the editor the schedule's author (ADR-0036).
- **Next**: M43-T03

## M43-T03 — The sweep, Run now and run history

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `schedules.handler.ts` (`runSchedule`, `listScheduleRuns`,
  `createScheduleSweep`), `index.ts` (sweep every minute, not overlapped);
  `src/modules/schedules/schedules.test.ts` (11 tests, injected clock).
- **Verified**: backend `bun test` 2041 pass; `backend:typecheck`, `:knip`
  green.
- **Notes**: The sweep claims each due row with `UPDATE … SET next_run_at =
  <next after now> WHERE id = ? AND next_run_at = <value read>`; four sweeps
  racing over one due slot fire it once (tested). A run never throws - skip
  (last task still open), create (task or workflow, stamped with
  `schedule_id`, titled with the date) or fail (message recorded) - so one
  broken schedule does not stop the rest; a creator who lost access makes
  runs fail visibly. Missed slots after downtime fire once, not once per
  slot. Run now fires as the caller (agents included, `tasks:write`) and
  leaves the next slot alone. The sweep is exported separately from the RPC
  handlers so it is not mistaken for an endpoint by the scope sweep.
- **Next**: M43-T04

## M43-T04 — CLI and MCP

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/cli/cmd/schedules.go` (new: `schedules
  list|get|create|update|delete|run|runs`), `internal/backend/clients.go`,
  `cmd/schedules_test.go`; `docs/cli-reference.md` regenerated; MCP
  `list_schedules`, `run_schedule` (e2e case), `docs/mcp.md`.
- **Verified**: `go test ./...` green (incl. the output contract: every
  `--cursor` command offers `--page-all`); backend MCP tests 19 pass;
  `cli:docs-check`, `backend:typecheck`, `:knip` green; local Storybook
  (144 stories) a11y and overflow green.
- **Notes**: `--weekdays mon,thu` implies weekly and `--day 15` monthly, so
  the common case is one flag; `update` fetches the schedule and keeps what
  it was not given, with `--pause`/`--resume`. No MCP tool defines a
  schedule; agents list and run them.
- **Next**: M43-T05

## M43-T05 — GUI

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `features/Schedules/` (new: `SchedulesScreen` at `/schedules`
  and `/schedules/:scheduleId`, `ScheduleForm`), tests and stories;
  `App.tsx` route, `AppShell.tsx` sidebar entry under Configuration.
- **Verified**: `gui:test` 1324 pass, branch coverage 95.13%; `gui:build`,
  `gui:typecheck`, `gui:lint`, `gui:design-lint`, `gui:rpc-coverage`,
  `gui:query-error-coverage` green.
- **Notes**: The form states the cadence back in one line ("Every Mon, Thu
  at 09:00 UTC") as it is edited, offers only workflows usable in the chosen
  project, and locks the project of an existing schedule. The detail shows
  the next run (or Paused), what it creates, Run now with its outcome,
  Pause/Resume, and the recent runs with skip/failure reasons and links to
  the tasks they made.
- **Next**: M43-T06
