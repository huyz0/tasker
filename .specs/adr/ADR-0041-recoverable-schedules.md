---
id: ADR-0041
status: accepted
date: 2026-11-09
milestone: M47
---

# Admit durable occurrences and commit work with its receipt

## Context

ADR-0036 preserves a small UTC cadence and creates ordinary tasks for external
workers. Its next-run CAS commits before work, and its history commits after
work: either crash gap can lose an occurrence or create untracked duplicates.
M45 supplies managed asynchronous units and keyed mutations; M46 captures events
inside those units. A 24-hour idempotency cache alone is not a durable receipt.

## Options

1. Keep the CAS and retry creation using its current template. This loses the
   claimed intent and can create a different graph after edits or key expiry.
2. Persist an occurrence, create work in one unit, then finalize history in a
   second unit using a durable creation receipt. This works but introduces a
   receipt/finalization protocol and another recoverable state.
3. Persist an occurrence with advancement, then commit its ordinary work,
   terminal receipt/history and schedule pointer in one SQL unit. This adds
   bounded snapshots and fenced recovery but removes the completion gap.

## Decision

Choose option 3. Supersede ADR-0036's CAS-only firing guarantee and raw error
recording; preserve its UTC cadence, creator attribution and ordinary-task model.

### Durable identity and admission

- Extend `schedule_runs` as the occurrence and receipt, preserving legacy rows.
  New nullable `slot_key` has a unique `(schedule_id, slot_key)` index. Scheduled
  identity uses the original stored UTC due instant, not claim time or the next
  slot. Manual identity uses a fresh random intent ID per RunSchedule call.
  Existing callers have no retry key: repeating an unanswered manual RPC is a
  new intent, not a guaranteed replay. `skipIfOpen` still prevents open pile-up.
- Add schedule revision and tombstone time. Under a managed unit, lock the
  current project/schedule, verify the selected revision, active/deleted state
  and due instant, then insert one frozen occurrence and advance to the first
  cadence slot strictly after the admission clock. Both commit or neither does.
  No catch-up series is generated. A very late slot still fires once.
- Freeze the actor identity, organization/project, target, skip policy, rendered
  date/title and task fields. A workflow snapshot includes its source template
  ID, parent description, author order, graph, priority, type IDs and resolved
  statuses. Deduplicate dependencies and bound serialized inputs to 1 MiB;
  MySQL uses LONGTEXT, not its 64 KiB TEXT limit. No credentials are stored.
- Invalid targets/authority produce one terminal failed receipt while advancing
  that due slot; infrastructure/storage failures roll admission back. Error
  details are fixed safe classifications, never arbitrary SQL/messages/bodies.
- Editing increments revision and affects future admissions. Pausing prevents
  new scheduled admissions but retains admitted intents. Manual runs of paused
  schedules remain allowed. Deleting tombstones the schedule, prevents admission
  and atomically cancels unstarted recoverable occurrences. It retains history.
  Archived project rows are still locked for authorized schedule edit/cleanup;
  archival must not prevent an administrator pausing/deleting pending work.

### Fenced execution and atomic result

- Lease queued/interrupted or expired running occurrences for 60 seconds using
  a fresh random token, incremented attempts and a conditional update. No owner
  token crosses the public contract. A terminal receipt is never leased again.
- Execution locks project, schedule and occurrence in that order, rereads current
  rows with locking reads on MySQL, and verifies the lease token. SQLite uses
  BEGIN IMMEDIATE. Acquisition/recovery uses the same order; do not establish a
  stale repeatable-read snapshot before waiting for these locks.
- Revalidate current authority before first work creation: a scheduled human's
  current membership/permission; a manual human's current permission; a manual
  agent's exact persisted token ID, agent/org binding, live agent, revocation,
  expiry and current scopes. Browser sessions/plaintext tokens are not persisted
  or required to resume an already admitted human intent. No cached token scopes
  grant recovery rights. Current project/type/status validity also applies.
