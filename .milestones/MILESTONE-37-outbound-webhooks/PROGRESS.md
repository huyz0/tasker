# M37 — Progress Journal

## M37-T01 — ADR-0030; contract and schema

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `.specs/adr/ADR-0030-webhooks-through-an-in-process-outbox.md`,
  `packages/shared-contract/{main.tsp,tasker/health/v1/health.proto}` and
  generated code, `apps/backend/src/db/schema.{sqlite,mysql}.ts`, migrations
  `0053_webhooks` / mysql `0040_webhooks`, `src/db/webhooks.migration.test.ts`
- **Verified**: backend `bun test` 1917 pass; `moon run
  shared-contract:format :knip :spec-drift` green; `go build ./...`.
- **Notes**: The design question was where events enter: `publishDomainEvent`
  drops them when there is no NATS, i.e. on every standalone deployment, so a
  NATS subscriber would never fire there. ADR-0030 puts a sink inside
  `publishDomainEvent` that writes an outbox row per matching webhook, in the
  process that published - broker or not, and never twice across replicas.
  A sweep delivers with a lease (`claimed_until`), signs with HMAC-SHA256 over
  `"<timestamp>.<body>"`, retries with backoff and disables after twenty
  consecutive failures. Addresses are vetted inside the connection's own DNS
  lookup, so the address checked is the address connected to - confirmed that
  Bun's `http.request` honours a custom `lookup` before committing to it.
  `WebhookService`: create (secret once), list, update, delete, rotate secret,
  ping, list deliveries.
- **Next**: M37-T02

## M37-T03 — URL safety

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/webhooks/urlSafety.ts` (+ test)
- **Verified**: `bun test src/modules/webhooks` 9 pass; knip, typecheck green.
- **Notes**: Done ahead of T02, which needs it to validate a URL at create.
  `isPublicAddress` refuses this-network, private, loopback, CGNAT,
  link-local (the metadata service), IETF/documentation/benchmark ranges,
  multicast and broadcast; for IPv6 also unique-local, link-local, multicast,
  documentation, and IPv4 smuggled in through mapped (`::ffff:a9fe:a9fe`) and
  NAT64 forms. `validateWebhookUrl` requires https, no credentials or fragment,
  and every resolved address public. `safeLookup` is the delivery half: a
  `lookup` for `http.request` that vets the very resolution the connection
  uses, refusing a host if *any* address it resolves to is non-public. Node
  does not call `lookup` for an IP-literal host, so delivery must also check a
  literal itself - noted for T04. `WEBHOOKS_ALLOW_PRIVATE=true` lifts both.
- **Next**: M37-T02

## M37-T02 — Management RPCs

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/webhooks/{webhooks.handler.ts,events.ts,outbox.ts}`
  (+ tests), `apps/backend/src/index.ts`, `lib/{viewer-denial,agent-scope-sweep}.test.ts`
