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
