---
id: ADR-0015
status: accepted
date: 2026-08-18
milestone: M21
---

# Agent tokens gain `memory:read`/`memory:write`; no `memory:admin` scope exists for agents

## Context

ADR-0008 (M04) gave agent tokens a fixed, closed set of eight
`<family>:<verb>` scopes and explicitly excluded organization
administration from all of them categorically — "no scope grants
organization administration... This is the decision most likely to be
argued with later; reversing it means adding a scope *and* re-reading
this paragraph." ADR-0013 (M10) kept agent-token scopes as a separate,
deliberately unconverged system from human `grants`/`can()`, resolved
through `authorizePrincipal`'s existing branch on `principal.kind`.

M21's belief system is explicitly meant to be written to and read from by
agents — that's the "help agents share memory" half of the feature. An
agent's own token, not a human's session, needs to reach `recordBelief`/
`searchBeliefs`/etc. Per ADR-0008, an RPC with no scope mapped to it is
denied to token principals by default (M03's deny-by-default sweep), so
this needs an explicit decision, not silence.

## Options

**Add exactly two new scopes, `memory:read` and `memory:write`, to the
closed vocabulary; no `memory:admin` scope exists for agents at all**
(chosen). `memory:read` maps to `getBelief`/`listBeliefs`/
`searchBeliefs`; `memory:write` maps to `recordBelief`/`updateBelief`/
`supersedeBelief`/`relateBeliefs`/`unrelateBeliefs`/`archiveBelief`/
`restoreBelief`. `promoteBelief` and `purgeBelief` are not mapped to any
agent scope — they're denied to token principals categorically, the same
absence-means-denial rule ADR-0008 already established for
`assignTask`/`OrgService`/token issuance/etc.

**Fold memory access into an existing scope (e.g. `tasks:write`)**
(rejected). ADR-0013 itself rejected this same move for `comment`/
`label`/`search`/`dashboard` in the *human* permission vocabulary,
reasoning that borrowed scope makes custom access control misleading — a
role or token that appears to grant task access would silently also
grant memory access, with no way to separate them later without breaking
whoever already depends on the coupling.

**Add a single `memory` scope covering read, write, and promote**
(rejected) — the same reasoning ADR-0008 already used to reject "a single
`agent` scope": a credential that can do everything a human admin could
do with beliefs is not scoped. Promotion changes a belief's visibility
across the org's structure (project → team → org); that's an
administrative, trust-elevating action in exactly the sense ADR-0008's
"no scope grants organization administration" was written to exclude.

**Give agents a `memory:admin` scope too, symmetric with the human
`memory:admin` permission** (rejected). The feature's own framing is that
promotion is fundamentally a *human* decision — "ensure human can see
relevant facts... or promote them" — an agent proposing something worth
promoting is exactly the case the capture-belief skill (see
`.agents/skills/capture-belief/SKILL.md`) is meant to hand off to a human
reviewer, not to resolve autonomously. This also matches ADR-0008's own
warning almost exactly: an agent that could promote (elevate visibility
across scope boundaries) is one step from the same "escalate out of every
other limit" concern that excluded org administration from every
existing scope.

## Decision

The agent-token scope vocabulary (ADR-0008) grows from eight to ten
entries: `memory:read`, `memory:write`. No `memory:admin` scope exists
for token principals, in any form; `promoteBelief` and `purgeBelief` are
unreachable by an agent token regardless of what scopes it holds, the
same categorical-exclusion pattern already applied to `OrgService`/
`AuthService`/token issuance.

## Consequences

**Easier.** An agent can capture what it learns and search what's
already known without a human minting it a broader credential than it
needs — the whole point of ADR-0008's scoped-token design in the first
place. The mapping test that already enumerates every RPC's required
scope (ADR-0008 §3, "the test that enumerates the mapping fails the
build until they do") extends naturally to the four new `MemoryService`
methods gated by these two scopes.

**Harder.** None beyond what ADR-0008 already accepted — two more rows in
a table that was already designed to grow.

**Foreclosed, for now.** An agent autonomously promoting a belief's
scope. Nothing here prevents adding a `memory:admin` agent scope later if
a concrete, argued need appears — but per ADR-0008's own note on
reversing its org-administration exclusion, doing so means adding the
scope *and* re-reading why it wasn't there.
