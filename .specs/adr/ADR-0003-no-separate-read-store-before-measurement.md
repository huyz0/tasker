---
id: ADR-0003
status: accepted
date: 2026-08-15
milestone: M02
---

# Do not introduce a separate read store before it is measured

## Context

The original architecture specified CQRS with OpenSearch as the read side: writes
commit to MySQL and emit a NATS event; a consumer projects into OpenSearch;
dashboards and agent queries read from there. The stated intent was that agent
write bursts must not degrade human read latency.

None of it is built. There is one path — reads and writes both hit the
transactional database — and OpenSearch appears in no manifest. Half the
machinery does exist: domain events are published on every mutating handler
(`lib/natsCorrelation.ts:43`), so the write side of the projection is already
emitting. **Nothing subscribes** — event consumers are M08.

The premise behind the original design was never tested. It assumes a read/write
ratio and a data volume that no measurement in this repository supports. There is
no benchmark, no load test and no production deployment.

## Options

**Adopt OpenSearch as specified.** Delivers the design as written. Costs a
cluster to operate, a projection consumer to build and keep correct, and an
eventual-consistency window the GUI must handle — a task list that does not show
the task just created is a bug report, not a trade-off. All of that before a
single measurement says the transactional database is the bottleneck.

**Read replicas on MySQL.** Much cheaper: no new component, no projection, no
consistency window beyond replication lag. Handles read/write asymmetry without
a second data model. Does not give ranked full-text search.

**Materialised tables in the primary database**, fed by the existing NATS
events. Keeps one operational component. Gives denormalised reads without a new
service.

**Defer.** Keep one path; measure first.

## Decision

Defer. **M07** measures the read path against a realistic dataset and picks from
the options above on evidence. OpenSearch is one candidate, not a commitment,
and no milestone owns introducing it.

## Consequences

**Easier.** One data model, one source of truth, no staleness to reason about,
no cluster to run. Every read is transactionally consistent with the write that
preceded it — which is the property the GUI silently depends on today.

**Harder.** The asymmetry the original design worried about is real and
unmitigated: a burst of agent writes shares connection-pool capacity with human
dashboard reads. If it bites before M07, it bites in production with no fallback
staged.

**Foreclosed.** Nothing structural. Events are already published, so a projection
consumer can be added without touching a single handler — the expensive half of
CQRS is already paid for.

**How to know the deferral was wrong.** No alert exists. `lib/rpcMetrics.ts`
logs per-method P50/P95 every five minutes and nothing reads those numbers.
Making them actionable is **M11**. Until then this decision is being revisited
on nothing, which is the honest risk of deferring.
