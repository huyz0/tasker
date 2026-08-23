---
id: ADR-0023
status: accepted
date: 2026-08-23
milestone: M26
---

# An agent reads the live event feed under its own scope, filtered per subject

## Context

`EventService.subscribeEvents` (M08-T07) accepts an agent principal and, at
`events.handler.ts:52`, returns that token's organization as its authorized
set. The agent branch is deliberate — its own doc comment explains that
"an agent's answer is its token: ADR-0008 binds a token to exactly one org."
M08 meant for agents to be able to subscribe.

What was never done is gating it. `events` appears in neither
`AGENT_RPC_SCOPES` nor `agent-scope-sweep.test.ts`'s handler map, and
`subscribeEvents` calls `requirePrincipal` rather than `authorizePrincipal`.
The result: **any valid agent token opens its organization's entire live
feed** regardless of which scopes it holds. A token issued with only
`agents:read` receives every subject the organization emits.

Worth stating precisely, because it bounds the severity: the wire message is
deliberately thin — `{subject, orgId, projectId, occurredAt}` and nothing
else (`main.tsp`'s `DomainEventMessage`, whose own note explains that
"carrying the full payload would put every field's authorization rules on
this stream too"). So an unscoped token does **not** read task titles or
comment bodies. What it learns is activity metadata: which kinds of thing
happen, in which project, and when — a work-rate and project-structure
side channel, not a content leak. That is a real defect and a smaller one
than "sees everything", and the fix is the same either way.

This also falsifies a documented guarantee. `scopes.ts:38` states
*"Absence means denial. A method not listed here cannot be called with a
token at all… `agent-scope-sweep.test.ts` enumerates every method on every
handler and fails naming any that is neither listed nor refusing an agent."*
The sweep enumerates every method on every **listed** handler, and its list is
hand-maintained. Four of twenty-one registered services are missing from it;
three (`teams`, `roles`, `audit`) call `requireUser` throughout and are
therefore safe by construction, and `events` is the one that is not.

## Options

**A. Close the feed to agents entirely** — switch `requirePrincipal` to
`requireUser`, as `reports` and `dashboard` already do. Simplest, and nothing
consumes the feed as an agent today (there is no CLI command for it). But it
reverses a deliberate M08 design decision on the strength of a bug in its
enforcement rather than a problem with the idea, and it forecloses the
push-based agent integration the product's own mission argues for — agents
currently have no option but to poll.

**B. Reuse an existing broad scope**, e.g. require `tasks:read`. No new
vocabulary, but it lies: the feed carries artifact, belief, project and agent
events too, so `tasks:read` would grant visibility far beyond tasks. A scope
whose name misdescribes what it grants is worse than a coarse one.

**C. One new feed-wide scope, no filtering.** Add `events:read`; holding it
opens the whole org feed. Honest about being coarse, and consistent with
ADR-0008's deliberately small vocabulary. But it re-creates the same problem
one layer up: an operator granting "may watch the feed" cannot also say "…but
only the parts you can already read," so `events:read` silently becomes the
most powerful scope in the vocabulary.

**D. A new scope to open the feed, plus per-subject filtering against the
token's other scopes.** Costs one scope and one pure-function change:
`eventScope.ts`'s `shouldDeliver` is already the per-message choke point, is
already pure, and is already unit-tested without a broker or a socket.

## Decision

Take **D**. Add `events:read` to `AGENT_SCOPES`; require it in
`subscribeEvents`; and in `shouldDeliver`, drop any event whose subject family
the token's remaining scopes would not have let it read through an ordinary
RPC.

The governing rule is one sentence: **an agent may see an event on the feed
only where its scopes would have permitted the equivalent read.** The mapping
is therefore not invented here — it is read off `AGENT_RPC_SCOPES`' existing
read methods, so the feed and the request path cannot drift into disagreeing
about what a token may see:

| Subject family | Scope | Mirrors |
|---|---|---|
| `task`, `task_type`, `task_status`, `task_statuses`, `task_status_transition`, `tasknote`, `comment` | `tasks:read` | `listTasks`, `listTaskTypes`, `listTaskNotes`, `listComments` |
| `artifact`, `folder` | `artifacts:read` | `listArtifacts`, `listFolders` |
| `project`, `project_template`, `label` | `projects:read` | `listProjects`, `listTemplates`, `listLabels` |
| `agent`, `agent_role` | `agents:read` | `listAgents`, `listAgentRoles` |
| `belief` | `memory:read` | `listBeliefs` |
| `repository` | `repos:read` | `listRepositoryLinks` |
| `org`, `team`, `role`, `grant`, `retention` | — none exists — | never delivered to an agent |

One carve-out inside a family, because the governing rule is stated
absolutely and family granularity would otherwise break it:
`domain.agent.token_created` and `domain.agent.token_revoked` are **never**
delivered to an agent, even one holding `agents:read`. Token issuance is a
categorical exclusion in `scopes.ts` — `listAgentTokens` is deliberately
absent from `AGENT_RPC_SCOPES` — so admitting those two subjects under the
`agent` family would grant, via the feed, exactly the visibility the request
path refuses.

The last row is the important one: organization, team, role and grant
administration has no agent read scope *anywhere* in the vocabulary, by
ADR-0008's own categorical exclusion. Those events are therefore unreachable
by any token regardless of what it holds, which is the same answer the
request path already gives.

Human sessions are untouched. The filter applies only to agent principals;
a signed-in user's feed keeps resolving through organization membership
exactly as M08 built it.

## Consequences

Easier: the feed stops being a hole in the scope model, and an operator can
issue a genuinely narrow watching token. The sweep's stated guarantee becomes
true rather than aspirational — M26-T03 additionally makes its handler map
assert coverage of every service registered in `index.ts`, so the omission
that caused this cannot recur silently for the next handler.

Harder: a new subject family now needs a line in the map, or it is invisible
to every agent. That failure mode is deliberate and is the safe direction —
absence means denial here too, consistent with the rest of `scopes.ts`.

Costs: one scope added to a vocabulary ADR-0008 deliberately keeps small,
justified because it grants a genuinely new capability (a live stream) rather
than subdividing an existing one. Existing tokens do not gain it — a token
issued before this lands holds no `events:read` and is refused, which is the
correct default for a capability that was never intentionally granted.

Foreclosed: per-*project* feed filtering by grant, and delivering partial
event payloads (e.g. a task id without its title). Both are finer-grained than
the token vocabulary can currently express; M10's policy model is where that
belongs if it is ever wanted.
