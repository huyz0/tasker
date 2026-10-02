# M36 — Progress Journal

## M36-T01 — ADR-0029; JSON-RPC core

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `.specs/adr/ADR-0029-a-stateless-mcp-endpoint-over-the-connect-listener.md`,
  `apps/backend/src/modules/mcp/protocol.ts` (+ test)
- **Verified**: `bun test src/modules/mcp` 5 pass; knip and typecheck green.
- **Notes**: ADR-0029: a remote, stateless `POST /mcp` whose tools are
  mappings onto existing RPCs, called over loopback with the caller's own
  credentials - so authentication, scopes, rate limits and logs are the RPC's,
  and no second path into the handlers exists (ADR-0019's concern) - plus a
  `tasker mcp` stdio relay. The core is transport-free: `initialize` (version
  negotiation, tools capability, usage instructions), `ping`, `tools/list`,
  `tools/call`; notifications get no response; batches, malformed requests,
  null/object ids, unknown methods and tools, and non-object arguments are
  JSON-RPC errors; a tool's own failure is the host's to report as `isError`.
- **Next**: M36-T02

## M36-T02 — The tool catalogue and its loopback dispatch

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/mcp/tools.ts` (+ test), `protocol.ts`
- **Verified**: `bun test src/modules/mcp` 10 pass; knip and typecheck green.
- **Notes**: Twenty tools - whoami, list_projects, list_tasks, get_task,
  create_task, update_task, set_task_status, claim_next_task, claim_task,
  release_task, list_my_tasks, add_task_note, list_task_notes, add_comment,
  link_tasks, unlink_tasks, list_task_links, get_task_type, search_memory,
  record_belief - each a declared mapping onto one existing RPC, with
  snake_case arguments, priority as words, and read-only/idempotent hints. The
  advertised inputSchema *is* the validator: missing required, unknown keys (a
  misspelt field is named, not ignored), wrong types, ranges and enums are
  JSON-RPC invalid-params. A test walks every tool against the generated
  service descriptors - the method must exist and every request key (and
  `page` key) must be a field of its input message; checked that a snake_case
  key would fail it. An RPC refusal becomes `isError` with the server's code
  and message; transport failures propagate. `loopbackCaller` posts Connect
  JSON with the caller's own `Authorization` header (ADR-0029).
- **Next**: M36-T03
