# M53 — Workflow Correctness progress

## M53-T01 — Design canonical navigation and pending/history interaction

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Define authorized resource scope, one-entry navigation normalization, complete pending/history paging and all-exit task-keyed summary drafts before implementation.
- **Verified**: M28/M51 dependencies are published. Isolated worktree starts at final M47 candidatee34924e while PR #5 CI runs; no M53 publication until M47 base/ledger reconciliation. Existing source and independent preliminary human-workflow review expose concrete scope-close, tier, paging and draft/save races.
- **Notes**: Heavy design task produces UX and executable acceptance plan; ADR-0047 records additive authorized metadata/closed selectors; no new storage/executor or authorization scheme. Existing ADR-0025 URL ownership is retained with authorized entity normalization. Frontend/security standards selected; TDD applies to later implementation. Static design documents have no runtime behavior to drive. Independent research/system decisions from M51 remain the typography/token baseline; do not copy repo design prose uncritically.
- **Next**: Review proposed ADR-0047, UX and TC-001–011. Source-driven plan expansion includes bounded authorized ownership metadata (GetTaskResponse3, GetArtifactResponse2/3) and SQL closed selectors; existing APIs cannot safely supply these through capped client pages or folder scans.

### T01 design review refinement

Independent backend/agent reviews approve the boundary, with explicit coverage
for cursor *position* binding (extraCacheKey previously guards only count), MCP
closed selectors and other required strings. Human review rejects missing
switcher/projectless interaction; design now covers settled auto-selection,
reload/history and deliberate project/org changes, clean-content dirty semantics
and existing URL-backed origin state. Add a real-interceptor stale-approval
regression because direct-handler tests may hide rollback to pending. No
implementation begins before corrected design approval.

Corrected design receives independent v2 approval from human, reliability and
agent-workflow reviewers. ADR-0047 and11 executable acceptance scenarios are
accepted; no implementation has begun. Fresh-source full gates run before T01
closure; M47 final-head real integration is green while remaining CI jobs wait.

Fresh-worktree GUI 1360/95.34% branches passes. Initial full check stops at a
new extra blank line in STATE.md; the ledger formatting is corrected and full
gates rerun without changing production source or coverage thresholds.

T01 final checks pass all35 tasks (33 cached after the fresh full run): baseline
backend2175/zero failures, GUI1360/95.34% branches and CLI gate93.8%. Design
acceptance is reviewed against current readers/switcher/pagination/mutation
boundaries; no runtime implementation is claimed. Next M53-T02 writes the
canonical ownership regressions before API/GUI changes. Overall37 tasks remain.

## M53-T02 — Resolve authorized entity navigation

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Add compatible authorized ownership metadata and resolve task/artifact/Memory navigation without losing detail or trusting caller scope.
- **Verified**: T01 accepted design and final35 checks pass; implementation regressions are next. M47 PR #5 remains at unchanged e34924e while final remote checks run.
- **Notes**: Heavy task follows ADR-0047, approved UX and TC-001–003/011. Frontend/security standards selected; TDD. Source inspection confirms getArtifactOrgId currently selects full artifact body; metadata regressions cover the authorization path too. No new ADR, persistence, font or palette is needed.
- **Next**: Reproduce missing metadata/body projection and wrong-scope navigation; implement bounded authorized scope and distinguish deliberate selection from normalization, then verify both dialects and actual navigation.

### T02 metadata and selector checkpoint

Three initial backend reds reproduce absent owner metadata and a full artifact
body read during authorization. Corrected scoped metadata joins/projections pass
98 focused backend tests; real MySQL passes7 assertions including foreign denial
and archived-parent behavior. Generated TypeSpec/proto/TS/Go fields compile and
1116 contract round trips pass. Six initial UI reds reproduce scope selection
and projectless switcher failures; corrected selector foundation passes44
focused hook/switcher tests. Canonical resource resolution, full Memory behavior,
both-dialect fault/old-client/browser evidence and full task gates remain pending.

