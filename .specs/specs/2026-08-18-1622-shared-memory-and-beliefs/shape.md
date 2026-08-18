# Shared Memory & Belief System — Shaping Notes

## Scope

A shared memory/belief system for tasker: agents and humans record
facts/beliefs scoped to a project or org, promotable to team/project/org,
with every entry traceable to who/what asserted it and when. Humans can
find, relate, and promote entries through a full audit trail. Agent-facing
capture happens through a markdown skill instructing the `tasker` CLI, not
a new skills subsystem.

New feature, no existing implementation. Comparable in size to M10
(RBAC/teams — 13 tasks); executed as a formal milestone
(`MILESTONE-21-shared-memory-and-beliefs`), not an ad-hoc review round.

## Decisions

- **Scope reuses ADR-0013's existing hierarchy** (`organization`/`team`/
  `project`) — no new "agent-private" tier. Capture writes at `project`
  scope; promotion moves project→team, project→org, team→org through the
  same `grants`/`can()` machinery every other resource uses. See
  ADR-0014.
- **Agent tokens gain two new scopes** (`memory:read`, `memory:write`),
  extending ADR-0008's closed eight-scope vocabulary to ten. No
  `memory:admin` scope for agents — promotion and purge stay human-gated.
  See ADR-0015.
- **`searchBeliefs` is the primary read path**, not `listBeliefs`/
  `getBelief` — a belief store is a knowledge base people query, not a
  table people page through. Used by both the agent capture-belief skill
  and the GUI's own search-first Memory screen.
- **Retrieval is pluggable, lexical by default.** `BeliefRetriever`
  interface; `LexicalBeliefRetriever` (reusing `search.handler.ts`'s
  proven FTS5/`bm25()`/InnoDB `FULLTEXT` machinery as a sixth
  `SearchEntity`) is the only implementation built in this milestone. No
  vector store, no embedding-model dependency ships now. See ADR-0016 for
  the full reasoning and the researched (not guessed) recommendation for
  a future vector phase: LanceDB (embedded, no server) + a local
  in-process embedding model (EmbeddingGemma-300M or Nomic Embed v2, via
  `transformers.js`) — not a hosted embedding API.
- **"Agent skill" = a markdown playbook, not a new product concept.**
  Confirmed with the user directly: `.agents/skills/capture-belief/
  SKILL.md`, this repo's own existing convention, instructing an agent
  when/how to call `tasker memory ...`. No `AgentSkill` entity, no
  capability registry — `AgentRole.capabilities` stays free-form prose.
- **Confidence, not a fact/belief ontology.** `Belief.confidence`
  ('low'|'medium'|'high') is the only epistemic distinction modeled — a
  "fact" is just a high-confidence belief. Avoids inventing a distinction
  the product hasn't asked for (same reasoning ADR-0013 used rejecting
  ABAC).
- **Server-side automatic LLM extraction is explicitly out of scope.**
  Capture is always an explicit CLI/RPC call. A background worker that
  proposes beliefs on its own (subscribing to `domain.task.updated` etc.)
  is a documented future idea, not built here — it would need tasker's
  first LLM-provider dependency and its own ADR.

## Context

- **Visuals:** None.
- **References:** `apps/backend/src/modules/projects/` and
  `apps/backend/src/modules/roles/` (module pattern), `apps/backend/src/
  modules/search/search.handler.ts` (retrieval infrastructure to extend),
  `apps/backend/src/lib/policy.ts`/`authz.ts` (RBAC entry points) — full
  detail in `references.md`.
- **Product alignment:** Directly extends the mission's "agents create/
  track/update work with minimal friction... humans stay off the loop by
  default" framing (`.specs/product/mission.md`) — a belief system is
  infrastructure for agents to hand context to each other and to humans
  without a human having to be present for every exchange. Not currently
  named in `roadmap.md` (which lists M01–M14); this milestone (M21) is
  additive to that list the same way M15–M20 were, sequenced after the
  currently-`todo` M08/M09/M11/M12 backlog by explicit user request
  rather than by a dependency edge.

## Standards Applied

- `.specs/standards/api-standard.md` — contract-first RPC, `PageRequest`/
  `PageResponse` pagination, `ConnectError` codes, per-handler
  authorization, latency budgets (150ms default for `list*`).
- `.specs/standards/security-standard.md` — Zod at the boundary, RBAC
  ownership verification (not just authentication), fail-closed by
  default.
- `.specs/standards/dependency-standard.md` — minimalism; directly
  informs ADR-0016's decision to ship zero new dependencies in v1.
- `.specs/standards/frontend-standard.md` — container/presentational
  split, TanStack Query for server state, mandatory Storybook stories for
  Empty/Loading/Error/Populated.
- `.specs/standards/testing-standard.md` — 95% coverage gate, TDD,
  co-located tests, unit-heavy with integration against real SQLite.
- `.specs/standards/milestone-standard.md` — governs `MILESTONE.md`/
  `PROGRESS.md` format and the one-commit-per-task protocol this
  milestone's execution follows.
