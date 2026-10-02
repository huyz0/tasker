---
id: ADR-0030
status: accepted
date: 2026-10-02
milestone: M37
---

# Webhooks: an in-process outbox, signed at-least-once delivery, addresses vetted at connect time

## Context

An agent runner outside Tasker learns of new work today by holding the event
feed open (ADR-0023) or by polling. A2A push notifications, Linear and GitHub
all wake external workers with webhooks instead
(`.specs/reviews/2026-10-02-ai-native-landscape.md`).

Domain events leave a handler through `publishDomainEvent(nc, subject,
payload)`, which publishes to NATS. A standalone deployment has no broker:
there `nc` is null and the event goes nowhere. A webhook design fed only from
NATS would never fire on the deployment the quickstart recommends.

A server that POSTs to URLs its users choose is also a request-forgery risk: a
URL naming `169.254.169.254`, `localhost` or a private address turns the
server into a proxy into its own network.

## Options

**Where events enter.**

- **(a) A NATS subscriber** (queue group, so one replica takes each event).
  Durable only as far as NATS is; absent in standalone mode.
- **(b) A sink inside `publishDomainEvent`** that writes matching events to a
  `webhook_deliveries` outbox in the process that published them. Works with
  or without a broker; each event is published by exactly one replica, so no
  duplicates and no queue group.
- **(c) Transactional outbox** written in the same database transaction as the
  change. The strongest guarantee, but every write path would need its event
  moved into its transaction — most are not transactional today.

**Delivery.** Synchronous in the request (slow receivers slow writes), or a
sweep over the outbox with retries.

**Address safety.** Check the hostname at registration only (defeated by DNS
rebinding: the name later resolves elsewhere); resolve and check before
`fetch` (a second resolution inside `fetch` can still differ); or **vet the
address inside the connection's own DNS lookup**, so the address checked is the
address connected to.

## Decision

**(b)**, delivered by a **sweep**, with addresses vetted **in the lookup**.

- `publishDomainEvent` calls an optional sink. The webhook sink matches
  `domain.task.*` and `domain.tasknote.*` events to the organization's active
  webhooks (project-scoped ones only for their project) and inserts one
  delivery row per webhook. It is best-effort exactly like the NATS publish it
  sits beside: a failed insert is logged, never fails the request.
- A sweep every few seconds claims due deliveries by a conditional update (the
  M30-T04 pattern, so replicas never send the same row twice), POSTs them, and
  records the outcome. Delivery is **at least once**: a receiver de-duplicates
  on `X-Tasker-Delivery`.
- Each request carries `X-Tasker-Event`, `X-Tasker-Delivery`,
  `X-Tasker-Timestamp` and `X-Tasker-Signature: sha256=<hex>` — an HMAC-SHA256
  of `"<timestamp>.<body>"` with the webhook's secret. The secret is shown once,
  stored encrypted (`lib/crypto.ts`), and rotatable.
- Failures retry with exponential backoff (30 s doubling, 8 attempts, about two
  hours) and are then marked failed. Twenty consecutive failed attempts
  disable the webhook and notify the organization's admins in-app.
- URLs must be `https`. Every address a host resolves to must be public:
  loopback, private, link-local (the metadata service), CGNAT, multicast,
  unspecified and IPv6 unique-local are refused — at registration, and again
  inside the delivery's DNS lookup. `WEBHOOKS_ALLOW_PRIVATE=true` permits
  `http` and private addresses, for development and on-premises receivers.
- Only `org:admin` manages webhooks; agent tokens cannot (an agent that could
  register a webhook could exfiltrate every event in the organization).

## Consequences

- An event published while the database is unreachable is lost to webhooks,
  as it would be to the event feed. (c) would close that; it is not worth
  restructuring every write path for it now.
- Receivers get each event at least once and in roughly, not strictly, the
  order it happened; the payload's `occurredAt` and the delivery id are what
  to rely on.
- The sink adds one query per task event — only for organizations with an
  active webhook, which an in-memory set (refreshed every 30 s, cleared on any
  change in the same process) answers without the database.
- Delivered and failed rows are pruned after seven days.
