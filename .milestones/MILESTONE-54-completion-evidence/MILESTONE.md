---
id: M54
title: Completion Evidence
status: done
goal: External workers can discover, attach and read bounded task evidence through MCP, and people can inspect that evidence with accurate provenance.
depends_on: [M46, M53]
surfaces: [backend, gui, contract, specs]
exit_criteria_met: true
started_at: 2026-11-09
completed_at: 2026-11-09
---

# M54 — Completion Evidence

## 1. Goal

External workers can discover, attach and read bounded task evidence through MCP, and people can inspect that evidence with accurate provenance.

## 2. Why Now

Task summaries describe work; existing artifact records supply reviewable outputs without another document store.

## 3. Exit Criteria

- [x] MCP workers can discover folders/artifacts, create/link evidence and explicitly read bounded stored content using existing permissions.
- [x] Opt-in digest evidence stays bounded and ordinary digest clients need no new scope.
- [x] People can inspect evidence with source/time/provenance and honest unavailable states.
- [x] Both dialects, generated clients, wire compatibility and real worker-to-human journeys pass.

## 4. Scope

In scope: the tasks below, compatible contracts/migrations, authorization, explicit UI states, independent review and recorded verification.

Related work: event reliability M46; schedule recovery M47; client reconciliation M48; production evidence M49; operational documentation M50; workflow correctness M53; artifacts/evidence M54; attention M55; guided connection M56; optional claim receipts M57; URL/named views M58. The program introduces no hosted runner, automatic reassignment, workflow-parent roll-up, AI grading, arbitrary workflow language, hard billing enforcement or external process cancellation. Those ideas remain deferred, without a delivery milestone.

## 5. Task Breakdown

- [x] **M54-T01** — Define compatible evidence bounds, provenance and permissions before extending contracts.
  - **Files**: .specs/adr/ADR-0042-completion-evidence.md; .milestones/MILESTONE-54-completion-evidence/design/UX-DESIGN.md; packages/shared-contract/main.tsp.
  - **Verify**: Specify fresh optional field numbers, stored-representation prefixes, server-side limits, metadata-only digest opt-in and retry semantics; ordinary tasks:read digests remain valid without artifacts:read; no implicit completion enforcement.

- [x] **M54-T02** — Add thin MCP artifact discovery/create/link/read tools backed by bounded existing RPCs.
  - **Files**: apps/backend/src/modules/mcp/tools.ts; apps/backend/src/modules/artifacts/artifacts.handler.ts; packages/shared-contract/; apps/cli/gen/.
  - **Verify**: Exactly one RPC per tool; folder discovery is possible; link list pagination precedes name lookups; body prefix is bounded in SQL, truncated is explicit, create input is bounded; wrong org/missing scope denied; unlink remains human-only.

- [x] **M54-T03** — Expose opt-in bounded artifact metadata in task digests without reading bodies.
  - **Files**: apps/backend/src/modules/tasks/digest.ts; apps/backend/src/modules/artifacts/; packages/shared-contract/; apps/backend/src/modules/mcp/.
  - **Verify**: Existing digest contract remains compatible; includeArtifacts requires artifacts:read; cap links before metadata lookup and propagate truncation; assert body columns are not selected; fresh generated TS/Go and wire checks pass.

- [x] **M54-T04** — Present task completion evidence beside summaries and existing repository/build signals.
  - **Files**: apps/gui/src/features/Tasks/; apps/gui/src/components/; apps/gui/tests/e2e/.
  - **Verify**: Review surface identifies author/time/source and accessible artifact links; distinguishes worker-reported evidence from provider-observed signals; handles no evidence, removed/inaccessible artifacts, loading/error and large content; responsive/keyboard stories pass.

- [x] **M54-T05** — Verify worker-to-human evidence handoff and publish precise integration examples.
  - **Files**: docs/mcp.md; docs/agent-integration.md; .milestones/MILESTONE-54-completion-evidence/reviews/; apps/backend/src/test/wire/.
  - **Verify**: MCP discover/create/link/digest/explicit body read journey with oversized literal and encoded representations; cross-tenant/task denial, legacy digest and retry behavior; full gates, browser checks and standalone packaging pass.

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
