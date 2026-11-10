# M57 — Attempt Correlation progress

## M57-T01 — Define durable claims and optional evidence correlation

- **Status**: done
- **Date**: 2026-11-10
- **Changed**: Accepted ADR0043, Claim history UX and TC001–010 with five preserved independent review records; no runtime API, migration or screen change.
- **Verified**: ARCH-v3/UX-v2 approve. All36 checks pass in full2 (33 cached,5m48s), including GUI1622/95.13% branches; backend2302/zero failures passed full1 and is cached in full2. Three earlier failing unchanged GUI files pass168/168 alone. M56 PR #9 still needs actual final-head CI/main publication.
- **Notes**: API/security standards and the static-document TDD exception apply. This is a heavy task because durable ownership receipts cross persistence, wire, authorization and evidence boundaries. Record ADR0043, an accessible claim-history UX specification and executable acceptance cases; preserve existing optional-client behavior and distinguish ownership from process execution. Work is isolated from M56 and original user WIP; reconcile the base after M56 publication.
- **Next**: M57-T02 — drive atomic receipt, replay, exact-release, unassign and owner-retention regressions before implementation; reconcile the base after M56 publication.

### Design review and boundary checks

- Accepted ADR0043, Claim history UX and TC001–010 define exact winning ta-ID receipts, real immutable ownership facts, current access plus owner-bound delayed association, legacy omission, bounded SQL paging and exact-generation release before handoff effects. T01 reserves fresh optional wire numbers in the ADR; TypeSpec/generated exposure remains with the actual T02/T03 implementations so no unimplemented RPC is advertised.
- ARCH-v1 catches actual retention agent purge removing assignments on surviving tasks; the design now requires exact-ID atomic closure with owner_purged/system semantics and retained owner snapshots, while preserving existing report-deletion policy. ARCH-v2 approves that correction.
- UX-v1 identifies eventless remote unassign/retention closure and human Add link while filtering an agent's receipt. The amended design refreshes only the visible current history page every30seconds, stops on hidden/collapse/scope/denial, and tests the no-event case. A filtered reader never becomes report owner: legacy link writes remain unassociated, with actual-response-aware feedback and Show all reports. ARCH-v3/UX-v2 approve the final artifacts.
- Static preflight initially used an incorrect root task alias; resolved the actual worktree-derived Moon ID. The real doc-drift gate then caught a missed M57 ledger status row, corrected to in-progress before the full run. Full36 is running against unchanged M56 runtime source. No M57 runtime behavior, migration or API change is claimed delivered.

### Fresh-checkout verification

- Full1 passes backend2302/zero failures and the other completed source/build checks, but the GUI has9 failures/1613 passes under concurrent fresh-build load. Failures are initial render/wait or5000ms deadline cases in existing Tasks/index, Artifacts/index and canonicalNavigation files; M56 connection cases pass. No runtime source changed in M57, and no assertion/deadline is relaxed.
- The three unchanged affected files pass alone:168/168,72.43seconds, one worker. Final static docs/doc-drift pass (502 documents). Full2 limits Moon task concurrency to2 with the standard two GUI workers; source/build caches are now warm. Closure still requires its actual result.
- Full2 passes all36 checks (33 cached,5m48s). GUI115/115 files and1622/1622 cases pass with95.13% branches; no assertion, deadline or product source was changed. Backend2302/zero failures from full1 remains valid in the cached result. Accepted static boundaries satisfy T01; runtime receipt/API and rendered behavior remain T02–T05. Overall380 done/16 pending; M57 is1/5 tasks, with no exit criterion yet claimed met.

## M57-T02 — Persist exact claim generations and transactional closure

- **Status**: done
- **Date**: 2026-11-10
- **Changed**: Compatible claim/release receipt fields, generated clients, additive SQLite0065/MySQL0053, exact-ID transactional release/unassign/retention closure, retained snapshots, parent cascades and real regression/upgrade coverage.
- **Verified**: CODE-v1 approves. Full2 passes all36 checks (17 cached,6m25s): backend2318/zero failures/95.89% functions/96.83% lines and GUI1622/95.13% branches. Explicit backend/GUI app types,15 SQLite receipt cases,46 real MySQL assertions,4 both-dialect upgrade cases/32 assertions,447 old messages/1283 fields/15 actual old-client decodes and3 restored rollback faults pass. M56 is published as681dc20 after all8 final-head jobs; post-main jobs remain pending.
- **Notes**: API/security standards plus TDD reselected. This heavy task reuses accepted ADR0043 and TC001–005; no new architecture/UX alternative is introduced. Keep the winning ta-ID, current authorization before replay, immutable owner/task/org/time/correlation, optional generation fencing and exact-ID transactional release/unassign/owner-retention closure. Preserve old data/clients and do not advertise the T04 history RPC early. Both dialects, controlled rollback faults, generated/wire compatibility and independent four-lens review must pass before completion.
- **Next**: M57-T03 — optional owner/task-bound report correlation and worker arguments; reconcile onto published main after this clean checkpoint.

