# M55 — Attention Center progress

## M55-T01 — Define actionable source truth and grouped flow

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Define grouped questions, approvals, current-user reviews and stalled claims with source identities, scoped bounded SQL selectors, current permissions and existing resolution paths before code.
- **Verified**: M48/M53 are published; M54 is locally closed as0682bab after all35 checks and reviewed real handoff/database/browser proof. Its final-head CI still gates main publication.
- **Notes**: API/security standards plus TDD selected. Heavy task needs a fresh ADR, UX and executable acceptance plan; static design has no runtime behavior to drive. Reserve existing ADR0043/0044 for planned M57/M58; current highest47 makes ADR0048 available for this boundary. Do not treat capped Dashboard/Reports panels as queues or create another inbox/state machine. Independent source preflight/external design references precede acceptance.
- **Next**: Inspect exact source eligibility/action permissions/archive semantics, record viable alternatives and grouped-navigation judgment, then independent architecture/UX review and full source verification before completion.

Initial static design/preflight proposes ADR0048, UX and TC001–012. Independent
review finds no architectural/visual-direction blocker but requests two precise
acceptance amendments; ARCH-v1/UX-v1 retain them. Current GUI only answers a
question; cancellation is an authorized CLI/RPC/other-client drain path, not a
Cancel question control. Shared organization task-read loss must also fence a
pre-denial in-flight sibling success and same-org cached project switching until
post-denial explicit Retry. Project NotFound is local unavailability, not proof
of organization permission loss. Amendments are written; acceptance review and
full source checks remain pending. No runtime implementation exists.

M54 is published as858e2cf via PR #7 after all8 final-head jobs42715671413 pass.
Its final0682bab source tree equals fetched main exactly. This isolated M55 WIP
is checkpointed before rebasing onto that published base; no user work/services
are reset.26 tasks remain and M55-T01 stays in-progress.

Amended ADR0048/UX/TC001–012 receive independent ARCH-v2/UX-v2 approval, with no
design blockers. ADR is accepted. Explicit GUI Answer vs external cancellation,
account+organization shared-authority epochs, pre-denial sibling responses and
same-org project transitions are named acceptance cases. A canceled cached success
or response counter alone cannot reauthorize. NotFound remains local owner
unavailability. The design retains contextual task actions and current source
semantics. Static TDD exception applies; no runtime behavior is implemented.
Fresh-worktree full35 checks are in progress before T01 completion.

T01 fresh-worktree verification passes all35 checks (none cached): GUI1498/
95.13% branches; backend2282/59environment-gated skips/zero failures with95.84%
functions/96.75% lines; CLI, generated contracts/wire and standalone packaging.
Accepted ADR0048/UX/TC001–012 receive ARCH-v2/UX-v2 approval after preserving two
initial findings. Static design has no new runtime behavior and uses the stated
TDD exception. This branch is reconciled onto published M54main858e2cf; its two
post-merge GitHub/NATS integration jobs pass. M55 is not implemented or published.

T01 is complete:1/5 M55 tasks,371 done/25 pending overall. T02 next reproduces
bounded source rows, exact source/parent eligibility, principal/project/cursor
isolation and silence/date semantics before contract-first implementation. No
inbox record, new permission, generic Resolve action or unbounded source helper
is authorized by the accepted design. Existing source actions remain contextual.

## M55-T02 — Bounded current source projection

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Drive source-derived human attention reads through real database authority/eligibility/paging/preview/count regressions before compatible contracts and bounded SQL implementation.
- **Verified**: T01 committed/pushed as0815b6b with accepted ADR0048/UX/TC001–012 and ARCH-v2/UX-v2; all35 fresh-worktree and closure checks pass. Published base M54 is858e2cf; draft PR #8 is attached.
- **Notes**: API/security standards plus TDD selected. Accepted design governs this heavy boundary, so no new ADR/UX is needed. Preserve current source rules, archive/restore and organization permission scope. Add one human-only read service, no migration/permission/runner/state machine. Before decoding/shaping, SQL must cap source rows and previews; oldest source position and current counts are principal/org/project/kind bound. Review assignment date remains unknown. SQLite raw timestamp aggregates are epoch seconds; MySQL strings are UTC wall-clock, per sqlTime helper. Stalled strict24h cutoff must preserve sub-second comparisons and exclude only created activity. Extract/reuse the tested literal prefix primitive without changing artifact behavior. A new read RPC may expose the staged GUI parity gap until T03; observe that gate before any exact, task-linked temporary exception, which T03 must remove.
- **Next**: Observe missing-selector reds, add fresh messages/generate without overwriting old proto annotations, implement minimum bounded queries/current authority, prove both dialects and controlled faults, then full gates/review.

Initial selector regression is observed red: no attention.handler exists, so the
new source tests cannot load (zero passes/one missing-feature error). Cases cover
125 sources per kind, bounded raw rows/actor lookup and byte transfer, exact
terminal/archive/drain semantics, current human/custom-role scope, foreign
projects, literal Unicode/NUL previews, honest review age, strict24h/sub-second
raw-date behavior, token-liveness independence, current counts and bound cursors.
This initial missing-module red is not claimed as individual business-case proof;
controlled faults and real both-dialect execution remain required after code.
Fixture inspection corrects the fake token row's required metadata and adds
unrelated actors to make unbounded name hydration observable before implementation.

