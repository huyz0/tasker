# Architecture and operating boundaries

This document describes delivered behavior and cites its implementation.
Historical ADRs explain earlier decisions; they do not override the current
source. [Technology inventory](tech-stack.md), [roadmap](roadmap.md) and
[measured limits](../../docs/performance.md) provide the related detail.

## Product and contract

Tasker is a modular task-management system for people and external workers.
It records work, claims, evidence, questions, approvals, usage and schedules;
it does not host an autonomous worker's model execution.

The TypeSpec source is `packages/shared-contract/main.tsp`. Its current
namespace is `Tasker.Health.V1`, generating the existing
`tasker.health.v1` protobuf/Connect contract. React and Go clients consume
that contract. Most RPCs are unary; `EventService.SubscribeEvents` is
server-streaming. There is no client-streaming or bidirectional RPC.

Human accounts support local username/password login and optional linked
Google identity, not Google-only identity (`modules/auth/auth.ts`,
`lib/credentials.ts`, the dialects' users/credentials/linked-identity tables).
Sessions resolve through `lib/authenticate.ts` and
`modules/auth/session.ts`, with current revocation checks.

Agents are separate principals with opaque scoped credentials
(`lib/agentToken.ts`, `lib/scopes.ts`, `lib/authz.ts`). Stored tokens are
hashed; a token is not a human session. RPCs absent from the closed agent
scope map are denied. The agent-scope sweep checks registered services.

Unless prefixed otherwise, backend paths below are relative to
`apps/backend/src/`.

## Processes and transports

`index.ts` hosts the Node-compatible HTTP listener and Connect adapter.
Auth and telemetry use Elysia route groups, while health/readiness/metrics
and MCP have explicit HTTP dispatch. MCP uses JSON-RPC lifecycle/tool
messages at `POST /mcp`; its mappings call the existing RPCs over loopback
with the caller's authorization, so it shares authentication, scopes and
rate limiting (`modules/mcp/`). The Go CLI's `tasker mcp` is a stdio relay.

A separate entrypoint, `consumers/index.ts`, runs the durable audit
projector. The API also owns recoverable background event/webhook/schedule
work. Saying that the backend publishes but consumes nothing is incorrect.

The backend modules are `agents`, `artifacts`, `attention`, `audit`,
`auth`, `comments`, `dashboard`, `events`, `health`, `labels`, `mcp`,
`memory`, `notifications`, `orgs`, `projects`, `reports`,
`repositories`, `roles`, `schedules`, `search`, `tasks`, `teams`,
`telemetry`, `views`, `webhooks` and `workflows`. Handler factories
register in `index.ts`; search/dashboard/reports take the router directly.
This is one modular application, not a microservice split.

Shared rules live in `lib/`, but there is no blanket prohibition on
cross-module handler reuse: schedule execution deliberately invokes task and
workflow behavior inside its authorized transaction
(`modules/schedules/occurrenceExecution.ts`). It does not create another
public API or bypass the original actor's permissions.

## Authorization and persistence

The session interceptor resolves a principal. Each handler then authorizes
that principal against the canonical resource and tenant using
`lib/authz.ts` and policy helpers. Authentication alone grants no resource
access. Human role/policy checks and agent org/scope checks are distinct.

MySQL serves the clustered configuration; `bun:sqlite` serves standalone.
`db/db.ts` selects `schema.mysql.ts` or `schema.sqlite.ts` using the
configured mode. Handlers select the matching schema at call time.
Tenant isolation is application-enforced, not database row-level security.

`db/access.ts` supplies the asynchronous unit-of-work boundary. Use that
boundary for coordinated writes; do not pass an asynchronous callback to
Bun SQLite's synchronous transaction primitive. Changes, captured source
events and matching webhook deliveries commit or roll back together.

Keyed mutations reserve, execute and store their result in one transaction
(`lib/idempotency.ts`). The key is scoped to principal and method, and a
request digest rejects changed reuse. A lock/reservation conflict becomes
Connect `Aborted` (`db/errors.ts`); retry the same request/key. A client
deadline does not establish that the write failed to commit. Replay remains
subject to current authorization. Generic keys have a 24-hour retention
threshold and hourly cleanup; that is not an unlimited retry guarantee.

Tasks have priorities, parent/dependency links and claim-generation receipts.
The task modules enforce readiness and ownership, and retain attempt
correlation after release. Plans, human input/approval, completion evidence,
usage and workflow creation are delivered surfaces, not proposed extensions.
See `modules/tasks/`, `modules/artifacts/`, `modules/workflows/` and
[agent integration](../../docs/agent-integration.md).

## Durable events, audit and webhooks

The production mutation path captures source events in SQL before commit
(`lib/domainEventOutbox.ts`, `lib/natsCorrelation.ts`). Matching webhook
delivery rows are created deterministically in the same transaction
(`modules/webhooks/outbox.ts`). An in-memory publish callback is not the
durability boundary.

`lib/domainEventRuntime.ts` and `lib/domainEventRelay.ts` lease pending
events with a fencing token. The default lease is 60 seconds; retries back
off from five seconds to five minutes. Broker-required source rows are
marked delivered only after a real JetStream publication acknowledgement.
A missing broker retains SQL work for retry instead of silently dropping
the event. Standalone without a configured broker projects locally; MySQL
and explicitly broker-configured standalone use the broker path.

Broker messages carry bounded references with stable producer IDs, not
large artifact bodies. The audit projector loads the committed source,
writes idempotently using its event identity, then acknowledges delivery
(`consumers/auditProjector.ts`). A source row's `delivered_at` means broker
acceptance, not that audit or an HTTP webhook receiver has finished.

`consumers/stream.ts` defines stream `DOMAIN_EVENTS` over `domain.>`,
seven-day broker retention, durable consumer `audit-projector`, explicit
acknowledgement, a 30-second ACK wait and five delivery attempts. Delivered
SQL source retention is 14 days. These are bounded recovery windows, not
exactly-once delivery forever. Exhausted/expired work requires operator
inspection; restarting a consumer does not promise unlimited redelivery.

Webhook workers separately lease, sign, send and retry SQL deliveries
(`modules/webhooks/delivery.ts`, `urlSafety.ts`). Stale owners cannot
overwrite a successor. DNS/address validation is applied at connection
time. Webhook identity and producer event identity have different roles;
receivers must deduplicate the delivery chain. Details and inspection SQL
are in [webhooks](../../docs/webhooks.md).

## Live reconciliation

The live feed is ephemeral and distinct from durable audit delivery.
`modules/events/events.handler.ts` shares one broker subscription per
API process. Each client has a bounded 1000-entry queue plus an out-of-band,
coalesced resync flag. Overflow cannot silently impersonate a complete
history: `stream.resync` tells the client to refetch canonical state.

Defaults are a 25-second heartbeat and 30-second quiet credential/scope
revalidation, with scope invalidation and credential expiry also checked.
Revocation is bounded revalidation, not a promise of instantaneous global
delivery suppression. Canonical reads and keyed-response replay always
require current authorization. See `modules/events/eventScope.ts`.

The GUI reconciles on reconnect/first-frame recovery and resync, cancelling
stale reads before invalidation/refetch. Client backoff is bounded with
jitter. Real browser and CLI journeys cover recovery; the recorded evidence
is in the M48 milestone and `apps/gui/tests/e2e/`.

## Recoverable schedules

`modules/schedules/` admits durable creation receipts with frozen inputs.
`occurrenceExecution.ts` fences a 60-second owner lease, rechecks the
original actor and credential, and creates work/its terminal receipt in the
same coordinated transaction. Interrupted work can resume after eligibility
and lease expiry; a stale owner cannot replace a newer result.

Editing a template or schedule does not rewrite already frozen inputs.
Pausing prevents future admissions. A new manual Run is a new creation
intent, not a retry of an accepted occurrence. Stable schedule receipt
identity survives generic idempotency-key cleanup. History exposes outcome,
attempts and recovery information; it must not be reduced to an invented
fixed `created|skipped|failed` union.

## Search and user interface

`modules/search/search.handler.ts` uses SQLite FTS5 and MySQL FULLTEXT.
Indexes and bounded filtering/pagination are real; the original LIKE
scanning decision was superseded by M07. Reads and writes still use the
transactional database. OpenSearch and a separate read store are absent.

The GUI is a client-rendered React SPA with routes in
`apps/gui/src/App.tsx` and generated Connect clients behind TanStack Query.
Tokens live in `apps/gui/src/index.css` and are checked by
`apps/gui/scripts/design-lint.mjs`. Dialog, dropdown-menu and tabs use
Radix with local components; hand-rolled primitives are not a universal rule
([ADR-0011](../adr/ADR-0011-adopt-radix-for-overlay-and-navigation-primitives.md)).

The M51 navigation/layout review records the independently researched
system-font/violet decision, grouped navigation and responsive fixes.
Attention, agent connection, evidence, attempt correlation and saved views
are delivered and recorded by M53–M58. A theme token or a passing screenshot
is not evidence of unmeasured user-study outcomes.

## CLI

`apps/cli/cmd/` is a Cobra command tree over generated Go Connect clients.
`--json` emits stable compact JSON; supported paged lists offer
`--page-all` NDJSON, cursor-loop detection and a bounded page count
(`cmd/output.go`). Earlier pages may already be written when a later one
fails. Error output/exit status remain significant.

The default `--timeout` is 30 seconds per backend request, including a page
or forwarded MCP request, not the entire command/MCP session
(`internal/backend/request_lifetime.go`, `cmd/root.go`). Earlier parent
deadlines and cancellation still apply. Stdio MCP relay exists; a TUI,
field masks and a schema-introspection command do not.

## Deployment, telemetry and checks

The standalone build embeds the SPA and migrations
(`apps/backend/scripts/bundle-gui.ts`, `db/embeddedMigrations.ts`,
`lib/staticServer.ts`). It is not a backend-only binary. There is one
HTTP/RPC ordering; the rejected in-process transport is not a planned API.

`apps/backend/Dockerfile` builds API and consumer binaries and runs as a
non-root user. `docker-compose.yml`, `deploy/kubernetes.yaml` and
`deploy/otel-collector.yaml` are committed deployment examples. Their
presence is not evidence of a production deployment. Database, broker
storage and encryption secrets require an operator's backup policy.

Pino and OpenTelemetry provide logs/traces; OTLP export is created only
when configured (`lib/telemetry/otel.ts`). In-process counters feed
`GET /metrics` (`lib/prometheus.ts`). Liveness `/healthz` is independent
of dependencies; `/readyz` reports lifecycle readiness and becomes false
while draining. `HealthService.Ping` is a separate dependency check.
Shutdown stops admission/leasing, drains work and closes resources.

The exact repository gate is `moon check --all`, supplemented by explicit
native-service, browser, rendered-story, standalone and packaging jobs in
`.github/workflows/`. M49's verified source runs 37 repository checks;
task declarations, rather than this snapshot count, define the current
gate. GUI coverage enforces its configured 95% thresholds. Vulnerability
CI includes the JavaScript high/critical ratchet and Go govulncheck.

Toolchains come from `.prototools` through checked local setup actions:
Node 24.22.3, Bun 1.3.11, Moon 2.4.6 and Go 1.26.11 at this revision.
Cross-compiled packaging is tested on Linux; native execution of every
target is not implied. No release or deployment is performed by a PR check.

## What measurements establish

Historical M07 data-volume fixtures and handler p95 budgets are distinct
from M49's real HTTP, multi-process, concurrent-caller workload. A unit-test
pass does not recertify every historical large fixture.

[Performance evidence](../../docs/performance.md) retains hardware, runtime,
dataset, defaults, latency samples, uncertain outcomes and recovery tails.
Retained short 100-caller observations complete without request errors.
Original and repaired 1000-caller bursts remain severely saturated despite
correct reconciliation of eventual commits. Generator profiles, hardware,
errors and unacknowledged commits are distinct in the linked records.
Earlier incomplete commands and the final-head reproduction remain recorded.

This does not establish healthy 1000-caller service, steady-state queue
stability, all endpoints, streaming, multiple hosts or 20000 concurrent
agents/users. Rate limiting is per process; replicas multiply that budget
(`lib/rateLimit.ts`). Durable SQL/ACKed retry is not unlimited retention.

## Unscheduled decisions

A separate read store/OpenSearch, representative sustained multi-project
profiling, shared rate coordination and improved overload/admission policy
need measured requirements and recorded decisions. The observed write
burst alone does not select a CQRS architecture.

A visual state-machine canvas, CLI field masks/schema inspection/TUI and
signed release binaries remain unscheduled. Certificates/signing and native
cross-platform validation are not implied by portable binaries. SSR and
React Flow are not installed choices. Keep historical ADRs intact and
record a new decision before introducing these technologies.