M47 PR #5 is now published as eeca2741d1e1e042430c7798aee7a8e0450c81b8 after
all ten final-head jobs passed (CI42614414075; real integration42614414067).
Remote GUI logs confirm1360 tests and all174 Storybook axe/375px checks. This
WIP checkpoint will be rebased onto that published main before further work.

### T02 canonical resource checkpoint

The unpublished branch is now rebased onto published main eeca274. Authorized
owner metadata drives a shared replace-in-place scope resolver; explicit scope
selection closes incompatible detail in its original navigation. Initial task
reds pass with direct/legacy/cross-organization/denied/warm-cache cases. Artifact
and all three Memory tier reds reproduce missing scope; artifact cases pass,
and Memory reaches owned content (the first assertions needed to account for
both the breadcrumb and detail containing the statement). Team detail has no
project, list picker or Record action; its breadcrumb returns to organization
Memory. A focused existing-screen run exposes underspecified ownership fixtures
and obsolete store-only selection simulations; these are being updated to use
the URL writer rather than weakening the canonical gate. Full gates, browser,
compatibility, fault checks and independent implementation review remain pending.

T02 expanded checkpoint: canonical component tests pass task/artifact/project,
organization and team ownership, legacy task fallback, warm-cache denial and
explicit Memory tier clearing. Existing Task97 and Artifact57 tests pass after
fixtures use real owner fields and URL selection; Memory57 passes serially,
with occasional existing 1s debounce assertions failing under concurrent CPU
work, so verification remains sequential. App TypeScript passes before the
latest story/browser additions. A deliberate shared-authorization SELECT *
fault fails and restored SQLite passes; resource-read agent scopes pass without
projects:read. Browser artifact and project Memory routes pass real RPC/SQL,
Back/Forward/reload; browser reds identify artifact missing project trail (now
corrected) and stale project labels on projectless Memory. Independent read-only
review identifies same-org re-selection clearing and invisible background read
failures; new reds are in flight before corrections. No task completion claimed.

### T02 independent revision and restored candidate

Review fixes have observable regressions: same-org selection does not clear its
project/detail; labels are keyed by owner ID and cannot reuse A for an off-page B;
known access loss clears accepted ownership until a fresh success, including
denial then unavailable retry. Transient reads retain the editor with a visible
retry. Composite retry includes valid bounded legacy project/folder dependencies;
a duplicate folder alert is consolidated. Organization Memory list URLs also
clear irrelevant project ownership. All64 focused cases pass. Removing owner
normalization fails; hiding background failures fails all6 targeted cases;
removing fallback retries fails2 recovery cases. SQLite/MySQL body-read faults
fail and restored MySQL passes8 assertions. Five real browser journeys pass
Back/Forward/reload; pre-M53 binary/Go clients read actual JSON/protobuf responses
with unknown owner fields. Independent human/product/agent reviewers approve the
corrected source/tests, subject to full gates and expanded rendered checks.
The first full run was intentionally interrupted during CLI checks when the
remaining review cases were found; it is not claimed as a passing full run.

T02 full-suite reconciliation: the first complete GUI run reports1399 passing
and3 failing tests. The routing-only App fixture mocks every resource read as
unavailable, so it now asserts the honest artifact opening state rather than
requiring content. Organization Memory's breadcrumb expectation now drops the
irrelevant project. The unchanged schedule-history test was still loading runs
at its assertion; all36 tests across these three files pass in the focused
rerun. No timeout or coverage threshold changes. Updated the scope-sync comment
to describe owner convergence rather than the removed scope-change dismiss guard.
Expanded browser evidence passes all5 journeys with20 light/dark desktop/mobile
captures and no document overflow. Full checks and rendered stories rerun next.

T02 verified complete: all35 local checks pass; GUI1402/95.24% branches,
backend2180/zero failures with47 explicitly gated skips, and CLI93.8%. Five
actual browser journeys pass with20 light/dark desktop/mobile captures. All25
selected stories pass100 settled-state axe checks (including portal content)
and the375px overflow sweep. Both-dialect fault/restoration, real old-client
JSON/protobuf compatibility and independent CODE-v2/UX-v1 approval are recorded.
Curated synthetic captures are retained under design/evidence. The final preview
build runs from apps/gui; transitions are disabled for stable contrast snapshots.
No UI timeout or coverage threshold changed. Next T03 covers all six search
result types, current-query error/retry and visible-order keyboard navigation.
Overall36 tasks remain; M53 publication waits for T03–T07 and final-head CI.

