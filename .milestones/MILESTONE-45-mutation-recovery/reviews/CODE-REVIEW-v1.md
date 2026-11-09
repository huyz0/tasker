---
timestamp: 2026-11-08T08:12:00Z
decision: approved
---

# M45 database boundary and MySQL bootstrap review (T02, T06)

## Correctness

Awaited SQLite queries share a FIFO connection gate. An async unit explicitly
opens BEGIN IMMEDIATE, retains the gate across awaits, then commits or rolls
back. Nested operations share the owner. Fluent synchronous queries and native
synchronous transactions fail closed under another transaction owner. Async
callbacks are rejected by the synchronous transaction API. Raw SQL helpers are
awaited; the report trend query now observes that rule. Thenables are assimilated
inside AsyncLocalStorage, and native promises are not wrapped a second time;
the existing retention restore-race test proves reentrant query hooks work.

MySQL selects the transaction's actual pooled handle through the same context.
A real MySQL test reads its own provisional insert in a nested operation, rolls
it back, then commits another insert. It passes against MySQL 8.4.

The notification bootstrap uses a bounded temporary index, then migration 0047
replaces it with a generated full-key binary SHA-256 index. It preserves source
keys and runs before serving. A clean default-charset database migrated through
all 48 MySQL migrations. Keys sharing 511 characters, duplicates, and Unicode
keys were exercised against the real engine. No database charset was weakened.

## Coverage

The new boundary tests cover awaited rollback, concurrent reader isolation,
nested units, deferred callbacks, callback failure after commit, guarded sync
reads, and async callback rejection. Deliberately bypassing the access gate
makes the concurrent-reader test fail by exposing provisional data; restoring
it passes. Existing task concurrency, reports and retention tests pass. Real
MySQL task concurrency tests: 2 pass. Real MySQL access/index tests: 9 pass.
Full local gate: 35 completed, no failed backend tests.

## Architecture

ADR-0038 and ADR-0039 document the actual tradeoffs. T02 establishes the database
boundary; keyed mutations and workflows are not claimed atomic until T03/T04.
The volatile after-commit buffer is explicitly not a durable outbox; M46 owns
crash-safe publication. The historical SQL adjustment is necessary to let clean
utf8mb4 boot reach its forward repair; existing applied rows are not rerun.

## Security

The database layer adds no route and changes no permission policy. Provisional
SQLite data is withheld from other awaited callers; synchronous access fails
closed rather than leaking it. Transaction handles remain internal. Generated
digests preserve keys without truncation, at SHA-256's collision bound. No test
credential is committed and disposable databases were created without deleting
existing data. Interrupted historical MySQL DDL remains an operational issue
requiring inspection, not an automatic destructive repair.

## Findings

```yaml
findings: []
```
