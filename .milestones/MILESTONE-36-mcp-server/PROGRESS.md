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

## M36-T03 — Mount `/mcp`; end-to-end test

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/mcp/http.ts`, `apps/backend/src/index.ts`,
  `apps/backend/src/modules/mcp/mcp.e2e.test.ts`
- **Verified**: backend `bun test` 1916 pass; knip, typecheck green.
- **Notes**: `POST /mcp`, JSON response mode, stateless. Refused before any
  JSON-RPC is read: non-POST (405, `Allow: POST`), a browser `Origin` off the
  CORS allowlist (403, DNS-rebinding guidance), a missing or dead bearer token
  (401, `WWW-Authenticate: Bearer realm="tasker"`), an unsupported
  `MCP-Protocol-Version` (400), a body over 1 MiB (413); non-JSON is a -32700
  parse error; a notification is 202 with no body. Mounted after the agent
  rate limiter, so an MCP request spends the token's budget and each tool's
  loopback RPC spends it again - deliberately: exempting `/mcp` would leave
  `initialize` floods unthrottled, and a skip header would be spoofable.
  The end-to-end test runs in `backend:test`, not the spawn-a-process wire
  suite (which CI does not run): a real HTTP server with the Connect adapter
  and the same session-interceptor shape as `index.ts`, a real minted agent
  token, and the loop initialize -> notifications/initialized -> tools/list
  -> whoami -> claim_next_task (got the urgent task over the low one) ->
  add_task_note (handoff) -> release_task -> get_task (unassigned, handoff
  note present). A read-only token's claim comes back `permission_denied` as
  a tool error; a missing task, `not_found`.
- **Next**: M36-T04

## M36-T04 — `tasker mcp` stdio bridge

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/cli/cmd/mcp.go` (+ `mcp_test.go`), `docs/cli-reference.md`
- **Verified**: `moon run cli:format cli:vet cli:test cli:docs-check
  cli:coverage-gate` green, coverage 94.3%. **Live**: against the restarted
  standalone backend, with an agent token minted through the CLI (`agents
  create-role`, `agents create`, `auth token create`), five stdin lines through
  the real binary gave exactly four stdout lines - initialize (2025-06-18),
  tools/list (20 tools), whoami (the agent and its three scopes),
  claim_next_task (the urgent task from M35's smoke run) - and nothing for the
  notification.
- **Notes**: Newline-delimited JSON-RPC in, one compact line per reply out, and
  nothing else on stdout. A server refusal answered before the server read the
  id (401, 413) is given the request's own id so the client can match it; a
  reply that is not JSON-RPC at all (a proxy's HTML, an unreachable backend)
  becomes a -32603 error for a request and nothing for a notification. Without
  a credential it exits 3 before reading stdin.
  Also: the M35 push turned CI red - `shared-contract:format` (blank lines
  between commented TypeSpec fields), which I had never run locally; it
  skipped every later job. Fixed in 520c17f; the contract format check is now
  in this milestone's local verification.
- **Next**: M36-T05

## M36-T05 — Docs and close

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `docs/mcp.md` (new), `docs/agent-integration.md`, `README.md`,
  `.specs/product/architecture.md` (MCP; the module list, which had also
  missed `notifications` since M29), `.milestones/STATE.md`
- **Verified**: `moon run :docs-lint :doc-drift :spec-drift :skills-check`
  green.
- **Notes**: `docs/mcp.md` covers HTTP configuration (Claude Code and generic
  JSON), the stdio relay, every tool with the RPC behind it, argument
  validation, tool errors, and the limits: two rate-limit units per
  `tools/call`, 401/403 refusals, no resources/prompts/streams/OAuth
  discovery. M36 closed: 5/5 tasks, 6/6 criteria - each criterion is a test in
  `src/modules/mcp/` or the live T04 run.
- **Next**: M37-T01
