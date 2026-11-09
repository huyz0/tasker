---
id: M52
title: Release Candidate Validation
status: done
goal: The completed session fixes have reproducible release validation and pass local dependency and release checks.
depends_on: [M44, M45, M51]
surfaces: [cli, infra, specs]
exit_criteria_met: true
started_at: 2026-11-09
completed_at: 2026-11-09
---

# M52 — Release Candidate Validation

## 1. Goal

The completed authorization, transaction and UI fixes have an audited dependency graph, reproducible integration setup and passing local release checks. PR #1 owns remote execution and publication; main is merged only after its required workflows pass.

## 2. Why Now

Publishing PR #1 exposed a shallow-checkout failure in both real integration jobs, an undeclared manual audit entry point hidden by a stale local cache, and twelve dependency advisories with patched releases available.

## 3. Exit Criteria

- [x] Integration jobs have the Git history Moon requires; the manual UI audit is a declared runnable entry with correct cache inputs.
- [x] The installed dependency graph has no unaccepted high/critical advisory and the repository gates pass.
- [x] GitHub release workflows are enabled with repaired configuration and the candidate PR records validation outcomes; publication remains gated on remote success.

## 4. Scope

Include release configuration and security patch refreshes within existing dependency ranges. Preserve the unfinished M46 relay files in their original worktree. M46–M50 delivery is not completed by this release.

## 5. Task Breakdown

- [x] **M52-T01** — Repair integration checkout history and register the manual UI audit as an executable entry.
  - **Files**: .github/workflows/integration.yml; knip.json; moon.yml
  - **Verify**: Reproduce the original unused-file finding; integration checkout fetches full history and uncached knip passes.
- [x] **M52-T02** — Refresh vulnerable dependencies and prove local candidate readiness for remote release validation.
  - **Files**: bun.lock; package.json; apps/cli/go.mod; .prototools; PROGRESS.md; .milestones/STATE.md
  - **Verify**: JavaScript/Go audits, forced local gates and CLI checks pass; remote execution is tracked in PR #1 without weakening merge gates.

## 6. Verification

Use the actual failed GitHub jobs as reproduction for configuration changes; static configuration does not need tests that repeat constants. Run uncached knip, the dependency audit and full local gates. Observe both GitHub workflows before publication to main. This milestone records candidate readiness; remote completion is recorded in the PR so a commit does not claim the outcome of its own future CI run.

## 7. Risks

Dependency refreshes can affect tooling and UI; retain existing dependency ranges and run the full checks. Do not ignore advisories or disable checks to unblock publication.
