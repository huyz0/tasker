---
task: M04-T05
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M04-T05 Token issuance, listing and revocation RPCs

## Correctness

The verify line — the plaintext never appears in a list response — holds, and
holds for a structural reason rather than a diligent one: `AgentToken` has no
plaintext field and no hash field on the wire at all, so neither can leak by
being forgotten in a mapping function. Confirmed by injection: adding
`tokenHash` to the response shape turns the suite red.

Eighteen tests. The ones that carry weight are the two secret-handling
assertions (the stored row does not contain the plaintext; the list response
contains neither plaintext nor hash), the cross-org pair, and the round trip —
the token `createAgentToken` returns actually authenticates through
`resolveAgentToken`, which is what makes the rest of the suite about a real
credential rather than a string.

```yaml
- file: apps/backend/src/modules/agents/agents.handler.ts
  line: 0
  severity: medium
  comment: >
    expiresInDays: 0 is read as "unset" rather than refused, and that is forced
    by the wire format rather than chosen. A proto3 int32 has no field presence,
    so a client that omits the field sends 0 — refusing 0 would refuse every
    caller who did not set an expiry. The test asserting 0 is rejected was
    written before this was noticed and was wrong; it now asserts the default is
    applied, with the reason in the test body. The alternative, `optional int32`,
    would give real presence and is worth taking if this field ever needs to
    express "zero days" as distinct from "unspecified". It does not today.

- file: apps/backend/src/modules/agents/agents.handler.ts
  line: 0
  severity: low
  comment: >
    revokeAgentToken answers NotFound for a token id that does not exist, before
    any authorization check runs. That is the right order for not leaking
    existence, but it meant the viewer sweep was passing for the wrong reason —
    it asserted a viewer cannot revoke a token *nobody has*. The fixture now
    seeds a real token in the viewer's own org so the assertion exercises
    authorization. The behaviour was correct; the proof was not.
```

## Test coverage

No test plan was written for this task — the behaviour is stateable in one line
per case and the suite is the record. What is covered: issuance (plaintext once,
hash stored, round-trip authentication, default and explicit expiry, the 365-day
cap, the closed scope vocabulary, empty scopes), listing (no secrets, expiry
computed server-side, revoked tokens still listed), and revocation (takes effect
next call, does not touch siblings, cross-org refused, unknown is NotFound).
Every one of the three RPCs has an admin-only case.

The gap worth naming: there is no test that two tokens for the same agent
receive different secrets. `mintToken` is covered for that in
`agentToken.test.ts`, so it is tested one layer down rather than untested.

## Architectural drift

Matches ADR-0008 on every point it touches: SHA-256 hashing, 90-day default and
365-day maximum, closed eight-scope vocabulary, `tskr_` prefix, plaintext
returned once. `AGENT_SCOPES` is the single source for the vocabulary and the
Zod enum is derived from it, so the contract and the validation cannot drift
apart.

The `orgId` on the wire message is read from the token row, not from the agent,
which is what M04-T02 stored it for.

```yaml
- file: apps/backend/src/lib/scopes.ts
  line: 24
  severity: low
  comment: >
    AgentScope and isAgentScope were written and then removed: knip fails the
    build on an export nothing imports, and their consumer is M04-T07. Recorded
    here so the next reader does not think the omission is an oversight. This is
    the third time this milestone that knip has caught something written one
    task ahead of its caller — the gate is doing exactly what it should.
```

## Security

`createAgentToken`, `listAgentTokens` and `revokeAgentToken` are all
`assertOrgAdmin`. Three separate cross-tenant cases pass: an admin of another
org cannot mint against this agent, cannot revoke this org's token by naming its
id, and a plain member can do neither.

`revokeAgentToken` scopes from the token row's own `orgId` rather than from
anything the caller sent — the same defect class M03-T12 fixed in
`revokeInvitation`, avoided here by construction.

```yaml
- file: apps/backend/src/modules/agents/agents.handler.ts
  line: 0
  severity: medium
  comment: >
    Validation failures leave the handler as ZodError, not ConnectError, so
    ConnectRPC maps them to `internal` — an agent presenting a malformed request
    is told the server broke. `invalid_argument` is the correct code and the
    difference is behavioural for an autonomous caller: one is worth retrying,
    the other is not. This is pre-existing and repository-wide (every handler
    calls Schema.parse directly), not introduced here, so fixing it inside this
    task would mean changing error semantics for every RPC in the product on the
    way past. Flagged for M04-T12, which reviews this surface, with M12 as the
    fallback owner.

- file: apps/backend/src/lib/viewer-denial.test.ts
  line: 0
  severity: low
  comment: >
    listAgentTokens is a read that is deliberately NOT on the viewer allowlist.
    Who holds a credential, its prefix and when it was last used is
    administrative information — a viewer learning that a token exists and was
    used an hour ago learns something about the organization's automation they
    have no standing to know.
```

## Verdict

**Approved.** Two mediums, both recorded rather than silently accepted: the
proto3 presence constraint on `expiresInDays` (documented in the test that
originally got it wrong) and the repository-wide ZodError mapping (pre-existing,
handed to T12). Three lows.
