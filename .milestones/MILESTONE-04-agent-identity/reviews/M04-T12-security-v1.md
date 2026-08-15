---
task: M04-T12
version: v1
timestamp: 2026-08-15
decision: approved
---

# Security review — M04 Agent Identity & M2M Tokens

The task names `/security-review`. **No such skill exists** — the harness has 16
skills and that is not one of them, so the plan named a command that was never
written. The review was performed directly against `security-standard.md` and
the security lens in `references/heavy-task.md`. Recorded here rather than
quietly substituted.

The review was adversarial rather than a summary: each area below was probed by
writing a test that *should* fail if the property does not hold, and running it.
Two real defects were found that way, both fixed in this task.

## Findings

```yaml
- file: apps/backend/src/modules/agents/agents.handler.ts
  line: 0
  severity: critical
  comment: >
    A purged agent's tokens kept authenticating. purgeAgent deleted the agent
    row but never touched api_tokens, and resolveAgentToken LEFT JOINs agents to
    check deletedAt - with the agent row gone the join yields NULL, the
    deleted-agent branch does not fire, and the credential resolves normally.
    The agent is absent from every screen, every list and every query, and its
    token still works. Found by asking what happens to a credential when the
    identity it stands for stops existing, then writing the test. purgeAgent now
    deletes the agent's tokens first; token-purge.test.ts holds it, and also
    holds that archive kills the token and restore brings it back, so "move to
    bin, change your mind" does not silently break an integration.

- file: apps/backend/src/lib/rateLimit.ts
  line: 0
  severity: high
  comment: >
    The bucket map was unbounded and reachable pre-authentication. The limiter
    keys on the presented token's hash before any lookup - it must, because
    resolving a token id means the database query it exists to protect - so
    anyone can create a bucket by sending a random tskr_ string, with no
    credential at all. Idle eviction ran on a 10-minute sweep, which a flood
    outruns. Now bounded by maxBuckets (10,000). The eviction order matters more
    than the bound: LRU is wrong here, because during a flood the genuine
    credential is by definition the least recently used, so LRU evicts exactly
    the bucket worth keeping and hands its holder a fresh allowance. It now
    evicts the least *constrained* buckets first - dropping a nearly-full bucket
    loses almost nothing, dropping a nearly-empty one discards the limit being
    enforced.

- file: apps/backend/src/modules/search/search.handler.ts
  line: 0
  severity: medium
  comment: >
    universalSearch was absent from both the agent scope sweep and M03's viewer
    sweep, because createSearchHandler registers onto a ConnectRouter instead of
    returning a handler object, so neither sweep's handler map included it. It
    is closed to agents today only because it still calls requireUser - nothing
    would have caught a future migration, and search reads across tasks and
    artifacts in an organization. Both sweeps now cover it, recovered from a stub
    router, and the coverage was proven by injection: removing its authorization
    turns the sweep red.

- file: apps/backend/src/lib/requestLogging.ts
  line: 0
  severity: medium
  comment: >
    Agent traffic is unattributed in the logs. requestLogging binds userId into
    the request context via resolveSessionUserId, which returns null for an
    agent token, so every log line for an agent request carries userId: null and
    nothing else identifying. The credential itself is correctly never logged -
    the header is read but not recorded - so this is an observability gap rather
    than a leak, but "which agent did this" is unanswerable from the logs today.
    M11 owns observability; noted there rather than fixed here, because the fix
    is a change to the logging context shape that M11 should design once.

- file: apps/backend/src/modules/tasks/tasks.handler.ts
  line: 0
  severity: low
  comment: >
    Carried forward from M04-T07: createTask stamps createdBy null for an agent,
    because the column references users.id. Which agent created a task is not
    recoverable from the row. M08 owns audit persistence.
```

## What was probed and held

**Secret handling.** The plaintext exists in exactly one response and is never
stored, logged or re-derivable. `AgentToken` has no plaintext and no hash field
on the wire at all, so a mapping function cannot leak one by omission — proven
by injection in T05. The stored value is SHA-256; the displayed prefix is 6
characters of a 43-character base64url secret, leaving ~220 bits unrevealed.

**Authentication.** A revoked token fails on the next request with no restart,
verified live. An expired one fails at the instant of expiry, not the day. A
forged `tskr_` string resolves to nothing. A bad agent token accompanied by a
valid session cookie does **not** downgrade to the human — and after the first
test of that proved nothing (it passed with the guard removed), a second test
now pins the header-precedence that makes it true.

**Authorization.** Three independent axes, none of which silently widens if
another is removed: the token's organization, its scopes, and the map of which
RPCs accept tokens at all. Unmapped methods refuse a token holding all eight
scopes; mapped methods refuse a token holding all eight *except* the one they
name. `orgs`, `auth` and `search` are refused entirely. Cross-organization
access fails even with correct scopes.

**Tenancy.** `revokeAgentToken` scopes from the token row's own `orgId`, never
from the request — the defect class M03-T12 fixed in `revokeInvitation`. An
admin of another organization cannot mint against, list, or revoke this
organization's credentials.

**Privilege escalation.** No scope grants organization administration, and token
issuance is refused to agents categorically rather than by omitting a scope. An
agent cannot mint itself a wider credential, add members, change roles, or
assign work to itself.

**Injection.** No new SQL string interpolation. Scope values are validated
against a closed enum at creation; a malformed stored `scopes` value parses to
an empty array rather than throwing, so a corrupt row grants nothing instead of
taking the process down.

## Not resolved, and why

`ZodError` propagating as `internal` rather than `invalid_argument` (raised in
T05) is unfixed. It is repository-wide — every handler calls `Schema.parse`
directly — so correcting it means changing error semantics for every RPC in the
product, which is not a change to make inside a security review of one
milestone. **M12** owns it.

## Verdict

**Approved, with the two defects fixed rather than filed.** One critical (purged
agents' tokens surviving) and one high (unbounded pre-auth bucket map) were
found by this review and are closed, with tests that fail without the fix. Two
mediums are recorded and assigned — one closed as a gate gap, one handed to M11.
No open criticals, which is the task's exit condition.
