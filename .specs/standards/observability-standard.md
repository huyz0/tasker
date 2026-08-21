# Observability Standards

## 1. Structured Logging

- **Format**: All logs MUST output as JSON payloads for parsing.
- **Deprecation**: Never use raw `console.log()`. Use centralized logger
  instance (Pino/Winston).
- **Context Required**: Inject `@timestamp`, `level`, `pid`, and telemetry trace
  tokens globally.

## 2. Tracing & Correlation

- **Propagation**: Propagate correlation IDs across all boundaries. Use
  `traceparent` (OpenTelemetry) or `x-request-id` headers.
- **Log Binding**: Auto-append authenticated `userId` and thread `traceId`
  per-request context via binding.

## 3. Errors

- **Wrapping**: Do not discard root cause stacks (`throw new Error("Failed")`).
  Wrap exceptions and inject domain meta-data.
- **HTTP Problem Details**: Format user-facing API errors identically to RFC
  7807 problem details inside `.error`. Never leak internal stacks.
- **Global Catch-All**: API route wrappers must intercept unhandled promises,
  log FATAL trace, and cleanly return `500 Server Error`.

## 4. Telemetry Events

- **Metrics**: Emit structural metrics for critical business events
  (`user.created`).
- **Tagging**: Tag dimensional telemetry counters explicitly (e.g.,
  `status: success`).

## 5. What exists today (M11)

The sections above are the rules. This section is what implements them, so a
reader can tell the standard from the aspiration — the distinction ADR-0004 was
written to keep honest.

**Tracing** — `lib/telemetry/otel.ts`. The OpenTelemetry SDK is always
installed; an OTLP exporter is created **only** when
`OTEL_EXPORTER_OTLP_ENDPOINT` (or its traces-specific variant) is set. Without
one, spans still exist, `traceparent` still propagates and trace ids still
reach the logs, entirely in process — which is what lets the standalone binary
(M09) keep its promise of no external dependency while still satisfying §2.

Configuration is the standard OTLP environment vocabulary — `OTEL_SERVICE_NAME`,
`OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_TRACES_SAMPLER_ARG` — rather than names
invented here.

**Spans** — `lib/telemetry/tracingInterceptor.ts` opens one per RPC, ordered
ahead of the session interceptor so it covers authentication. Attributes carry
identities only (method, principal kind, org id, request id, outcome, Connect
error code); never payload, because a tracing backend has different access
rules from the database.

**Across the broker** — `lib/natsCorrelation.ts` injects `traceparent` into
every published `domain.*` payload beside the `requestId` and actor it already
stamps, and `consumers/index.ts` continues that context. A mutation and its
audit projection are one trace.

`requestId` is kept alongside, not replaced: the audit trail records it, it is
returned in the `x-request-id` response header, and it is the id a person can
read out of an error message and quote.

**Log binding** — `lib/logger.ts`'s Pino mixin merges `requestId`, `userId`,
`traceId` and `spanId` into every line, from the request context and the active
span. The consumer has no request context and still gets trace ids, which is
why the span is read directly rather than through the context.

**Metrics** — the in-process counters ADR-0004 chose (`lib/rpcMetrics.ts`,
`lib/httpMetrics.ts`, `lib/businessEvents.ts`) are unchanged, and
`lib/prometheus.ts` renders them at `GET /metrics` in the text exposition
format. Latency is a summary with quantile labels rather than a histogram,
because the recorder keeps percentiles and no buckets — inventing buckets would
mean inventing the numbers in them.

`/metrics` is unauthenticated and carries no tenant data: method names, route
paths, status codes, event subjects and counts. Restrict it at the network
layer if that inventory is itself sensitive.

**Health** — three signals, not one (`lib/lifecycle.ts`):

| Endpoint | Answers | Depends on |
| --- | --- | --- |
| `GET /healthz` | Is the process wedged? | Nothing external, deliberately |
| `GET /readyz` | Should it receive traffic? | Startup and shutdown state |
| `HealthService/Ping` | Is the whole system working? | Database and broker |

Liveness must never depend on a dependency: a database outage that fails
liveness restarts every replica and turns one outage into two.
