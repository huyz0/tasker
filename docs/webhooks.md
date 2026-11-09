# Webhooks

A webhook sends an organization's task events to an HTTPS endpoint as they
happen. An agent runner can then start work when work appears, instead of
polling or holding the event feed open (M37, ADR-0030).

Only an organization **admin** manages webhooks: from **Organizations →
Webhooks** in the app, or with `tasker webhooks`. Agent tokens cannot. A token
that could register a webhook could copy every event in the organization
somewhere else.

## Register one

```bash
tasker webhooks create --org "$ORG" \
  --url https://runner.example.com/tasker \
  --event task.created --event task.unblocked \
  --description "agent runner"
# Webhook created: …
# Signing secret (shown once): whsec_…
```

- `--event` takes an event type (below), `task.*` or `tasknote.*` for all of
  that kind, or `*` for everything. Repeat it or comma-separate.
- `--project <id>` limits it to one project's events. The default is the
  whole organization.
- **Store the secret now.** It is shown once. `tasker webhooks rotate-secret
  <id>` replaces it for subsequent batches. A request already in flight can
  still carry a signature from the previous secret.
- `tasker webhooks ping <id>` sends a `ping` event to test the receiver.
  `tasker webhooks deliveries <id>` shows what was sent and what came back.

## Events

| Type | When |
|------|------|
| `task.created`, `task.updated`, `task.status_updated` | A task is created, edited, or moved |
| `task.claimed`, `task.released` | An agent or person takes a task, or gives it back |
| `task.unblocked` | Its last unfinished blocker finished, so the task may now be ready |
| `task.linked`, `task.unlinked` | A blocked-by or discovered-from link changed |
| `task.deleted`, `task.restored`, `task.purged` | Binned, restored, or permanently removed |
| `task.stalled` | A claim went silent (the stalled-claim detector) |
| `task.plan_updated` | The working agent replaced its plan for the task |
| `task.input_requested`, `task.input_answered`, `task.input_cancelled` | An agent asked a person a question on the task; a person answered it; it was withdrawn |
| `task.approval_requested`, `task.approval_decided` | An agent's move crossed a transition that needs approval and is held; a person approved (the move is applied) or rejected it (`approved`, `reason`) |
| `task.usage_reported` | An agent reported tokens and cost for work on the task (`modelName`, `inputTokens`, `outputTokens`, `costMicros` - micro-dollars) |
| `task.summary_updated` | The task's summary was written, replaced or cleared (`cleared`, `length`); read it with `GetTask` or `GetTaskDigest` |
| `task.workflow_started` | A workflow template was instantiated; `taskId` is the parent, `templateId` and `steps` say what was created (each step also sends `task.created`) |
| `tasknote.created`, `tasknote.updated`, `tasknote.deleted` | An agent note or handoff changed |
| `ping` | Sent by `webhooks ping`, to every webhook |

## What arrives

A `POST` with a JSON body:

```json
{
  "id": "evt-…",
  "type": "task.unblocked",
  "occurredAt": "2026-10-02T11:35:37.000Z",
  "orgId": "org-…",
  "projectId": "prj-…",
  "data": { "taskId": "tsk-…", "unblockedBy": "tsk-…" }
}
```

`data` is the event as Tasker published it. For most task events that is the
task. For claims, releases, links and unblocks it is the ids involved; fetch
the task with `GetTask` (or `tasker tasks get`) when you need the rest.

| Header | Value |
|--------|-------|
| `X-Tasker-Event` | The event type |
| `X-Tasker-Delivery` | Unique per delivery attempt chain. **De-duplicate on this.** |
| `X-Tasker-Timestamp` | Unix seconds when this attempt was signed |
| `X-Tasker-Signature` | `sha256=` + hex HMAC-SHA256 of `"<timestamp>.<raw body>"` with the secret |

### Verify the signature

Verify every request before trusting it. Compute the HMAC over the **raw**
body bytes, compare in constant time, and reject old timestamps to stop
replays.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret: string, rawBody: string, headers: Record<string, string>): boolean {
  const ts = headers["x-tasker-timestamp"];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // older than 5 minutes
  const want = "sha256=" + createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  const got = headers["x-tasker-signature"] ?? "";
  return want.length === got.length && timingSafeEqual(Buffer.from(want), Buffer.from(got));
}
```

```python
import hmac, hashlib, time

