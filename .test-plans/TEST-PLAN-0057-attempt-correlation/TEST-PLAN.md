---
status: active
title: Durable claim receipts and optional report association
milestone: M57
author: Delivery engineering
created_at: 2026-11-10
---

# M57 executable acceptance plan

## Context, scope and strategy

T01 is static design; runtime TDD applies to T02–T05. Exercise actual managed
SQLite/MySQL handlers, migrations, generated old/new TS/Go/wire clients, real
HTTP MCP and a real browser. Controlled faults must show new assertions can
fail. Every receipt-bearing operation retains current tenancy/scope checks.
External process supervision and inferred execution outcomes are outside scope.

## TC-001 — Atomic claim identity (T02/T05, exit1)

Given an open unassigned task and authenticated claimers, when claims race on
both dialects, then exactly one assignment/receipt wins with the same ta-ID and
authenticated owner/task/org, actual claim time and optional externalRunId.
Given a receipt/activity/event/idempotency write failure, then no partial claim
or event remains. Given ClaimNext with no work, then no receipt is emitted.

## TC-002 — Retry and reclaim (T02/T05, exit1)

Given a keyed winning claim, when replayed within retention, then return its
original receipt and create no second row/event, including after release.
Given the same key with changed externalRunId, then reject the changed request.
Given release then a new same-agent claim, then its receipt ID differs; the
original keyed response does not assert the new claim is currently held.

## TC-003 — Exact release fence (T02/T05, exit2)

Given receiptA released and the same agent now holding receiptB, when releasing
with expectedAttemptIdA and a handoff note, then FailedPrecondition leaves B,
its receipt, notes, activity and events unchanged. Given current B, then its
assignment removal, one handoff, receipt closure and event commit together.
Given a concurrent removal after selection or a handoff/receipt failure, then
the entire losing release rolls back without stray note or newer closure.
Given a human-created assignment, then self-release remains refused.

## TC-004 — Human unassignment and lifecycle (T02/T05, exits1/2)

Given real matching assignment rows, when a permitted human unassigns an exact
agent/user pair, then only the actual removed IDs' receipts close transactionally;
other pairs and a concurrent replacement survive. Given an absent pair, then
no extra closure/activity occurs. Given status change/archive, then no ownership
end or process outcome is invented. Given task purge, then receipt/report cascade
completes; owner purge preserves recorded receipt identity/name facts. Given an
archived agent still holding a live task, when retention calls purgeAgentCascade,
then actual removed receipt IDs end once with owner_purged/system and real time,
while snapshots remain and the existing report-retention policy still applies.
Given a cleanup failure, then ownership removal and closure roll back together.
Task/project/org cascades remove receipts with their parents, without orphans.

## TC-005 — Migration and legacy omission (T02/T05, exits1/3/4)

Given a pre-upgrade DB with active/deleted claims, notes, usage and artifact links,
when both additive migrations run, then old fields/rows remain and no fabricated
receipt/time/association appears. A pre-upgrade active claim still releases via
an omitted fence. Old clients decode new responses and omitted optional fields
continue to work. Removed protobuf numbers stay reserved. Document unsafe old
backend ownership writes on downgrade rather than claiming rollback compatibility.

## TC-006 — Owner-bound delayed association (T03/T05, exit3)

Given an agent's receipt after release/reclaim, when that same authenticated
agent supplies attemptId on a note, usage or artifact link with current ordinary
permissions, then store/return exactly that old receipt association. Given a
different token for the same agent, then owner association still works. Given
another agent, user-kind mismatch, other task/org, unknown ID, missing scope or
revoked access, then reject without a write or foreign metadata exposure. Human
usage/link association requires its own human claim; notes stay agent authored.

## TC-007 — Stable correlation and retries (T03/T05, exit3)

Given omitted attemptId while a claim exists, then reports remain ungrouped.
Given receipt-bearing usage replay, then the same owner/association replays one
record; changed or omitted association refuses and cannot relabel it. Existing
uncorrelated keyed usage behavior remains. Given a duplicate artifact pair,
then the same explicit association returns the existing link; a different
explicit association refuses. An omitted legacy link request never overwrites
existing provenance. Note edits cannot change association. Release handoffs use
the exact recorded receipt or remain ungrouped for a legacy claim.

## TC-008 — Bounded authorized source reads (T04/T05, exit4)

Given more than100 receipts/reports with equal timestamps, when paging, then
SQL limits and stable ID ties produce complete nonduplicated authorized results.
Given another task/filter cursor or unsupported receipt sort/filter, then refuse
reuse. Given receipt/uncorrelated filters on notes, usage or task-side artifacts,
then SQL filters before limit/count; mutually exclusive fields and reverse-side
artifact correlation are refused. Current source permissions independently apply;
tasks:read alone cannot reveal artifact bodies. Task-wide usage totals retain
their meaning. Given current owner names later changed/purged, then recorded
snapshot IDs/names remain readable without whole-catalog fetches.

Given more than three handoffs mixed with many comments, when the task-wide
handoff summary reads its bounded noteType page, then SQL filters before the
limit and returns the latest three with the correct handoff total; selecting a
report receipt does not relabel that summary as receipt-specific.

## TC-009 — History and associated sources (T04/T05, exit4)

Given new/closed/reclaimed receipts plus legacy ungrouped reports, when opening
task detail, then history shows ownership facts and real optional timestamps,
All reports remains the default, and explicit receipt/ungrouped selection scopes
existing sources without unbounded grouping or duplicate viewers. Given older
pages/loading/empty/error/denied/retry, then extent and state are truthful and
keyboard accessible. No status label asserts running/stopped/success/failure.
Given an agent's selected receipt and a human Add link, then the write omits
attemptId; a returned ungrouped/other-receipt link produces accurate success
feedback and Show all reports rather than fake ownership or apparent lost work.

## TC-010 — Lifetime and real worker handoff (T04/T05, exits3/4)

Given pending history/report pages, when task/account/org or selected receipt
changes or authority is denied, then old completions/caches cannot expose stale
protected rows, steal focus or overwrite current source intent. Given transient
read errors without known denial, then useful retry retains valid intent. Given
an actual CLI/MCP claim→note→release→reclaim→delayed usage/artifact link sequence,
then the browser groups explicit old-receipt reports while legacy omission stays
ungrouped. Run both-theme375/768/1280 keyboard/accessibility/overflow journeys,
full local gates, independent review and actual final-head CI before publication.
Test tokens remain memory-only and are revoked in finally.
Given a human reads an agent note, even with a matching textual user/agent ID,
then the note and author-only guidance are visible without Edit/Delete or an
editor; no note mutation is submitted. Existing exact-agent author operations
retain their API/CLI permission boundary.
Given remote human unassignment or owner-retention closure with no task event,
then the visible current history page refreshes within30seconds and the current
task's actual assignees reconcile, including on an unchanged older history page.
Given the same agent has reclaimed, then its current assignment remains intact;
Summary draft text/focus and history position survive the refresh. Given collapse,
hidden document, unmount, scope replacement or known denial, then polling and
late completions stop; automatic refresh does not fetch every cached page.

Given usage denies the same task-read authority while a history response is
pending, or any report source confirms authentication loss, then old sibling
reports and late responses stay fenced. Given artifact/note-specific permission
loss only, then independently authorized sources remain visible. Given a denied
Older/Newer page and restored access, then its primary Retry performs fresh
current-page authorization; transport failures keep their original page target.