## M53-T03 — Complete supported search and current-query states

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Reproduce omitted Memory hits, grouped/keyboard order mismatch and dishonest failed/debouncing query states before correcting the existing palette.
- **Verified**: T02 is committed/pushed as ad39df7; draft PR #6 is attached and awaits CI. All35 local checks,1402 GUI tests and100 rendered state audits pass on that completed task.
- **Notes**: Frontend/security standards selected again, plus TDD. Reuse ADR-0047, approved UX and TC-004: no new API, navigation destination, font or palette. Fresh WAI-ARIA combobox/status-message references support input focus, visible suggestion order and distinct live status/errors. Keep server state in TanStack Query; bind displayed/keyboard results to the current query and org. Project/agent list destinations preserve the searched organization; project hits select their project.
- **Next**: Run GUI reds with real debounce, out-of-order/error/retry/type fixtures; inspect both SQL dialects' supported result types, add actual browser and deterministic story states, then full gates and independent review.

T03 checkpoint: ten new GUI reds reproduce missing Memory/actionable list scope,
visual/keyboard order, stale debounce Enter and missing current error/status
states. The corrected shared current-query predicate, ordered result sequence,
input focus/scroll behavior and semantic loading/error states pass40 focused
search tests including query/org races and access-denial recovery. App TypeScript
passes. Existing SQLite search passes36 tests/73 assertions; real MySQL passes6/
16 assertions across all supported types/ranking/paging/beliefs. The first MySQL
attempt timed out during cold schema bootstrap and then hit overlapping DDL;
preparing the owned schema before timed cases passes without timeout changes.
Deterministic search stories are added; actual rendered/browser/fault/full-gate
verification remains pending. No backend search behavior or contract changed.

T03 interaction revision: native/real-debounce coverage passes45 tests after
reproducing and correcting two focus defects (options in Tab order and Retry
losing input focus). Real browser tests expose duplicate short Memory snippets
and application-default hidden retry backoff; exact duplicate snippets are
omitted and interactive search now reports one failed attempt with explicit
Retry. After project/agent mouse navigation, keyboard reopening no longer lets a
stationary pointer override selection: actual movement controls hover selection.
A bounded scroll owner includes the sticky input, preserving keyboard access
without extra option Tab stops. Three real RPC/SQL browser journeys pass all six
groups, scoped project/agent/Memory destinations, Tab/arrows/scroll, debounce,
subsequent failure and dark-mobile Retry/axe. Four deliberate current-data,
query/org-key, missing-org and whitespace faults fail their regressions. Restored
rendered/final full gates and independent final review remain pending.

T03 verified complete: all35 checks pass (24 cached), GUI1421/95.31% branches,
45 focused tests, real SQLite36/MySQL6 search cases, four failed deliberate binding
faults, three actual browser journeys, and six preview states/24 settled axe
audits plus mobile overflow. CODE-v4/UX-v2 and independent source reviews approve.
The corrected GUI-directory build is evidence; the earlier script-listing command
and stale preview output are not. No timeout, coverage threshold, contract or
backend permission change. Next T04 separates pending work from closed history,
adds bound cursors and preserves intentional stale approval closure through the
real mutation unit. Overall35 tasks remain; M53 still requires T04–T07 and final CI.

## M53-T04 — Separate pending work from bounded history

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Reproduce stale approval rollback through the real mutation interceptor, then implement SQL closed selectors, bound cursor position/count and independent reachable pending/history pages.
- **Verified**: T03 committed/pushed as fc684f9; all35 local gates pass with1421 GUI tests. Draft PR #6 contains completed T01–T03 and remains unmerged.
- **Notes**: API/security standards selected, plus TDD. Reuse accepted ADR-0047, UX and TC-005/006. The approval RPC will own its narrow transaction and translate an intentional committed stale result into FailedPrecondition afterward; other errors still roll back. No generic commit-on-error policy, schema or stored closed status.
- **Next**: Run the failing interceptor regression before production edits; verify durable closure, atomic normal decisions and capture failure rollback, then closed filtering/paging on both dialects, MCP, GUI and actual browser.

