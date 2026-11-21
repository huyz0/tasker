# API architecture standards

The shared edge is contract-first RPC: TypeSpec to protobuf/Connect, with
generated TypeScript and Go clients. Auth, telemetry, probes, metrics and
the MCP JSON-RPC bridge are explicit HTTP edges; they are not a generic REST
resource API.

## 1. Contract and compatibility

`packages/shared-contract/main.tsp` is the source of wire messages and
services. Its current namespace is `Tasker.Health.V1`, generating
`tasker.health.v1`. Do not invent a separate per-domain package as if it
already existed. A namespace/version migration needs an explicit design.

Each RPC takes one request message and returns its declared response.
Do not hand-write an alternative wire model in a handler. Add optional
fields in the source and regenerate the existing TS/Go outputs.

Field numbers are permanent: never renumber/reuse them. Preserve JSON names
as well as protobuf compatibility. A required-field/type/name removal can
break clients even when a convenient local type still compiles. Run the
existing generated-contract and breaking-change checks.

Most RPCs are unary. `EventService.SubscribeEvents` is already
server-streaming; there is no client-streaming or bidirectional RPC.
Follow its cancellation/auth/recovery contract rather than describing a new
stream as the first one. Source: `modules/events/events.handler.ts` and
the shared contract.

Versioning lives in the protobuf namespace, not an invented `/api/v1`
resource prefix. A genuinely breaking API needs an intentional compatible
rollout, not a suppressed generated-code warning.

## 2. Errors and uncertain outcomes

Throw `ConnectError` with an explicit `Code`. Do not return a successful
message containing an error string or expose raw driver/body/secret data.
Ordinary auth/debug HTTP errors use `lib/problemDetails.ts`; MCP uses its
declared JSON-RPC protocol.

| Code | Meaning |
|---|---|
| InvalidArgument | Malformed input, invalid enum or changed request under an existing keyed intent |
| NotFound | Resource absent, or its existence must not be disclosed |
| PermissionDenied | Valid principal lacks current role/scope/policy access |
| Unauthenticated | No currently valid credential |
| AlreadyExists | Uniqueness conflict |
| FailedPrecondition | Current state forbids the operation |
| Aborted | A rolled-back lock/reservation conflict; retry the same request and stable key |
| ResourceExhausted | Admission/rate budget exhausted; honor a supplied retry delay |
| DeadlineExceeded | Request deadline elapsed; a mutation's commit outcome may still be unknown |

`db/errors.ts` maps transaction conflicts. `Aborted` is not evidence
that a second mutation should be created. A timeout/transport loss also
must not cause a caller to invent a new key. Internal error codes alone
do not identify a database/pool root cause.

## 3. Authorization is per resource and principal

The interceptor resolves authentication. Handlers still authorize before
reading/mutating tenant data (`lib/authz.ts`, `lib/scopes.ts`).

- Use `requirePrincipal` and `authorizePrincipal` for agent-capable
  operations, with the declared scope and human policy permission.
- Human-only operations use the existing human/role helpers and explicitly
  refuse agents. A valid agent token is not an unauthenticated user.
- Derive tenant/project scope from the canonical target. Do not authorize an
  arbitrary org supplied beside a resource from another tenant.
- Current authorization governs cached keyed replies and long-lived feeds.
  A cached success is not a cached access grant.
- New agent-capable methods require the closed RPC/scope mapping. The
  existing sweep tests verify that registered services are covered.

Prefer NotFound when disclosing existence across a tenant boundary leaks
information. Use the established operation/unit-of-work wrappers so
authorization, replay and coordinated changes retain their transaction
boundary; do not move them into an unverified gateway shortcut.

## 4. Mutation and event boundary

`db/access.ts` provides `withUnitOfWork`; asynchronous callbacks do not
belong in Bun SQLite's synchronous transaction primitive. Coordinated domain
changes, captured SQL source events and matching webhook rows commit or
roll back together. Broker publication is after commit and may lag/retry.

`lib/idempotency.ts` scopes keys by principal and method, hashes request
content, and reserves/executes/caches in one transaction. Its placeholder
is not a public processing response. New stored request digests reject
changed reuse. Generic keys become eligible for hourly cleanup after
24 hours; do not promise unlimited replay protection.

Schedule occurrence receipts have their own stable creation identity and
frozen inputs (`modules/schedules/occurrenceExecution.ts`). A new manual
Run creates a new intent; it is not the recovery action for an accepted
occurrence. Current actor/credential checks still apply on recovery.

## 5. Bounded collections and streams

Paginated collections use the shared `PageRequest`/`PageResponse`
shapes. `db/query-builder.ts` implements opaque keyset cursors bound to
the sort column/value/ID; clients must not parse them. Its common page
default is 50 and cap is 100. Use each declared endpoint's bounded shape
for specialized histories/graph relationships; do not claim every method
with a List name has an identical page wrapper.

Do not load all tenant rows to filter/page them in memory or add an
unbounded collection response. Counts and pages must share canonical
scope/filter semantics. CLI `--page-all` is for supported paged commands,
emits NDJSON and can emit earlier items before a later page fails.

The live feed is ephemeral. It has a bounded 1000-entry queue and coalesced
`stream.resync` control, not a durable complete history. Clients refetch
canonical state after recovery/resync. Defaults are a 25-second heartbeat
and 30-second quiet credential/scope revalidation, with expiry/invalidation
also checked. Do not promise instantaneous global revocation. Durable
audit delivery is the separate SQL/JetStream path.

## 6. Handler latency budgets

Measure handler query/serialization p95 separately from socket time,
multi-RPC workflows, queue recovery and setup/cleanup.

| Read | Handler p95 budget |
|---|---|
| Ordinary paginated list | 150ms |
| universalSearch | 300ms |
| getDashboard | 300ms |
| getReportExceptions | 300ms |
| getReportTrends | 300ms |

Historical M07 evidence uses large data fixtures, including 2000 projects,
50000 tasks in one project and 100000-scale artifact/member collections.
Those records and `apps/backend/scripts/measure-latency.ts` describe
data volume, not simultaneous clients. Re-measure relevant large fixtures
after a schema/query-plan change.

For a disposable fixture only:

```sh
cd apps/backend
bun run seed -- --scale large
bun run measure:latency
```

The command enforces its handler budgets. Current M49 staged HTTP evidence
is in `docs/performance.md`: 1000 callers saturate badly, despite stable
committed identities. Do not compare a three-RPC network workflow's p95
directly to a single read handler's budget or claim a 20000-client fleet.

## 7. Validation

Validate semantic inputs with the handler's declared Zod schema before domain
work. Protobuf shape does not establish meaningful identifiers, allowed
scope, safe size/range or a valid state transition. Respect the endpoint's
unknown-field/compatibility policy rather than inventing a global coercion
rule. Keep diagnostics bounded and free of credentials, raw SQL/body content
and arbitrary exception text.
