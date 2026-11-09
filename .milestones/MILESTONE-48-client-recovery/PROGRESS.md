# M48 Progress

## M48-T01 — Reconcile short disconnects and bound reconnect jitter

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Refetch active queries once on the first accepted frame after a dropped stream, mark inactive cache stale for later use, and randomize reconnect waits within half to all of the existing capped backoff.
- **Verified**: Initial red reproduces stale active data after one drop and missing jitter. Independent v1 review found pending initial-fetch reuse; its real hook regression fails before explicit cancellation and passes afterward, including the late old response. All 25 focused tests pass; independent v2 approved. Removing cancellation fails one test; removing jitter fails two. Restored `moon check --all`: 35 completed (one cached), 96 GUI files pass with branch coverage 95.25%; backend 2122 pass / 43 gated skip / 0 fail. No browser journey is claimed by this hook task; T04 owns it.
- **Notes**: Started independently during M46 PR #3's browser checks; M48 depends only on M44. M46 merged as 62a0c3f with all ten jobs green, and this branch is rebased onto it with ledger counts reconciled. M48 proceeds ahead of M47. No new ADR or visual UX: existing connection states/fallback remain; a focused test plan owns reconnect/overflow/CLI recovery acceptance. No component appearance changes, so no new story is needed for this hook.
- **Next**: M48-T02 overflow reconciliation.
