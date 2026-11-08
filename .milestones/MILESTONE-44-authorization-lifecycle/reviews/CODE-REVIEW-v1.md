---
timestamp: 2026-11-08T07:50:09Z
decision: approved
---

# M44 authorization lifecycle review

## Correctness

CreateTask, ClaimTask and ClaimNextTask authorize the current principal against
the current resource before consulting an idempotency record. Status/assignment
validation remains inside execution so a legitimate retry still recovers its
original result. Workflow instantiation already authorizes before replay.

Stream revalidation checks elapsed time before waiting and after waking. The
wait is capped by the next validation deadline, so both continuous traffic and
idle connections are covered. Reauthentication verifies identity, expiry and
revocation, checks events:read and refreshes membership/scopes. Errors and aborts
release the subscriber through the existing finally block. Original headers
remain request-local. No credential enters a log or event.

## Test coverage

Three replay regressions failed against the prior implementation, then passed.
The event suite covers busy/idle revalidation, missed membership changes,
identity substitution, valid continuation, stored agent token revocation/expiry,
and real session logout. The handler has 100% line/function coverage in the
focused run. Full local gates passed with 2053 backend tests and 1324 GUI tests;
28 service-dependent backend cases were skipped in that run. The real NATS
mutation/feed/audit chain passed separately. A real socket scenario confirms
that the production default closes an open feed after logout in about 30 seconds.

## Architecture

ADR-0037 matches implementation. Connect HandlerContext already exposes request
headers, so the handler calls the existing resolvePrincipal helper directly
instead of adding an interceptor context key. The typed resolver/clock options
are test seams; production uses stored credentials and wall time. No wire
contract or schema changed.

## Security

Current authorization gates cached content. A narrower replacement token cannot
use another token's earlier scopes to retrieve a cached response. Stream
credentials are periodically re-resolved, and identity substitution fails
closed. Membership events remain a fast path; the periodic refresh repairs a
missed event. Revocation is bounded rather than instantaneous and that bound
is documented. Concurrent retry/crash safety remains explicitly owned by M45;
this review does not claim it has been fixed.

## Findings

```yaml
findings: []
```
