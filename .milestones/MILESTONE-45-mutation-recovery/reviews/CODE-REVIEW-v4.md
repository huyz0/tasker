---
timestamp: 2026-11-08T08:43:15Z
decision: approved
---

# M45 process recovery and milestone review (T05)

## Correctness

The integration harness starts separate Bun workers against one SQLite file or
one real MySQL 8.4.13 database. Workers execute CreateTask with the same actual
user, project, payload and key. Competing workers finish with one task ID, one
completed response and a project counter of two. The crash case pauses the real
completed-response write after task creation, kills that worker with SIGKILL,
then verifies zero tasks, no committed key and the original counter. A new
worker completes the request, and the parent can replay its committed result.

## Test strength

All four process cases pass against SQLite and MySQL. Deliberately committing
SQLite before awaiting the callback and removing the MySQL transaction makes
both kill cases fail: each exposes one partial task, a counter of two and a
null response placeholder. Restoring the implementation returns all four to
green. The real socket/auth/feed and broker/audit chain also pass (11 tests).
Full local gate: 35 completed, backend has no failures; service-dependent cases
were run explicitly rather than called passed from their default skip state.

## Architecture

The harness adds no production failure flag or alternate task implementation.
A worker-local database proxy pauses only response persistence, inside the real
unit and task handler. Production code remains the reviewed ADR-0038 boundary.
The forward MySQL bootstrap repair is recorded separately in ADR-0039. M46
still owns the event-loss gap after a successful database commit.

## Security and operations

Workers use isolated temporary files and uniquely named fixture principals and
organizations. Cleanup targets only their IDs. No credentials enter source or
worker case JSON; MySQL connection settings are inherited from the test runner.
Current authorization still precedes replay in the unit. The integration guide
now describes Aborted retries, the same-key rule and the 24-hour retention bound.
Optional gh/act execution was skipped by the repository's root task because the
tools are absent; direct local tasks, actual sockets and actual services ran.
No remote CI result, deployment, or 20000-client capacity claim is asserted.

## Findings

```yaml
findings: []
```
