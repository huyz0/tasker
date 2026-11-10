---
id: M57
title: Attempt Correlation
status: in-progress
goal: Claims leave durable generation receipts and workers can optionally associate notes, usage and artifacts with the correct claim after release.
depends_on: [M46, M54]
surfaces: [backend, gui, contract, cli, specs]
exit_criteria_met: false
started_at: 2026-11-10
completed_at: null
---

# M57 — Attempt Correlation

## 1. Goal

Claims leave durable generation receipts and workers can optionally associate notes, usage and artifacts with the correct claim after release.

## 2. Why Now

Deleted assignment rows erase useful execution attribution, while a receipt avoids duplicating external runner state.

## 3. Exit Criteria

- [ ] A winning claim has one durable identity retained after ownership removal; idempotent replay returns that identity.
- [ ] A stale expected generation cannot release a newer claim by the same agent.
- [ ] Optional notes/usage/artifact correlation is bound to authenticated owner and task while legacy fields remain optional.
- [ ] Paginated history states ownership facts only; both-dialect, wire and end-to-end tests pass.

## 4. Scope

In scope: the tasks below, compatible contracts/migrations, authorization, explicit UI states, independent review and recorded verification.

Related work: event reliability M46; schedule recovery M47; client reconciliation M48; production evidence M49; operational documentation M50; workflow correctness M53; artifacts/evidence M54; attention M55; guided connection M56; optional claim receipts M57; URL/named views M58. The program introduces no hosted runner, automatic reassignment, workflow-parent roll-up, AI grading, arbitrary workflow language, hard billing enforcement or external process cancellation. Those ideas remain deferred, without a delivery milestone.

## 5. Task Breakdown

- [x] **M57-T01** — Define backward-compatible claim receipts, attribution and stale-release semantics.
  - **Files**: .specs/adr/ADR-0043-claim-attempt-correlation.md; .test-plans/TEST-PLAN-0057-attempt-correlation/; packages/shared-contract/main.tsp.
  - **Verify**: Reuse winning ta-* assignment ID; immutable authenticated owner/task/org/claimedAt plus optional externalRunId; release means ownership ended only; omitted fields remain legacy; no fabricated historical claim times or inferred execution outcomes.

- [x] **M57-T02** — Persist receipts atomically with claims and close the exact generation on release/unassign.
  - **Files**: apps/backend/src/modules/tasks/tasks.handler.ts; apps/backend/src/db/schema.*.ts; apps/backend/drizzle-*/; packages/shared-contract/; apps/cli/gen/.
  - **Verify**: Keyed replay returns same receipt; changed correlation with same key fails; racing claims create one receipt; reclaim creates another; expectedAttemptId fences stale release before handoff/deletion; human unassignment closes receipt transactionally; both migrations preserve old clients.

- [x] **M57-T03** — Accept optional task/owner-validated correlation on notes, usage and artifact links.
  - **Files**: apps/backend/src/modules/tasks/task_notes.handler.ts; apps/backend/src/modules/tasks/usage.ts; apps/backend/src/modules/artifacts/; apps/backend/src/modules/mcp/; apps/cli/cmd/; packages/shared-contract/.
  - **Verify**: Same task and credential-derived receipt owner required; ID confers no authority; delayed final usage after release works; other-task/agent/org rejected; omitted correlation remains ungrouped; do not auto-attach late legacy reports to current claim.

- [x] **M57-T04** — Expose paginated claim receipts and group associated evidence without inventing runtime status.
  - **Files**: apps/backend/src/modules/tasks/; apps/gui/src/features/Tasks/; packages/shared-contract/; apps/cli/cmd/.
  - **Verify**: tasks:read controls list; show claim/release timestamps, owner and optional external correlation; legacy ungrouped evidence remains visible; task status changes do not assert process stop/success; accessible loading/empty/error/page states.

- [ ] **M57-T05** — Verify retry, reclaim, delayed reporting and cross-tenant attribution end to end.
  - **Files**: apps/backend/src/test/wire/; apps/gui/tests/e2e/; docs/agent-integration.md; .milestones/MILESTONE-57-attempt-correlation/reviews/.
  - **Verify**: Run both-dialect migration/races, keyed response compatibility, stale release, preserved receipts, delayed owner usage, cross-task/agent denial and legacy omission; generated TS/Go/wire and full gates pass.

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
