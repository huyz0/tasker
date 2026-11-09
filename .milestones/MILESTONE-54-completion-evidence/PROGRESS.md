# M54 delivery journal

## M54-T01 — Define bounded evidence and provenance before contracts

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Design additive evidence limits, stored-representation prefixes, metadata-only opt-in digest authorization and human provenance states before implementation.
- **Verified**: M46/M53 dependencies are locally complete; M53 candidate c82fada has35 source checks/42 browser journeys and final story matrices, while PR #6 remote CI still gates its publication.
- **Notes**: API/security standards selected with TDD protocol. This task is static ADR/UX/acceptance design; no runtime behavior is added, so runtime TDD applies from T02. Heavy review uses existing reviewers. No contract field is changed or reserved until actual fresh-number verification. Original worktree/services remain preserved; new branch must reconcile onto published M53 before publication.
- **Next**: Inspect current boundedness/permissions/provenance, record alternatives and executable scenarios, independent review and full checks.

Independent initial reviews reject ambiguous folder permission wording and the
missing metadata path beyond the digest cap. ARCH-v1 and UX-v1 retain findings.
Amendments preserve agent-capable CreateFolder RPC, add paged evidence metadata,
pin precise/coarse size units and archived policy, use one mutable-reference
Evidence surface, sanitize unavailable nested names and require15s visible
current-page-chain refresh because existing events do not cover every link or
cross-project change. ARCH-v2/UX-v2 approve; TC001–009 bind implementation proof.

M53 PR #6 merges as53b47d6 after eight CI jobs on exact headc82fada and both
real-integration jobs pass. Published main has the same tree as the design base;
reconcile this branch before publication. Current T01 is static design only.

Accepted artifact map adds paged evidence metadata/provenance and nullable link
actor/time migrations in T02, beyond its initially listed handler/contract
paths. This necessary scope is additive and reviewed, not a new evidence store.
No implementation, generated field change or runtime scenario is marked passed.

T01 final baseline verification passes all35 local checks (onecached) in the
fresh worktree: GUI1475/95.43% branches, backend2207/57gated skips/zero failures,
CLI93.8%, contracts/wire/standalone and design/document checks. New static
artifacts add no runtime behavior; future TC001–009 are not claimed executed.
Task01 is complete:1/5 M54 tasks,366 done/30 pending overall. T02 begins with
observed bounded-read/paging/tool/provenance regressions after branch reconciliation.

## M54-T02 — Implement bounded artifact adapters and provenance

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Reproduce unbounded content/link reads and absent MCP mappings before additive contract generation, binary SQL prefixes, paged metadata and forward-only link actor/time storage.
- **Verified**: T01 committed/pushed as6a62b3b on published main53b47d6; all35 baseline checks and35/32cached closure checks pass. Draft PR #7 is attached.
- **Notes**: API/security standards and TDD selected. Accepted ADR0042/UX/TC001–009 govern the heavy task. Additive nullable migrations/provenance and shared metadata helper are required beyond initial handler/contract file hints. Keep each MCP adapter one RPC, omit folder/unlink adapters, preserve ordinary digest behavior for T03 and existing omitted-limit/unpaged clients. No new dependency.
- **Next**: Observe focused red tests for prefixes/server bounds, page-before-lookup metadata, provenance and tool catalogue; implement/generate, then both-dialect/full/wire/independent review.

Observed initial RPC reds:15 of16 cases fail on full stored body/absent bound
validation, full source projection, missing page metadata and absent provenance;
foreign authorization stays passing. MCP adapter catalogue/protocol tests fail
on absent tools before any implementation. Contract additions use freshly
verified fields2/4/5, link6/7 and page/evidence2/3; digest opt-in stays for T03.

First implementation passes53 focused cases; expanded artifacts/MCP suites pass
129. A duplicate-name resource red narrows create's existing lookup to ID only.
Source review catches stored BOM consumption and optional null schema acceptance.
Two SQLite BOM reds, a real MySQL BOM red and three null/zero-RPC reds are
observed; CODE-v1 preserves findings. Decoder now preserves BOM and host validates
explicit null. Resource tests observe actual prefix bytes/link row count before
response shaping and forbid metadata body transfer under aliases. MySQL fixture
uses60s for fresh migration plus25 serial writes; its initial5s harness timeout
is excluded, without changing handler budgets. Final both-dialect/source proofs
remain pending. The checked-in proto preserves pre-existing optional/stream
annotations; it is updated additively before actual TS/Go generation.

