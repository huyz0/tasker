# M40 — Progress Journal

## M40-T01 — Contract and schema

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `.specs/adr/ADR-0033-agent-usage-and-cost.md`,
  `packages/shared-contract/*` and generated code,
  `apps/backend/src/db/schema.{sqlite,mysql}.ts`, migrations
  `0056_usage_records` / mysql `0043`, `src/db/usageRecords.migration.test.ts`.
- **Verified**: backend `bun test` 1986 pass; `backend:typecheck`,
  `gui:typecheck`, `:knip`, `:spec-drift`, contract round-trip green; CLI builds.
- **Notes**: ADR-0033: the agent reports (Tasker keeps no price table and
  proxies no model calls); records attach to a task with agent and project
  denormalized; money is integer micro-dollars in 64-bit columns. Contract:
  `ReportUsage`, `ListUsageRecords` (TaskService), `GetUsageReport`
  (ReportService), `Task.usage`. The field is `modelName` - `model` is a
  TypeSpec keyword. Idempotency is a unique (task, key) index.
- **Next**: M40-T02
