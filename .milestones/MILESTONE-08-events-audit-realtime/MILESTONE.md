---
id: M08
title: Events, Audit & Real-Time
status: todo
goal: Domain events are consumed rather than discarded — producing a durable audit trail and a browser that updates without a manual refresh.
depends_on: [M04, M07]
surfaces: [backend, gui, infra, contract]
exit_criteria_met: false
started_at: null
completed_at: null
---

# M08 — Events, Audit & Real-Time

## 1. Goal

Two people looking at the same board see the same thing without either of them
reloading. An administrator can answer "who changed this role, and when". Both
come from the same source: the `domain.*` events the handlers already publish,
finally given a consumer.

## 2. Why Now

The event vocabulary already exists and is emitted at exactly the right points —
over twenty subjects across every module — with no subscriber anywhere in the
repository and no broker in the local compose file. The expensive design work is
done; what is missing is the consuming half. Real-time is also the last
outstanding claim from the original mission statement ("near real-time
interactive web GUI") that has no implementation at all.

## 3. Exit Criteria

- [ ] NATS runs in the local stack and the health probe reflects its true state.
- [ ] A consumer process subscribes durably and survives a broker restart
      without losing events.
- [ ] Every `domain.*` event is written to an `audit_log` table with actor,
      subject, payload and timestamp.
- [ ] An organization administrator can browse and filter the audit trail.
- [ ] A change made in one browser appears in another within two seconds,
      without a reload, scoped so a user only receives events for organizations
      they belong to.
- [ ] Dropping the stream degrades to polling rather than to a stale view.

## 4. Scope

**In Scope**: NATS in compose and dev, a durable consumer, the audit projection
and its UI, a scoped streaming endpoint, the client subscription and its
reconnection behaviour.

**Out of Scope**: full CQRS read models (still deferred by the M02 ADR),
OpenSearch, cross-region replication.

## 5. Task Breakdown

- [ ] **M08-T01** — Add NATS to `docker-compose.yml` and `scripts/dev.sh`; make
      the health probe's NATS status reflect reality in every mode.
      - Files: `docker-compose.yml`, `scripts/dev.sh`, `modules/health/health.handler.ts`
      - Verify: `moon run dev` reports NATS connected.

- [ ] **M08-T02** — Create the consumer entrypoint with a durable subscription,
      graceful shutdown and structured logging.
      - Files: `apps/backend/src/consumers/index.ts`, `apps/backend/moon.yml`
      - Verify: events published while the consumer is down are delivered on restart.

- [ ] **M08-T03** — Add the `audit_log` table and a projector that writes every
      `domain.*` event with the acting principal.
      - Files: `db/schema.*.ts`, migrations, `apps/backend/src/consumers/auditProjector.ts`
      - Verify: a role change produces one audit row naming the actor.

- [ ] **M08-T04** — Include the acting principal in every published event payload
      so the projector does not have to infer it.
      - Files: `lib/natsCorrelation.ts`, all handlers
      - Verify: every event carries `actor` and `requestId`.

- [ ] **M08-T05** — Add `listAuditEvents` (org admin, paginated, filterable by
      subject and actor).
      - Files: `main.tsp`, new `modules/audit/audit.handler.ts`
      - Verify: filtering by actor returns only that actor's events.

- [ ] **M08-T06** — Build the audit trail view under organization settings.
      - Files: `apps/gui/src/features/Organizations/`
      - Verify: an administrator can trace a member removal.

- [ ] **M08-T07** — Add a server-streaming subscription endpoint scoped by
      organization and project, authorized per connection.
      - Files: `main.tsp`, `modules/events/events.handler.ts`, `apps/backend/src/index.ts`
      - Verify: a client receives only events for orgs it belongs to.

- [ ] **M08-T08** — Add a client subscription hook that maps events to targeted
      React Query invalidations rather than blanket refetches.
      - Files: `apps/gui/src/hooks/useDomainEvents.ts`, feature views
      - Verify: a task created in one browser appears in another within two seconds.

- [ ] **M08-T09** — Add reconnection with exponential backoff and a polling
      fallback when the stream is unavailable.
      - Files: `apps/gui/src/hooks/useDomainEvents.ts`
      - Verify: killing the backend and restarting it restores live updates.

- [ ] **M08-T10** — Add a connection indicator so a user can tell live from stale.
      - Files: `apps/gui/src/components/layout/AppShell.tsx`
      - Verify: the indicator changes state when the stream drops.

- [ ] **M08-T11** — End-to-end test: mutation → event → projection → second client.
      - Files: `apps/gui/tests/e2e/realtime.spec.ts`, backend tests
      - Verify: the test fails if the consumer is stopped.

## 6. Verification

```bash
docker compose up -d nats mysql
moon run backend:test
moon run gui:e2e
```

## 7. Risks

A streaming endpoint changes the deployment shape — connections are long-lived
and load balancers must be configured for it. Record the requirement in the
deployment section of `architecture.md` as part of this milestone rather than
discovering it during M11.
