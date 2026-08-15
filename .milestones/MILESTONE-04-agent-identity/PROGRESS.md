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
