---
id: M52
title: Verified Session Release
status: in-progress
goal: The completed session fixes have reproducible green release checks and can be published to main.
depends_on: [M44, M45, M51]
surfaces: [infra, specs]
exit_criteria_met: false
started_at: 2026-11-09
completed_at: null
---

# M52 — Verified Session Release

## 1. Goal

The completed authorization, transaction and UI fixes pass remote release checks with an audited dependency graph and reproducible integration setup.

## 2. Why Now

Publishing PR #1 exposed a shallow-checkout failure in both real integration jobs, an undeclared manual audit entry point hidden by a stale local cache, and twelve dependency advisories with patched releases available.

## 3. Exit Criteria

- [x] Integration jobs have the Git history Moon requires; the manual UI audit is a declared runnable entry with correct cache inputs.
- [ ] The installed dependency graph has no unaccepted high/critical advisory and the repository gates pass.
- [ ] GitHub release checks pass for the publication candidate; the PR and validation outcomes are recorded.

## 4. Scope

Include release configuration and security patch refreshes within existing dependency ranges. Preserve the unfinished M46 relay files in their original worktree. M46–M50 delivery is not completed by this release.

## 5. Task Breakdown

- [x] **M52-T01** — Repair integration checkout history and register the manual UI audit as an executable entry.
  - **Files**: .github/workflows/integration.yml; knip.json; moon.yml
  - **Verify**: Reproduce the original unused-file finding; integration checkout fetches full history and uncached knip passes.
- [ ] **M52-T02** — Refresh vulnerable dependencies and prove the publication candidate passes release checks.
  - **Files**: bun.lock; package.json if required; PROGRESS.md; .milestones/STATE.md
  - **Verify**: Dependency audit, full local gates, and remote integration/build/browser checks pass without weakening gates.

## 6. Verification

Use the actual failed GitHub jobs as reproduction for configuration changes; static configuration does not need tests that repeat constants. Run uncached knip, the dependency audit and full local gates. Observe both GitHub workflows before publication to main.

## 7. Risks

Dependency refreshes can affect tooling and UI; retain existing dependency ranges and run the full checks. Do not ignore advisories or disable checks to unblock publication.
