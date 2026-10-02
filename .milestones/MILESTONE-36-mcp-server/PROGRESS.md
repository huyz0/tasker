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
