---
id: ADR-0043
status: accepted
date: 2026-11-10
milestone: M57
---

# Retain claim generations as ownership receipts

## Context

ClaimTask and ClaimNextTask atomically insert a `ta-*` assignment for the
authenticated principal. ReleaseTask deletes that row. A later claim by the same
agent is a different generation, but today's release request names only the task.
Notes, usage and artifact links have author/provenance fields but no explicit
claim association. None of these records observes an external process lifetime.

Assignments have no claim timestamp. Existing activity is not a complete durable
claim ledger. M46's managed unit of work and transactional idempotency already
provide the atomic boundary; use them rather than a second transaction system.

## Options

1. **Separate immutable claim receipts using the winning assignment ID** (chosen).
   Receipts survive assignment removal, accept explicit delayed attribution and
   give callers a generation fence. This costs an additive table and bounded reads.
2. **Keep deleted assignments as historical rows** (rejected). Every current
   assignment/readiness/claim query would need a new active predicate. Missing one
   could make released work appear owned or permanently unclaimable.
3. **Infer attempts from activity or the current assignee** (rejected). Incomplete
   history cannot supply exact claim times, and delayed reports can attach to a
   newer claim. The inference would assert facts the service never recorded.
4. **Store external runner states and execution outcomes** (rejected). The service
   does not supervise those processes; ownership release does not prove stop,
   failure or completion. Runner orchestration remains outside this milestone.

## Decision

Persist one ownership receipt for each new winning self-claim, with the exact
winning `ta-*` ID, and accept optional explicit receipt association only from its
authenticated owner on the same task and organization.

### Receipt identity and lifecycle

- Add `task_claim_attempts`, keyed by the winning assignment ID, with task/org,
  owner kind/ID/name snapshot, actual `claimedAt`, optional `externalRunId`, and
  nullable `releasedAt`, `releaseReason`, released-by kind/ID. Owner/task/org,
  claim time and external correlation never change. The only lifecycle update is
  the first ownership ending. `releaseReason` is `released`, `unassigned` or
  `owner_purged`; the latter names retention removal, not worker execution.
- New human self-claims also receive receipts. Human-created assignments do not.
  A receipt's owner is a principal (agent or user), never a token ID, so another
  valid token for the same agent may submit its delayed report. Tokens still need
  current organization access, scopes and ordinary operation permission.
- Capture one real claim time on success. Assignment, receipt, activity, durable
  event and keyed response commit together. A failure in any part rolls back all
  parts; a losing claim creates no receipt. ClaimNext with no work returns none.
- Reclaim creates a different ID even for the same agent. The existing principal
  and method scoped idempotency key returns its original receipt-bearing response
  within the existing 24-hour retention. A changed external correlation with the
  same key is a changed request and fails. Replay after release remains an
  original response snapshot, not proof of present ownership.
- Do not backfill old assignments, vanished claims, times or report associations.
  A pre-upgrade active claim can still be released by the legacy request and has
  no receipt. No migration timestamp is presented as its claim time.

### Exact release and administrative unassignment

- Add optional `expectedAttemptId` to ReleaseTask. Omission preserves legacy
  caller-held-claim semantics. When supplied, it must equal the current held
  assignment ID before any handoff note, receipt update, activity or deletion.
  A stale ID, including same-agent release/reclaim, fails FailedPrecondition.
- Wrap authorization, selection, exact-ID removal, optional handoff and receipt
  closure in one managed transaction. A concurrent lost exact-ID removal aborts
  the entire operation; it cannot leave a handoff or close a newer claim. Delete
  the selected assignment before writing the handoff within the transaction;
  neither becomes visible until commit. A caller cannot self-release an assignment
  made by a human. Existing handoff author/scope checks remain mandatory.
- Human UnassignTask retains its exact agent/user pair semantics. Capture the
  actual matching row IDs, delete those IDs and close only their receipts in the
  same transaction; never look up a newer generation after deletion. Record real
  removal once. An absent pair remains an idempotent success. A manual assignment
  without a receipt needs no fabricated one.
