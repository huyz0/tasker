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
