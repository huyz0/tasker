# M47 recovery evidence — 2026-11-09

Base: published M48 `3f55f55`; branch feature/m47-recoverable-schedules, PR #5.
Toolchain: Bun 1.3.11, Moon 2.4.6, Go 1.26.10. Local process proofs run on Linux
with SQLite and MySQL 8.4.13 in owned files/schemas. No capacity claim is made.

## T02 admission

Initial real-sweep failure injection leaves an advanced next-run time and one
untracked task before the fix. The corrected admission inserts one immutable
original-slot occurrence and advances in one unit. Frozen workflow/default,
retained deletion and queued-event cases fail before implementation. Review adds
archived cleanup and a stronger post-insert advancement failure: removing the
unit leaves one orphan occurrence; restored code passes.

The first process proof passes both dialects (26 assertions): two independent
sweepers admit one slot, and SIGKILL after advancement retains its queued intent.
SQLite legacy upgrade retains prior receipts and enforces unique new slot keys.
T02 full checks pass all 35 tasks, backend 2139 / zero failures, GUI 1350 / 95.26%
branches, CLI coverage gate 93.7%. Populated MySQL upgrade is still T04 work.

## T03 atomic work and durable receipts

Four initial behavioral reds reproduce lost queued intents, missing frozen
workflow recovery, orphan work after receipt failure, and concurrent manual
pile-up. The frozen case deletes its original template and changes status order;
recovery must use original inputs and dependencies. Failed creation rolls back
the entire graph before a safe terminal failure is recorded.

Further regressions cover lease takeover, original token revocation/expiry/invalid
expiry/current scopes/live-agent/binding/replacement-token checks, current human
authority, bounded retry, failure isolation and accepted manual contention.
A frozen scope-poison case creates two tasks in another authorized project before
its fix; metadata equality now rejects it. A malformed timestamp initially permits
work and now fails closed. Transient scan conflicts defer without losing pending
intents. An async fixture query is explicitly awaited; no timeout gate is raised.

Four deliberate faults fail their intended outcome assertions: omit the work
unit, omit lease fencing, reload the mutable workflow template, or ignore original
token revocation. Omitting only the work unit while retaining atomic lease claim
also fails the real SQLite SIGKILL proof with one orphan task. All source is
restored afterward.

The final process fixture additionally installs real durable event capture:

1. Two worker processes contend for one original due slot.
2. SIGKILL after admission retains the original queued intent.
3. A worker pauses after provisional task creation, before terminal receipt.
   SIGKILL rolls back that task and its task-created event; running lease remains.
4. Another process, using a controlled clock beyond lease expiry, commits the
   original occurrence's task and receipt. SIGKILL after commit retains them.
5. Expired idempotency keys are actually purged; a further process returns the
   same receipt/task ID without creating again.

Both SQLite and MySQL pass **54 assertions** after occurrence-context correction.
This phase uses a single-task work graph. T04 still owns the full workflow and
SIGSTOP stale-owner process matrix and populated MySQL upgrade evidence.

The first full check catches two failures, both corrected: the global scope
fixture lacks a persisted credential, and M46's existing capture regression
finds inherited foreign parent organization context in queued/running events.
The capture test now includes a wrong parent actor. Isolated red-to-green proof
and independent v6 review validate occurrence-local routing/attribution. Current
73 focused cases and typecheck pass; a final mixed manual/scheduled race also
passes. Final full check:35 tasks pass (24 cached), backend2165/zero failures,
functions95.80% / lines96.69%. Exact task closure lives in PROGRESS.md.

## Commands and boundaries

The committed full check uses normal coverage thresholds:

```sh
GOFLAGS=-buildvcs=false GOTOOLCHAIN=go1.26.10 moon --concurrency 1 check --all
```

Focused runs use Bun with an external test config that omits whole-project
coverage for selected files. Full checks retain the committed thresholds.
Run the real-process suite from the repository root (which has no backend-only
whole-project coverage configuration). It is enabled explicitly and creates/drops only its own
namespaced files/schemas; it needs an isolated MySQL service and credentials
with schema-creation rights:

```sh
TASKER_REAL_INTEGRATION=1 TASKER_MYSQL_INTEGRATION=1 \
  bun test apps/backend/src/test/wire/scheduleRecovery.integration.test.ts
```

This environment's private MySQL runner supplies credentials without printing
them. Original development services and databases are preserved. No remote
final-head CI or milestone completion is inferred from these local results.
