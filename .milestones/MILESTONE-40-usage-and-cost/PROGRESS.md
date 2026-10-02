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

## M40-T02 — ReportUsage, task totals, usage report

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `src/modules/tasks/usage.ts` (new: `ReportUsage`,
  `ListUsageRecords`, shared SUM helpers), `tasks.handler.ts` (`GetTask`
  carries `usage`), `src/modules/reports/usage.ts` (new) and
  `reports.handler.ts` (`GetUsageReport`), `lib/scopes.ts`,
  `lib/cascadePurge.ts`, `modules/webhooks/events.ts` (`task.usage_reported`),
  both gate sweeps, GUI webhook event list, `docs/webhooks.md`;
  `src/modules/tasks/usage.test.ts` (9 tests).
- **Verified**: backend `bun test` 1996 pass; `backend:typecheck`,
  `gui:typecheck`, `:knip` green.
- **Notes**: Values arrive as bigint (Connect), number or string (JSON) and
  are checked as safe whole numbers in range; an empty report is refused. A
  replayed key returns the original record (`replayed: true`); two retries
  racing on one key settle on the unique index and the loser returns the
  winner. The report runs four queries (totals, by agent, by project, by
  epoch-day - the existing dialect-split helper) plus two name lookups,
  independent of volume; agents and projects ranked by spend, capped at 50;
  empty days filled. Person-filed reports share one "People" row.
- **Next**: M40-T03

## M40-T03 — CLI and MCP

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/cli/cmd/usage.go` (new: `tasks usage report|show`,
  `reports usage`), `internal/backend/clients.go` (ReportService client),
  `cmd/tasks.go` (usage on `get`), `cmd/usage_test.go`;
  `docs/cli-reference.md` regenerated; MCP `report_usage` with validation and
  an e2e case; `docs/mcp.md`.
- **Verified**: `go test ./...` green; backend MCP tests 16 pass;
  `cli:docs-check` green.
- **Notes**: `--cost-usd` is parsed as a decimal string straight into
  micro-dollars - no float on the path - and printed back with only
  significant digits (`$0.015`, `$1.50`). The MCP tool takes `cost_micros`
  as an integer for the same reason; its description gives the conversion.
  Bad input exits 6 before any request.
- **Next**: M40-T04
