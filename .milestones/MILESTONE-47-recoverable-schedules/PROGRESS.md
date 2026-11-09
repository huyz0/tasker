# M47 Progress

## M47-T01 — Design recoverable schedule occurrences

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Define frozen occurrence identity/admission, fenced recovery, atomic work receipts, current authority and update/delete races before implementation.
- **Verified**: Current handler advances nextRunAt before fire and commits work separately from history; these are the admission and completion crash gaps to remove. Independent reliability/human-workflow design reviews now approve after v1 corrections (silent expiry, action consequences, wording and owned task-link scope). Initial full check hit an existing dashboard setup-hook timeout under concurrent suites; that case passes three isolated repetitions (24 tests / 0 failures). Serial `moon --concurrency 1 check --all` passes all 35 tasks (30 cached); all 96 GUI files pass (1338 tests / 95.25% branches), backend has zero failures. ADR/UX/test plan define identity, frozen inputs, lease ownership, retry and missed-slot semantics. Runtime TDD does not apply to these static design artifacts; T02–T04 must execute their regression scenarios.
- **Notes**: M45/M46 are published dependencies. This isolated branch starts from main 62a0c3f while M48 PR #4 final-head CI runs. Rebase onto published M48 and reconcile STATE before publication. Expanded planned surfaces to GUI/CLI/contract for history metadata and existing-screen observability; clarified T03 Verify around the stronger atomic work/receipt boundary. Heavy task produces ADR-0041, TEST-PLAN-0047 and UX for run-history states; no runtime code in T01. Existing cadence and external-worker model remain.
- **Next**: M47-T02 durable admission, after rebasing onto M48 publication when available.

## M47-T02 — Persist frozen due occurrences with advancement

- **Status**: in-progress
- **Date**: 2026-11-09
- **Changed**: Add additive occurrence/revision/tombstone schema and an admission core with frozen task/workflow inputs; serialize admission and schedule edits/deletion under current project/schedule locks.
- **Verified**: Initial real sweep regression fails with nextRunAt advanced and one untracked task after occurrence storage failure. Minimal atomic admission now passes it and all 11 existing schedule tests (12 total). Remaining: full frozen workflows, mutation locking/tombstones, independent-process admission and both-dialect upgrade proof; task remains in progress.
- **Notes**: ADR-0041 and TEST-PLAN-0047 bind implementation. T02 delivers admission/storage foundations; T03 activates leased execution with the existing sweep so no unreviewed intermediate worker is published. Workflow snapshot preparation is an internal boundary shared with the public handler, never an arbitrary-graph RPC. Standards: API/security; TDD.
- **Next**: Rebase this WIP onto M48 publication; finish frozen workflow inputs, races and migration/process evidence before checking T02.
