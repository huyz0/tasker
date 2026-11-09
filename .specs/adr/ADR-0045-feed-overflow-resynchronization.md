---
id: ADR-0045
status: accepted
date: 2026-11-09
milestone: M48
---

# Ephemeral feed overflow requests source reconciliation

## Context

The live feed deliberately has a bounded per-client queue and drops its oldest
event when a reader falls behind. Targeted invalidation by surviving events
cannot refresh an entity whose only event was dropped. Reconnect reconciliation
alone cannot repair a stream that stays connected.

## Options

1. Close the stream on overflow. This reuses reconnect recovery but adds backoff
   and connection churn to every slow-reader burst, without distinguishing the
   gap from a transport failure.
2. Replay all missed events from JetStream. The feed would become a durable
   consumer with retention/cursor/authorization semantics that it does not have;
   browsers need current source state rather than an event archive.
3. Coalesce a resync control indication outside the existing domain queue. This
   preserves the bounded ephemeral feed and asks clients to refetch source truth.

## Decision

Use one pending `stream.resync` indication per subscriber whenever its queue
drops an event. Emit it before consuming remaining queued domain data. Repeated
drops coalesce until it is consumed; a later overflow can arm another indication.
The flag is constant-size and cannot itself be displaced from the domain queue.

The control envelope uses the existing subject/org/project/time fields, with
empty org and no project. It carries no event identity, entity, count, tenant
or payload from dropped traffic. Existing periodic credential checks still run
before yielding. Refresh current organization membership on resync as well:
the discarded event might itself have revoked membership. Apply the ordinary
scope/scope-permission filter again to remaining domain data.

Membership notifications from other organizations must not occupy that queue:
doing so would turn unrelated activity into a visible resync and refetch. Keep
a second coalesced internal scope-dirty flag. Refresh membership before domain
data resumes; request a visible resync only if the caller's authorized set
actually changed. This still discovers newly joined organizations without
exposing foreign membership traffic or dropping the client's own queued data.

The GUI treats this frame as a request to reconcile all source queries: cancel
active reads, then mark cache stale and refetch active queries. This includes an
entity whose event disappeared, and prevents an unfinished initial read from
restoring a pre-gap snapshot. Other control frames retain their current behavior.
An abandoned subscription effect cannot refetch a replacement scope.

## Consequences

- At most the existing domain-queue bound plus two flags is retained per client.
  Domain data remains ephemeral and can arrive out of order; resync does not
  promise replay or an application-wide transactional snapshot.
- A client that repeatedly falls behind may refetch repeatedly. Coalescing
  removes one refresh per individual dropped message; the existing bounded
  queue and reconnect/polling behavior remain.
- This is additive within the existing string-subject protocol. Older clients
  that ignore unknown control frames do not gain the new recovery guarantee.
  External clients should refresh their authorized source state on this frame.
- Credential expiry/revocation retains M44's bounded revalidation contract.
  Resync does not weaken it or expose queued data under stale membership.
- No new dependency, database table, domain event or durable consumer is needed.
