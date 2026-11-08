---
timestamp: 2026-11-08T08:19:42Z
decision: approved
---

# M45 atomic idempotency review (T03)

## Correctness

The unique principal/method/key reservation is inserted before executing the
mutation. Reservation, domain writes and completed JSON response commit in one
unit; a storage failure rolls them all back. The reservation is never committed
as pending, so a crash needs no processing-row lease. Existing completed rows
and request hash mismatch behavior are preserved. SQLite serializes competing
callers; independent MySQL connections either replay or lose the reservation
and receive Aborted. Lock/deadlock conflicts are also retryable at the operation
entry point, including BEGIN conflicts before the helper runs.

Task create, claim and claim-next entry points own the unit before permission
checks, so current authorization and cache replay share the boundary. Nested
helper units do not commit early. Publication is deferred until the outer commit;
a failed response write emits no task event. This volatile buffer is not claimed
to survive a crash after commit; M46 remains necessary.

## Coverage

All three new SQLite regressions failed against the old helper: three executions
for three overlapping calls, response-storage failure left data committed, and
an unkeyed failed callback left data behind. Real SQLite triggers now force
completed-response writes to fail and prove both rows and events roll back.
57 focused task/replay/queue tests pass. Independent real MySQL pools race on
one key and execute the mutation once; a retry returns that result. Combined
MySQL retry/task concurrency run: 10 pass. Full local gate: 35 completed.

## Architecture

The helper uses ADR-0038's existing unit and key schema rather than introducing
a second reservation lifecycle. Database conflicts are translated through one
small helper used by the task boundary and idempotency helper. No wire fields,
new package or schema migration is introduced by T03. Workflow compensation
cleanup is explicitly deferred to T04; workflow calls already inherit the unit.

## Security

The M44 authorization regressions remain green. Replacement credentials retain
retry identity but must satisfy current permissions. Errors preserve their
cause internally and expose a generic retry instruction, not SQL or key values.
No committed placeholder can be replayed by another request. JSON serialization
or storage errors abort the transaction rather than silently weakening retries.

## Findings

```yaml
findings: []
```
