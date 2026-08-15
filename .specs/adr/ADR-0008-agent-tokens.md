---
id: ADR-0008
status: accepted
date: 2026-08-15
milestone: M04
---

# Agent tokens are opaque random secrets, stored as a SHA-256 hash, scoped to one organization and always expiring

## Context

An agent today is a row in `agents` with a name. Every action an agent takes
rides a human's Google session, and `createComment` / `createTaskNote` accept an
`agentId` in the request body — so any organization member can attribute a
comment to any agent by naming it. There is no credential to revoke, no way to
tell an agent's traffic from its operator's, and no limit on what a compromised
integration can reach.

M04 makes an agent a principal. Everything downstream in this milestone encodes
the choices below — the schema (T02), the interceptor (T04), the issuance RPCs
(T05), the scope check (T07) and the rate limiter (T08) — so they are decided
once, here, rather than discovered one task at a time.

Constraints already in place:

- `bun:sqlite` and MySQL are both supported; anything chosen must work on both.
- No new dependencies without authorization (`AGENTS.md`). `node:crypto` is
  available and already used by `modules/auth/session.ts` and `lib/crypto.ts`.
- ConnectRPC is the wire format for all 13 services, and `lib/problemDetails.ts`
  is deliberately scoped to the *plain HTTP* routes only.
- M03 established deny-by-default for authorization: an unclassified RPC fails
  the build rather than falling through to allow.

## Options

### 1. Token format

**Opaque random secret** (chosen) — 32 bytes from `crypto.randomBytes`,
base64url, behind a `tskr_` prefix: `tskr_<43 chars>`. The server looks the
token up by hash. Revocation is a row update and takes effect on the next
request.

**Self-describing signed token (JWT/HMAC), like the existing session cookie**
(rejected) — `modules/auth/session.ts` already mints HMAC-signed payloads, so
this would reuse a working mechanism. It was rejected because a signed token is
valid until it expires: revocation needs a separate deny-list consulted on every
request, which is exactly the `revokedSessions` round-trip the session path
already pays. For a credential whose entire purpose is to be revocable
independently, storing state is the honest design rather than storing none and
then adding a table to compensate. It also leaks its own claims to anyone
holding it, and an agent token will carry scopes and an org id.

The `tskr_` prefix is not decoration. It makes a leaked token identifiable in a
log or a paste, and it is what a future secret-scanning rule matches on.

### 2. Hashing

**SHA-256, hex, unique-indexed** (chosen). The stored value is
`sha256(<the whole token string>)`. Verification hashes the presented token and
looks the row up by that hash — one indexed query, no per-row comparison.

**bcrypt / argon2** (rejected). The reflex is "never store a credential with a
fast hash", and for passwords it is right. It is wrong here, for two reasons.
A slow hash defends against *guessing a low-entropy secret*; this secret is 256
bits of CSPRNG output, and no offline attack on it terminates. And a slow hash
cannot be looked up — you must fetch candidate rows and compare one at a time,
so every agent request would become a table scan plus ~100 ms of deliberate
work. That is a denial-of-service surface bolted onto the authentication path in
exchange for protection against an attack that does not exist. bcrypt's 72-byte
input cap is a third, smaller problem.

**HMAC-SHA-256 with a server-side pepper** (rejected, but closest). It would mean
a stolen database alone cannot be used to forge a lookup. Against a 256-bit
random secret this buys nothing a plain digest does not already give — there is
nothing to precompute and nothing to reverse — and it adds a key whose rotation
would invalidate every token at once. Reconsider if tokens ever carry
lower-entropy material.

Plaintext is returned exactly once, from the creation call, and is never stored,
logged or re-derivable.

### 3. Scope vocabulary

A **fixed, closed set of eight** (chosen). Scopes are `<family>:<verb>`:

| Scope | Grants |
|---|---|
| `tasks:read` | read tasks, task types, task notes and comments |
| `tasks:write` | create, update and transition tasks |
| `comments:write` | author comments and task notes |
| `artifacts:read` | read artifacts and folders |
| `artifacts:write` | create and modify artifacts |
| `projects:read` | read projects, templates and labels |
| `agents:read` | read the agent and agent-role catalogue |
| `repos:read` | read repository links, builds and deployments |

