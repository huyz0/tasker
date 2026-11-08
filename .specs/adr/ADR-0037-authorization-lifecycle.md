---
id: ADR-0037
status: accepted
date: 2026-11-08
milestone: M44
---

# Current authorization for replay and long-lived streams

## Context

Task create/claim/claim-next authorize inside `withIdempotency` callbacks. A completed response bypasses those callbacks, so a valid session whose membership changed can replay data. Agent keys are scoped to agent identity, so replacement tokens also need their current scope checked. Existing streams authenticate once; membership events refresh membership, but credential revocation/expiry is never rechecked. Continuous traffic must not postpone validation indefinitely.

## Options

1. Include credentials in cache identity and terminate streams only on domain events. This fragments legitimate retry protection across rotations and cannot enforce expiry or recover a lost revocation event.
2. Authorize before consulting cached results and periodically resolve the original stream credentials. This adds bounded database reads and explicitly bounds revocation delay; it works with broker outages and normal token rotation.
3. Query credentials on every stream event. This provides a tighter bound at the cost of database work proportional to event fanout.

## Decision

Authorize each keyed operation before cache lookup, and reauthenticate open event streams at least every 30 seconds using the original headers, including while domain events arrive continuously.

## Consequences

- Replay retains its existing principal/method/key identity, request hash and response compatibility, but never substitutes for authorization.
- Stream revalidation checks expiry/revocation through `resolvePrincipal`, verifies that the identity is unchanged, and refreshes membership and agent scopes. Failure closes the stream with Unauthenticated or PermissionDenied rather than continuing with stale authority.
- No raw credential is logged, serialized to the event broker, or persisted in a database. The original headers remain in the existing request lifetime only.
- Connect HandlerContext supplies the original request headers to the handler. Production reuses `resolvePrincipal` directly; tests can inject a resolver without opening a socket. No new interceptor context key is needed.
- Validation occurs on elapsed wall time, with the queue wait capped at the next validation deadline. A busy stream cannot defer checks and an idle one cannot wait beyond the bound.
- Membership events remain a fast-path refresh; periodic revalidation also repairs missed membership events.
- Authorization failure does not delete a cached outcome; a later properly authorized retry can recover it.
- Atomic retry execution, transactional events and durable schedule occurrences are separate designs owned by M45–M47.
