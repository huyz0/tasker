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

- **Status**: done
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

T03 full verification passes35 checks (9cached): GUI1475/95.43% branches,
backend2270/59environment-gated skips/zero failures,95.84% functions/96.75%
lines; CLI93.8%, generated contract/wire and standalone gates. CODE-v3 approves
the64 focused cases,62 real MySQL assertions, seven restored faults and eighteen
old-client decodes with442 messages/1241 existing fields preserved. T03 is
complete:3/5 M54 tasks,368 done/28 pending overall. T04 next moves the single
Evidence surface after Summary, with actual previews/browser proof; PR #7 stays
draft until T04/T05 and applicable final-head CI.

## M54-T04 — Present current evidence beside summary

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Evolve one task Evidence surface immediately after Summary, preserving reverse artifact Tasks, with bounded metadata/paging, current permission controls, scope-safe linker and visible refresh.
- **Verified**: T03 committed/pushed as1fa68a7 after all35 full/closure gates; no pending source failures. Independent human preflight specifies placement outside Summary disclosure, compact rows, historical link labels, mutable references and no duplicated sidebar list.
- **Notes**: Frontend/security standards plus TDD selected; accepted ADR0042/UX/TC006–009 govern heavy UI. Source has no authoritative capability-read RPC; client role/grant reconstruction would drift from policy. Amend the paged response with fresh optional canLink4/canUnlink5 advisory flags, using existing server write policy and preserving independent write authorization. This requires small backend/contract additions beyond initial GUI hints, with review and regressions before code. No new permission, event family, font, palette or dependency.
- **Next**: Approve capability/placement amendment; observe capability and UI state/paging/access/query-intent reds before implementation, then actual previews/browser/full proof.

T04 implementation checkpoint: five observed capability reds now pass using
existing server policy, with optional paged flags4/5 and independent write checks.
Eight initial UI reds pass; adapted reverse-link tests give22 focused successes.
Five additional access/page-chain/current-query/late-write/pending-reopen cases
pass against the real Connect transport. The access test's initial failure was a
fixture label mismatch (Retry versus the existing Try again), corrected before
accepting the result; deliberate behavior faults remain pending.

One Evidence surface is outside Summary and before Agent plan; task-side sidebar
duplication is removed, reverse artifact Tasks retained. Metadata refreshes without
body/owner reads. New recorded pull-request subsection consumes the workbench's
existing project query, filtering exact task IDs; no additional provider request
or build attribution. Last recorded is local upsert time, with incomplete/stale
sync copy. The existing unbounded project selector remains an M49 scale concern;
this UI does not imply a bounded or complete provider read. Account/org keys and
AbortSignal now partition that cache. Denied/error states hide cached records.
Five recorded-signal cases pass after the absent-component red. New deterministic
wire-backed stories cover evidence states without a live account; actual rendered
and broader/full verification are pending. T04 remains in-progress and unchecked.

Independent T04 source review identifies two control-state defects: global cache
invalidation could bypass explicit retry after read denial, and Refresh cleared
write denial before a fresh capability response. Both regressions fail as expected
(two observed reds). Query enablement now excludes unaccepted cached errors;
manual refetch can reauthorize only on success. A local write-denial latch survives
mutation reset/cancel and clears only after successful capability refresh. Seven
focused lifetime/denial cases pass after correction. Broader workbench97 cases
pass after its fixture supplies authenticated session; remaining21 affected
suites passed. TypeScript is clean and Storybook builds. Full rendering/coverage,
controlled faults and current-source browser proof remain pending. T04 is WIP.

T04 proof checkpoint:36 focused GUI cases pass after settling acceptance before
children become actionable (a delayed acceptance effect could otherwise trigger
a first-page retry after a quick next-page failure). The visible/focus/reconnect
test now awaits changed metadata, rather than a request counter before response
settles; no production freshness change was needed. Six deliberately broken
behaviors each fail and restore. Real MySQL passes70 assertions including paged
human/read-only-agent/write-agent capabilities and unchanged legacy shape.
All18 old-client decodes preserve442 message descriptors/1241 existing fields.

