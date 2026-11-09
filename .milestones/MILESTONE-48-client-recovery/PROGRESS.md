# M48 Progress

## M48-T01 — Reconcile short disconnects and bound reconnect jitter

- **Status**: in-progress
- **Date**: 2026-11-09
- **Changed**: Refetch active queries once on the first accepted frame after a dropped stream, mark inactive cache stale for later use, and randomize reconnect waits within half to all of the existing capped backoff.
- **Verified**: Initial red reproduces stale active data after one drop and missing jitter. First candidate: 22 focused tests pass. Independent v1 review rejects delayed initial-fetch reuse and requests explicit abandoned-wait/late-frame coverage; correction pending. Full GUI gates running against the first candidate before correction.
- **Notes**: Start the independent M48 branch from published main while M46 PR #3's final browser checks run; M48 depends only on completed M44. This brings client recovery ahead of M47 to use the CI wait productively. Rebase onto published M46 before publication and reconcile ledger counts. No new ADR or visual UX: existing connection states/fallback remain; a focused test plan owns reconnect/overflow/CLI recovery acceptance. No component appearance changes, so no new story is needed for this hook.
- **Next**: M48-T02 overflow reconciliation.
