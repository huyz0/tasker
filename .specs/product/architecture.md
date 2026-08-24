# Architecture & Principles

This document has two halves and one rule.

**Built** describes the system that exists. Every mechanism stated in the
present tense cites the file that implements it. If you cannot cite a path, the
statement does not belong in this half.

**Planned Architecture** describes what is intended and not yet built. Every
entry names the milestone that owns it. Nothing there may be imported, called,
or assumed by code written today.

> Libraries and versions: [tech-stack.md](./tech-stack.md). Decisions and their
> reasons: [`.specs/adr/`](../adr/). Delivery order: [roadmap.md](./roadmap.md).

---

## Built

### System context

Tasker is a task-management system whose clients are both humans and AI agents.
It exposes one API contract, defined in TypeSpec and served over Connect-RPC,
consumed by a React SPA (`apps/gui/`) and a Go CLI (`apps/cli/`).

- **Human identity** is Google OAuth 2.1 — `apps/backend/src/modules/auth/auth.ts`
  for the routes, `modules/auth/session.ts` for cookie/bearer session
  resolution, `lib/sessionRevocation.ts` for revocation checks.
- **Agent identity** is a first-class principal, separate from human identity.
  An agent holds its own scoped, revocable, rate-limited M2M token
  (`lib/agentToken.ts` issues and verifies; `lib/scopes.ts` declares the closed
  scope vocabulary and the per-RPC scope map; `lib/authz.ts`'s
  `authorizePrincipal` is the agent branch of every authorization check).
  Absence from `AGENT_RPC_SCOPES` denies, and `lib/agent-scope-sweep.test.ts`
  fails the build for any handler method that is neither mapped nor refusing
  agents — including a check that its own handler map covers every service
  registered in `index.ts`. Delivered by M04; ADR-0008.
- **External runtimes** integrate by calling the same Connect-RPC contract. There
  is no separate agent-execution protocol.

### Process and transport

One process serves everything (`apps/backend/src/index.ts`):

- A `node:http` server on port 8080 is the listener (`index.ts:157`).
- Connect-RPC handlers are mounted through `connectNodeAdapter` from
  `@connectrpc/connect-node`. Twenty-one services are registered from the
  generated contract (`index.ts:3`) — eighteen through `router.service(...)`
  plus `search`, `dashboard` and `reports`, which take the router and register
  themselves.
- **Elysia handles two route groups only**, not the whole surface:
  `/api/auth/*` (`modules/auth/auth.ts`) and `/api/client-errors` + `/api/debug/*`
  (`modules/telemetry/telemetry.ts`). `index.ts:113-145` dispatches to them by
  URL prefix and caps request bodies at 256 KiB before any handler runs.
- **All RPCs are unary except one.** `EventService.SubscribeEvents` is
  server-streaming (`modules/events/events.handler.ts`); nothing is
  bi-directionally streaming.

Cross-cutting behaviour is implemented as Connect interceptors in `index.ts`:
session resolution, request logging (`lib/requestLogging.ts`) and per-method
latency capture (`lib/rpcMetrics.ts`).

### Bounded contexts

The backend is a **modular monolith**. Nineteen modules under
`apps/backend/src/modules/` own their own handlers and schema access:

`agents`, `artifacts`, `audit`, `auth`, `comments`, `dashboard`, `events`,
`health`, `labels`, `memory`, `orgs`, `projects`, `reports`, `repositories`,
`roles`, `search`, `tasks`, `teams`, `telemetry`.

Each exports a `create*Handler(router, db, nc)` factory registered in
`index.ts`. Modules do not import one another's handlers; shared behaviour lives
in `src/lib/`.

### Data

- **Two dialects, two schemas**: `db/schema.mysql.ts` and `db/schema.sqlite.ts`.
  `db/db.ts` selects one via `setupDatabase("sqlite" | "mysql")`, driven by the
  `STANDALONE` environment variable (`index.ts:38`).
- Handlers pick the matching schema module at call time rather than at import
  time — see the comment in `lib/authz.ts:8-13` explaining why freezing it at
  module load queried the wrong dialect under test.
- **Multi-tenant access control is enforced in application code**, not by
  database row-level security. `lib/authz.ts` provides `requireUserId`,
  `assertOrgMember` and `getOrgMemberRole`; org roles are `owner`, `admin`,
  `member`, `viewer`, with `owner` treated as a superset of `admin`
  (`lib/authz.ts:38`).
- `db/query-builder.ts` centralises pagination and filter construction.
- **Retention**: `lib/retentionSweep.ts` runs hourly from `index.ts:162`.
  `lib/cascadePurge.ts` implements hard deletion.