T04 corrected candidate: the real-interceptor stale red persists pending on old
code; narrow decision ownership commits intentional stale results before the RPC
error. SQLite/MySQL history and transaction cases pass16/124 assertions, including
capture rollback, normal approval and competing decisions. Closed selectors,
endpoint/scope/order/filter cursor binding and legacy first-page restart pass;
MCP advertises/forwards closed after two observed reds. Forty-seven GUI cases
pass after six independent-review reds reproduce cached access actions, missed
off-project updates and obsolete mutation notices. Cached forms are disabled
after known access loss until fresh success; visible organization queues refresh
at15s without another stream; obsolete notices cannot erase current errors.
Browser task/history and organization paging behavior pass, but the first complete
dark-mobile axe scan exposes a pre-existing1.75:1 Delete control. The touched
control now uses the existing destructive-subtle pair; restored browser/rendered,
full gates and final independent review remain pending. No rule waiver or new
font/palette. TypeSpec generation succeeds; story required args are corrected.

T04 review refinement: a second lifetime red proves that local denial state was
lost on remount after an unavailable retry. Each mounted/query identity now
requires a fresh successful acceptance before cached forms become actionable;
A→B→A recovery is covered too. Independent human review approves the corrected
source. All49 focused GUI tests pass; final SQLite/MySQL16 cases/128 assertions
include a second authorized-org cursor mismatch and generated service descriptors.
Both actual browser journeys pass, including52 org questions/51 approvals, task
history23/13, local page retry/retained text, durable stale closure/reload and
dark375px0axe. A suspected delimiter-format change is disproved at byte/runtime
level: source has one JS escape, preserving runtime NUL. The pre-existing facet
cursor test passes; a deliberate two-backslash literal fault fails3vs4 and is
restored. Backend focused36/485 assertions pass. Full/rendered closure remains.

T04 verified complete: all35 checks pass (25 cached), GUI1440/95.45% branches,
backend2194/57 gated skips/zero failures/95.80% functions/96.70% lines and CLI
gate93.8%; standalone builds. Final focused49, SQLite/MySQL16/128 assertions,
two actual browser journeys and18 previews/72 settled axe plus18 overflow pass.
Closed-filter/cursor/GUI-page/access faults fail2/3/4/4 cases and restore; owned
unit and literal-delimiter faults fail too. The first full run's TypeScript
result narrowing is corrected and15 approval cases rerun before final success.
CODE-v5/UX-v4 approve. The failed-refresh preview is corrected to transition from
a mounted success rather than seed unaccepted failed data. Next T05 protects
summary intent across every exit/save/identity race. Overall34 tasks remain;
M53 publication still awaits T05–T07 and final-head remote CI.

## M53-T05 — Preserve summary drafts through every exit and save race

- **Status**: in-progress
- **Date**: 2026-11-09
- **Changed**: Reproduce cross-task/local-unmount draft loss and unconditional save-success clearing before introducing account/generation/entry/revision-bound session-memory intent.
- **Verified**: T04 committed/pushed as6feb920; all35 closure checks pass with1440 GUI tests/95.45% branches,2194 backend tests and standalone build.
- **Notes**: Frontend/security standards selected, plus TDD. Reuse accepted ADR-0047, UX and TC-007–009. No persistent storage, new dependency, server summary model or executor. Existing mutation cache owns pending/status; a local draft registry coordinates intent across the tree. Identity synchronization must precede protected-route early returns; global native warning remains while panels close. Independent preflight adds logout ordering, Cancel/reopen identity, same-tick Save/Clear exclusion, baseline advancement/revert-while-pending and Summary disclosure discoverability.
- **Next**: Run existing-panel behavioral reds before code, then guard native/identity lifetime and actual SPA exits. Distinguish transient session lookup errors from confirmed identity loss so temporary failure cannot discard drafts.