Two current-source live browser journeys pass, covering21 real links, loaded
extent, no metadata-triggered body reads, dirty summary refresh, keyboard source
activation/Back and permission→offline→explicit recovery. Four actual375/1280
light/dark captures are retained. Fresh Storybook build and234 stories pass936
accessibility scans and468 mobile overflow scans. The build predates the final
control-state-only correction and will be rebuilt/rechecked before closure.

Full35 run1 stops at one existing GlobalSearch real-debounce readiness wait:
1496 GUI cases pass, one remains Searching beyond the default1s DOM wait. All19
search cases pass isolated. That single wait now has a finite3s budget with the
same behavioral assertions; no production search change. Full2 runs without
concurrent browser audits. T04 stays in-progress; final coverage/review/head
verification and failed-state captures remain pending.

Final independent review catches cancellation semantics: an in-flight refetch
canceled by M48 recovery can resolve with prior cached isSuccess=true, without
a fresh capabilities response. The new canceled-refresh regression fails before
correction. Refresh now requires the query's accepted-response dataUpdateCount
to advance before clearing write denial.37 focused cases pass, including this
regression; independent reviewer approves source/captures with no remaining
blockers, explicitly pending full-gate completion. No server authorization bypass
was present. Earlier WIP644671b remains an implementation checkpoint only.

Two additional backend capability faults fail (agent unlink and guessed human
write); restored focused backend checks pass45 cases/565 assertions. Full2 GUI
passes1497 cases at95.17% branches, but its source snapshot predates the final
cancellation regression/counter correction, so a final-head full rerun remains
required. Backend/CLI/packaging gates are still progressing. A current-source
browser rerun first encounters connection-refused because both temporary server
processes exited; these are excluded harness failures. Only owned M54 processes
are restarted detached, readiness200 verified, then the9 affected journeys rerun.
No original service or data is reset. Final Storybook rebuild succeeds; full
rendered matrices continue. T04 remains unchecked/in-progress.

Final rendered matrices pass234 stories/936 accessibility scans/468 mobile checks
on the rebuilt corrected source. All9 affected browser journeys pass after the
owned-server harness restart. Evidence fixtures now create dedicated task records,
avoiding inherited summary/link state from another journey; two consecutive runs
pass4 cases. Six current captures include both-theme failed mobile states. Full2
passes35 checks (GUI1497/95.17%, backend2275/59gated skips/zero failures and
standalone smoke); final full35 runs on the cancellation-corrected source and its
new regression. The seventh UI fault fails when counter advancement is removed.

Prepare and exercise an owned-runtime MCP proof using memory-only temporary
credentials, with finally revocation and public output IDs only. This strengthens
actual agent-link provenance before T04 closure and supplies T05 handoff evidence;
T05 integration examples and committed executable handoff coverage remain pending.
No extra product implementation or task completion is implied by this probe.

Owned deployed-runtime MCP handoff passes115 assertions: real discovery/create/
link/repeat/digest/explicit prefix reads,20,003-byte BOM/Unicode/NUL literal and
8,000-byte stored encoded representation, tasks-only omitted/false digests,
positive-opt-in scope refusal, read-only writes, malformed bounds, and actual
foreign org/project/task/artifact refusals. Returned link actor/time is the
minted agent identity. Three current-run credentials are revoked in finally;
plaintext remains memory-only and retained output contains public IDs/counts.
Earlier probe harness attempts used incorrect ListOrgs field/default test user
and expected invalid tool arguments as a result rather than JSON-RPC error;
these are corrected before this valid run, with all3 issued credentials from
that attempt also finally revoked. No production fix was needed by the probe.
T05 still owns committed handoff coverage/integration examples and publication.