- **Verified**: backend `bun test` 1943 pass; knip, typecheck green.
- **Notes**: `org:admin` throughout - a member, a viewer, another org's admin
  and every agent token are refused (agents: `NO_AGENT_ACCESS`, since a token
  that could register a webhook could copy the organization's events out).
  Create checks the URL (T03), the event filters against the fifteen
  `domain.task.*`/`domain.tasknote.*` subjects actually published (plus
  `<entity>.*` and `*`), and that a project belongs to the org; it returns a
  `whsec_` secret once and stores it AES-GCM encrypted. Update re-validates a
  new URL, replaces the filter only when one is given, and re-enabling clears
  the failure record. Rotate, ping (queues a `ping` delivery through the
  outbox) and paginated deliveries (no payloads) follow. Management events go
  to the feed and the audit log without the URL, which can carry a token in
  its query string - there is a test for that. The viewer gate first failed
  with NotFound on placeholder ids, i.e. it never reached authorization; it
  now runs against a seeded webhook.
- **Next**: M37-T04

## M37-T04 — Outbox fan-out and the signed delivery sweep

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/webhooks/{outbox.ts,delivery.ts}`
  (+ `delivery.test.ts`), `lib/natsCorrelation.ts` (`setDomainEventSink`),
  `lib/notificationRegistry.ts` (`webhook.disabled`), `src/index.ts`
- **Verified**: backend `bun test` 1954 pass; knip, typecheck green. Mutation
  check: dropping the lease condition makes the overlapping-sweeps test send
  20 POSTs for 10 deliveries - it fails, as it should.
- **Notes**: `publishDomainEvent` now also offers each event to one in-process
  sink (never throws, like the publish beside it). The webhook sink places a
  task or task-note event by its task's project and organization and writes a
  delivery per active webhook whose scope and filter match - one event id
  shared across webhooks. An organization set, cached 30 s and cleared on any
  change in this process, makes events cost nothing when nobody subscribes.
  The sweep (every 5 s, never overlapping itself) claims due rows by a
  conditional update, POSTs with `X-Tasker-Event/-Delivery/-Timestamp/
  -Signature` (tested by verifying the HMAC as a receiver would), treats any
  non-2xx - redirects included, never followed - as a failure, backs off 30 s
  doubling for 8 attempts, and counts consecutive failures in the database so
  replicas add up; at 20 the webhook is switched off once and the org's
  owners/admins get a `webhook.disabled` notification linking to
  `/organizations?section=webhooks`. Deliveries for a webhook paused or
  deleted since queuing are closed, not sent. Settled rows go after a week.
  The real `httpSender` refuses an IP-literal private host itself (Node does
  not call `lookup` for those) and a name that resolves privately via
  `safeLookup`, before a byte is sent.
- **Next**: M37-T05

## M37-T05 — CLI

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/cli/cmd/webhooks.go` (+ `webhooks_test.go`),
  `apps/cli/internal/backend/clients.go`, `docs/cli-reference.md`
- **Verified**: `moon run cli:format cli:vet cli:test cli:docs-check
  cli:coverage-gate` green, coverage 94.5%. **Live, standalone, no NATS**:
  with `WEBHOOKS_ALLOW_PRIVATE=true` and a local receiver that recomputes the
  HMAC from the secret `webhooks create` printed, `webhooks ping` and then
  `tasks create` x2 / `update-status done` produced four deliveries - ping,
  task.created x2, task.unblocked - every signature verified by the receiver,
  every row `delivered after 1 attempt HTTP 204` in `webhooks deliveries`; the
  status change itself, outside the filter, was not sent; an agent token's
  `webhooks list` exited 3.
- **Notes**: `webhooks create|list|update|delete|rotate-secret|ping|
  deliveries`. The secret prints once with a label saying so; `update`
  sends only the flags given (`--enable`/`--disable` are exclusive and exit
  6 together); `deliveries` pages like every list (`--cursor`, `--page-all`,
  `--json`).
- **Next**: M37-T06

## M37-T06 — GUI

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/gui/src/features/Organizations/{Webhooks.tsx,index.tsx}`
  (+ `Webhooks.test.tsx`, `Webhooks.stories.tsx`), `apps/gui/src/lib/eventQueryKeys.ts`
- **Verified**: `moon run gui:lint gui:design-lint gui:typecheck gui:test
  gui:build` green - 1260 tests, 98.4% statements / 95.3% branches.
  `gui:storybook-test` was still running at commit time; its result is
  recorded under T07.
- **Notes**: Organizations → Webhooks (`?section=webhooks`, where the
  `webhook.disabled` notification links). Add form: URL, description, event
  groups (every / task / agent-note) and every specific type behind a
  disclosure; submit is disabled with a reason when no event is chosen. The
  secret appears once in a status callout saying so, with copy and dismiss.
  Each webhook shows scope, filter, state (active / paused / disabled with
  the reason), consecutive failures and last delivery, with ping (disabled
  when inactive; opens the delivery list), pause/enable, rotate (confirmed;
  shows the new secret), delete (confirmed) and recent deliveries with
  outcome, attempts, HTTP status and error. A non-admin sees "Only
  organization admins can manage webhooks" and no add button.
  `webhook` joins the live-event key map.
- **Next**: M37-T07