### Search

**Search is served by a real index**, not a scan. `modules/search/search.handler.ts`
queries SQLite's contentless FTS5 table joined on `rowid` and ranks with
`bm25()`; the MySQL dialect uses a `FULLTEXT` index over the same columns.
Six entity kinds are searchable, beliefs among them (M21-T06).

Delivered by M07, which supersedes
[ADR-0002](../adr/ADR-0002-like-scanning-instead-of-full-text-search.md)'s
choice of `LIKE` scanning — the ADR stands as the record of why that was
right at the time and what changed.

### Events

The backend **publishes** domain events to NATS and consumes none.

- Connection: `index.ts:51`, wrapped by `lib/natsCorrelation.ts` so every
  `domain.*` payload carries the request correlation id.
- `publishDomainEvent(nc, subject, payload)` (`lib/natsCorrelation.ts:43`) is a
  no-op when NATS is unreachable, so a missing broker degrades rather than fails.
- Publishers: `modules/{tasks,agents,comments,labels,repositories}` handlers,
  plus `modules/tasks/task_notes.handler.ts`. Subjects follow
  `domain.<entity>.<verb>` — e.g. `domain.task.status_updated`
  (`modules/tasks/tasks.handler.ts:576`).
- **Two consumers read these events**, deliberately different in kind. A
  durable JetStream projector (`consumers/auditProjector.ts`, run as its own
  entry point — see Deployment below) derives the audit trail and must never
  lose an event. An ephemeral per-connection subscriber
  (`modules/events/events.handler.ts`) feeds the live GUI and would rather
  drop than block, because a browser tab that fell behind wants current state
  rather than a backlog. Authorization for the feed lives in
  `modules/events/eventScope.ts`: org membership is the ceiling for a human,
  and an agent additionally receives only the subjects its token's scopes
  could have read (ADR-0023). Delivered by M08.

### In-app notifications

A person's notifications are rows, not a projection of the event stream: read
state is per recipient, so the same event reaching three people is three rows
in `notifications` (M29).

- **Written through a registry**, `lib/notificationRegistry.ts`. An event type
  registers a renderer producing title, body, target path and a dedupe key;
  `writeNotifications` persists one row per recipient and never learns what any
  particular type means. `modules/notifications/notifications.handler.ts` and
  the GUI's `NotificationBell` are equally type-agnostic — a new type reaches
  the bell without either changing. `task.stalled` is the only type registered
  today; the handoff and review-request types M25 named are unbuilt.
- **Detection is independent of delivery** (ADR-0026). `runStalledClaimAlertSweep`
  used to return before any query when SMTP was unconfigured, so a deployment
  without a mailer did no stalled-claim detection at all. It now detects,
  records and publishes on every sweep, and email is one channel gated below
  that. Two consequences a deployment feels: an SMTP-less deployment now runs
  the detector hourly where it ran nothing, and the email digest still caps
  itemization at `DIGEST_TASK_LIMIT` but no longer itemizes the overflow in a
  later sweep — the overflow is a count in the mail and a full list in the bell.
- **Recipients are people, not addresses.** `resolveTaskAlertRecipients`
  returns a `userId` with a nullable email; the email channel skips the ones it
  cannot address. Before M29 it filtered on email throughout, which silently
  excluded every M13 local account with no address from alerting.
- Reads are predicated on the session's `userId` as well as org membership, and
  `NotificationService` is refused to agent principals categorically — an agent
  has the event feed for the same facts.

### Configuration

`apps/backend/src/config.ts` implements a hierarchical loader validated by Zod
at startup, with `config.test.ts` covering it.

- Production reads `process.env`, which satisfies 12-factor deployment.
- Standalone reads a `.env` next to the binary, loaded by Bun from the CWD.
- Parsing failure is fatal at boot rather than deferred to first use.

### Observability

**Telemetry is OpenTelemetry over Pino, with the in-process counters kept.**
The SDK is always installed, but an exporter is created *only* when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set (`lib/telemetry/otel.ts`) — without one,
spans still exist, `traceparent` still propagates and every log line still
carries a trace id, all in process, with nothing reaching for a collector that
is not there. That is what the standalone binary requires.

- `lib/logger.ts` — structured JSON logging.
- `lib/rpcMetrics.ts`, `lib/businessEvents.ts`, `lib/httpMetrics.ts` — counters
  and latency summaries, flushed to the log stream every five minutes
  (`index.ts:169-175`).
- `lib/errorRingBuffer.ts` + `lib/errorReporter.ts` — recent errors in memory;
  `index.ts:41-47` makes uncaught exceptions fatal and logs unhandled rejections.
