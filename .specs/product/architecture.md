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
- **Agent identity** is not separate from human identity yet. Agents are rows in
  the agent tables (`modules/agents/agents.handler.ts`); there is no M2M token
  issuance. That is **M04**.
- **External runtimes** integrate by calling the same Connect-RPC contract. There
  is no separate agent-execution protocol.

### Process and transport

One process serves everything (`apps/backend/src/index.ts`):

- A `node:http` server on port 8080 is the listener (`index.ts:157`).
- Connect-RPC handlers are mounted through `connectNodeAdapter` from
  `@connectrpc/connect-node`. Fourteen services are registered from the
  generated contract (`index.ts:3`).
- **Elysia handles two route groups only**, not the whole surface:
  `/api/auth/*` (`modules/auth/auth.ts`) and `/api/client-errors` + `/api/debug/*`
  (`modules/telemetry/telemetry.ts`). `index.ts:113-145` dispatches to them by
  URL prefix and caps request bodies at 256 KiB before any handler runs.
- **All RPCs are unary.** The TypeSpec contract declares no streaming methods,
  so nothing in the system is bi-directionally streaming today.

Cross-cutting behaviour is implemented as Connect interceptors in `index.ts`:
session resolution, request logging (`lib/requestLogging.ts`) and per-method
latency capture (`lib/rpcMetrics.ts`).

### Bounded contexts

The backend is a **modular monolith**. Twelve modules under
`apps/backend/src/modules/` own their own handlers and schema access:

`agents`, `artifacts`, `auth`, `comments`, `health`, `labels`, `orgs`,
`projects`, `repositories`, `search`, `tasks`, `telemetry`.

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

**Search is `LIKE`-based.** `modules/search/search.handler.ts:35` builds
`column LIKE ? ESCAPE '\'` with caller input escaped for `%`, `_` and `\`.

An FTS5 virtual table named `search_index` is created in `db/db.ts:27` and is
read only by the health probe. **Nothing writes to it.** It is scaffolding, not
an index. A real search path is **M07**. Decision:
[ADR-0002](../adr/ADR-0002-like-scanning-instead-of-full-text-search.md).

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
- **There is no subscriber anywhere in the repository.** No audit trail is
  derived from these events and no client is updated by them. Consumers are
  **M08**.

### Configuration

`apps/backend/src/config.ts` implements a hierarchical loader validated by Zod
at startup, with `config.test.ts` covering it.

- Production reads `process.env`, which satisfies 12-factor deployment.
- Standalone reads a `.env` next to the binary, loaded by Bun from the CWD.
- Parsing failure is fatal at boot rather than deferred to first use.

### Observability

**Telemetry is in-process counters over Pino, not OpenTelemetry.** No
`@opentelemetry` package is installed.

- `lib/logger.ts` — structured JSON logging.
- `lib/rpcMetrics.ts`, `lib/businessEvents.ts`, `lib/httpMetrics.ts` — counters
  and latency summaries, flushed to the log stream every five minutes
  (`index.ts:169-175`).
- `lib/errorRingBuffer.ts` + `lib/errorReporter.ts` — recent errors in memory;
  `index.ts:41-47` makes uncaught exceptions fatal and logs unhandled rejections.
- `modules/telemetry/telemetry.ts` exposes these over `/api/debug/*`.
- `lib/problemDetails.ts` shapes error responses as `application/problem+json`.

Distributed tracing and OTLP export are **M11**. Decision:
[ADR-0004](../adr/ADR-0004-in-process-counters-instead-of-opentelemetry.md).

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
- **The SPA is not embedded.** A `GET /` on the standalone binary returns a
  hardcoded placeholder string (`index.ts:149-152`). Its own text claims
  "Embedded Vite SPA Assets active"; no asset is bundled, because the compile
  step above has only `src/index.ts` as input. Serving the real SPA is **M09**.
- `index.ts:34` exports `localInProcessTransportRouter`, a three-line stub
  returning `{ status: 200, message: "in-process override active" }`. **It is
  referenced nowhere.** In-process transport is **M09**.
- Standalone uses `bun:sqlite`; clustered deployment uses MySQL and an external
  NATS server. No container images, Kubernetes manifests or CDN configuration
  are committed.

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
| Security | OAuth 2.1 sessions with revocation, org-membership checks on every handler, 256 KiB body cap, `ESCAPE`-hardened `LIKE` input. No rate limiting or per-key quota exists. |

Measured numbers are owed by **M07** (read-path scale), **M11**
(observability) and **M12** (test depth and release).

---

## Planned Architecture

Not built. Each entry names its owning milestone. Do not write code against any
of it.

### CQRS with a separate read store — **M07**

The intent is asymmetric handling: writes commit to MySQL and emit an event;
reads serve from a materialised view so agent write bursts cannot degrade human
dashboard queries.

Today there is **one path**. Reads and writes both hit the transactional
database, and search scans with `LIKE`. M07 decides between populating the
existing FTS5 table and introducing a dedicated index; **OpenSearch is not
installed and no milestone commits to it** — it is one candidate, to be chosen
against measured need. Decision:
[ADR-0003](../adr/ADR-0003-no-separate-read-store-before-measurement.md).

### Event consumers, audit trail and live updates — **M08**

Publishing exists; consumption does not. M08 adds subscribers that derive an
audit trail from `domain.*` events and push changes to the GUI so the interface
updates without polling.

### Single portable binary — **M09**

Three separate pieces are missing behind one goal:

1. Embedding the built SPA in the compiled binary and serving it, replacing the
   placeholder at `index.ts:149-152`.
2. Replacing the `localInProcessTransportRouter` stub (`index.ts:34`) with a
   real in-process transport that satisfies the same Connect-RPC contract,
   removing network overhead inside the binary.
3. Zero-config startup against `bun:sqlite` with FTS5 so standalone loses no
   capability.

### Graphical state-machine editing — **M05**

Task state machines are configured through the API today
(`modules/tasks/tasks.handler.ts`). A visual editor is an M05 capability; the
library is an open choice. React Flow was named in an earlier draft of this
document and is not a commitment.

### OpenTelemetry — **M11**

Distributed tracing and metrics over OTLP, exporting to a standard backend, with
graceful degradation to stdout in standalone. Replaces the in-process counters
described under Built, or sits alongside them.

### Agent identity and quotas — **M04**, **M10**

M2M tokens with their own lifecycle (M04), and policy-based RBAC over teams
(M10). Until then, agents authenticate as the user that created them and
authorisation is the four org roles in `lib/authz.ts`.

### Agent-facing CLI ergonomics — **M05**

Field masks (`--fields`), NDJSON pagination (`--page-all`) and schema
introspection (`cli schema <cmd>`) exist as intent only. An MCP server mode and
a TUI are named in no milestone; see the Dropped table in
[tech-stack.md](./tech-stack.md).

### Not planned by anyone

Server-side rendering and React Flow appeared in earlier revisions of this
document as present-tense descriptions. Neither is built, and no milestone owns
either. They are recorded in the Dropped table of
[tech-stack.md](./tech-stack.md) so they are not reintroduced by accident.
