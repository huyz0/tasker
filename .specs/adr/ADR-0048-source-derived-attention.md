---
id: ADR-0048
status: accepted
date: 2026-11-09
milestone: M55
---

# Project current attention from source rows with independent bounded cursors

## Context

Questions, held moves, assigned reviews and quiet claims require different human
judgments. Dashboard caps panels at eight. Existing question/approval lists are
paged but cannot filter by project; filtering their loaded page is incomplete.
The stalled helper loads all held rows, classifies/sorts in memory, then slices.
None is a complete bounded selector for an organization/project attention screen.

There is no separate review outcome: current-user reviewer assignment plus a
nonterminal task is the existing review queue. Review/assignment rows have no
creation timestamp. Task completion does not close an open question; pending
approvals can become durably stale during an attempted decision. Unassign deletes
the current task/agent/user pair without an incarnation/silence fence. Current
questions/approval lists do not exclude archived parents, and existing review/
stalled panels omit archived-project filtering. M55 must define this explicitly.

## Options

1. Combine Dashboard/Reports panels or filter existing org pages. This reuses
   interfaces but hides old/current work and transfers unbounded held rows.
2. Add persisted inbox records, read/unread state and generic Resolve actions.
   This duplicates source state machines and cannot accurately model reviews or
   safely release a later assignment from an old stalled-row snapshot.
3. Project one source group per bounded read and keep all resolution in the
   existing task context. This adds one read-only RPC and explicit predicates,
   while retaining source writes, permissions and canonical task navigation.

## Decision

Choose option3. Add AttentionService.ListAttention with required orgId1/kind3,
optional projectId2/page4, and fixed oldest-first source ordering. Proposed new
response fields are items1/page2/observedAt3; new message-local numbers do not
modify any existing field. Recheck names/numbers before T02 generation. No new
MCP adapter, permission, migration, inbox row, notification read state or runner.

The reader is human-only and requires existing task:read for the requested org.
The requested organization must be active. A supplied project must be active and belong to that authorized org; foreign,
missing or archived hints fail generically without returning owner metadata.
Each source joins an active task and active project in that exact org. Resolve
current authority before source reads. Existing source handlers remain the write
boundary; attention does not grant task:write or bypass task transition rules.

| Kind | Current source identity | Eligibility | Age and ownership |
| --- | --- | --- | --- |
| question | input_requests.id | source status open; live task/project, even if task terminal | Asked at source createdAt; requester is source actor; authorized human task writers can answer |
| approval | transition_approvals.id | source status pending; live task/project, even if current task status contradicts request | Requested at source createdAt; requester is source actor; current task writers decide using existing rules |
| review | task_reviewers.id | current authenticated user is reviewer; live task/project and configured nonterminal task | Task createdAt explicitly labeled; assignment date is not recorded; responsibility is the current user |
| stalled_claim | task_assignments.id | agent-held live nonterminal task with existing silence clock strictly older than24h | No task activity since last non-created signal, then claim, then task creation; holder is the assignment's agent |

Use configured terminalStatusSql, not a literal done list. Human comments,
notes, assignment and status activity count as task signals; token last-used
liveness does not. Preserve existing silence semantics and threshold. A stalled
assignment's source ID distinguishes removal/recreation for display, but does
not add a conditional unassign contract. Archived agents can still hold a task;
show an unavailable holder honestly if its authorized name cannot be resolved.
Never join a foreign actor's profile merely because an ID was supplied/stored.

Archive excludes current attention without rewriting its source status. Restore
re-exposes a still-open/pending source. Reviews/stalled claims additionally drain
when terminal or their assignment disappears. Questions close only through
answer/cancel; approvals through approved/rejected/stale. Reads never mutate
sources or infer a review approval. Existing history/queues remain reachable.

Each call selects at most limit+1 source rows in SQL (default20, maximum100)
before any bounded actor hydration, shapes at most limit entries, and computes
that group's current filtered count. Apply project, user, current-state and
archive predicates before paging/counting. The stalled aggregate applies silence,
ordering, cursor and LIMIT in SQL before driver transfer; do not call the
fetch-all findStalledCandidates helper. It may share its semantic SQL primitives.
Question previews select a bounded literal UTF-8 prefix before decoding; reuse/
extract the tested storage primitive rather than reintroducing BOM/NUL splits.
Do not select task descriptions, summaries, plans, artifact bodies or histories.

Order questions/approvals by source createdAt then source ID ascending; reviews
by task createdAt then reviewer-row ID; stalled claims by silentSince then
assignment ID. Cursor position is bound to endpoint/kind, principal user, org,
project or all-projects, fixed order and the24h classification version. Reject
malformed/unbound/foreign cursors before using position or counts. Counts are
current reads, not stale cursor-cached totals. State can change between pages;
Refresh rebuilds the loaded chain with fresh cursors and stable-ID deduplication.
No frozen snapshot or exactly-once queue semantics is implied.

The new item is a metadata projection: kind/sourceId, task ID/display ID/title/
status, actual project ID/name, bounded reason preview with truncation flag,
source timestamp and explicit timestamp basis, and relevant actor ID/kind/name
where known. Review age is task age, never an invented assignment/waiting time.
No task-wide assignee or actor catalogue scan is needed. Each source is identified
by kind+sourceId, not taskId alone.

Attention is triage. Every row offers Open task using its actual authorized
org/project. Question answering/approval decisions, review inspection, status changes and
deliberate assignment management stay in existing task detail. Question cancellation remains an authorized CLI/RPC/other-
client action; current task GUI has no Cancel question action. Links do not
promise to target a particular question/approval inside that task. Do not add
inline Resolve/Approve review/Release stalled claim actions. Source mutation
settlement, relevant events, focus/reconnect and visible polling reconcile the
attention queries; FailedPrecondition may accompany a committed stale closure.

## Consequences

Four independently paged selectors become reachable through one read contract.
SQL must accurately reproduce each source's eligibility on both dialects, and
counts/cursors must remain scoped to the current person and filters. The UI
introduces no duplicate mutation forms or resolution semantics. Task context is
one navigation step away and may require its existing question/history paging.
This tradeoff preserves context and current server rules without claiming an
unsupported source-specific deep link or safe stale-hold release. M57 remains
responsible for optional generation correlation/fences.

Both-dialect source-row trace tests, over50 current fixtures per kind, archive/
restore, custom terminal statuses, principal/cursor isolation, large/Unicode
previews, source mutation/refusal races and real browser Back/scroll/scope proof
are required. The UX/test plan define known-access-loss and identity lifetime;
canceled cached success cannot count as fresh authorization. Read-loss fences
are account+organization-wide across projects/groups. A success begun before
denial cannot reopen metadata after another group denies; post-denial explicit
Retry is required, including after project switching. PermissionDenied/
Unauthenticated signal shared authority loss; a NotFound from an archived/missing
project is local unavailability, not proof that org-wide task-read authority was
lost. Hide that project's data while leaving another allowed project reachable. Existing fonts,
semantic tokens, navigation contract and personal notifications remain distinct.