Final correction checkpoint:138 focused cases and backend TSC pass. Real MySQL
content/create/update/page/provenance proof passes56 assertions, including BOM,
NUL, Unicode and empty content. SQLite driver probes show native text binding
consumes a leading BOM and empty BLOB results are null. Independent stored-byte
fixtures plus separate create/update reds drive binary binding only for leading
BOM writes and empty-prefix normalization; accepted ADR records this boundary.

Six restored faults fail: full prefix under alias, uncapped source links, body
under metadata alias, BOM consumption, optional null and foreign cursor position.
Raw-result tests enforce byte/row bounds before response shaping. Old-schema
SQLite and MySQL application upgrade/reopen proofs preserve existing link IDs/
content and unknown provenance even on repeat. SQLite legacy fixture now includes
the historical FTS startup table before applying old migrations; its initial
missing-table setup failure is excluded. Main MySQL proof is strengthened to
create/drop its own random schema, independently of the private disposable runner.
Corrected independent source reviews approve, with final full/compatibility
gates still required. No T03 digest or T04 UI behavior is claimed delivered.

Pre-full checkpoint: backend TSC is green after adding upgrade fixtures. The
main MySQL harness owns its random schema and restores DB_NAME in finally; a
local variable collision was rejected by Bun before execution and corrected.
A separate schema inventory confirmed no orphan main-test schema existed. The
final combined own-schema MySQL/SQLite run is in progress, followed by all35
workspace gates. T02 remains in-progress and PR #7 remains draft.

Final combined disposable-schema checks pass3 cases/68 assertions, covering both
dialects' literal content and old-link upgrade/reopen. Old-client compatibility
checks preserve442 messages/1241 fields and pass four old TS protobuf decodes
plus four old Go JSON/four protobuf decodes. CODE-v2 approves corrected source
and observed boundary proofs; full35 checks remain in progress. Implementation
checkpoint is committed/pushed asfb0b578; T02 remains unchecked pending full gate.

T02 final full verification passes35 checks (8cached): GUI1475/95.43% branches,
backend2255/59environment-gated skips/zero failures with95.84% functions and
96.75% lines, CLI93.8%, contract/wire and standalone gates. Actual checkpoint
CI42696236198 passes all eight jobs including full GUI E2E and rendered story
checks. Both-dialect/legacy upgrade proofs, six restored faults and old-client
compatibility remain as recorded. CODE-v2 approves; T02 is complete,2/5 M54
tasks and367 done/29 pending overall. Final milestone/head CI still gates PR #7
publication; T03 opt-in digest and T04/T05 UI/live handoff are not implemented.

## M54-T03 — Opt-in bounded artifact metadata in task digests

- **Status**: in-progress
- **Date**: 2026-11-09
- **Changed**: Reproduce missing opt-in evidence and missing scope enforcement before optional contract fields and a capped metadata-only digest read.
- **Verified**: T02 committed/pushed as6ef19d7 after all35 source/closure checks, both-dialect/old-link/wire/fault evidence and CODE-v2 approval.
- **Notes**: API/security standards plus TDD selected. Accepted ADR0042/TC004/TC008 govern this authorization boundary; no new ADR/UI design. Omitted/false includeArtifacts must retain tasks-only reads and perform no artifact query. True requires current artifact-read authority, caps raw links before lookup and combines truncation without selecting bodies. Reuse T02 metadata logic and preserve old clients; no new dependency or persisted digest.
- **Next**: Observe ordinary/no-query, denied-opt-in, capped metadata/truncation and MCP input reds; add fresh fields/generate, then both-dialect/full/compatibility review.

Initial T03 red run observes10 failures/4 passes: ordinary/false task-only reads
and foreign-task refusal already hold; requested metadata/scope refusal/cap and
MCP opt-in are absent. Fresh TaskDigest field7 and request field2 are verified
free against6ef19d7 before additive TSP/proto generation. T02 raw-result tracing
is extracted unchanged into a private test helper for reuse by digest bounds.

T03 source checkpoint passes64 focused cases/1054 assertions and backend TSC.
Real owned-schema MySQL digest/content proof passes62 assertions: ordinary/false
tasks-only calls, refused opt-in and authorized20-entry evidence. Fresh additions
preserve442 legacy messages/1241 fields and six old TS protobuf plus six old Go
JSON/six protobuf decodes, including digest messages. Seven restored faults fail
for authority/default widening/source cap/both truncation families/MCP forwarding/
metadata body alias. CODE-v3 approves corrected source with no findings; final
full35 checks remain pending and T03 stays in-progress.
