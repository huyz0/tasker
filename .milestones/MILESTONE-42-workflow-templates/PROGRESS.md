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

## M42-T02 — Template CRUD with graph validation

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `src/modules/workflows/workflows.handler.ts` (new:
  create/update/get/list/delete, `orderSteps`), `index.ts` (WorkflowService
  mounted), `lib/scopes.ts` (`workflows` section), both gate sweeps with a
  real template fixture; tests in `workflows.test.ts`.
- **Verified**: see M42-T03 (one commit).
- **Notes**: Delivered in the same commit as T03 - the two share one module
  and one test file, and splitting them would have meant committing a
  handler with a half-wired method. Validation: unique, well-formed keys,
  known dependencies, no self-dependency, no cycle (Kahn's algorithm,
  naming the steps in the cycle), ≤ 50 steps, typed steps' types in the org
  and statuses in the type. People define templates (`tasktype:write`);
  agents read them (`tasks:read`).
- **Next**: M42-T03

## M42-T03 — InstantiateWorkflow

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `workflows.handler.ts` (`instantiateWorkflow`),
  `modules/webhooks/events.ts` (`task.workflow_started`), GUI webhook event
  list, `docs/webhooks.md`; `src/modules/workflows/workflows.test.ts`
  (9 tests).
- **Verified**: backend `bun test` 2020 pass; `backend:typecheck`, `:knip`
  green.
- **Notes**: Parent first, then steps in dependency order through
  `CreateTask` itself, each a subtask `blocked_by` its dependencies;
  re-validated against current task types before anything is written; a
  failure part-way purges what was made (tested both ways - a type that
  changed under the template, and a CreateTask refusal mid-run). The ready
  filter, and so claim-next, hands the steps out in dependency order with no
  new code - the test walks it through. Untyped steps start at "todo",
  typed ones at their type's first status. Idempotent by key.
- **Next**: M42-T04

## M42-T04 — CLI and MCP

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/cli/cmd/workflows.go` (new: `workflows
  list|get|create|update|delete|start`), `internal/backend/clients.go`,
  `cmd/workflows_test.go`; `docs/cli-reference.md` regenerated; MCP
  `list_workflow_templates`, `get_workflow_template`, `start_workflow`
  (e2e case), `docs/mcp.md`.
- **Verified**: `go test ./...` green; backend MCP tests 18 pass;
  `cli:docs-check`, `backend:typecheck`, `:knip` green.
- **Notes**: Steps come from repeated `--step "key:title[:deps]"` for quick
  use or a JSON `--file` (array, or `{name, description, steps}`; `-` for
  stdin) - JSON rather than YAML to avoid a new dependency. `update` fetches
  the template and keeps whatever it was not given. No MCP tool defines or
  deletes a template, asserted in the tool test.
- **Next**: M42-T05
