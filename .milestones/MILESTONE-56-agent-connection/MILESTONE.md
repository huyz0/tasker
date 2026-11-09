---
id: M56
title: Agent Connection
status: todo
goal: A person can register an agent, issue a least-privilege token, configure an external worker and verify that credential through an actual authenticated API request.
depends_on: [M54]
surfaces: [backend, gui, contract, cli, specs]
exit_criteria_met: false
started_at: null
completed_at: null
---

# M56 — Agent Connection

## 1. Goal

A person can register an agent, issue a least-privilege token, configure an external worker and verify that credential through an actual authenticated API request.

## 2. Why Now

Identity registration currently looks like deployment and leaves the first successful connection implicit.

## 3. Exit Criteria

- [ ] Registration and external runtime responsibilities are named accurately throughout the UI.
- [ ] Scoped configuration can be copied without browser persistence of the secret.
- [ ] Verified-at reflects a real request using that exact agent credential and its authorized identity.
- [ ] Denied/revoked/offline states and full first-connection browser/MCP journeys pass.

## 4. Scope

In scope: the tasks below, compatible contracts/migrations, authorization, explicit UI states, independent review and recorded verification.

Related work: event reliability M46; schedule recovery M47; client reconciliation M48; production evidence M49; operational documentation M50; workflow correctness M53; artifacts/evidence M54; attention M55; guided connection M56; optional claim receipts M57; URL/named views M58. The program introduces no hosted runner, automatic reassignment, workflow-parent roll-up, AI grading, arbitrary workflow language, hard billing enforcement or external process cancellation. Those ideas remain deferred, without a delivery milestone.

## 5. Task Breakdown

- [ ] **M56-T01** — Design registration-to-verification states and one-time secret handling.
  - **Files**: .milestones/MILESTONE-56-agent-connection/design/UX-DESIGN.md; .test-plans/TEST-PLAN-0056-agent-connection/.
  - **Verify**: Specify register, token issue, configuration and verified-at states; verification means one actual token-authenticated call, not runtime liveness; define loss/reissue/revocation and no-token/no-role/denied/error states.

- [ ] **M56-T02** — Rename identity-only deployment actions and guide role/agent registration.
  - **Files**: apps/gui/src/features/Agents/; apps/gui/src/features/Agents/; apps/gui/src/components/; docs/.
  - **Verify**: Register accurately describes creation; role selection and permissions are clear; empty list leads to first registration; cancelling/returning preserves meaningful non-secret context; responsive keyboard stories pass.

- [ ] **M56-T03** — Generate scoped external-worker configuration and verify the exact newly issued credential.
  - **Files**: apps/gui/src/features/Agents/; apps/backend/src/modules/agents/; apps/backend/src/lib/auth.ts; docs/mcp.md.
  - **Verify**: Scopes are explicit and least privilege; JSON/examples are correctly escaped; secret is shown once and copied explicitly; never stored in URL/localStorage/Zustand/logs; success requires an API request authenticated by that token and displays its real identity/org/scopes/time.

- [ ] **M56-T04** — Verify registration, token failure/revocation and first MCP activity journeys.
  - **Files**: apps/gui/tests/e2e/; apps/backend/src/test/wire/; docs/agent-integration.md; .milestones/MILESTONE-56-agent-connection/reviews/.
  - **Verify**: A real new token connects via CLI/MCP; invalid/revoked/wrong-origin credentials fail accurately; admin session success never marks token verified; inspection finds no secret persistence; full security/browser/gates pass.

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
