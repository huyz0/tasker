# M46 Progress

## M46-T01 — Transactional event design

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: ADR-0040, TEST-PLAN-0046 and refined capture/relay task outcomes.
- **Verified**: Source audit found 19 emitting RPC modules plus stalled-claim detection and schedule-run bookkeeping; auth HTTP routes emit no domain events. Existing emitters all use publishDomainEvent. `moon check --all`: 35 completed (33 cached); documentation and milestone truth gates pass.
- **Notes**: Capture webhook targets in the transaction rather than through a stale cache at relay time. Broker references keep large payloads in SQL; audit uses producer identity, not sequence. Standalone without an explicit broker projects locally. Pending source events never age out; delivered source retention is 14 days, exceeding broker retention.
- **Next**: M46-T02 failing atomic capture scenarios and migrations.