- A task status update or archive does not close ownership or assert process
  completion. Existing explicit release/unassignment ends ownership. Purging a
  task removes its receipts through the existing explicit cascade; archived tasks
  retain them. Agent/user purge must retain receipt owner snapshots and IDs rather
  than erase attribution or introduce a new blocking foreign key.
- The existing retention `purgeAgentCascade` also removes assignments on live
  tasks. Run its actual assignment-ID capture/removal and corresponding first
  receipt closures in one managed transaction. Preserve receipts on surviving
  tasks with reason `owner_purged`, the real removal time and released-by kind
  `system` with no invented user/agent ID. Already closed receipts stay unchanged.
  Keep the existing note deletion/comment anonymization policy; a retained receipt
  does not guarantee all reports survive retention. Apply the same rule to any
  owner cleanup that removes ownership on a surviving task. Task/project/org
  cascades delete receipts with their parent tasks instead of retaining orphans.
- `externalRunId` is optional nonblank opaque text, at most256characters,
  preserved exactly after validation and rendered as escaped text rather than
  an inferred URL. It names external correlation, never a server execution ID.

### Optional report association

- Add optional `attemptId` to note creation, usage reporting and artifact linking,
  and to their returned/read models. Validate the base operation's current access
  first, then require a receipt on this exact task/org whose owner kind and ID
  equal the authenticated principal. An ID confers no permission. Unknown,
  other-task/org/owner references fail without exposing foreign receipt metadata.
- Closed receipts remain valid for delayed owner reports, including final usage
  after another agent or the same agent has reclaimed. There is no automatic
  association when the field is omitted, even if a claim currently exists.
- Notes remain agent authored and their association is immutable on edit. A
  release-generated handoff associates with the exact receipt when one exists;
  legacy releases without a receipt leave it ungrouped.
- Usage remains append-only. Validate explicit correlation before keyed replay.
  If either existing or requested usage has a receipt, replay requires the same
  association and authenticated reporter; changed/omitted association cannot
  relabel a receipt-bearing record. Legacy uncorrelated keyed behavior remains.
- Artifact links remain one current task/artifact pair. An explicit new receipt
  that differs from the existing link's association fails FailedPrecondition;
  it never silently moves historical provenance. Repeating the same association
  returns the existing link. A legacy omitted request keeps returning an existing
  link unchanged. Unlink/relink follows existing human unlink policy and records
  new provenance, not an immutable artifact-content snapshot.
- Add nullable association columns/indexes without rewriting old rows. Keep
  notes, usage and artifact metadata visible when association is absent.
  Agent-note edit/delete remains exact-agent-author-only; the human GUI is a
  read-only report reader, including for administrators. Remove the inherited
  impossible edit/delete affordances rather than broadening that permission.
- Serialize MySQL link creation on the artifact parent and use a current locking
  duplicate read after any wait. An earlier authorization snapshot must not let
  simultaneous retries create competing task/artifact pairs. SQLite uses its
  existing managed write unit. Retain historical duplicate rows rather than
  imposing a new unique index that would require choosing/deleting old provenance.

### Bounded reads and compatible wire changes

- Add ListTaskAttempts to TaskService: task ID + existing PageRequest; response
  receipts + PageResponse. Current tasks:read/task:read controls access. SQL
  pagination is fixed claimedAt descending then ID descending, default50/max100,
  with cursor scope bound to task. Reject unsupported filter/sort rather than
  ignore them. Resolve names from recorded owner snapshots; do not fetch catalogs.
- Existing note/usage/task-artifact lists gain optional `attemptId` and
  `uncorrelatedOnly` filters, mutually exclusive. Apply filters in SQL before the
  limit/count. Correlated filters validate that the receipt belongs to the
  authorized task, without requiring the reader to own it. Artifact filtering is
  task-side only; reverse artifact browsing remains unchanged. Each source keeps
  its current permission boundary, page size and cursor policy. Cursors must not
  cross task or association filters. Existing totals keep their task-wide meaning;
  filtered records must not relabel them as attempt totals.
