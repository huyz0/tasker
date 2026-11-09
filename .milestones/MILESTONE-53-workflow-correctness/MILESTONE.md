---
id: M53
title: Workflow Correctness
status: in-progress
goal: Every existing question, approval, search result and task edit keeps the correct scope, exposes all pending work and preserves user intent.
depends_on: [M28, M51]
surfaces: [backend, gui, cli, contract, specs]
exit_criteria_met: false
started_at: 2026-11-09
completed_at: null
---

# M53 — Workflow Correctness

## 1. Goal

Every existing question, approval, search result and task edit keeps the correct scope, exposes all pending work and preserves user intent.

## 2. Why Now

Confirmed route, pagination, error-state and draft defects are foundations for the new supervision screens.

## 3. Exit Criteria

- [ ] Project A cannot be presented as the owner of an authorized project B entity; Back/reload retain correct context.
- [ ] Every supported search type appears and failed reads offer retry instead of an empty-success state.
- [ ] All open task and organization questions/approvals remain reachable regardless of history volume.
- [ ] Every summary dismissal protects a dirty draft and MCP can explicitly clear a summary.
- [ ] Real browser regressions and affected full suites pass; workflow docs match current claim semantics.

## 4. Scope

In scope: the tasks below, compatible contracts/migrations, authorization, explicit UI states, independent review and recorded verification.

Related work: event reliability M46; schedule recovery M47; client reconciliation M48; production evidence M49; operational documentation M50; workflow correctness M53; artifacts/evidence M54; attention M55; guided connection M56; optional claim receipts M57; URL/named views M58. The program introduces no hosted runner, automatic reassignment, workflow-parent roll-up, AI grading, arbitrary workflow language, hard billing enforcement or external process cancellation. Those ideas remain deferred, without a delivery milestone.

## 5. Task Breakdown

- [x] **M53-T01** — Design canonical entity navigation and the pending/history interaction contract.
  - **Files**: .specs/adr/ADR-0047-authorized-navigation-and-bounded-history.md; .milestones/MILESTONE-53-workflow-correctness/design/UX-DESIGN.md; .test-plans/TEST-PLAN-0053-workflow-correctness/.
  - **Verify**: Review cross-project queues, direct task/artifact/Memory links, Back/reload, org Memory tier, inaccessible entities and every loading/empty/error state; record acceptance fixtures before code.

- [x] **M53-T02** — Resolve entity navigation from authorized resource scope across queues, search and detail screens.
  - **Files**: packages/shared-contract/main.tsp; apps/backend/src/modules/tasks/tasks.handler.ts; apps/backend/src/modules/artifacts/artifacts.handler.ts; apps/gui/src/hooks/useScope.ts; apps/gui/src/components/layout/GlobalSearch.tsx; apps/gui/src/features/Tasks/; apps/gui/src/features/Memory/; apps/gui/src/features/Tasks/InputRequests.tsx; apps/gui/src/features/Tasks/Approvals.tsx.
  - **Verify**: Open project B entities from project A, missing/conflicting scope links and org Memory; URL, sidebar, breadcrumbs and actions agree; Back preserves origin; inaccessible resources expose no metadata.

- [x] **M53-T03** — Show every supported search type with distinct loading, no-match and recoverable failure states.
  - **Files**: apps/gui/src/components/layout/GlobalSearch.tsx; apps/gui/src/components/layout/GlobalSearch.test.tsx; apps/backend/src/modules/search/.
  - **Verify**: Task/artifact/project/agent/belief fixtures remain actionable; initial and subsequent failed queries show retry; out-of-order requests cannot replace current results; keyboard navigation remains usable; test both SQL dialects for requested types.

- [x] **M53-T04** — Separate open requests from paginated history and make all organization pending rows reachable.
  - **Files**: apps/backend/src/modules/tasks/inputRequests.ts; apps/backend/src/modules/tasks/approvals.ts; apps/backend/src/db/query-builder.ts; apps/backend/src/modules/mcp/tools.ts; packages/shared-contract/main.tsp; apps/gui/src/features/Tasks/InputRequests.tsx; apps/gui/src/features/Tasks/Approvals.tsx; apps/gui/src/features/Tasks/; apps/gui/tests/e2e/.
  - **Verify**: An old open question beyond 20 newer closed rows and approval beyond 10 remain visible; more than 50 organization pending rows are reachable by bounded paging; next-page errors retry without hiding earlier rows; source decisions reconcile both sections.

- [ ] **M53-T05** — Protect task summary drafts through every dismissal path and failed save.
  - **Files**: apps/gui/src/features/Tasks/TaskSummary.tsx; apps/gui/src/features/Tasks/index.tsx; apps/gui/tests/e2e/.
  - **Verify**: Escape, backdrop, close, route navigation and task switch follow one discard/restoration policy; background refresh and failed save retain text; A draft never appears on B; explicit cancel discards; successful save clears dirty state.

- [ ] **M53-T06** — Honor explicit empty MCP summaries and document actual workflow/template semantics.
  - **Files**: apps/backend/src/modules/mcp/tools.ts; apps/backend/src/modules/mcp/tools.test.ts; docs/agent-integration.md; docs/mcp.md.
  - **Verify**: Empty summary reaches exactly one existing RPC; missing/null/non-string text, empty IDs and oversized text still fail; example never promises project-wide claim-next selects one step; template org/project visibility and ordinary parent claimability are accurate.

- [ ] **M53-T07** — Verify existing human workflows end to end and close the correctness review.
  - **Files**: apps/gui/tests/e2e/; .milestones/MILESTONE-53-workflow-correctness/reviews/; docs/.
  - **Verify**: Run full GUI coverage, backend/MCP suites, scoped browser journeys and moon check --all; review notification links and task dialogs without reviving disproved dialog-masking claim.

## 6. Verification

1. Write and run a behavioral regression before implementation; for design/static documents, record why runtime TDD does not apply.
2. Run focused tests, then affected complete suites and generated client/wire checks.
3. Exercise both SQL dialects when persistence/query semantics change; run actual browser journeys for screen and navigation behavior.
4. Run `moon check --all`, affected explicit integration/E2E/standalone checks and an independent four-lens review for heavy tasks.
5. Retain commands/results and screenshots where useful. Commit each completed task with its journal and ledger. Publish through a PR and merge to main only after actual CI passes.

## 7. Risks

- Optional fields and additive migrations must preserve old clients and existing data; recheck fresh protobuf numbers against intervening changes.
- Tenant and owner identity come from current authorization; resource IDs and saved definitions never grant access.
- Paginated source truth must stay complete without an unbounded fetch-all or capped summary panel.
- Secrets, large artifact bodies and external runner assumptions require the exact boundaries in the delivery map.
- Roll back GUI/tool exposure first; retain additive data/receipts. Document any migration that prevents a previous binary from safely writing. Never silently downgrade/drop user data.