def verify(secret: str, raw_body: bytes, headers) -> bool:
    ts = headers["X-Tasker-Timestamp"]
    if abs(time.time() - int(ts)) > 300:
        return False
    want = "sha256=" + hmac.new(secret.encode(), f"{ts}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, headers["X-Tasker-Signature"])
```

## Delivery guarantees

- **At least once.** A receiver may see the same delivery twice, for example
  after a timeout where its reply was lost. De-duplicate on
  `X-Tasker-Delivery`.
- **No strict ordering.** Retries and concurrent workers can arrive out of
  order. `occurredAt` is the producer's timestamp, not an ordering guarantee.
- A completed `2xx` response within the total 10-second attempt is success.
  The deadline includes DNS, connection setup and reading the response.
  Anything else is a failure,
  including a redirect, which is never followed. A failure is retried after
  30 s, 1 min, 2 min, … for 8 attempts (about an hour plus processing delays), then marked
  `failed`.
- After **20 consecutive failed attempts** the webhook is disabled, and the
  an in-app notification to the organization's admins is attempted. The delivery
  result and disablement commit together; notification persistence remains
  best effort. Fix the receiver, then
  `tasker webhooks update <id> --enable`; re-enabling clears the count.
  Events from while it was paused or disabled are not sent later.
- Settled delivery rows are removed seven days after their creation. Pending
  deliveries are never removed by this age-based cleanup.
- The task change, source event and matching webhook delivery rows commit in
  one database transaction. A committed change survives a producer crash or
  broker outage. This also works in standalone mode without NATS. A failed
  transaction commits none of those rows.

## Recovery and operations

The source event ID in the body and `X-Tasker-Delivery` stay stable across
retries. A lease token prevents an expired worker from changing its successor's
result, but cannot undo a request the receiver already accepted. Keep receiver
deduplication even when only one Tasker instance runs.

Inspect pending source events without selecting their potentially sensitive
payloads:

```sql
SELECT COUNT(*) AS pending FROM domain_events WHERE delivered_at IS NULL;
SELECT id, subject, org_id, project_id, occurred_at, attempts,
       next_attempt_at, claimed_until, last_error
FROM domain_events WHERE delivered_at IS NULL
ORDER BY next_attempt_at, id LIMIT 50;
```

SQLite stores these timestamps as Unix seconds; MySQL uses datetime values.
Do not log event payloads, signing secrets or webhook URLs while investigating.
`last_error` contains a bounded failure classification, rather than the event
body. Source events and webhook deliveries have separate queues: successful
broker publication does not mean the receiver accepted its delivery.

After a process or broker outage, restart with the same database and broker
configuration. Pending source events retry with a five-second to five-minute
backoff. A crashed owner's lease expires after 60 seconds. Do not clear live
leases or rewrite stored payloads to force progress. Graceful shutdown stops
new leases, drains active work and leaves pending rows for restart. The API's
broker connection recovers without restarting the API.

Without an explicit `NATS_URL`, standalone mode projects audit rows directly
from the durable source. With a broker configured, run the audit consumer
against the **same database**, including `DB_PATH` for SQLite. References on
the broker contain routing and identity; the consumer loads the original body
from SQL. A missing source or mismatched reference is rejected, never silently
converted into an empty audit entry.

Pending source events have no age limit. Delivered source events are retained
for 14 days, while the broker retains messages for seven days. This is a
recovery window, not an indefinite event archive. The audit consumer stops
automatic redelivery after five failed deliveries. Fix the underlying database
or reference problem before replaying an affected event.

To replay an existing source event during that window, use the backend's
`brokerEventReference(source)` helper from `src/lib/domainEventRelay.ts` and
publish the reference to the stored subject with a **fresh transport message
ID**, keeping the source event's ID and routing unchanged. Wait for the
JetStream acknowledgement. This creates a new consumer delivery window;
producer-ID deduplication leaves an existing audit entry unchanged. It does
not enqueue new webhook deliveries or send historical events to newly created
subscriptions. The process recovery test exercises this exact duplicate
reference path. Never publish a fabricated source identity or copy a payload
into the broker to bypass a missing SQL row.

For this upgrade, stop old API, audit and webhook workers before starting the
new version. Older webhook workers cannot enforce the new lease-token fence.
Back up the database first. The audit migration replaces broker-sequence
uniqueness with producer-event uniqueness; rolling back requires a compatible
producer-aware projector or a tested backup restore. Do not blindly restore
the old unique index over data written by the new version.

## Security

- URLs must be `https`. A URL whose host is, or resolves to, a loopback,
  private, link-local (including the cloud metadata service), carrier-grade NAT
  or other non-public address is refused when it is registered. It is checked
  again at delivery, inside the connection's own DNS lookup, so a name that
  later resolves somewhere private is still refused.
- `WEBHOOKS_ALLOW_PRIVATE=true` on the server lifts both checks and allows
  `http`. It is for development and for on-premises receivers on a private
  network. Do not set it on a server whose users you do not trust.
- The secret is stored encrypted and never returned after it is first shown.
  Management events in the audit log record which webhook changed but not its
  URL, because a URL can carry a token in its query string.