- `modules/telemetry/telemetry.ts` exposes these over `/api/debug/*`.
- `lib/problemDetails.ts` shapes error responses as `application/problem+json`.

The counters below are a *view* of the same data, not a parallel system;
`/metrics` exposes them in Prometheus format (`lib/prometheus.ts`). Delivered
by M11, which discharges rather than reverses
[ADR-0004](../adr/ADR-0004-in-process-counters-instead-of-opentelemetry.md) —
that ADR deferred OTLP on two grounds, and both were answered rather than
overruled.

### Frontend

`apps/gui/` is a **client-rendered single-page app**. There is no server-side
rendering and no React Flow; routes are declared in `apps/gui/src/App.tsx` and
data is fetched through TanStack Query against the generated Connect-RPC
clients. Design tokens live in `apps/gui/src/index.css` and are enforced by
`apps/gui/scripts/design-lint.mjs`. UI primitives are hand-rolled rather than
Shadcn/Radix — decision and the M06 revisit:
[ADR-0005](../adr/ADR-0005-hand-rolled-ui-primitives-instead-of-shadcn-and-radix.md).

### CLI

`apps/cli/` is a Cobra command tree (`apps/cli/cmd/`) over a Connect-RPC client.
Commands cover agents, artifacts, auth, comments, labels, orgs, projects,
project templates, repositories, search, tasks and task types.

Output is human-readable text or `--json`. **The following do not exist**:
`--fields` masks, `--page-all` NDJSON pagination, a `schema` introspection
command, an MCP server mode, and any TUI. Those are described under Planned.

### Deployment

What is actually buildable today:

- `bun build --compile --minify --sourcemap --outfile dist/tasker-standalone src/index.ts`
  (`apps/backend/package.json`, wired as `backend:build-standalone` in
  `apps/backend/moon.yml`). This compiles **the backend only**.
- **The SPA is embedded** (M09-T02/T03). `scripts/bundle-gui.ts` packs
  `apps/gui/dist` into a path → base64 manifest that `bun build --compile`
  carries, and `lib/staticServer.ts` serves it with content types, cache
  headers and SPA history fallback. The migrations travel the same way
  (`db/embeddedMigrations.ts`), so the binary creates and migrates its own
  SQLite database from an empty directory.
- **There is no in-process transport, deliberately** — see
  **ADR-0019**. The former `localInProcessTransportRouter` stub is deleted. The
  GUI is a browser application, so its calls cross a real socket regardless of
  what the server does internally, and a second entry point into the handlers
  would mean a second ordering of the session, rate-limit and logging
  interceptors.
- Standalone uses `bun:sqlite`; clustered deployment uses MySQL and an external
  NATS server. No container images, Kubernetes manifests or CDN configuration
  are committed.

### Observability and deployment (M11)

- **Tracing** is OpenTelemetry, exporting over OTLP **only** when an endpoint is
  configured; otherwise spans, propagation and log correlation all still work in
  process with no external dependency. See `observability-standard.md` §5 and
  ADR-0004, whose "until M11" this discharges.
- **Metrics** are the same in-process counters, rendered at `GET /metrics` in
  Prometheus exposition format. No second measurement, no metrics library.
- **Health** is three signals: `/healthz` (liveness, depends on nothing),
  `/readyz` (readiness, false while draining) and `HealthService/Ping` (the
  whole system, database and broker included).
- **Shutdown** stops reporting ready, waits for the load balancer to notice,
  drains in-flight requests, then closes NATS and flushes spans — in that
  order, because closing the broker first makes an in-flight mutation succeed
  while its event vanishes.
- **Container image**: `apps/backend/Dockerfile`, two stages, non-root,
  no interpreter or package manager in the runtime layer. The same image runs
  the API and the projector, by entrypoint.
- **Full stack**: `docker compose --profile full up` brings up MySQL, NATS, the
  API, the projector and an OTLP collector.
- **Deployment sample**: `deploy/kubernetes.yaml`, annotated — including the
  proxy read-timeout that M08's streaming endpoint requires, and the
  `terminationGracePeriodSeconds` that has to exceed the drain budget or a pod
  is killed mid-drain.

### Quality gates

`moon check --all` runs 22 tasks, mirrored in `.github/workflows/ci.yml`:
type-checking, `oxlint`, unit tests behind a 95% coverage threshold, `knip`,
`tasker:skills-check`, `tasker:docs-lint` and `gui:design-lint`. Playwright
end-to-end (`gui:e2e`) is `type: run` and executed explicitly in CI against a
seeded backend. `oxlint` is the only TypeScript linter and no formatter runs —
decision and its cost:
[ADR-0001](../adr/ADR-0001-oxlint-instead-of-eslint-and-prettier.md).

