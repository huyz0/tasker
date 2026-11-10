---
id: M55
title: Attention Center
status: in-progress
goal: A person can find and resolve current questions, approvals, reviews and stalled claims from one scoped screen without losing underlying source truth.
depends_on: [M48, M53, M54]
surfaces: [backend, gui, contract, specs]
exit_criteria_met: false
started_at: 2026-11-09
completed_at: null
---

# M55 — Attention Center

## 1. Goal

A person can find and resolve current questions, approvals, reviews and stalled claims from one scoped screen without losing underlying source truth.

## 2. Why Now

Existing intervention queues are scattered; correct scope and complete pending lists make one useful entry point possible.

## 3. Exit Criteria

- [ ] A scoped screen exposes all current actionable sources through bounded independent pagination.
- [ ] Every row states why action is needed and routes or acts using its actual scope.
- [ ] Existing source actions govern resolution, permissions and stale decisions.
- [ ] No second inbox database or notification state is introduced; full authorization/browser journeys pass.

## 4. Scope

In scope: the tasks below, compatible contracts/migrations, authorization, explicit UI states, independent review and recorded verification.

Related work: event reliability M46; schedule recovery M47; client reconciliation M48; production evidence M49; operational documentation M50; workflow correctness M53; artifacts/evidence M54; attention M55; guided connection M56; optional claim receipts M57; URL/named views M58. The program introduces no hosted runner, automatic reassignment, workflow-parent roll-up, AI grading, arbitrary workflow language, hard billing enforcement or external process cancellation. Those ideas remain deferred, without a delivery milestone.

## 5. Task Breakdown

- [x] **M55-T01** — Define actionable source states and a grouped attention flow with independent cursors.
  - **Files**: .milestones/MILESTONE-55-attention-center/design/UX-DESIGN.md; .test-plans/TEST-PLAN-0055-attention-center/; packages/shared-contract/main.tsp.
  - **Verify**: For each source define ID, reason, age, owner, org/project, next action, permission and resolution rule; distinguish unresolved work from history; no duplicate inbox records or read/unread state.

- [x] **M55-T02** — Project current authorized source records with complete bounded paging and stable source identity.
  - **Files**: apps/backend/src/modules/attention/; apps/backend/src/modules/tasks/; packages/shared-contract/; apps/cli/gen/.
  - **Verify**: Use source kind+ID identity and per-source cursors; old/more-than-50 pending rows remain reachable; no capped Dashboard/Reports result reused as a complete queue; same-org permission filtering and current authorization apply.

- [ ] **M55-T03** — Build the attention screen with reason, age, ownership and accurate project context.
  - **Files**: apps/gui/src/features/Attention/; apps/gui/src/App.tsx; apps/gui/src/components/layout/AppShell.tsx; NAVIGATION.md.
  - **Verify**: Each group supports loading/empty/error/next-page retry, keyboard and mobile layouts; accessible count labels say what is loaded/total; canonical links use actual source scope; existing queues remain reachable.

- [ ] **M55-T04** — Resolve attention through existing source mutations and reconcile stale/live changes.
  - **Files**: apps/gui/src/features/Attention/; apps/gui/src/lib/eventQueryKeys.ts; apps/backend/src/modules/attention/.
  - **Verify**: Answer/decide/review/unassign uses existing server rules; successful actions remove current item and update original source; stale decisions and revoked permissions recover clearly; reconnect invalidates current truth; no competing state machine.

- [ ] **M55-T05** — Verify supervision journeys, pagination and permissions and document the new entry point.
  - **Files**: apps/gui/tests/e2e/; apps/backend/src/test/wire/; docs/; .milestones/MILESTONE-55-attention-center/reviews/.
  - **Verify**: Resolve every supported source across projects with >50 fixtures, live updates and reconnect; cross-tenant denials, full suites, a11y/overflow stories, standalone and all gates pass.

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
