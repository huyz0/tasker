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
