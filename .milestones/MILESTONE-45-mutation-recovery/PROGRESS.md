# M45 Progress

## M45-T01 — Atomic mutation design

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: ADR-0038, TEST-PLAN-0045 and refined T02 to introduce the shared transaction boundary before extracting domain helpers.
- **Verified**: Existing Drizzle/Bun nested synchronous transactions were exercised inside an explicit BEGIN and correctly rolled back. `moon check --all`: 35 completed (33 cached); docs and ledger checks pass. Design documents SQLite isolation, MySQL connection ownership, legacy responses, retry conflicts and buffered events.
- **Notes**: Prefer a database-owned async unit over separately committed processing reservations; no schema change is required for idempotency. M46 still owns crash-safe event publication.
- **Next**: M45-T02 failing database isolation/rollback tests.
