# M04 — Agent Identity & M2M Tokens — Progress Journal

Append-only. Newest entry at the bottom.

---

## M04-T01 — Design the token model and record it as an ADR

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `.specs/adr/ADR-0008-agent-tokens.md`
- **Verified**: the ADR names the hash algorithm (SHA-256, four mentions) and
  the scope list (eight `<family>:<verb>` scopes in a table).
  `moon run tasker:docs-lint` — 167 files clean.
- **Artifacts**: ADR only. No UX pass (no screen), no test plan (nothing to
  execute yet) — both come with T05/T10.
- **Decisions, and what each forecloses**:
  - **Opaque random secret over a signed token.** The session path already mints
    HMAC payloads, so reuse was the obvious move. Rejected because a signed
    token is valid until expiry and revocation then needs a deny-list consulted
    on every request — which is the `revokedSessions` round-trip the session
    path already pays. For a credential whose purpose *is* independent
    revocation, storing state is honest rather than storing none and adding a
    table to compensate.
  - **SHA-256, not bcrypt.** "Never store a credential with a fast hash" is a
    password rule, and this is not a password: 256 bits of CSPRNG output has no
    terminating offline attack. A slow hash would also make the token
    unlookupable — every agent request becomes a scan plus ~100 ms of
    deliberate work, i.e. a DoS surface on the auth path bought in exchange for
    nothing. HMAC with a pepper was the closest rejected option and is recorded
    as reconsiderable if tokens ever carry low-entropy material.
  - **Eight fixed scopes, and no scope grants org administration.** Org
    mutations, `AuthService` and token issuance are refused to agent principals
    categorically, not by omitting a scope — an agent that can mint tokens
    escapes every other limit here. Deny-by-default on unmapped RPCs, following
    M03's viewer sweep, so a new endpoint is inaccessible to agents until
    someone classifies it.
  - **Expiry is mandatory** (90d default, 365 max, `NOT NULL`). The cost lands
    on T11: rotation has to be documented well enough to do without downtime.
- **Found while designing, not while implementing**: exit criterion 6 wants
  `429` + RFC 7807 + `Retry-After`, but `lib/problemDetails.ts` states in its
  first line that it is not for RPC endpoints, and ConnectRPC has its own error
  envelope. The two cannot both hold inside a handler. Resolved in the ADR by
  putting the limiter in an HTTP wrapper ahead of the Connect adapter — which
  means Connect clients see a transport error, not a typed one, so **T09's CLI
  must recognise a bare 429 itself**. Named here so T08 and T09 do not each
  rediscover it.
- **Next**: M04-T02

---

## M04-T02 — Add the `api_tokens` table to both dialects

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `src/db/schema.sqlite.ts`, `src/db/schema.mysql.ts`,
  `drizzle-sqlite/0023_api_tokens.sql`, `drizzle-mysql/0010_api_tokens.sql`,
  both `meta/_journal.json`, `src/db/migrate-api-tokens.test.ts` (new, 11 tests)
- **Verified**: `moon run backend:test` — 455 pass / 7 skip / 0 fail (was 444).
  SQLite verified by **execution**: the real drizzle migrator run against a
  fresh file applies all 24 migrations, and the resulting table has every column
  `NOT NULL` that should be, with `api_tokens_token_hash_idx` unique.
- **Verified only structurally on MySQL — read this before trusting it**: the
  verify line says "both dialects", and the MySQL half was *not* observed. There
  is no MySQL server in this environment (no `mysqld`, no Docker daemon) and
  **none in CI** — no workflow starts one and no test opens a mysql2 pool. That
  is true of every MySQL migration in this repository, not only this one. What
  runs instead is a structural check that the generated file still describes the
  schema: columns present, `expires_at`/`scopes`/`token_hash` `NOT NULL`,
  `last_used_at`/`revoked_at` nullable, one row per token hash. It would catch a
  bad hand-edit; it would not catch DDL MySQL rejects. Recorded for **M12**.
- **Divergence from the task's field list**: added `tokenPrefix` and `createdBy`.
  The prefix lets the list view (T05, T10) identify a token as `tskr_a1b2…`
  without holding anything secret — without it, a list of tokens is a list of
  names with no way to match one against a leaked string. `createdBy` is who
  issued it, which the revoke flow and any later audit both want.
- **`orgId` is stored on the token, not joined through the agent.** Deliberate:
  the interceptor authorizes on it every request, and reading it from the row
  means re-homing an agent cannot silently widen a credential that already
  exists.
- **`drizzle-kit generate` emitted catch-up statements for M03's migrations.**
  0021/0022 (sqlite) and 0008/0009 (mysql) were hand-written, so the meta
  snapshot never learned about them and the generator re-emitted
  `agent_roles.org_id` and `invitations.expires_at` as new work. Applying that
  against an existing database fails with a duplicate column. Stripped from both
  files, and a test now asserts they stay stripped, because the next person to
  run `generate` will hit exactly this again. The snapshots written by this run
  are current, so the trap is closed going forward.
- **Deliberate-break check**: the five MySQL structural tests passed on first
  run, so `expires_at` was made nullable in the file to confirm the suite goes
  red (it did — one failure, the right one) before being restored.
- **Next**: M04-T03

---

