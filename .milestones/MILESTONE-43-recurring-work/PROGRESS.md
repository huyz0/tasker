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