Compatible contracts/generated clients and the human-only bounded reader are
implemented. Actual-process routing is first observed red, then registered and
passes. SQLite19 cases/7382 assertions and affected artifact/digest/MCP176 cases/
1215 assertions pass; shared prefix extraction preserves existing imports.
Real MySQL18 source cases/7901 assertions pass after correcting fixture-only
column-limit/options-default assumptions. These were setup failures, not claimed
product regressions. Current raw source transfer, names and literal prefix bounds
are observed before response shaping. Existing444 message descriptors/1261fields
are unchanged; old TS/Go clients pass18 JSON/protobuf decode checks.

GUI RPC coverage is observed red for the new method. An exact temporary exception
links M55-T03 and must be removed when that screen calls the reader; no UI is
claimed complete. Eight controlled source faults (SQL limit, question status,
active task, current reviewer, cursor binding, literal prefix, strict cutoff and
foreign actor names) each produce assertion failures, then source is restored.
Independent CODE-v1 requests zero/default protobuf page normalization; actual
empty-page HTTP first fails as reproduced. Omitted/zero now defaults20, negatives
remain invalid and cursor-only HTTP coverage is added. Final re-runs, review and
full gates are pending; T02 stays in-progress.

Pagination amendment passes final SQLite19/7387 and MySQL18/7901 assertions;
CODE-v2 independently approves. Initial full run and checkpoint CI correctly
catch an omitted entry in the exhaustive registered-handler agent-denial sweep:
2300 backend cases pass but its completeness case fails. Add Attention to that
existing sweep with a human-only classification/sample, without adding an agent
scope. Actual all-scopes agent refusal plus source cases now pass34/7404. This is
a verification-map correction; runtime already denies agents. Full rerun remains
pending. GUI1498 and contract1122 round trips pass; backend coverage95.85%
functions/96.80% lines despite the failing completeness case. Main M54's eight
post-merge CI jobs and both integration jobs are now all confirmed successful.

T02 final verification passes all35 checks (22 cached,2m14s): backend2302/
59environment-gated skips/zero failures with95.85% functions/96.80% lines,
GUI1498/95.13% branches, generated round trips, CLI and standalone packaging.
SQLite19/7387, MySQL18/7901, affected176/1215, exhaustive agent/source34/7404,
eight restored faults and18 old-client decodes pass. CODE-v2 approves with v1
retained. No new permission, migration, source mutation or UI is delivered by
this task. The exact staged GUI coverage exception belongs to T03 and must be
removed there.2/5 M55 tasks complete;372 done/24 pending overall. Draft PR #8
requires subsequent screen/reconciliation/browser proof and actual final-head CI
before main publication. Closure checks follow these ledger changes.

## M55-T03 — Scoped attention screen and navigation

- **Status**: in-progress
- **Date**: 2026-11-10
- **Changed**: Build the accepted grouped screen, bounded independent paging, intentional All projects switcher policy and actual-scope task/Back navigation.
- **Verified**: T02 committed/pushed as7976c81 after all35 source and closure checks, SQLite/MySQL/current-process proof and approved amended source review.2/5 M55 tasks are complete;24 tasks remain.
- **Notes**: Frontend/security standards plus TDD selected. Accepted ADR0048/UX/TC001–012 govern implementation; independent preflight specifically rejects copying Evidence's mounted-owner accepted flag. Use an account+org denial lifetime shared across kinds/project switches, with request-start epochs and explicit post-denial Retry receipts; keep project NotFound local. Preserve existing fonts/type roles/violet/semantic surfaces and native links, and Memory's projectless policy. Every changed component needs current stories. No new mutation forms or source-specific deep-link promise. Read-only current task navigation remains useful.
- **Next**: Observe absent-screen and project-auto-selection regressions, implement source groups and lifetime-safe queries, remove the staged RPC exception, then controlled races, rendered/mobile/browser proof, independent review and full gates.

Initial screen absence, All projects labeling/selection, protected lazy route /
Work navigation, shared-denial lifetime and Back focus regressions are observed
red before their implementation. Native group links, independent20-row pages,
actual-project task URLs and once-only return intent are now implemented. The
exact staged RPC exception is removed; GUI reaches170/186 methods with16
preexisting justified exceptions. Existing fonts/type roles/semantic palette are
retained. No resolution form or permission is invented.

Focused screen22 cases, existing/extended routing43 and switcher23 pass. Shared
account+organization epochs quarantine pre-denial sibling results and project
caches; project NotFound has a separate local epoch. Explicit recovery requires a
new completed response receipt plus a query update, so canceled cached isSuccess
cannot authorize. Back waits for current loaded pages, restores a surviving row
or visible heading once, and keeps background refresh from moving focus. The
focus/poll test initially waits on a non-DOM counter under a frozen interval;
this harness-only failure is corrected to observe changing rendered responses,
then passes. It is not claimed as a product regression.

Fifteen new Attention states plus three switcher states and the updated shell
preview are authored; real rendered/contrast/overflow/capture proof remains
pending. Independent source review, deliberate UI faults, full coverage/gates
and actual backend browser journeys still gate T03. An owned M55 fixture runs on
8096/5184 without touching earlier worktrees/services; private credentials stay
outside the repository. This is a recoverable in-progress checkpoint, not task
completion.24 tasks remain.
