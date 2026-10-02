---
id: ADR-0029
status: accepted
date: 2026-10-02
milestone: M36
---

# A stateless MCP endpoint whose tools call the Connect listener over loopback

## Context

The Model Context Protocol is how agents reach a tracker today: Linear,
Atlassian, Asana, Plane, Taskmaster, Backlog.md and Beads each ship an MCP
server (`.specs/reviews/2026-10-02-ai-native-landscape.md`). Tasker's agents
can only use the RPC API directly or script the CLI.

An MCP server exposes *tools* (name, description, JSON Schema input) that a
client lists and calls over JSON-RPC 2.0. The current transport is
"streamable HTTP": the client POSTs JSON-RPC to one URL and the server answers
with either a JSON body or an SSE stream; sessions (`Mcp-Session-Id`) are
optional.

Three questions decide the design: where the server runs, how a tool call
reaches the existing handlers, and what state it keeps.

## Options

**Where.**

- **(a) A stdio server in the CLI only** (`tasker mcp`). No new backend
  surface; uses the CLI's credentials. But every agent host must install the
  binary, and remote/hosted agents (the 20K-agent target) cannot spawn it.
- **(b) A remote endpoint on the backend** (`POST /mcp`). One URL plus the
  agent's existing bearer token. Hosted agents can use it directly.
- **(c) Both**, with the CLI relaying stdio to the remote endpoint so the tool
  catalogue is written once.

**How a tool reaches a handler.**

- **(i) Call the handler functions in-process.** Fast, but it is the second
  entry point ADR-0019 refused: the session interceptor, agent-token rate
  limiter, request logging and validation mapping all live on the Connect
  listener's path, and the one most easily skipped is authentication.
- **(ii) Call the Connect listener over loopback HTTP**, forwarding the
  caller's `Authorization` header. Every tool call is an ordinary RPC: same
  authentication, scopes, rate limit, idempotency, logs and metrics. Costs a
  loopback round trip per call.

**State.** Session ids would let the server keep per-client state, which
nothing here needs, and would pin a client to one replica.

## Decision

**(c) with (ii), stateless.** `POST /mcp` on the backend implements the MCP
lifecycle (`initialize`, `notifications/initialized`, `ping`) and tools
(`tools/list`, `tools/call`) in JSON response mode, with no session id. Each
tool is a declared mapping from its arguments to one Connect RPC, called over
loopback with the caller's credentials. `tasker mcp` relays stdio JSON-RPC to
the endpoint with the CLI's stored token, for hosts that only speak stdio.

- Unauthenticated requests are refused with HTTP 401 and
  `WWW-Authenticate: Bearer` before any JSON-RPC is read. Authorization is
  then exactly the RPC's: a tool the token's scopes do not allow fails as the
  RPC would, reported as a tool error.
- An RPC error becomes a tool result with `isError: true` and the server's
  message, so the model can read and correct it; protocol errors (malformed
  JSON-RPC, unknown method or tool, bad arguments) are JSON-RPC errors.
- A browser `Origin` not on the CORS allowlist is refused (403), per the MCP
  specification's DNS-rebinding guidance.
- Supported protocol versions are negotiated; the server answers with the
  client's version when it supports it, otherwise its latest.

## Consequences

- No resources, prompts, sampling or server-initiated streams. The event feed
  (ADR-0023) already pushes events; webhooks (M37) will too.
- A tool call costs one extra loopback hop. Against handlers doing database
  work it is noise, the same judgement ADR-0019 made.
- The catalogue is a list of mappings onto RPCs that already exist, so it adds
  no authorization rules of its own. A test fails if a tool names an RPC that
  does not exist.
- OAuth discovery (`/.well-known/oauth-protected-resource`) is not offered:
  tokens are issued by Tasker's own agent-token flow, and MCP clients accept a
  static bearer header.