## M04-T03 — Introduce a `Principal` type

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `src/modules/auth/session.ts` (`Principal`, `currentPrincipalKey`),
  `src/lib/authz.ts` (`requirePrincipal`, `requireUser`), 95 call sites across
  12 handler modules, `src/lib/principal.test.ts` (new, 9 tests),
  `src/lib/authz.test.ts` (two fixtures)
- **Verified**: `moon run backend:test` — 464 pass / 7 skip / 0 fail (was 455).
  `moon check --all` — 23 tasks pass.
- **The rename is the security control.** `requireUserId` became `requireUser`,
  which *refuses* agent principals, rather than becoming `requirePrincipal`,
  which would accept them. Every one of the 95 existing call sites is therefore
  closed to tokens by construction; an endpoint opens to agents only when
  someone deliberately moves it to `requirePrincipal` in T06/T07. Deny-by-default
  falls out of the rename instead of depending on anyone remembering — the same
  shape as M03's viewer sweep.
- **`requireUser` answers `PermissionDenied`, not `Unauthenticated`,** to an
  agent. The agent *is* authenticated; a 401 would tell a correctly-credentialled
  caller to authenticate again, which for an autonomous worker is an endless
  retry loop rather than an error.
- **`Principal` is a discriminated union, not one shape with optional fields.**
  An agent has no `userId` and a user has no `scopes`; merging them would make
  every consumer check a field that is only sometimes meaningful.
- **Divergence from "existing human tests pass unchanged"**: one did not, and it
  is worth being precise about why. `authz.test.ts` built its context from
  `{ get: () => "user-1" }` — a stub answering *every* key with the same string,
  so it also claimed `currentPrincipalKey` held a `Principal` whose `kind` was
  the letter `"u"`. It failed on the shape of the stub, not on any behaviour a
  caller can observe. Rebuilt on real `createContextValues()`. The alternative —
  type-guarding `requirePrincipal` until the stub passed again — would have been
  writing production code to satisfy a mock.
- **Fixed in passing**: `assertOrgAdminOfAny`'s doc comment still explained
  itself as guarding a global, tenant-shared `agentRoles` catalogue. M03-T05
  scoped that table to one organization (ADR-0007), so the comment described a
  schema that no longer exists and justified the function on grounds that had
  gone. Rewritten to say what it is actually for now (the `/api/debug/*` routes)
  and to warn against reaching for it out of convenience.
- **Next**: M04-T04

---

## M04-T04 — Resolve agent tokens in the session interceptor

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `src/lib/agentToken.ts` (new), `src/lib/authenticate.ts` (new),
  `src/index.ts` (interceptor), `src/lib/agentToken.test.ts` (new, 17 tests),
  `src/lib/authenticate.test.ts` (new, 14 tests)
- **Verified**: `moon run backend:test` — 495 pass / 7 skip / 0 fail (was 464).
  `moon check --all` — 23 tasks pass. And the verify line end to end against a
  running server, which is the part the unit tests cannot reach:

  | Request | Response |
  |---|---|
  | live token | `permission_denied: This endpoint requires a human session` |
  | same token, after `revokeToken` | `unauthenticated: Authentication required` |
  | forged `tskr_…` string | `unauthenticated` |

  `permission_denied` on the first line is the proof: the token authenticated,
  and `requireUser` then refused it because no endpoint has been opened to
  agents yet (T06/T07). No restart between the two calls. `lastUsedAt` was
  stamped on the token row without the request waiting for it.
- **The resolution logic is not in the interceptor.** `src/index.ts` is in
  `coveragePathIgnorePatterns` and cannot be exercised by the suite, and the
  decision about *who a caller is* is the last thing that should be untestable.
  `resolvePrincipal(db, headers)` lives in `lib/authenticate.ts`; the
  interceptor is now four lines that call it and set two context keys.
- **A bad agent token does not fall back to the session.** A revoked token
  presented with a valid cookie resolves to nothing, rather than quietly
  downgrading to the human — otherwise a dead agent credential keeps working as
  somebody else.
- **A test that could not fail, found by injection.** The assertion above passed
  even after the early return was removed, because `resolveSessionPayload`
  prefers the `Authorization` header and so never reaches the cookie. The
  outcome was right for a reason unrelated to the code it appeared to guard.
  Added a second test pinning that ordering explicitly, so if someone makes
  session resolution fall back to the cookie — the moment a dead token starts
  borrowing a session — it fails instead of looking harmless. Kept both: two
  layers enforce this, and a test per layer is what makes either failure visible.
- **`lastUsedAt` is not stamped on a rejected token.** The token list is where an
  operator confirms a revocation worked; "last used: just now" on a dead
  credential reads as live. Verified by injection (stamping unconditionally goes
  red).
- **A deleted agent's token stops working**, checked in the same indexed query
  as the hash lookup rather than as a second round trip.
- **Divergence**: the task named `lib/sessionRevocation.ts`; it was not touched.
  Agent revocation is a column on the token row, not a deny-list — a token is
  already stateful, so it needs no `revokedSessions` equivalent (ADR-0008).
- **knip caught an over-export**: `TokenRejection` was exported with no importer.
  Unexported; the union is still reachable through `TokenResolution`.
- **Next**: M04-T05
