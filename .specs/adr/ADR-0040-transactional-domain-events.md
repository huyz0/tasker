---
id: ADR-0040
status: accepted
date: 2026-11-08
milestone: M46
---

# Capture domain events with their mutations

## Context

M45 makes task/workflow mutations atomic and buffers events until commit, but
an API process can die after commit and before publication. The webhook sink
also queues deliveries asynchronously. JetStream cannot recover an event never
published to it. Background stalled-claim detection and scheduled-run recording
publish outside ordinary RPC handlers and need explicit boundaries too. Artifact
creation emits its full content and accepts 15 million characters
(`artifacts.handler.ts`), exceeding the default NATS payload limit.

## Options

1. Await broker publication before committing. This holds a database transaction
   across network I/O and still has two separate commits: either side can win
   while the other fails.
2. Persist an event with the mutation and lease a relay after commit. This adds
   a bounded retained log, at-least-once delivery and consumer deduplication,
   but no distributed transaction or network dependency on the mutation path.
3. Persist only webhook delivery rows. This closes push delivery's gap while
   leaving audit and the live feed dependent on fire-and-forget publication.

## Decision

Persist emitted domain events and matching webhook deliveries in the mutation's
unit of work, then lease a broker relay and deduplicate audit by producer event
identity rather than broker sequence.

## Commit boundary

- A unit has a before-commit phase as well as M45's after-commit callbacks.
  Capture runs before COMMIT and failure rolls back the mutation.
- Each captured event gets a stable ID, producer timestamp, organization/project,
  request ID, actor and trace context. The JSON payload is snapshotted when the
  handler emits it, so later mutation cannot change the event.
- RPC mutation interception wraps unary writes; unknown unary methods default
  to a unit. Read methods and the event stream avoid write transactions.
  Existing task/workflow units reuse the outer owner.
- Auth HTTP routes emit no domain events today and are not wrapped around their
  external OAuth network calls. This decision strengthens existing emitted
  domain events; it does not invent account-security events.
- Stalled-claim recording emits within its own per-candidate unit. Schedule run
  bookkeeping emits in one unit. M47 owns occurrence claiming/recovery.
- Production capture refuses publication outside a unit. The legacy immediate
  publisher remains available to isolated tests/scripts without capture enabled;
  production installs capture before opening the listener.

## Webhooks

Resolve active matching endpoints in the capture transaction and insert their
delivery rows then. A relay-time subscription cache could miss newly registered
endpoints, send past events to a new endpoint, or fail to resolve a purged task.
Current request project routing is captured before deletion. Delivery identity
is deterministic for event plus webhook, and duplicates alone are ignored.
The existing signing, SSRF checks, retries and disable policy remain in force.
A delivery-storage failure aborts capture rather than silently losing a wakeup.

## Broker and audit

- Relay rows have a lease token, deadline, attempt count, next attempt and bounded
  last error. Completion/retry updates require the winning token, so an expired
  owner cannot overwrite its successor. Undelivered rows are never age-purged.
- JetStream publication is acknowledged and uses the event ID as message ID.
  Acknowledgement loss may still cause duplicates beyond the broker's dedupe
  window; audit has a unique producer ID and handles those independently.
- Broker messages carry routing/trace metadata and a reference to the retained
  SQL event. The projector reads the authoritative stored payload. This keeps
  large descriptions/artifacts inside SQL and avoids exceeding NATS payload
  limits. Legacy full-payload messages remain supported.
- Broker sequence remains diagnostic, not identity: a stream recreated with a
  reused sequence must not suppress a different new event. Legacy records use
  a deterministic legacy sequence identity during migration.
- Standalone without an explicit NATS_URL projects stored events locally. With
  an explicit broker URL, or on MySQL, publication remains pending across an
  outage and the connection manager retries. Event/health handlers read the
  current connection rather than freezing a failed startup connection.
- Delivered source events are retained for 14 days, exceeding the existing
  seven-day JetStream window. Pending rows are retained until resolved. This
  is a delivery/recovery log, not an indefinite event-sourcing contract.

## Shutdown and operations

Stop taking new relay/delivery leases, drain API mutations and await in-flight
bounded relay/delivery work before draining the connection. A crash is safe
because committed rows and expiring leases survive it. Logs/metrics describe
backlog and failures without logging event bodies. Documentation gives inspection
and retry procedures and states at-least-once, potentially out-of-order delivery.

## Consequences

Mutation latency includes local event and webhook-row writes, not network I/O.
Outbox storage failure can now refuse a mutation rather than acknowledge work
without its event. Audit consumes an internal reference protocol but keeps
compatibility with old messages. SQL events must outlive broker retention;
changing either retention requires revisiting that bound. The new access layer
is shared by HTTP/RPC and background publishers; no second authorization policy
or public RPC contract is introduced.

## Activation details (M46-T04)

The runtime installs capture before listening. An explicit service/method read
inventory avoids units for reads/streams; unknown unary methods enter a unit
before authentication. Repository OAuth/provider preparation and manual schedule
firing explicitly own narrow write units. Repository writes refresh credentials,
policy memo and resource routing after external I/O. Invitation email is deferred
until commit. Stalled-alert claim and event share a per-candidate unit; each
schedule firing has fresh tenant/actor context and atomic run bookkeeping.

Shutdown rejects new non-probe HTTP and unary RPC requests once draining starts.
Actual handler promises are tracked because Connect's Node adapter returns void.
Periodic workers stop ticks and await active promises; the consumer stops intake
and awaits the active SQL projection before draining its connection.

Client request IDs are accepted up to 128 characters; longer values receive a
server-generated ID. Broker reference metadata has a 16 KiB ceiling. SQL error
messages can include full parameters: logger serialization, error-ring summaries
and both tracing error sinks emit a fixed database-error description and safe
code rather than SQL, parameters or original stacks. The thrown original error
and its cause are retained for application handling.

Audit migration adds nullable event_id, backfills legacy sequence identities and
removes stream-sequence uniqueness. The current projector always supplies an
identity; nullable storage preserves old rows/read compatibility, not permission
to keep running the old projector. Stop old consumers before migration. A binary
rollback must use a projector that understands producer IDs or restore a tested
pre-migration backup; blindly re-adding sequence uniqueness is unsafe once two
new producers legitimately share a sequence. Ambiguous conflicting legacy
identities fail visibly rather than silently dropping a different payload.
