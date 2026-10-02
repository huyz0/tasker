# M35 — Progress Journal

## M35-T01 — ADR-0028; contract and schema

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `.specs/adr/ADR-0028-a-task-graph-of-blockers-parents-and-origins.md`,
  `packages/shared-contract/{main.tsp,tasker/health/v1/health.proto}` and
  generated code, `apps/backend/src/db/schema.{sqlite,mysql}.ts`, migrations
  `0052_work_graph` / mysql `0039_work_graph`,
  `src/db/workGraph.migration.test.ts`
- **Verified**: backend `bun test` 1887 pass; contract round-trip 900 pass;
  `go build ./...`.
- **Notes**: `Task` gains `priority` (0 none, 1 urgent … 4 low),
  `parentTaskId`, `blockedByOpenCount`; create/update/list/claim-next gain the
  matching fields; `AddTaskLink`/`RemoveTaskLink`/`ListTaskLinks` and
  `TaskRef`. `task_links` is one directed row per relation, unique per
  (task, linked, kind), indexed both ways. MySQL's unique key is 544 chars ×
  4 bytes, inside InnoDB's 3,072. `moon run shared-contract:compile` cannot run
  in this sandbox (buf's remote plugins are unreachable); generated with the
  local plugins, as in M33.
- **Next**: M35-T02

## M35-T02 — Priority

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/tasks/{tasks.handler.ts,taskGraph.ts}`
  (+ `workGraph.test.ts`), `apps/backend/src/db/query-builder.ts`
- **Verified**: backend `bun test` 1889 pass; the cross-page sort test failed
  first with a bun:sqlite binding error.
- **Notes**: Create/update/get/list carry `priority`; `ListTasks` filters it
  and sorts `priority:asc` urgent-first with "none" last, through a rank
  expression. That exposed a paginator bug no existing list could hit: the
  cursor decoder turned *every* number into a `Date`, so a numeric sort key
  could not page. It now converts only for date columns (`dataType ===
  "date"`), and the new `cursorFields` option names the row key a cursor reads
  when the sort key is not the visible value. Task responses now go through
  one `toWireTask`, which also replaces six copies of the `createdAt` ISO
  conversion. `ListMyTasks` sorts by priority too.
- **Next**: M35-T03
