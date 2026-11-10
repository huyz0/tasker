# M55 executable acceptance plan

Static source/design analysis is T01; runtime cases bind T02–T05. Each completed
case needs an observed regression or a restored deliberate production fault,
not merely the presence of a file or a response-shaped mock.

## TC-001 — Current human scope (T02/T05, exits1/4)

Given authenticated people with task-read authority in different orgs and a
same-org read-only custom role, when each source group is requested, then only
current authorized org/project data appears. Given no principal, an agent token,
missing authority or a foreign/missing/archived project hint, then reject before
returning source/actor/project metadata. Extra caller user IDs cannot select
another person's reviews. No new permission or agent scope is introduced.

## TC-002 — Exact source eligibility (T02/T05, exits1/3)

Given open/answered/cancelled questions, pending/approved/rejected/stale approvals,
current/removed reviewer assignments, agent/user/combined holds and custom task
types, when listing each group, then use its documented source predicate. Terminal
tasks still expose independently open questions/pending approvals, while reviews
and stalled groups use configured terminal status. Reading never mutates source
status or invents review approval. Review identity is reviewer-row ID, stalled
identity assignment-row ID; duplicate task IDs do not collapse distinct sources.

## TC-003 — Active parents and restoration (T02/T05, exits1/3)

Given unresolved sources under active tasks/projects, when a task, its project or the organization
archives, then all its attention rows/counts disappear without changing source
status. Given restore, then still-eligible source IDs reappear with honest original
metadata. Missing/purged/foreign parents never expose titles or actors. Existing
source/history APIs retain their semantics; this current-view policy is explicit.

## TC-004 — Complete bounded paging (T02/T03/T05, exits1/4)

Given at least125 eligible rows in each kind, newer/history noise and multiple
projects, when paging20 rows at a time, then all current rows beyond50 are reachable
with stable source-ID ordering and correct filtered counts. Trace actual database
results before shaping: source rows are at most21, metadata hydration at most20,
and no descriptions/summaries/plans/artifact bodies/history are selected. Stalled
classification/order/position/LIMIT execute in SQL before driver transfer, not
through a fetch-all helper. Both SQLite/MySQL must execute the real selectors.

## TC-005 — Bound cursors and current counts (T02/T05, exits1/4)

Given a cursor for a kind/user/org/project/order, when replayed for another
rowset/principal or malformed/unbound/unsupported filter/sort, then reject before
using position/count identity. Given source changes between pages, then counts
are current scoped reads, not stale cached totals. Refresh starts at the first
page with fresh cursors, preserves loaded extent and deduplicates source IDs.
Given an old task newly assigned to the reviewer, then refresh makes it reachable.

## TC-006 — Truthful silence and age (T02/T03/T05, exits2/4)

Given silence around the24h boundary, a created-only history, legacy holds,
recent human comment/note/status/assignment activity and an active token with no
task signal, when classifying, then match the existing silence clock and strict
threshold. Token liveness alone does not clear task silence. Given reviewer and
assignment rows lacking timestamps, then label task creation/silence basis or
unknown; never claim when a review was assigned. Holder/requester names resolve
only within authorized scope; missing/archived identities remain honest.

## TC-007 — Group state, scope and paging UI (T03/T05, exits1/2)

Given a chosen org with or without project and independently loading/failing/
empty/populated kinds, when navigating sources, then counts stay unknown on
failure and successful groups remain reachable. Initial scope absence sends no
source RPC. All-projects selection remains intentional through settled switcher
effects; Memory behavior stays intact. Load-more failure retains rows/Retry;
query keys/callbacks partition account/org/project/kind. Late A results cannot
replace B or reset B's current source/scroll/focus choice.

## TC-008 — Access lifetime and canceled recovery (T03/T04/T05, exits3/4)

Given accepted metadata/counts in several groups, when shared task-read authority
is lost in one source, then hide all affected scope metadata and stop automatic
polling/invalidation activation. Given later network failure, remount, A→B→A,
account switch or M48 global cancel/invalidate, then cached success cannot restore
it. Given group B was already in flight before group A denies, then its later
success cannot expose B until a post-denial explicit Retry succeeds. Given denial
in project A, then same-org cached project B/All projects remain quarantined;
project selection cannot implicitly reauthorize organization task-read authority.
Given project NotFound without PermissionDenied/Unauthenticated, then unavailable
project metadata stays hidden while another authorized project remains reachable. Only explicit Retry with newly accepted authorized responses re-exposes each
group. Canceled old isSuccess must fail this proof. Ordinary transient group
errors retain accepted stale rows with honest labels and independent recovery.

## TC-009 — Canonical task/Back flow (T03/T05, exit2)

Given organization-wide attention and a task in another project, when activating
Open task by keyboard or pointer, then actual org/project appear in URL/sidebar/
breadcrumb/actions. The link does not pretend to target one source inside the
task. Given Back, then original attention kind/scope, loaded extent and useful
scroll/focus return after current data settles; polling does not move focus.
Dirty summary writing survives context refresh/navigation under existing policy.

## TC-010 — Resolve through source rules (T04/T05, exit3)

Given current source rows, when a person opens the task and answers a question, approves/
rejects a move, changes task terminal status/removes review responsibility, or
inspects and deliberately manages a current assignment through existing task
controls, then attention reconciles with source truth. Given an authorized
CLI/RPC/other client cancels a question, then it also disappears; no GUI
Cancel question action is implied. A question closes
independently of task completion; removed review responsibility is not labeled
approval. A stale approval may durably close while returning FailedPrecondition;
refresh on settlement and retain its existing notice. Read-only/currently revoked
writes fail without optimistic fake resolution. No inline old-row release/bulk
reassign/new review state machine is introduced.

## TC-011 — Live and hidden reconciliation (T04/T05, exits3/4)

Given current visible source pages and mutations from another client, when
relevant events, reconnect, focus, Refresh or the15s visible poll occur, then
reconcile the already-loaded active chain without loading extra pages. Source
mutation settlement invalidates attention and original source keys, including
committed stale closures. Hidden/inactive/closed views pause polling and current
scope reactivation fetches authorized truth without losing loaded extent/intent.

## TC-012 — Rendered and compatibility closure (T05, exit4)

Given all documented states and long/Unicode names/previews in both themes at
375/1280, when completed Storybook previews and actual portals render, then
contrast, headings, focus visibility, keyboard/source navigation and overflow
pass with captures. Given existing TS/Go JSON/protobuf clients and current fresh
contracts, then old message fields/behavior remain compatible. Full35 gates,
both-dialect real selectors, over50 supervision journeys, standalone packaging
and actual applicable final-head CI pass before main publication.
