# M48 Progress

## M48-T01 — Reconcile short disconnects and bound reconnect jitter

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Refetch active queries once on the first accepted frame after a dropped stream, mark inactive cache stale for later use, and randomize reconnect waits within half to all of the existing capped backoff.
- **Verified**: Initial red reproduces stale active data after one drop and missing jitter. Independent v1 review found pending initial-fetch reuse; its real hook regression fails before explicit cancellation and passes afterward, including the late old response. All 25 focused tests pass; independent v2 approved. Removing cancellation fails one test; removing jitter fails two. Restored `moon check --all`: 35 completed (one cached), 96 GUI files pass with branch coverage 95.25%; backend 2122 pass / 43 gated skip / 0 fail. No browser journey is claimed by this hook task; T04 owns it.
- **Notes**: Started independently during M46 PR #3's browser checks; M48 depends only on M44. M46 merged as 62a0c3f with all ten jobs green, and this branch is rebased onto it with ledger counts reconciled. M48 proceeds ahead of M47. No new ADR or visual UX: existing connection states/fallback remain; a focused test plan owns reconnect/overflow/CLI recovery acceptance. No component appearance changes, so no new story is needed for this hook.
- **Next**: M48-T02 overflow reconciliation.

## M48-T02 — Signal bounded feed overflow

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Add one coalesced stream.resync control indication outside the bounded domain queue, refresh subscriber membership before queued data resumes, and reuse active-query reconciliation in the GUI.
- **Verified**: Initial red: two backend and two GUI cases fail. Independent v3 found foreign membership amplification; its new burst/discovery regressions fail before correction. A periodic authorization-set change regression also fails before explicit resync request. Current 42 backend tests (92 assertions) and 43 GUI tests pass; independent v4 approved. Actual socket/broker suite: 11 pass including logout. Full `moon check --all`: 35 completed (17 cached); all 96 GUI files pass, branch coverage 95.26%; backend has zero failures.
- **Notes**: ADR-0045 and the existing TEST-PLAN-0048 define the additive control-frame boundary. No new wire fields or visual component; no UX artifact/story is needed. Old clients ignoring the new frame retain their previous behavior; updated clients reconcile. Standards: API/security. Keep current bounded credential refresh and do not include dropped event metadata in the control frame.
- **Next**: M48-T03 CLI cancellation/deadlines.
