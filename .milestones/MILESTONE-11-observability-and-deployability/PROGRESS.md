# M11 — Progress

Delivered 2026-08-22 in two commits. Verified by running things: a live API and
consumer against a real broker, the container image, and the full compose stack
with a collector on the other end.

## Done

### M11-T01..T04 — tracing that costs nothing when unconfigured

ADR-0004 chose in-process counters over OpenTelemetry "until M11", on two
grounds: the single binary must run with no external dependency, and there was
nothing deployed to trace. This answers both rather than reversing either.

The SDK is always installed; an exporter is created **only** when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set. Without one the provider still runs, so
spans exist, `traceparent` propagates and every log line carries a trace id —
all in process, nothing opening a connection to a collector that is not there.
The M09 standalone promise is intact.

One span per RPC, ordered ahead of the session interceptor so it covers
authentication; the principal is therefore unknown when the span opens and its
attributes are set on the way out. Identities only, never payload.

`traceparent` rides in the event payload beside the requestId and actor, and
the consumer continues that context. `requestId` stays alongside — the audit
trail records it, it is in the `x-request-id` response header, and it is the id
a person can read out of an error message.

**Verified with both processes running**: `CreateTask` and the projection of
its event share one traceId with different spanIds, and both log lines carry
them.

### M11-T05 — `/metrics`

A view of the counters ADR-0004 built, not a second measurement. Hand-rendered
rather than pulling in `prom-client`, for ADR-0004's own reason. Latency is a
summary with quantile labels rather than a histogram: the recorder keeps
percentiles and no buckets, and inventing buckets would mean inventing the
numbers in them.

### M11-T08 — three health signals and a real drain

Liveness depends on nothing external, deliberately: a database outage that
failed liveness would restart every replica and turn one outage into two.
Readiness does, and goes false the instant a drain starts. The ordering is the
substance — stop being ready, wait a beat because the load balancer notices on
its own schedule, drain in flight, only then close NATS. Closing the broker
first makes an in-flight mutation succeed while its event vanishes.

**Verified by signal**: SIGTERM flips `/readyz` to 503 while the process keeps
serving, then exits `drained`.

### M11-T06/T07/T09 — the deployable shape

Two-stage image: the runtime layer has two binaries and no interpreter, no
package manager and no source. Non-root at a fixed uid. 284 MB.

Three things it took a real build to find. The workspace root manifest has to
be in the context or `shared-contract@workspace:*` does not resolve. A
transitive `better-sqlite3` compiles a native addon on install and needs a
toolchain in the builder — nothing uses it, but skipping install scripts
wholesale would skip everyone's. And Alpine needs `libstdc++`/`libgcc`: a Bun
binary links them, and without them the container starts and dies on "Error
loading shared library", which is a uniquely unhelpful way to learn a base
image is too small.

**And the real find.** The compose stack's first boot died reading
`./drizzle-mysql` — M09-T01 embedded only the SQLite migrations, because the
standalone binary was the case in front of us. A compiled artefact carries its
schema or it does not. Both dialects are embedded now, through one
dialect-agnostic apply loop whose runner methods may return a promise or not,
so `bun:sqlite` and mysql2 share a code path instead of having two kept in
step.

`docker compose --profile full up` brings up MySQL, NATS, the API, the
projector and an OTLP collector, and a `Ping` shows up in the collector's log
with its attributes. `deploy/kubernetes.yaml` is annotated — including the
proxy read-timeout M08's streaming endpoint needs and the
`terminationGracePeriodSeconds` that has to exceed the drain budget.

### M11-T11 — dependency scanning that stays on

`bun update` cleared four criticals. Fourteen highs remain, every one
transitive through a development dependency, none fixable from here — so a job
that failed on all of them would be permanently red, and a permanently-red gate
gets switched off.

`scripts/audit-dependencies.sh` is a ratchet instead: new high or critical
advisories break the build; the fourteen are listed by GHSA id with a reason
and the route they arrive by. `govulncheck` covers the Go side and found five
*reachable* standard-library vulnerabilities, fixed by pinning go1.26.6.

Found while building it: `bun audit --ignore` accepts a comma-separated list
silently and matches nothing. The gate reported green while ignoring nothing —
the worst possible failure for a security check. One `--ignore=` per id.

### M11-T10 — security review

`.specs/reviews/2026-08-22-m11-security-review.md`. No open critical or high
findings. Four issues found and fixed during it (the metrics gate, the Go
stdlib vulnerabilities, the four criticals, the silently-ineffective ignore
list); five decisions accepted with reasons; three things named as out of scope
rather than left implied — per-instance rate limiting, no CSP on the SPA, and
no image signing.

### M11-T12 — the documentation says what exists

`observability-standard.md` gains a section separating the rules from their
implementation, which is the distinction ADR-0004 was written to keep honest.
`architecture.md` gains the deployment shape.

## Exit criteria

All eight met.

## Remaining

Nothing.