- Reuse an internal frozen-workflow core shared with public instantiation. Do
  not reload a mutable template or add an arbitrary-graph public RPC. The public
  operation keeps its own contract, validation and current authorization.
- Under the schedule lock, check the latest committed parent task for
  skip-if-open. Work creation uses the existing keyed task/private workflow
  operations with the occurrence ID; every workflow step, schedule stamp,
  terminal occurrence result, last-run pointer and captured events commit in
  the same outer unit. Only committed work updates `lastTaskId`.
- A successor cannot replace a lease while the work unit owns its row locks.
  Expiry makes an occurrence eligible to contend, not permission to overwrite
  an in-flight commit. Final updates require the exact token. Stale owners
  create no work and cannot overwrite a newer owner/result.
- A kill before commit rolls back all provisional work; the durable admitted
  occurrence remains recoverable after lease expiry. A kill after commit leaves
  the original work and terminal receipt. Recovery consults that receipt before
  template/creation authorization and never recreates work, even beyond 24h.
  This deliberately removes the planned separate bookkeeping window rather
  than merely recovering it; tests kill on both sides of the atomic boundary.
- Business denial/invalid frozen targets are terminal `failed`; skip-if-open is
  terminal `skipped`. Other errors roll back the whole work unit, then mark the
  same token `interrupted` with retry after 5 seconds, exponentially capped at
  5 minutes. Failed bookkeeping must not hide other due schedules. Process death
  leaves `running`; expired leases are shown as interrupted/recoverable. No
  retry count discards an intent. Deletion is terminal `cancelled`.

### History, retention and ownership

- Keep existing run fields/numbers and legacy outcomes. Add optional due time,
  attempts, retry/lease/start/completion times using fresh wire numbers. Keep
  ranAt as stable admission time for cursor ordering. List queries select only
  bounded metadata, not frozen inputs. Record queued/running/interrupted plus
  created/skipped/failed/cancelled, with safe details and original work links.
- Pending snapshots are immutable. Clear frozen execution bodies on terminal
  completion/cancellation, retaining actor identity, target metadata and receipt
  task ID. Existing task/artifact retention rules govern created work. Terminal
  run metadata and tombstones remain until project or organization purge,
  including automatic retention purge of archived parents. Those paths
  deliberately remove schedules and all their occurrences in a locked unit.
- Active schedule lists exclude tombstones; normal GetSchedule keeps NotFound
  after delete. ListScheduleRuns by a known deleted ID remains authorized by
  current organization task-read permission and can inspect retained history.
  No new archive navigation or retry button is introduced in this milestone.
- Existing history adds readable state labels, attempt/recovery times and live
  refresh from domain.schedule events. Existing semantic tones and typography
  apply. While visible history contains queued/running/interrupted rows, refetch
  it every 15 seconds so a crashed worker needs no new event to expose expiry.
  Organization-wide schedule browsing can display a project outside the selected
  project's feed: in that case poll its detail/history every 15 seconds even
  when empty or terminal, and poll the organization list while its feed is
  project-narrowed. Stop fallback on covering scope, unmount or access denial.
  A second stream would duplicate connection state; silently switching projects
  would override user intent. Use the existing authorized reads instead. M53
  still owns application-wide scope/subscription alignment. The server derives
  interrupted from lease expiry; eligibility does not imply a retry started.
  Agents need tasks:read for schedule events, matching schedule reads.

## Consequences

Two narrow units per scheduled admission/execution make recovery inspectable
without network I/O or a new executor. MySQL locking behavior and SQLite process
crash recovery require real tests. New schema/worker semantics mean all old
sweepers must be stopped before migration; running mixed old/new sweepers is
unsupported. Rollback requires stopping new workers and retaining the new
schema/receipts; an old binary cannot safely execute pending new occurrences.

This milestone does not claim exactly-once external agent execution. Tasker
atomically creates one ordinary work graph for each admitted occurrence.
