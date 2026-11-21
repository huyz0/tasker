---
date: 2026-11-21
decision: rejected
reviewed_head: 292ffd62f9b940386ac0e78660ba1f5fe9a5774d
---

# M49-T02 source review

Two blocking findings.

1. **P1: Required recovery runner lacks an owned outer schema.** The runner enables MySQL counterparts without creating a schema or setting DB_NAME. The existing atomic-recovery fixture calls setupDatabase(mysql) and passes that configuration to its workers. CI supplies no default database, so this fails ER_BAD_DB_ERROR. A caller-supplied existing database could instead receive migrations and fixture writes. Generate a disposable outer schema, pass only it to the child and guarantee cleanup.
2. **P2: Teardown can abandon owned resources.** Sequential connection/database cleanup can reject before container removal, temporary-directory cleanup or environment restoration. Container creation is marked only after docker run succeeds, missing a daemon-created container left by a failed/timed-out command. Track attempts before invoking Docker, independently attempt cleanup, restore environment unconditionally and aggregate failures.

The central proof design is sound: distinct API PIDs, real scoped actors, claims/retries, explicit duplicate publication, consumer ACK before logical audit checks, stable producer identity, and positive delivery followed by reconnect revocation. Faults target acknowledged outcomes and restore source.

T02 remains unchecked; M49 is 2/6 with 391 completed tasks. Separate Integration success does not establish the required MySQL recovery gate passed. Actual ordinary/fault and final checks remain required. Read-only GitHub review; no files, tests or services changed.
