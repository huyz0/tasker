---
id: M04
title: Agent Identity & M2M Tokens
status: in-progress
goal: An AI agent is a first-class authenticated principal with its own scoped, revocable, rate-limited credential, and attribution is derived from that credential rather than trusted from the request body.
depends_on: [M03]
surfaces: [backend, cli, gui, contract]
exit_criteria_met: false
started_at: 2026-08-15
completed_at: null
---

# M04 — Agent Identity & M2M Tokens

## 1. Goal

An agent authenticates as itself. It presents a token issued for it, scoped to
one organization and a set of permissions, revocable independently of every
other credential, and subject to its own rate limit. Every comment, note and
task the agent creates is attributed from that token. No caller can claim to be
an agent it does not hold a credential for.

## 2. Why Now

This is the gap between what the product claims to be and what it is. The
mission statement describes infrastructure for 20,000 autonomous agents; today
an agent is a row with a name, every agent action rides a human's Google
session, and any organization member can attribute a comment to any agent by
passing its id in the request body. Until this exists, "AI-first" is a
positioning statement rather than a capability. It sits after M03 because it
extends the same authorization helpers.

## 3. Exit Criteria

- [ ] An agent can call every RPC it is scoped for using only its own token,
      with no human session present anywhere in the request.
- [ ] Attribution on comments, notes and tasks is derived from the authenticated
      principal; the `agentId` request field is removed from the contract.
- [ ] A token is displayed exactly once at creation and stored only as a hash.
- [ ] Revoking a token stops the next request; revoking one token does not
      affect any other.
- [ ] A token cannot act outside the organization it was issued for, proven by test.
- [ ] Exceeding a token's rate limit returns `429` with RFC 7807 problem details
      and a `Retry-After` header.
- [ ] `ENABLE_TEST_LOGIN` is no longer needed for agent or CLI workflows.

## 4. Scope

**In Scope**: the token model, issuance and revocation, principal resolution in
the interceptor, scope checks, quotas, CLI and GUI surfaces for managing tokens.

**Out of Scope**: fine-grained custom permissions (M10 — this milestone ships a
fixed scope vocabulary), audit persistence (M08), OAuth device flow.

## 5. Task Breakdown

- [x] **M04-T01** — Design the token model and record it as an ADR: prefix format,
      hashing (never store plaintext), scope vocabulary, expiry policy.
      - Files: `.specs/adr/ADR-0008-agent-tokens.md`
      - Verify: the ADR names the hash algorithm and the scope list.

- [x] **M04-T02** — Add the `api_tokens` table to both dialects with migrations:
      id, orgId, agentId, name, tokenHash, scopes, expiresAt, lastUsedAt, revokedAt.
      - Files: `db/schema.*.ts`, `drizzle-sqlite/`, `drizzle-mysql/`
      - Verify: migrations apply cleanly on both dialects.

- [x] **M04-T03** — Introduce a `Principal` type (`user` or `agent`) and replace
      `requireUserId` with `requirePrincipal`, keeping a `requireUser` for
      human-only endpoints.
      - Files: `apps/backend/src/lib/authz.ts`, `modules/auth/session.ts`
      - Verify: existing human tests pass unchanged.

- [x] **M04-T04** — Extend the session interceptor to resolve an agent token from
      the `Authorization` header, rejecting revoked and expired tokens, and
      updating `lastUsedAt` without blocking the request path.
      - Files: `apps/backend/src/index.ts`, `lib/sessionRevocation.ts`
      - Verify: a revoked token is rejected on the next call.

- [ ] **M04-T05** — Add `createAgentToken`, `listAgentTokens` and `revokeAgentToken`
      RPCs, gated on org admin, returning the plaintext once.
      - Files: `packages/shared-contract/main.tsp`, `modules/agents/agents.handler.ts`
      - Verify: the plaintext never appears in a list response.

- [ ] **M04-T06** — Derive agent attribution from the principal and delete the
      `agentId` field from comment, note and task request models.
      - Files: `modules/comments/comments.handler.ts`,
        `modules/tasks/task_notes.handler.ts`, `main.tsp`
      - Verify: a human session can no longer author a comment as an agent.

- [ ] **M04-T07** — Enforce scopes: map each RPC to a required scope and reject
      tokens that lack it.
      - Files: `apps/backend/src/lib/authz.ts`, handler registration
      - Verify: a read-scoped token cannot create a task.

- [ ] **M04-T08** — Add per-token rate limiting and quota counters with a
      `429` + `Retry-After` response.
      - Files: `apps/backend/src/lib/rateLimit.ts`, `apps/backend/src/index.ts`
      - Verify: a burst past the limit is throttled and recovers.

- [ ] **M04-T09** — CLI: `tasker auth token create|list|revoke`, plus `--token`
      and `TASKER_TOKEN` for authenticating as an agent.
      - Files: `apps/cli/cmd/auth.go`, `apps/cli/internal/backend/credentials.go`
      - Verify: a scripted agent session works with no browser login.

- [ ] **M04-T10** — GUI: token management on the agent detail view, with
      copy-once presentation and a revoke action.
      - Files: `apps/gui/src/features/Agents/index.tsx`
      - Verify: an administrator issues and revokes a token from the UI.

- [ ] **M04-T11** — Write the agent integration guide: how an autonomous worker
      authenticates, what scopes exist, how to rotate.
      - Files: `docs/agent-integration.md`, `README.md`
      - Verify: a reader can authenticate an agent from the guide alone.

- [ ] **M04-T12** — Security review of the whole surface via `/security-review`,
      with findings resolved.
      - Verify: review recorded under `.milestones/MILESTONE-04-agent-identity/reviews/` with no open criticals.

## 6. Verification

```bash
moon run backend:test
moon run cli:test
TASKER_TOKEN=<issued> ./apps/cli/cli tasks list --project <id> --json
```

## 7. Risks

Removing `agentId` from the request models is a breaking contract change. Ship
it in the same release as the token surface and note it as `BREAKING CHANGE:`
in the commit, since no external consumer exists yet — the cost of doing this
later grows with every integration.
