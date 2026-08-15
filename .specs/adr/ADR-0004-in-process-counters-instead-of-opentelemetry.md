---
id: ADR-0004
status: accepted
date: 2026-08-15
milestone: M02
---

# Use in-process counters over Pino instead of OpenTelemetry until M11

## Context

`architecture.md` listed OpenTelemetry as an external integration with OTLP
export to Datadog, Prometheus, Grafana Tempo or Jaeger, degrading to no-op in
standalone. No `@opentelemetry` package is installed.

What exists is a deliberate, working, much smaller thing — structured logging
plus counters held in process memory:

- `lib/logger.ts` — Pino, structured JSON.
- `lib/rpcMetrics.ts` — per-method call counts and latency percentiles.
- `lib/businessEvents.ts` — domain event counts.
- `lib/httpMetrics.ts` — status codes per route, recorded in `index.ts`.
- `lib/errorRingBuffer.ts` + `lib/errorReporter.ts` — the last N errors, in memory.
- `modules/telemetry/telemetry.ts` — exposes all of it over `/api/debug/*`.
- `index.ts:169-175` — flushes the RPC and business-event summaries to the log
  stream every five minutes.

The forces that made this the right size:

- The single-binary target (**M09**) must run with no external dependency. A
  collector is exactly the dependency that target exists to avoid.
- There is no deployment. Tracing infrastructure with nothing deployed to trace
  is configuration nobody has ever read output from.
- The question actually being asked during development is "which method is slow"
  and "what error just happened", both answerable from a log stream.

## Options

**Adopt the OTel SDK now.** Vendor-neutral, standard, and the destination
anyway. Costs a meaningful dependency tree in a binary meant to be small, a
collector or endpoint to configure per environment, and instrumentation on every
handler — for signals no one is currently consuming.

**Expose Prometheus metrics.** Lighter than OTel. Still needs a scraper, which
standalone will not have, and gives no tracing.

**Counters in process, summaries in the log.** No dependency, no endpoint, works
identically in standalone and clustered. Loses everything cross-process:
percentiles are per-instance, and nothing correlates a request across services.

## Decision

Keep in-process counters flushed to the Pino log stream. **M11** introduces
OpenTelemetry, deciding then whether it replaces these counters or wraps them.

## Consequences

**Easier.** Zero operational surface. The standalone binary keeps its promise of
no external dependency. `/api/debug/*` answers latency and error questions during
development with no infrastructure at all.

**Harder — and this is the real cost.** Every counter is **per-process and
volatile**. Restart the backend and the numbers are gone; run two instances and
each reports its own partial view with no aggregate anywhere. There is no
distributed trace, so a slow request cannot be decomposed into database time
versus handler time. `lib/errorRingBuffer.ts` holds recent errors in memory, so a
crash loses the errors that explain the crash.

There is also no alerting. ADR-0003 defers a read-store decision to measurement
that this ADR leaves unmeasurable across restarts — the two deferrals lean on
each other, and M11 is where that stops.

**Foreclosed.** Nothing. The counter modules are small and behind their own
functions; OTel instrumentation can sit alongside or replace them.

**Note on correlation.** Request correlation ids already flow into published
NATS events (`lib/natsCorrelation.ts`), so one piece of tracing groundwork is
laid even though nothing consumes it.
