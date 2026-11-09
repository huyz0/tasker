---
timestamp: 2026-11-09T05:36:00Z
decision: approved
---

# M46-T04 — Activation after corrections

Independent read-only review approved both v3 corrections and re-ran 32 privacy/
drain tests (55 assertions, zero failures). Primary verification ran all 35 local
gates: backend 2111 pass, 40 explicitly gated skips, zero failures. Separate real
socket suites passed 11 tests; isolated real MySQL suites passed four tests.

Correctness: runtime capture precedes listening; explicit read/stream exclusions
and narrow external-I/O units preserve atomic writes without network-held SQL
locks. Producer IDs deduplicate authoritative hydrated payloads. Legacy populated
upgrades preserve rows and remove sequence uniqueness in both dialects. Actual
handler/worker promises drain, and late request admission is refused.

Coverage: new regressions failed before changes for missing runtime capture,
wrong duplicate identity, external write boundaries, stalled claim rollback,
schedule routing, request-ID bounds, late admission and private SQL telemetry.
Retaining the old unique sequence index deliberately fails SQLite and MySQL
upgrade acceptance. Brokerless real RPC creation projects one local audit row;
real authenticated feed logout still terminates correctly.

Architecture: follows ADR-0040, including bounded acknowledged references,
current connection lookup, local standalone projection and pending retry. M47
still owns schedule occurrence recovery; T06 owns webhook delivery fencing/total
deadline; T05 owns separate-process crash/broker-outage closure evidence.

Security: fresh post-network authorization, stored tenant/reference validation,
bounded metadata and body-free error logging/ring/tracing are in place. Original
exceptions remain intact. Disposable MySQL schemas isolate verification; the
old shared development test schema was not reset.

```yaml
findings: []
```
