---
id: M36
title: MCP Server
status: in-progress
goal: Any MCP-capable agent can work a Tasker queue — find, claim, update, note, hand off and search memory — by pointing its client at one URL with its agent token, with exactly the permissions that token already has.
depends_on: [M35]
surfaces: [backend, cli, specs]
exit_criteria_met: false
started_at: 2026-10-02
completed_at: null
---

# M36 — MCP Server

## 1. Goal

`POST /mcp` speaks the Model Context Protocol (streamable HTTP, JSON response
mode, stateless). An agent authenticates with its existing bearer token and
sees a tool catalogue covering the agent loop: identity, projects, listing and
reading tasks, ready work, claim-next, release, my tasks, status changes,
notes and handoffs, comments, task links, and memory search and record. Each
tool call goes through the same Connect listener — and so the same
authentication, scope checks, rate limit and logging — as a direct RPC.
`tasker mcp` bridges a stdio MCP client to the endpoint using the CLI's stored
credentials.

## 2. Why Now

`.specs/reviews/2026-10-02-ai-native-landscape.md` ranks it first: Linear,
Atlassian, Asana, Plane, Taskmaster, Backlog.md and Beads all ship one; it is
how agents reach a tracker today. Without it an agent has to be scripted
against the CLI or the RPC API. M35 lands the work-graph tools it exposes.

## 3. Exit Criteria

- [ ] `initialize`, `ping`, `tools/list` and `tools/call` behave per the MCP
  specification (JSON-RPC 2.0 errors for malformed requests, unknown methods
  and unknown tools; tool failures as `isError` results).
- [ ] Unauthenticated requests get 401 with `WWW-Authenticate: Bearer`; a tool
  the token's scopes do not allow fails exactly as the RPC would.
- [ ] Every tool is a thin mapping onto an existing RPC — proven by a test that
  each tool's target method exists in the generated service descriptors.
- [ ] An end-to-end test drives a real server over HTTP: initialize, list,
  claim-next, note, release.
- [ ] `tasker mcp` relays stdio JSON-RPC to the endpoint with the CLI's token.
- [ ] `docs/mcp.md` shows client configuration; CI green on `main`.

## 4. Scope

**In scope:** tools only (the agent loop), ADR-0029.

**Out of scope:** MCP resources and prompts; server-initiated SSE streams
(the event feed already exists); OAuth authorization server (tokens are
issued by Tasker's own agent-token flow).

## 5. Task Breakdown

- [x] **M36-T01** — ADR-0029; JSON-RPC core: initialize, ping, tools/list, errors.
  - **Files**: `.specs/adr/ADR-0029-*.md`, `apps/backend/src/modules/mcp/*` (+ test)
- [x] **M36-T02** — The tool catalogue and its loopback dispatch.
  - **Files**: `apps/backend/src/modules/mcp/tools.ts` (+ test)
- [x] **M36-T03** — Mount `/mcp`: auth, rate limit, size limit; end-to-end test.
  - **Files**: `apps/backend/src/index.ts`, `apps/backend/src/modules/mcp/*.test.ts`
- [ ] **M36-T04** — `tasker mcp` stdio bridge.
  - **Files**: `apps/cli/cmd/mcp.go` (+ test), `docs/cli-reference.md`
- [ ] **M36-T05** — Docs and close.
  - **Files**: `docs/mcp.md`, `docs/agent-integration.md`,
    `.specs/product/architecture.md`, `.milestones/STATE.md`

## 6. Verification

```
moon run backend:typecheck backend:test cli:test cli:docs-check :knip
moon run :doc-drift :docs-lint :spec-drift
```

## 7. Risks

- **Spec churn.** MCP revises yearly; the server negotiates the version and
  implements only the stable core (lifecycle + tools).
- **A second entry point into handlers** (ADR-0019's concern) — avoided by
  dispatching over the real listener, not in-process.
