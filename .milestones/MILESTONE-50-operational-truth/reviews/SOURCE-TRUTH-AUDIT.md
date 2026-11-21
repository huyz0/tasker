# Source truth audit — 21 November 2026

This is a source audit by the implementation agent, not an independent-agent
review or a claim of new local execution. T01 corrects present-tense guidance;
historical ADRs and milestone evidence remain intact.

| Obsolete claim | Evidence | Correction |
|---|---|---|
| Human identity is Google-only | auth/auth.ts, credentials.ts, both dialect schemas | Local accounts plus optional linked identity |
| Every RPC is unary | main.tsp, events/events.handler.ts | Existing server-streaming EventService |
| Authenticated user ID is the only principal | authz.ts, scopes.ts, agentToken.ts | Separate human/agent authorization and closed scope mapping |
| Backend publishes and consumes nothing | domainEventRuntime.ts, consumers/index.ts, auditProjector.ts | SQL source, ACKed relay and durable consumer |
| Missing broker silently drops the event | domainEventOutbox.ts, domainEventRelay.ts | Pending SQL retry; local projection in brokerless standalone |
| Webhooks are an in-memory outbox | webhooks/outbox.ts, domainEventOutbox.ts | Deterministic delivery rows in the mutation transaction |
| Live overflow can silently discard history | events/events.handler.ts | Bounded queue, coalesced resync and current credential/scope checks |
| No CLI paging or MCP mode | cmd/output.go, cmd/mcp.go, request_lifetime.go | NDJSON paging, stdio relay, per-request deadlines |
| All primitives are hand-rolled | GUI package.json, ui/Dialog.tsx, ADR-0011 | Radix dialog/dropdown/tabs with local wrappers |
| Search uses LIKE and FTS has no writers | search/search.handler.ts, DB setup/migrations | Delivered FTS5/FULLTEXT search |
| Container/manifests/scanners are absent | Dockerfile, compose/deploy files, ci.yml | Delivered examples and JS/Go vulnerability gates |
| MSW is dropped and clients are stubbed | GUI package.json, test/mockRpc.ts | Installed network interception with real generated clients |
| Concurrency has never been measured | M49 exact JSON/recovery results | Real two-process and staged evidence, with severe saturation and limits |

Declared JS ranges are reconciled to the current manifests. This changes no
dependency or runtime. Stable source paths replace fragile line-number claims.

M49's completed experiment has 1000 actual/peak callers but only 57 of 3000
complete workflows and 2943 errors. The 194 unacknowledged committed intents
remain distinct from acknowledged successes. No maximum fleet, stable queue,
all-endpoint/streaming, multi-host or 20000-client result is invented.

Remaining M50 work is roadmap/integration reconciliation and an actually
exercised private backup/restore/recovery runbook. These are not claimed
complete by this audit. Markdown/spec/doc-drift and final gates still apply.
