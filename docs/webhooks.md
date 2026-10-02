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
  <id>` replaces it, and the old secret stops signing immediately.
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
- **Roughly in order, not strictly.** Order by `occurredAt` if it matters.
- Any `2xx` within 10 seconds is success. Anything else is a failure,
  including a redirect, which is never followed. A failure is retried after
  30 s, 1 min, 2 min, … for 8 attempts (about two hours), then marked
  `failed`.
- After **20 consecutive failed attempts** the webhook is disabled, and the
  organization's admins get an in-app notification. Fix the receiver, then
  `tasker webhooks update <id> --enable`; re-enabling clears the count.
  Events from while it was paused or disabled are not sent later.
- Delivery history is kept for seven days.

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
- Events are offered to webhooks by the process that published them, so
  webhooks work on a standalone deployment without NATS. An event published
  while the database is unreachable is lost to webhooks, as it is to the
  event feed.
