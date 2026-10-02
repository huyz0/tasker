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
