# M45 Progress

## M45-T01 — Atomic mutation design

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: ADR-0038, TEST-PLAN-0045 and refined T02 to introduce the shared transaction boundary before extracting domain helpers.
- **Verified**: Existing Drizzle/Bun nested synchronous transactions were exercised inside an explicit BEGIN and correctly rolled back. `moon check --all`: 35 completed (33 cached); docs and ledger checks pass. Design documents SQLite isolation, MySQL connection ownership, legacy responses, retry conflicts and buffered events.
- **Notes**: Prefer a database-owned async unit over separately committed processing reservations; no schema change is required for idempotency. M46 still owns crash-safe event publication.
- **Next**: M45-T02 failing database isolation/rollback tests.

## M45-T02 — Transaction-owned database access

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: db/access.ts, db/db.ts and database isolation tests.
- **Verified**: Database boundary regressions pass; deliberate gate bypass makes the concurrent-reader test expose provisional data and fail. Restored code: real MySQL access/index tests 9 pass; existing MySQL task concurrency 2 pass; related SQLite reports/retention/access tests 40 pass / 1 skip. `moon check --all`: 35 completed. Review CODE-REVIEW-v1.md approved.
- **Notes**: Explicit SQLite BEGIN and a reentrant access gate; actual pooled MySQL transactions; nested operations reuse the owner.
- **Next**: M45-T03 keyed reservation and response commit.

## M45-T06 — Repair MySQL clean-install prerequisite

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: MySQL notification bootstrap index, forward hash-index migration, schema and embedded manifest.
- **Verified**: Fresh utf8mb4 MySQL 8.4 migration fails with ER_TOO_LONG_KEY on notifications(user_id varchar256, type varchar128, dedupe_key varchar512): 3584 bytes exceeds 3072.
- **Notes**: An earlier 5-second test timeout also interrupted DDL on the first disposable database; that database is retained for diagnosis, not silently repaired or reset. A second fresh database reproduces the independent oversized-index defect. T06 is a prerequisite to completing T02's real-MySQL check. Green: fresh database migrated; full keys with shared prefixes and Unicode persist; duplicates reject. Real MySQL tests 9 pass; full local 35-task gates pass. Review CODE-REVIEW-v1.md approved.
- **Next**: Fresh default-charset MySQL migration and full-key dedupe verification passed; then resume T02.

## M45-T03 — Atomic keyed mutations

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: idempotency helper, task operation entry points, event buffering and retry regressions.
- **Verified**: Red: overlapping calls ran 3 mutations, response-store failure committed data, unkeyed failure left data. Green: 57 focused task/replay/queue tests pass; real MySQL retry/task concurrency run 10 pass across independent pools. `moon check --all`: 35 completed. Review CODE-REVIEW-v2.md approved.
- **Notes**: Reserve before execution inside one unit; serialize SQLite and use MySQL unique-key reservation with retryable refusal for a concurrent loser. Authorize inside the task unit before replay. Defer volatile publication until commit; durable capture remains M46.
- **Next**: M45-T04 workflow rollback.

## M45-T04 — Workflow unit ownership

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: workflow transaction entry point and late-step failure regression.
- **Verified**: Deliberately disabling the outer unit leaks 2 task-created events and advances the counter to 3; restored code rolls back failures at all 3 step positions. Racing identical keys return one graph; deliberately bypassing replay produces different parent IDs and fails. Full `moon check --all`: 35 completed. Review CODE-REVIEW-v3.md approved.
- **Notes**: Replace compensating deletes with the shared unit; a later step's domain validation can fail after parent and prior steps were written. Check the counter and event stream as well as task rows.
- **Next**: M45-T05 process interruption and final verification.
