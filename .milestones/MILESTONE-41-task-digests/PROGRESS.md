# M41 — Progress Journal

## M41-T01 — Contract and schema

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `.specs/adr/ADR-0034-task-summaries-and-digests.md`,
  `packages/shared-contract/*` and generated code,
  `apps/backend/src/db/schema.{sqlite,mysql}.ts` (summary columns on
  `tasks`), migrations `0057_task_summaries` / mysql `0044`,
  `src/db/taskSummaries.migration.test.ts`, `tasks.handler.ts` (raw summary
  columns never reach the wire as-is).
- **Verified**: backend `bun test` 1998 pass; `backend:typecheck`,
  `gui:typecheck`, `:knip`, `:spec-drift`, contract round-trip green.
- **Notes**: ADR-0034: compaction saves reading, not storage - an agent
  writes a summary, the server assembles a bounded digest from the live
  tables at read time, and nothing is deleted. Contract: `SetTaskSummary`,
  `GetTaskDigest` (`TaskDigest` reuses `ListTaskLinksResponse` for
  relations), `ListCompactionCandidates` (limit and count, no cursor -
  summarizing removes a row), `Task.summary`.
- **Next**: M41-T02
