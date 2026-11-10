---
id: M58
title: Operational Views
status: in-progress
goal: Task and report filters survive reload and browser history, and people can reopen named tenant-safe personal or explicitly shared query definitions.
depends_on: [M53]
surfaces: [backend, gui, contract, specs]
exit_criteria_met: false
started_at: 2026-11-10
completed_at: null
---

# M58 — Operational Views

## 1. Goal

Task and report filters survive reload and browser history, and people can reopen named tenant-safe personal or explicitly shared query definitions.

## 2. Why Now

Useful operational views currently disappear when local screen state resets.

## 3. Exit Criteria

- [x] Tasks and Reports use validated URLs as the source of view state across reload and history.
- [ ] Named definitions are personal by default; shared editing has an explicit checked server policy.
- [ ] Saved definitions confer no data access and revalidate referenced resources when used.
- [ ] Obsolete/malformed definitions recover clearly and tenant/history/browser/full-gate checks pass.

## 4. Scope

In scope: the tasks below, compatible contracts/migrations, authorization, explicit UI states, independent review and recorded verification.

Related work: event reliability M46; schedule recovery M47; client reconciliation M48; production evidence M49; operational documentation M50; workflow correctness M53; artifacts/evidence M54; attention M55; guided connection M56; optional claim receipts M57; URL/named views M58. The program introduces no hosted runner, automatic reassignment, workflow-parent roll-up, AI grading, arbitrary workflow language, hard billing enforcement or external process cancellation. Those ideas remain deferred, without a delivery milestone.

## 5. Task Breakdown

- [x] **M58-T01** — Make task/report view mode, filters, sort and reporting window URL-owned.
  - **Files**: apps/gui/src/features/Tasks/; apps/gui/src/features/Reports/; apps/gui/src/hooks/; .milestones/MILESTONE-58-operational-views/design/UX-DESIGN.md.
  - **Verify**: Reload, deep link and Back/Forward reproduce supported state; parse malformed values safely; changing org/project removes invalid references; saved definitions/local cache never silently replace current URL scope; no result snapshots in URLs.

- [ ] **M58-T02** — Persist validated named query definitions with server-derived owner and explicit shared permissions.
  - **Files**: .specs/adr/ADR-0044-saved-view-ownership.md; apps/backend/src/modules/views/; apps/backend/src/db/schema.*.ts; apps/backend/drizzle-*/; packages/shared-contract/.
  - **Verify**: Private views are creator-only; organization-shared creation/edit/delete uses an explicit existing admin permission; never trust submitted owner/org; validate allowed query fields and referenced resources on save/load/use; ID guessing/cross-tenant access denied; store definitions only, never SQL/results/access rights.

- [ ] **M58-T03** — Add personal/shared view save, open, rename and delete flows with recoverable obsolete filters.
  - **Files**: apps/gui/src/features/Tasks/; apps/gui/src/features/Reports/; apps/gui/src/components/SavedViews/; packages/shared-contract/; apps/cli/gen/.
  - **Verify**: Applying a view updates URL intentionally; distinguish personal/shared ownership and editable state; removed statuses/labels/projects show recovery; no-access/error/empty/cancel and dirty naming states are usable; keyboard/mobile/a11y stories pass.

- [ ] **M58-T04** — Verify history, sharing permissions and deleted-resource recovery end to end.
  - **Files**: apps/gui/tests/e2e/; apps/backend/src/test/wire/; docs/; .milestones/MILESTONE-58-operational-views/reviews/.
  - **Verify**: Test two users in one org plus another org, private-ID guessing, shared admin-only edits, scope revocation/deleted references, reload and Back/Forward; both dialects, migrations, generated clients and all gates pass.

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