### Initial red/green and affected checks

- Six real SQLite regressions fail for missing returned/persisted receipts, ignored changed correlation and stale same-agent release before any production edit (`/tmp/tasker-m57-t02-red.log`). Initial receipt/schema/handler changes make all6 pass; the expanded14 receipt cases plus existing assignment, work queue, replay authority, cascade and retention suites pass59/59.
- Additive SQLite0065/MySQL0053 create the receipt table without backfill or owner foreign keys. The winning ta-ID and real second-resolution timestamp persist in the existing claim transaction. Release/unassign and actual owner-retention purge now remove exact selected IDs and close matching receipts in one unit; parent task/project cascades delete receipt children. No new event family, scope or history RPC is exposed.
- TypeSpec plus the maintained protobuf projection add only fresh optional claim/release fields and TaskAttempt; buf regenerates TS/Go successfully. Preserve existing protobuf scalar presence/reservations instead of replacing the maintained file with the TypeSpec emitter output, which differs. Append the new protobuf message to retain old generated message indexes. An explicit backend typecheck catches two new test-only ClaimNext union accesses; local typed response holders correct them without changing assertions. Both-dialect migration/races, legacy-client proof, faults, review and full gates remain pending.

### Dialect, upgrade and rollback proof

- SQLite receipt cases now15/15 (76 assertions), including unchanged ownership after terminal status/archive. The affected six-file run passes59 cases before that final invariant case was added. The actual MySQL proof passes46 assertions in19.3seconds: one winner across8 pool contenders, same-ID replay, stale same-agent refusal before handoff, ClaimNext/human receipts, legacy omission, receipt-insert rollback and release/unassign/owner-purge closure rollback.
- Populated application upgrade/reboot proof passes SQLite and MySQL without synthesizing historical receipts or rewriting legacy notes; the existing artifact upgrade test remains pinned to its actual historical boundary when this later migration is appended. Combined both-dialect claim/evidence run passes4 cases/32 assertions. An initial migration test import typo is corrected to the existing embeddedMigrations module before the successful run.
- An actual pre-M57 SDK from52c7ba4 retains447 existing messages/1283 field signatures and passes15 old-client binary decodes/unknown-field roundtrips (`/tmp/tasker-m57-t02-old-contract.log`). New TypeSpec/protobuf generation succeeds. Backend typechecks identify only new fixture typing (ClaimNext union holders and the fixed two-agent tuple), corrected without weakening checks.
- Three controlled source faults independently remove release, unassign and owner-purge transaction ownership. Each fails its real ownership-rollback assertion as intended; all source is restored and the14-case suite passes. No test deadline/assertion or product permission was relaxed. Four-lens CODE review/full36 and final types remain pending; T02 is not complete.

### Source approval and publication base

- Final SQLite invariance suite passes15/15 (76 assertions), and the explicit backend typecheck passes after the fixed-size MySQL actor tuple is typed correctly. CODE-v1 independently approves all four lenses with no blocking findings. Full1 stops at TypeSpec formatting; the formatter corrects whitespace only, with no runtime or assertion change. Full2 remains required.
- M56 PR #9 passes all8 actual final-head jobs42812207225 and merges to main as681dc205e2e891f9c40b6505b85cc7de63eb92af. Fetched main and tested daab6a1 have identical trees92f830ad3c3a058c01543b54b993bef63ecb21f0. Post-main CI42822658627 and real integration42822658587 are pending. After T02 has a clean checkpoint, reconcile this work onto the published base using a new owned delivery branch so the earlier pushed checkpoint remains intact.
- Full2 passes all36 checks (17 cached,6m25s), including backend2318/zero failures/95.89% functions/96.83% lines, GUI1622/95.13% branches and generated/Go/standalone checks. Backend and GUI app explicit types pass. T02 is complete locally; M57 is2/5 tasks with report association/history UI/end-to-end work still pending. Overall381 done/15 pending; no production claim-history UI is asserted.
