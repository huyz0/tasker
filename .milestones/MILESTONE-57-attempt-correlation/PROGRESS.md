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
