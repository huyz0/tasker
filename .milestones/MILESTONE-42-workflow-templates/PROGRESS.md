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

## M42-T05 — GUI

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `features/Workflows/` (new: `WorkflowsScreen` at `/workflows`
  and `/workflows/:templateId`, `WorkflowEditor`), tests and stories;
  `App.tsx` route, `AppShell.tsx` sidebar entry under Configuration; extra
  branch tests for `Approvals` and `TaskSummary`.
- **Verified**: `gui:test` 1312 pass, branch coverage 95.22% (threshold
  95%); `gui:typecheck`, `gui:lint`, `gui:design-lint`, `gui:rpc-coverage`,
  `gui:query-error-coverage` green.
- **Notes**: Same two-pane, URL-addressed shape as Task Types, including its
  org-switch rule. The editor names dependencies by ticking the steps a step
  waits for; renaming a key carries its dependents and removing a step drops
  it from them. Typed steps (set from the CLI/API) keep their type and
  status through a GUI save. "Start workflow" runs in the active project and
  links to the new parent task. The new screen first pushed global branch
  coverage under 95%; the gap was closed with tests for its retry, empty,
  error and pending paths rather than by lowering the bar.
- **Next**: M42-T06

## M42-T06 — Docs and close

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `docs/agent-integration.md` §17; `tests/e2e/workflows.spec.ts`
  (new); `features/Workflows/index.tsx` (Start picks the project) and its
  tests; milestone closed, STATE.
- **Verified**: full Playwright suite on a fresh seed, 51 passed (the new
  spec defines a two-step workflow in the GUI, starts it and opens the
  parent); `gui:test` 1314 pass, branch coverage 95.24%; live CLI smoke - a
  JSON template piped on stdin, an agent starts it, claim-next hands out the
  first step, an agent creating a template is refused (exit 3), a cycle is
  refused naming the steps (exit 6).
- **Notes**: The e2e run found a real gap: Start relied on an active
  project, and after choosing an organization there is none, so the button
  never appeared. The panel now lists the org's projects (only the
  template's own, for a project-scoped template), defaulting to the active
  one. Exit criteria met; CI on `main` verified after the push.
- **Next**: M43-T01

## M42 follow-up — GUI build on main

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `features/Workflows/index.test.tsx` (`rerender()` takes no
  element in this repo's `renderScoped`).
- **Verified**: `gui:build` (whose `tsc -b` also checks test files, unlike
  `gui:typecheck`) green; the Workflows tests pass.
- **Notes**: CI on `90795fc` was red on GUI build and the standalone binary
  (which builds the GUI) for this one type error. `gui:build` joins the
  local pre-push checks so it is caught before a push.
