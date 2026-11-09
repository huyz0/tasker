---
id: ADR-0038
status: accepted
date: 2026-11-08
milestone: M45
---

# Database-owned asynchronous units of work

## Context

Keyed task operations write their response after executing. Overlapping requests
and process interruption can duplicate the mutation. Workflow instantiation uses
compensating deletes, which cannot undo externally published events. Bun SQLite
transactions are synchronous: passing an async callback commits too soon.
MySQL requires one pooled connection throughout a transaction.

## Options

1. Add a committed reservation with processing status and leases. This prevents
   overlap but does not close the crash gap unless every mutation has its own
   durable completion identity and recovery algorithm.
2. Duplicate each operation in synchronous SQLite and asynchronous MySQL forms.
   This retains native transaction APIs but duplicates validation and domain
   behavior, and would require rewriting every workflow step.
3. Use an asynchronous unit of work with connection-aware database access.
   SQLite needs explicit BEGIN/COMMIT and serialized access to its connection;
   MySQL uses its existing pooled transaction. This adds a small access layer,
   but shares domain operations and gives events the same transaction boundary.

## Decision

Use a connection-aware database handle and an asynchronous unit of work; reserve
the idempotency key, execute the mutation and store its response in one database
transaction, and buffer events until commit.

## Consequences

- SQLite's shared connection serializes awaited queries with a reentrant FIFO
  gate. An async unit of work holds that gate through explicit BEGIN IMMEDIATE,
  callback completion and COMMIT/ROLLBACK. Other awaited queries cannot read its
  provisional writes, including on an in-memory database.
- Synchronous query APIs are allowed when the connection is idle or the caller
  owns its gate. They fail closed during another caller's work rather than
  exposing provisional data. Existing synchronous nested transactions remain
  synchronous; async work must use the new unit of work.
- MySQL gets an actual pooled transaction handle. AsyncLocalStorage routes
  operations issued through the database handle to that transaction. Nested
  operations share their parent's transaction; no nested commit is allowed.
- A pending key exists only inside the transaction. No committed processing row
  needs lease recovery: a crash rolls it back. A concurrent reservation loser
  receives retryable Aborted; the next retry reads the winner's committed
  response. A changed payload is InvalidArgument on replay.
- Existing completed records keep their shape and hash compatibility. No schema
  change is needed. Retention deletes only committed completed keys.
- A response-storage error rolls back the mutation; it is not swallowed.
- Task operations run inside a unit of work even without a retry key. Workflow
  steps share the parent unit and rollback together; compensation is removed.
- Domain events are buffered until commit, so rolled-back workflows cannot
  announce tasks. M46 replaces this volatile post-commit buffer with a durable
  transactional event record. M45 alone does not claim crash-safe publication.
- The access layer wraps only database/query builders, not returned rows or
  schema objects. Tests cover fluent queries, awaited access, synchronous
  transaction use, nested operations, rollback, and concurrent readers.
- Direct SQL helpers (`db.run`, `db.all`, `db.get`, `db.values`) are awaited
  outside owned synchronous transactions. The report trend query is updated
  to await its result; fluent synchronous `.all()` remains a guarded native
  escape hatch for existing synchronous transaction callbacks.
- Root connection access and an escaped transaction must never be handed to an
  external caller. Background work and streaming revalidation use the same
  managed database handle.