T04 final source verification passes35 checks (25cached) on corrected code:
GUI1498/95.13% branches; backend2275/59environment-gated skips/zero failures,
95.84% functions/96.75% lines; generated contract/wire, CLI and standalone pass.
Checkpoint90a3965 passes all8 actual CI jobs42710997686, including full browser
and Storybook jobs. Final task/milestone publication still requires T05 and its
applicable final-head CI. Independent CODE-v4/UX-v4 approval follows reproduced
and corrected read/write/cancellation gaps;37 focused UI cases,45 backend cases,
70 real MySQL assertions,18 old-client decodes,7 GUI/2 backend restored faults,
9 actual affected browser journeys plus4 isolated repeat cases,234-story936/468
rendered matrices and six current captures provide the detailed proof.

T04 is complete:4/5 M54 tasks,369 done/27 pending overall. T05 next commits the
real HTTP worker handoff coverage and precise docs, then closes/publishes M54.
The115-assertion owned-runtime probe already passes with all temporary credentials
revoked, but does not substitute for committed T05 coverage or publication gates.


## M54-T05 — Verify and document worker-to-human handoff

- **Status**: in-progress
- **Date**: 2026-11-09
- **Changed**: Commit real MCP→loopback→current authorization→database handoff coverage and exact integration examples, including ambiguous create discovery and bounded stored representations.
- **Verified**: T04 committed/pushed asf702e2a after final35 checks and closure35/32cached;1498 GUI/2275 backend cases, rendered234-story matrices, reviewed captures, real MySQL70 assertions,18 old-client decodes and checkpoint90a3965 all8 CI jobs pass.
- **Notes**: API/security standards plus TDD selected. ADR0042/UX/TC001–010 remain accepted; this is verification/documentation, with no new architectural or UX boundary and no new dependency. Static prose is exempt from runtime TDD; already-implemented behavior that passes new integration cases requires controlled production faults. Temporary credentials stay memory-only and are revoked finally, including failed proof attempts. Full both-dialect/source/browser/standalone and final-head CI remain publication gates.
- **Next**: Add live HTTP handoff, real refusals and dropped-create-response recovery proof; validate controlled faults, human review and exact docs before final gates/review/closure.

T05 checkpoint: new real-socket MCP handoff suite passes7 cases/134 assertions on
SQLite and the identical7/134 on an owned random MySQL schema, with schema/drop,
environment restoration, server closure and token revocation in finally. It
observes actual loopback paths (one RPC/tool), literal/encoded creation and bounded
reads, current agent provenance, task status remaining todo, metadata-only opt-in,
tasks-only defaults/false, real foreign resources, read-only writes, human-only
unlink RPC refusal, malformed zero-RPC inputs and uncertain create recovery.

Six cases first pass already-implemented T02/T03 behavior; four restored production
faults fail end to end (lost default bound, missing digest opt-in, wrong create
RPC and consumed BOM). The response-loss test initially assumes a rejected fetch;
the pinned Bun HTTP bridge instead yields an empty JSON response after destruction.
An instrumented probe confirms exactly one CreateArtifact RPC, so this is not a
retry. The client helper now rejects a missing JSON-RPC object; discovery finds
one committed output and verifies literal content without another create. This
is a harness correction, with no production behavior changed.61 focused MCP
cases/740 assertions pass before dialect-harness parameterization; TSC is clean.

Current-source actual human browser proof passes: native fetch mints one scoped
temporary token outside Playwright tracing, worker creates/links output, an open
pane's15-second metadata poll reveals authenticated agent provenance without a
Refresh click/body fetch, summary writing survives, and keyboard source activation/
Back returns the draft. Credential is revoked finally; minted test credentials
now expire within one day as well. The owned-runtime115-assertion probe remains
valid separate process proof. Documentation adds all6 tools, exact page/prefix/
UTF-16-create bounds, explicit opt-in, stored representation, mutable references,
human unlink boundary and discovery-before-create retry examples. Independent
four-lens review and final source/both-dialect/browser/head CI remain pending.