### Non-functional characteristics

Stated honestly: the properties below are **designed for**, not measured. No
load test, benchmark or profiling run is committed.

| Property | What exists today |
|---|---|
| Type safety | End-to-end and real — TypeSpec → protobuf → generated TS/Go, Drizzle schema types, Zod at every boundary. |
| Latency | `lib/rpcMetrics.ts` records per-method P50/P95 and logs a summary every five minutes. No target is asserted or enforced. |
| Scalability | The backend is stateless apart from in-memory counters, so it can run behind a load balancer. This has never been run multi-instance. |
| Reliability | NATS failure degrades to no-publish (`lib/natsCorrelation.ts:45`); config failure is fatal at boot. |
| Security | Sessions with revocation, policy-based authorization on every handler, 256 KiB body cap. Rate limiting exists (`lib/rateLimit.ts`, `lib/loginRateLimiter.ts`) and is **per-instance**, so N replicas multiply the effective limit by N — a shared store is the fix and needs a decision about which store. |

**What is measured, and what is not.** *Data* scale is measured:
`scripts/measure-latency.ts` drives the hot read paths against a seeded
fixture at the scale targets (2,000 projects, 50,000 tasks in one project,
100,000 artifacts in one folder, 100,002 organization members) and every
endpoint is inside the per-endpoint p95 budget declared in `api-standard.md`
§6. *Concurrency* is not: there is no load test in this repository, nothing
has been run multi-instance, and the cost of N simultaneous event-feed
subscribers is unmeasured. The figures above describe data volume, not
simultaneous callers.

---

## Planned Architecture

Not built. **Nothing here has an owning milestone**: every numbered milestone
in the ledger is closed, so each entry below is genuinely unscheduled rather
than waiting its turn. Do not write code against any of it.

Entries that used to live here — event consumers and live updates, the single
portable binary, OpenTelemetry, agent identity and quotas — were delivered by
M08, M09, M11 and M04/M10 respectively and now appear under **Built**, with
citations.

### CQRS with a separate read store — unowned

The intent is asymmetric handling: writes commit to MySQL and emit an event;
reads serve from a materialised view so agent write bursts cannot degrade
human dashboard queries.

Today there is still **one path**: reads and writes both hit the transactional
database. What has changed since this entry was written is that search is no
longer the argument for it — M07 answered that with a real FTS5 / `FULLTEXT`
index rather than a separate store.
[ADR-0003](../adr/ADR-0003-no-separate-read-store-before-measurement.md)
therefore stands unchanged, including its own honest caveat: it defers the
decision pending measurement, and the measurement that would trigger it is
concurrency, which nothing measures yet (see Non-functional characteristics).
**OpenSearch is not installed and nothing commits to it** — one candidate,
to be chosen against measured need.

### Graphical state-machine editing — unowned

Task state machines are configured through the API and from the Task Types
screen (`apps/gui/src/features/TaskTypes/`), which is a list-and-detail
editor. A *visual* editor — a canvas of statuses and transitions — is not
built and the library is an open choice. React Flow was named in an earlier
draft of this document and is not a commitment;
[tech-stack.md](./tech-stack.md)'s Dropped table records why.

### Agent-facing CLI ergonomics — unowned

Field masks (`--fields`), NDJSON pagination (`--page-all`) and schema
introspection (`cli schema <cmd>`) exist as intent only — none appears in
`apps/cli/cmd/`. An MCP server mode and a TUI are named in no milestone; see
the Dropped table in [tech-stack.md](./tech-stack.md).

### Signed release binaries — unowned

The release binaries are versioned and cross-platform and **not signed**.
M09 and M12 both deferred this for the same reason: signing needs
certificates this project does not have. Recorded here rather than left
implied, because "portable single binary" otherwise reads as complete.

### Measured concurrency — unowned

The Mission Scale targets 20,000 concurrent agents and 20,000 concurrent
users. Data scale is measured and within budget; **concurrency has never been
simulated at all**, there is no load test in this repository, and nothing has
run multi-instance. This is the largest gap between what the product claims
and what it has evidence for, and it is nobody's milestone.

### Not planned by anyone

Server-side rendering and React Flow appeared in earlier revisions of this
document as present-tense descriptions. Neither is built, and no milestone
owns either. They are recorded in the Dropped table of
[tech-stack.md](./tech-stack.md) so they are not reintroduced by accident.
