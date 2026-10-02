# M33 — Progress Journal

## M33-T01 — Contract and schema

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `.specs/adr/ADR-0027-agents-release-only-their-own-claims.md`
  (new); `packages/shared-contract/{main.tsp,tasker/health/v1/health.proto}`
  (`ClaimNextTask`, `ReleaseTask`, `ListMyTasks`, `GetIdentityResponse.agent`,
  `AgentIdentity`) and generated TS/Go;
  `drizzle-sqlite/0051_task_assignment_source.sql`,
  `drizzle-mysql/0038_task_assignment_source.sql`, journals,
  `db/schema.{sqlite,mysql}.ts`, embedded migrations;
  `modules/tasks/tasks.handler.ts` (ClaimTask writes `source='claim'`);
  `db/taskAssignmentSource.migration.test.ts` (new); `tasks.test.ts`
- **Verified**: `bun test` 1863+ pass; the backfill test stops the shipped
  chain before 0051, plants a claim, a human assignment and a holder whose
  only `claimed` row names someone else, and checks only the first becomes
  `claim`. GUI typecheck clean against the regenerated TS; knip clean.
- **Notes**: ADR-0027 records why release is limited to the caller's own
  claims and why that needs a column, not an inference from the best-effort
  activity log. The backfill can only under-count claims. Codegen used the
  local plugin template from M32-T06 (buf.build remote plugins unreachable).
- **Next**: M33-T02
