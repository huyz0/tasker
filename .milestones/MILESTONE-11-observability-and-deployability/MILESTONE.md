---
id: M11
title: Observability & Deployability
status: todo
goal: The system can be deployed to a real environment and debugged there, with distributed traces, metrics and container images.
depends_on: [M08]
surfaces: [backend, infra, specs]
exit_criteria_met: false
started_at: null
completed_at: null
---

# M11 — Observability & Deployability

## 1. Goal

An operator can deploy Tasker to a container platform, point it at a managed
database and broker, and answer "why was this request slow" from a trace
rather than by reading logs. The observability story described in
`architecture.md` becomes true instead of aspirational.

## 2. Why Now

It follows M08 because a streaming service and a background consumer change the
deployment topology, and tracing is far more valuable once there is an
asynchronous hop to correlate across. It precedes the release milestone because
distributing a product that cannot be operated is premature.

## 3. Exit Criteria

- [ ] Every RPC produces a span; the trace continues through the NATS hop into
      the consumer.
- [ ] `traceparent` is propagated inbound and outbound, and every log line
      carries the trace id.
- [ ] Traces export via OTLP when configured, and degrade to a no-op in
      standalone mode with no connection errors.
- [ ] A Prometheus-compatible metrics endpoint exposes the counters that are
      currently only logged.
- [ ] A container image builds for the backend, and a compose file brings up the
      full stack.
- [ ] The service shuts down gracefully, draining in-flight requests, and
      exposes separate readiness and liveness signals.
- [ ] `/security-review` passes with no unresolved critical or high findings.
- [ ] Dependency vulnerability scanning runs in CI.

## 4. Scope

**In Scope**: OpenTelemetry instrumentation and export, the metrics endpoint,
the Dockerfile and full compose stack, a deployment manifest sample, graceful
shutdown and health split, the security review, dependency scanning.

**Out of Scope**: a specific hosted vendor, autoscaling policy, multi-region.

## 5. Task Breakdown

- [ ] **M11-T01** — Add the OpenTelemetry SDK with the OTLP exporter, configured
      from standard environment variables and disabled by default in standalone.
      - Files: `apps/backend/src/lib/telemetry/otel.ts`, `config.ts`
      - Verify: with no OTLP endpoint set, startup logs no connection errors.

- [ ] **M11-T02** — Instrument every RPC with a span carrying method, principal
      type, org id and outcome.
      - Files: `apps/backend/src/lib/requestLogging.ts`, `index.ts`
      - Verify: a trace shows one span per RPC with attributes.

- [ ] **M11-T03** — Propagate `traceparent` inbound and through NATS into the
      consumer, replacing the bespoke correlation id or bridging to it.
      - Files: `lib/natsCorrelation.ts`, `consumers/`
      - Verify: a mutation and its projection share one trace.

- [ ] **M11-T04** — Bind trace and span ids into every Pino line.
      - Files: `apps/backend/src/lib/logger.ts`
      - Verify: a log line can be pasted into a trace viewer and found.

- [ ] **M11-T05** — Expose `/metrics` in Prometheus format from the existing RPC,
      HTTP and business-event counters, gated to an internal listener.
      - Files: `apps/backend/src/modules/telemetry/telemetry.ts`
      - Verify: the endpoint scrapes cleanly.

- [ ] **M11-T06** — Write the backend Dockerfile with a non-root user and a
      minimal runtime layer.
      - Files: `apps/backend/Dockerfile`, `.dockerignore`
      - Verify: the image builds and the container serves health.

- [ ] **M11-T07** — Extend `docker-compose.yml` to bring up the full stack:
      backend, GUI, MySQL, NATS, and an OTLP collector.
      - Files: `docker-compose.yml`
      - Verify: `docker compose up` yields a working application.

- [ ] **M11-T08** — Add graceful shutdown draining in-flight requests and closing
      NATS, plus separate readiness and liveness endpoints.
      - Files: `apps/backend/src/index.ts`, `modules/health/`
      - Verify: SIGTERM completes in-flight requests before exit.

- [ ] **M11-T09** — Add a sample Kubernetes manifest or Cloud Run configuration
      with the streaming requirements from M08 documented.
      - Files: `deploy/`, `.specs/product/architecture.md`
      - Verify: the manifest is valid and annotated.

- [ ] **M11-T10** — Run `/security-review` across the full surface and resolve
      every critical and high finding.
      - Verify: the review is recorded with no open items.

- [ ] **M11-T11** — Add dependency vulnerability scanning to CI, failing on high
      severity.
      - Files: `.github/workflows/ci.yml`
      - Verify: a known-vulnerable dependency fails the job.

- [ ] **M11-T12** — Update `observability-standard.md` and `architecture.md` to
      describe what now exists.
      - Files: `.specs/standards/observability-standard.md`, `.specs/product/architecture.md`
      - Verify: the M02 drift check passes.

## 6. Verification

```bash
docker compose up -d
curl -sf localhost:8080/metrics | head
moon run backend:test
```

## 7. Risks

OpenTelemetry's Node SDK is heavy and can measurably slow a Bun process.
Benchmark request latency before and after and record both figures; if the
overhead exceeds the M07 budget, sample traces rather than abandoning them.
