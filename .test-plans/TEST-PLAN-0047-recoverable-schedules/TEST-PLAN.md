---
status: active
title: Recoverable schedule occurrences
milestone: M47
author: Delivery Engineering
created_at: 2026-11-09
---

# Recoverable schedule occurrences

## 1. Context and objective

Given a scheduled/manual intent, when a process or SQL operation fails, then its
admitted identity and committed work remain inspectable without duplicate graphs.

## 2. Scope

Given existing UTC schedules and ordinary tasks/workflows, when this plan runs,
then it covers durable admission, fencing, current authority, history and purge.
Given external workers, cron or throughput targets, when this milestone runs,
then it makes no executor, arbitrary cron or capacity claim (M49 owns capacity).

## 3. Strategy and environment

Given managed seeded SQLite and an isolated MySQL 8 schema, when handler tests
run, then real SQL validates both dialects. Given separate Bun child processes
and owned files/schemas, when a barrier is reached, then SIGKILL/SIGSTOP tests
exercise actual commit/lease boundaries. Given GUI components/browser, when run
history changes, then real rendering and source queries verify labels/refresh.
No shared development database is reset. All candidate suites, generated checks,
moon check --all and actual final-head CI must pass before merge.

## 4. Executable acceptance scenarios

### TC-001: Unique admission (T02, exit 1)

- **Type**: SQL/process integration, SQLite and MySQL.
- **Given**: One due schedule and two independent sweepers.
- **When**: Both admit its original due instant.
- **Then**: One occurrence and one advancement commit; the next slot is after now.

### TC-002: Admission crash (T02/T04, exit 1)

- **Type**: Separate-process SIGKILL, both dialects.
- **Given**: A worker commits occurrence and advancement but has created no work.
- **When**: It is killed and a second worker resumes after lease expiry.
- **Then**: The same occurrence creates one task, with no silent lost due slot.

### TC-003: Stale candidate and unchanged UTC semantics (T02)

- **Type**: Handler SQL and cadence tests.
- **Given**: A selected due row, or missed daily/weekly/monthly slots.
- **When**: Another transaction edits/pauses/deletes it before admission, or the
  sweeper admits a late unchanged row.
- **Then**: A stale revision cannot overwrite the edit; unchanged schedules fire
  once, never replay all missed slots, and advance strictly past now in UTC.

### TC-004: Frozen graph (T02/T03)

- **Type**: Handler SQL.
- **Given**: An admitted task/workflow with resolved type defaults.
- **When**: Its schedule/template/default order changes before recovery.
- **Then**: Creation uses frozen title/date/description/order/graph/status; a
  deleted/invalid current project/type/status fails safely without partial work.

### TC-005: Atomic work and receipt (T03/T04, exit 2)

- **Type**: Separate-process SIGKILL and failure injection, both dialects.
- **Given**: Durable admission and provisional task/workflow creation.
- **When**: The worker is killed before terminal receipt commit, then recovered;
  separately it is killed after commit and revisited beyond 24-hour key TTL.
- **Then**: Before commit all provisional graph/event writes roll back; recovery
  creates one complete graph. After commit the original receipt/task ID survives
  without template reload/recreation. Injected receipt failure leaves no partial
  work or lastTaskId and the same intent remains recoverable.

### TC-006: Fenced owners and open-work policy (T03)

- **Type**: Handler plus independent-process SQL, both dialects.
- **Given**: An expired lease or simultaneous manual/scheduled occurrences.
- **When**: A successor acquires ownership while an old worker resumes, or both
  try skip-if-open creation.
- **Then**: Old ownership cannot create/overwrite work; only the latest committed
  parent governs skip-if-open, so one creates and the other skips. Disabling the
  flag permits separate work, and manual runs do not move the scheduled slot.

### TC-007: Authority at recovery (T03)

- **Type**: Real handler SQL.
- **Given**: An admitted human or agent manual intent.
- **When**: Membership/role changes, or the original token is revoked, expires,
  loses tasks:write, changes binding, or its agent is deleted before creation.
- **Then**: No work is created, a safe terminal failure is visible, and another
  token/cached scope cannot replace the exact credential. A committed receipt
  remains its original result; reading it still requires current task-read rights.

### TC-008: Failure isolation and recoverable history (T03/T04, exits 3/4)

- **Type**: Handler SQL/fault injection.
- **Given**: Multiple due schedules and one occurrence whose work/record write fails.
- **When**: One sweep processes the batch and subsequent recovery passes.
- **Then**: Other schedules proceed. Failed business validation is terminal;
  transient storage errors preserve the intent, attempt count and bounded retry;
  expired running appears interrupted, with no raw SQL/secret/body in history,
  logs or events. Removing error isolation makes the regression fail.

### TC-009: Delete, purge, migration and paging (T02/T04)

- **Type**: SQL/upgrade integration, both dialects.
- **Given**: Legacy run rows and queued/running/terminal occurrences.
- **When**: Migrations run, schedule delete races execution, history is paged,
  or the owning project is explicitly purged.
- **Then**: Legacy rows remain readable; deletion serializes and cancels unstarted
  work, leaves committed tasks/history, rejects new admission, and permits
  authorized retained-history reads. Paging selects metadata only, including
  safe failure details; terminal snapshots are cleared. Project purge deliberately
  removes all schedule/occurrence rows and cannot leave a worker creating work.

### TC-010: Visible recovery states and event refresh (T04, exit 4)

- **Type**: GUI tests/stories/browser plus event-scope tests.
- **Given**: All run outcomes, optional attempt/timing metadata, and narrow screens.
- **When**: History renders or receives a scoped schedule domain event.
- **Then**: Text explains creation/recovery rather than agent execution, task links
  retain scope, rows wrap, and actual list/detail/run roots refresh. Loading,
  empty, error and denied states remain distinct. Agents see schedule events only
  with tasks:read and matching org/project. Old clients can ignore new fields.

### TC-011: Silent lease expiry (T04, exit 4)

- **Type**: GUI clock-controlled source-query test/browser.
- **Given**: Visible history with a running lease and no subsequent stream events.
- **When**: The lease expires and the bounded 15-second refresh interval elapses.
- **Then**: A fresh history response renders interrupted and recovery eligibility,
  without claiming a retry started; terminal-only history stops this polling.
