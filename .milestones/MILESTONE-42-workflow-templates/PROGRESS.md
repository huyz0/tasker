# M42 — Progress Journal

## M42-T01 — ADR-0035, contract and schema

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `.specs/adr/ADR-0035-workflow-templates.md`,
  `packages/shared-contract/*` (new `WorkflowService`) and generated code,
  `apps/backend/src/db/schema.{sqlite,mysql}.ts` (`workflow_templates`),
  migrations `0058_workflow_templates` / mysql `0045`,
  `src/db/workflowTemplates.migration.test.ts`.
- **Verified**: backend `bun test` 2007 pass; `backend:typecheck`,
  `gui:typecheck`, `:knip`, `:spec-drift`, contract round-trip green.
- **Notes**: ADR-0035: a template stores the step graph; an instance is
  ordinary tasks (parent + subtasks + `blocked_by` links), so claim-next and
  every screen already understand it. A single DB transaction is not
  available across the async CreateTask path on SQLite, so instantiate
  validates everything first and purges what it created if a later step
  fails.
- **Next**: M42-T02
