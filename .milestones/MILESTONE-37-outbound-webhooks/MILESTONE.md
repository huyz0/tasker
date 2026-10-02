---
id: M37
title: Outbound Webhooks
status: todo
goal: An organization can subscribe an HTTPS endpoint to its task events and receive each one, signed, at least once — so an outside agent runner starts work when work appears instead of polling or holding a stream open.
depends_on: [M35]
surfaces: [contract, backend, cli, gui, specs]
exit_criteria_met: false
started_at: null
completed_at: null
---

# M37 — Outbound Webhooks

## 1. Goal

An org admin registers a webhook: a URL, the event types it wants (e.g.
`task.created`, `task.unblocked`, `task.status_changed`), optionally one
project. Tasker POSTs each matching domain event as JSON with an HMAC-SHA256
signature, a delivery id and a timestamp; failed deliveries retry with
backoff and are recorded, and a subscription that keeps failing is disabled
and its owner notified. Secrets are shown once. Admins manage webhooks and see
recent deliveries from the CLI and the GUI.

## 2. Why Now

The landscape review ranks it fourth: A2A push notifications, Linear and
GitHub all wake external runners this way. Tasker's only push channel is the
event-feed stream, which needs a long-lived connection per consumer.

## 3. Exit Criteria

- [ ] Each delivery carries `X-Tasker-Signature: sha256=<hex HMAC of
  "<timestamp>.<body>">`, `X-Tasker-Delivery`, `X-Tasker-Event` and
  `X-Tasker-Timestamp`; a test verifies a signature the way a receiver would.
- [ ] Delivery is durable: events are written to an outbox in the same
  process that publishes them, a sweep delivers and retries with backoff,
  and a restart loses nothing queued.
- [ ] URLs must be `https` (plain `http` only to loopback when
  `WEBHOOKS_ALLOW_HTTP=true`); private, link-local and metadata addresses are
  refused at registration and at delivery (after DNS resolution).
- [ ] Only `org:admin` manages webhooks; agents cannot (agent-scope sweep);
  events from projects the subscription does not cover are never sent.
- [ ] After N consecutive failures a subscription is disabled and org admins
  get an in-app notification.
- [ ] CLI `webhooks create|list|delete|deliveries|rotate-secret`; GUI
  Organization → Webhooks; CI green on `main`.

## 4. Scope

**In scope:** task and task-note events, ADR-0030.
**Out of scope:** per-user webhooks; event types beyond tasks; replaying old
events on demand.

## 5. Task Breakdown

- [ ] **M37-T01** — ADR-0030; contract and schema: subscriptions, outbox/deliveries.
- [ ] **M37-T02** — Management RPCs: create (secret once), list, update, delete, rotate.
- [ ] **M37-T03** — URL safety: scheme, address and DNS checks.
- [ ] **M37-T04** — Outbox fan-out from domain events; signed delivery sweep with retries and auto-disable.
- [ ] **M37-T05** — CLI.
- [ ] **M37-T06** — GUI.
- [ ] **M37-T07** — Docs and close.

## 6. Verification

```
moon run backend:typecheck backend:test cli:test cli:docs-check gui:test :knip
```

## 7. Risks

- **SSRF.** The main risk of any webhook feature; T03 is a task of its own and
  checks the resolved address, not the hostname.
- **Multiple replicas.** The sweep claims deliveries by a conditional update,
  the pattern M30-T04 used for stalled claims.