**Per-RPC permission strings** (rejected) — 13 services' worth of them. That is
M10's job, and M10 gets to design it against a real policy model. Shipping a
sprawling vocabulary now would mean either migrating every issued token when
M10 lands, or carrying two systems.

**A single `agent` scope** (rejected) — it would satisfy "an agent authenticates
as itself" while failing "a read-scoped token cannot create a task", which is
this milestone's own exit criterion. A credential that can do everything its
holder can do is not scoped.

**No scope grants organization administration.** `OrgService` mutations,
`AuthService`, and token issuance itself are refused to an agent principal
categorically, not by omitting a scope from a token. An agent that could mint
tokens or add members could escalate out of every other limit here, and no
legitimate autonomous worker needs to. This is the decision most likely to be
argued with later; reversing it means adding a scope *and* re-reading this
paragraph.

Each RPC maps to exactly one required scope, and **an unmapped RPC is denied to
token principals**, following M03's viewer sweep. A new endpoint is therefore
inaccessible to agents until someone classifies it, and the test that enumerates
the mapping fails the build until they do.

### 4. Expiry

**Always expires; 90 days by default, 365 maximum** (chosen). `expiresAt` is
`NOT NULL`.

**Optional expiry / non-expiring tokens** (rejected). A credential with no
expiry is a credential nobody ever rotates, and the failure mode is a token in a
CI config outliving the person who created it. The cost of the choice is real
and lands on M04-T11: if rotation is mandatory it has to be documented well
enough that a reader can do it without downtime.

### 5. The shape of a rate-limit rejection

Exit criterion 6 requires `429` with RFC 7807 problem details and `Retry-After`.
ConnectRPC has its own error envelope, and `lib/problemDetails.ts` says in its
first line that it is not for RPC endpoints — so these cannot both be honoured
inside a handler.

**Limit in an HTTP wrapper ahead of the Connect adapter** (chosen). The check
runs on the raw request, before any RPC dispatch, and returns a real
`application/problem+json` body with `Retry-After`. Throttling is a transport
concern and belongs at the transport.

**`ConnectError` with `Code.ResourceExhausted`** (rejected). The Connect protocol
does map it to HTTP 429 and metadata can carry `Retry-After`, so this is close —
but the body is a Connect envelope, not problem details, and the criterion names
the format. Recorded because it is what a reader would otherwise assume was
overlooked.

The consequence is that generated Connect clients see a transport-level failure
rather than a typed error, so the CLI (T09) has to recognise a 429 itself. That
cost is named here so T08 and T09 do not each rediscover it.

## Decision

Agent tokens are opaque 256-bit random secrets prefixed `tskr_`, stored only as
a SHA-256 hash, bound to exactly one organization and one agent, carrying a
fixed vocabulary of eight scopes with organization administration excluded
entirely, always expiring, and rate-limited by an HTTP-layer wrapper that
answers `429` with RFC 7807 problem details.

## Consequences

**Easier.** Revocation is a single row update with immediate effect. Attribution
stops being a request-body claim and becomes a property of the credential, which
is what lets T06 delete the `agentId` field. Per-token rate limiting and
`lastUsedAt` become possible because a request now names a specific credential.
An abandoned integration expires on its own.

**Harder.** Every agent request costs one indexed lookup — the session path
already pays a comparable one for revocation, so this is not new, but it is not
free either. Rotation becomes an operational task that must be documented. And a
`NOT NULL expiresAt` means there is no escape hatch for a long-lived service
credential; anyone who wants one has to change this decision rather than pass a
flag.

**Foreclosed.** Per-RPC custom permissions until M10, deliberately. Cross-org
tokens, permanently — the org binding is on the row, and a token that could span
organizations would defeat the tenancy work M03 just finished. And stateless
verification: this token cannot be checked without the database, so an offline
or edge validator is not possible without superseding this ADR.