- Preserve the existing task-wide latest-three handoff summary through a bounded
  ListTaskNotes noteType filter, with its filtered total count. This avoids
  retaining the old fetch-all request solely for a sidebar summary. The summary
  stays task-wide when associated report lists are filtered; it does not claim
  that the selected receipt contains all handoff context. Reserve fresh optional
  ListTaskNotesRequest noteType5, restricted to comment/handoff.
- UnassignTask and retention cleanup currently emit no task event. Do not assume
  stream invalidation can refresh those closures. While the Claim history
  disclosure is open, the document visible and current access confirmed, refresh
  only its current bounded history page every30seconds as well as existing task
  event invalidation. Stop timers/requests on collapse, hidden document, unmount,
  task/account/org change or known access loss. Explicit Retry/Refresh uses the
  same authority lifetime. Do not automatically poll every cached/older page.
  After each successful visible history read, revalidate the existing scoped
  task query too. An unchanged older page cannot reveal a newest-receipt closure,
  and the sidebar must reconcile actual current assignees. Never derive current
  assignment from a closed receipt: the same agent may already have reclaimed.
  Keep Summary drafts/focus and the selected history page through this point read.
  Test remote unassign/retention closure with no published event.
- Client read receipts bind QueryClient + account/org/task + source epochs.
  History and usage share task-read authority; their known denial and any source
  Unauthenticated fence sibling task reports and late responses. Artifact and
  note-specific permission loss stays local. A known-denied lifetime needs an
  explicit fresh authorized read, including after filter changes or remounts.
  After denial, Retry revalidates the retained current page before enabling
  navigation; a transport-only page failure retains and retries its target page.
- Plan fresh optional field numbers against the current TypeSpec source:
  ClaimTaskRequest externalRunId3; ClaimNextTaskRequest externalRunId5;
  ClaimTaskResponse/ClaimNextTaskResponse attempt3; ReleaseTaskRequest
  expectedAttemptId3; TaskNote attemptId8; CreateTaskNoteRequest attemptId5;
  UsageRecord attemptId12; ReportUsageRequest attemptId7; TaskArtifactLink
  attemptId8; LinkTaskArtifactRequest attemptId3. ListTaskNotesRequest and
  ListUsageRecordsRequest use attemptId3/uncorrelatedOnly4;
  ListTaskArtifactLinksRequest uses attemptId4/uncorrelatedOnly5.
  Recheck actual free numbers before T02/T03 generation. Removed note-author
  field2 remains reserved. No old field, message or method is removed/renumbered.
- T01 records this reservation without advertising an unimplemented RPC. T02
  changes claim/release TypeSpec and regenerates protobuf/TS/Go together; T03 adds
  report fields with their handlers. T04 introduces/registers ListTaskAttempts
  alongside its bounded reader and consumers. CLI and MCP accept optional external correlation and
  generation fields, return receipt metadata and document legacy omission. No new
  scope, runner, dependency or event family is required; reuse existing task,
  note, usage and artifact event roots for current-source invalidation.

## Consequences

History can explain who held a task and group explicitly associated reports after
release, while old clients can continue to operate without those guarantees.
Generation fencing requires the caller to send the returned ID; legacy clients
do not acquire stale-release protection merely by upgrading the server.

Current receipts and report associations are recorded facts, not success/failure,
process liveness, a heartbeat, artifact immutability or complete pre-upgrade
history. Paginated UI source views must communicate those limits.

Roll back GUI/CLI/MCP exposure first and retain additive data. A pre-M57 backend
cannot safely write claim/release/unassign operations while receipt recording is
required: it can remove ownership without closing receipts. A binary downgrade
therefore requires disabling those writes or a forward-compatible repair; do not
silently call old-writer operation safe or delete receipts to make it appear so.