T05 foundation checkpoint: six existing-panel reds reproduce task leakage,
unmount loss, newer/reverted writing cleared by old success, Cancel/reopen
collision and same-tick duplicate writes. Account/generation/entry/revision intent
and live mutation-cache Save/Clear fencing pass those cases; a later error-cache
red adds failed-save restoration. Four native reds drive the route-global warning
with closed/multiple panels, clean/reverted/pending content and post-unmount save
completion. Three identity reds and one session-metadata red drive pre-route
verification; two session-boundary reds distinguish temporary/malformed lookup
from confirmed logout. Three logout reds drive synchronous generation rotation,
blocked editing while pending, and honest retryable failure.

The first disclosure assertion matched both label and heading; corrected semantic
heading/open assertions fail against restored old closed behavior, then pass on
the candidate. Test-only Playwright-style exact options are removed after TSC
reports them. Three touched action-message reds remove Connect transport prefixes
while preserving server explanations. Final focused83 cases and app TypeScript
pass. No persistence/dependency/backend contract changes. Actual browser, stories,
deliberate final faults, full gates and independent implementation review remain
pending. Draft PR #6 contains completed T01–T04; this T05 checkpoint is not ready
to publish independently.

T05 review revision: CODE-v6's verified-login, older-generation admission and
canonical-baseline findings all have observed reds. Login/register validate their
returned owner, synchronously change draft ownership, cancel stale reads and
clear only QueryCache on account changes, preserving MutationCache sequencing.
Pending admission is now global per task, including shared resources across
accounts; foreign blockers expose only generic waiting copy. Dirty comparisons
and error/receipt content stay account-owned. Canonical receipts advance an
existing same-account baseline without clearing newer entry/revision intent.
Independent reliability re-review approves the corrected source. Focused122 and
TypeScript pass; the added native listener/privacy suite passes6 cases.

Four actual browser journeys pass all supported modal exits, Back/Forward,
sidebar-after-close, task/scope switches, old-success/newer-text preservation,
failed-save remount, explicit Clear and native Stay/Leave with panels closed.
The dark375px failed-save scan has0axe/overflow and its capture is curated and
visually inspected. The canceled-reload test uses the actual Chromium reload
command/prompt because Playwright's navigation waiter never finishes after Stay;
no production timeout changes. Six deliberate faults (unconditional clear, live
admission, foreign receipt, always-attached native listener, account-only
admission and stale-login cache) fail and restore. Rendered strict audits catch
a pre-existing drawer fixture mount race; the preview applies its initial open
state after AppShell mounts, rather than accepting a hidden-drawer audit. Final
rendered/full checks and final review remain pending.

T05 full-gate correction in progress: the routing-only TanStack mock needs the
new mutation-cache selector, and direct workbench fixtures need an explicit
verified draft owner. The bounded organization paging case hit its existing5s
limit under full coverage; reproduce in isolation before deciding any change.
Remote T04 CI also exposed an early idle timer wake that emitted a premature
heartbeat. A focused API/security repair will reproduce that scheduling boundary
with a controlled clock before changing the stream; no timeout or auth waiver.

T05 full-gate fixtures now pass136 cases without timeout changes. The first
correction run was overlapped by the inadvertently launched old-source command
and is excluded; the clean second invocation is the evidence. The next full
run is intentionally interrupted after two existing GUI timing assertions fail
under coverage, to correct the independently identified timer deadline issue.
Serial coverage diagnosis follows; no test or coverage requirement is waived.

The CI stream repair has two observed controlled reds: an early credential wake
emits a premature frame, and the first repair slides a heartbeat deadline. The
final inner wait retains its absolute deadline and checks credentials after
waking before every yield. Both controlled clock/timer cases and the full44
stream tests pass. Deliberately removing post-wake authentication fails the
credential regression; restored44 pass. Independent reliability approves both
deadlines, immediate domain/scope wakes and abort/iterator cleanup. This narrow
backend scheduling repair is recorded here because it resolves T04 remote CI
while the same session's T05 candidate is being verified. API/security standards
apply to that repair; no contract/authz policy or timeout is changed.
