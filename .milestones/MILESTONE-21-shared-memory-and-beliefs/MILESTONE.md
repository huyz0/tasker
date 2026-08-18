---
id: M21
title: Shared Memory & Belief System
status: in-progress
goal: Agents and humans can record project/org-scoped facts with full provenance, find them by search rather than by paging, and promote them across the existing organization/team/project scope hierarchy with an auditable trail of who promoted what and when.
depends_on: []
surfaces: [backend, gui, cli, contract, specs]
exit_criteria_met: false
started_at: 2026-08-18
completed_at: null
---

# M21 — Shared Memory & Belief System

## 1. Goal

An agent working a task can record what it learned — a convention, a
gotcha, a decision and its why — as a `Belief` scoped to the project it's
working in, and any other agent or human with read access to that scope
can find it by searching, not by paging through a list. Every belief
carries who or what asserted it, when, and (if it was ever promoted to a
broader scope) who promoted it and when — a full, queryable provenance
and audit trail, reusing the organization/team/project scope hierarchy
ADR-0013 already built rather than inventing a new one.

## 2. Why Now

Requested directly by the user via `/goal` (2026-08-18), as the next
capability after four consecutive feature-deep-review rounds (M17–M20)
closed out Agents/Artifacts/Tasks/Projects. Two rounds of research
(internal architecture mapping + external prior art on agent-memory
systems) and an interactive design review are complete — see
`.specs/specs/2026-08-18-1622-shared-memory-and-beliefs/` and
`ADR-0014`/`ADR-0015`/`ADR-0016`. No formal dependency on any `todo`
milestone (M08/M09/M11/M12); sequenced here by explicit user priority,
the same way M13 was sequenced ahead of M10 in `roadmap.md`'s own
precedent for priority-not-dependency ordering.

## 3. Exit Criteria

- [ ] An agent authenticated with a token holding `memory:write` can
      record a belief via `recordBelief`/`tasker memory record`, and it
      is visible to `searchBeliefs`/`tasker memory search` within its
      project scope immediately after.
- [ ] An agent token holding neither `memory:read` nor `memory:write` is
      denied `PermissionDenied` on both RPCs — proving the RBAC/scope
      gating (ADR-0014, ADR-0015) is enforced, not merely modeled.
- [ ] A human can find a belief through the GUI's Memory screen search
      box and through `tasker memory search`, both returning the same
      ranked-result shape `universalSearch` already provides for other
      entity types (ADR-0016's `LexicalBeliefRetriever`/`belief`
      `SearchEntity`).
- [ ] A human holding `memory:admin` can promote a belief from `project`
      scope to `organization` scope via `promoteBelief`/the GUI's
      Promote action; the resulting `BeliefPromotion` row (who, from,
      to, when) is visible in the belief's history view.
- [ ] Superseding a belief (`supersedeBelief`) marks the original
      `status: superseded`; it no longer appears in default
      `searchBeliefs` results but remains reachable via `getBelief` or
      `listBeliefs` with an explicit `status` filter.
- [ ] `.agents/skills/capture-belief/SKILL.md` exists and, followed
      literally, produces a correct `tasker memory record` invocation
      for a worked example.
- [ ] `moon check --all` is clean (27/27) with the new module included;
      the 95% coverage gate holds on every new file.

## 4. Scope

**In Scope**: `MemoryService` contract (`Belief`/`BeliefRelation`/
`BeliefPromotion`); `memory:{read,write,admin}` permission family added
to ADR-0013's vocabulary; `memory:read`/`memory:write` added to the
agent-token scope vocabulary (ADR-0008); `beliefs`/`belief_relations`/
`belief_promotions` schema + migrations on both dialects; the backend
handler (record/get/list/update/supersede/promote/relate/archive/
restore/purge/search); `belief` as a sixth `SearchEntity` in
`search.handler.ts`; a search-first `features/Memory/` GUI screen; a
`tasker memory` CLI command tree; the `capture-belief` agent skill and
`docs/agent-integration.md` updates; a `Belief.embedding` column
(unindexed, caller-supplied-only) so nothing needs backfilling later.

**Out of Scope**: any vector store or embedding-model integration
(`VectorBeliefRetriever` — ADR-0016 documents the design, a future
milestone builds it against measured evidence); any hosted LLM/embedding
API dependency; a server-side automatic belief-extraction worker
(subscribing to `domain.task.updated` etc. — ADR-0016/shape.md's
"explicitly out of scope" note, needs its own future ADR); any
`AgentSkill` product entity or capability registry (confirmed with the
user that "agent skill" means a markdown playbook, not a new data
model); a fourth ("agent-private") scope tier below `project`
(ADR-0014).

## 5. Task Breakdown

- [x] **M21-T01** — Save spec documentation: `.specs/specs/2026-08-18-
      1622-shared-memory-and-beliefs/`, `ADR-0014`/`ADR-0015`/`ADR-0016`,
      this `MILESTONE.md` and `PROGRESS.md`. No product code.
      - Files: `.specs/specs/2026-08-18-1622-shared-memory-and-beliefs/*`,
        `.specs/adr/ADR-0014-*.md`, `.specs/adr/ADR-0015-*.md`,
        `.specs/adr/ADR-0016-*.md`,
        `.milestones/MILESTONE-21-shared-memory-and-beliefs/*`
      - Verify: files exist, `moon run tasker:docs-lint` passes.

- [x] **M21-T02** — Add `MemoryService` and `Belief`/`BeliefRelation`/
      `BeliefPromotion` models to the TypeSpec contract; regenerate
      `health.proto` and the generated TS/Go clients.
      - Files: `packages/shared-contract/main.tsp`,
        `packages/shared-contract/tasker/health/v1/health.proto`,
        generated `health_pb.ts`/`health.pb.go`
      - Verify: `moon run shared-contract:compile` succeeds; generated
        types include `MemoryService` and all three models.

- [x] **M21-T03** — Add `memory:{read,write,admin}` permissions to the
      seeded human permission vocabulary/system roles (ADR-0014); add
      `memory:read`/`memory:write` to `AGENT_SCOPES`, the agent-token
      scope vocabulary (ADR-0015). Per-RPC `AGENT_RPC_SCOPES` mapping and
      `agent-scope-sweep.test.ts` wiring move to T05 - that sweep
      instantiates the real handler against real seeded data, so it can
      only be written once the handler exists.
      - Files: `apps/backend/drizzle-sqlite/0041_seed_memory_permissions.sql`,
        `apps/backend/drizzle-mysql/0028_seed_memory_permissions.sql`,
        `apps/backend/src/lib/scopes.ts`
      - Verify: migration verified against live MySQL; `AGENT_SCOPES`
        includes the two new entries.

- [x] **M21-T04** — Add `beliefs`/`belief_relations`/`belief_promotions`
      tables plus `beliefs_fts` (SQLite FTS5) / `FULLTEXT` index
      (MySQL), both dialects, with paired numbered migrations.
      - Files: `apps/backend/src/db/schema.sqlite.ts`,
        `apps/backend/src/db/schema.mysql.ts`,
        `apps/backend/drizzle-sqlite/0042_beliefs_schema.sql`,
        `apps/backend/drizzle-mysql/0029_beliefs_schema.sql`, both
        `meta/_journal.json` files
      - Verify: migrations verified against a live MySQL instance via
        `docker compose up -d mysql` + integration test run; both
        migrations hand-written (not `drizzle-kit generate`d) after the
        SQLite generator produced a corrupted migration against the
        known-drifted snapshot lineage. New schema exports are
        `@knipignore`d until `memory.handler.ts` (M21-T05) references
        them.

- [ ] **M21-T05** — Implement `memory.handler.ts`: `recordBelief`,
      `getBelief`, `listBeliefs`, `searchBeliefs`, `updateBelief`,
      `supersedeBelief`, `promoteBelief`, `relateBeliefs`/
      `unrelateBeliefs`, `listBeliefRelations`, `listBeliefPromotions`,
      `archiveBelief`/`restoreBelief`/`purgeBelief`, each with a Zod
      schema, `assertCan`/`authorizePrincipal`, and `publishDomainEvent`.
      Also add the `memory` entry to `AGENT_RPC_SCOPES` (deferred from
      T03 - see its note) mapping every method except `promoteBelief`/
      `purgeBelief` to `memory:read`/`memory:write` per ADR-0015, and
      wire `memory` into `agent-scope-sweep.test.ts`'s `handlers`/
      `REQUESTS`.
      - Files: `apps/backend/src/modules/memory/memory.handler.ts`,
        `apps/backend/src/modules/memory/memory.test.ts`,
        `apps/backend/src/lib/scopes.ts`,
        `apps/backend/src/lib/agent-scope-sweep.test.ts`
      - Verify: `moon run backend:test`, coverage gate held;
        `agent-scope-sweep.test.ts` fails until `memory` is classified,
        then passes once it is.

- [ ] **M21-T06** — Add `belief` as a sixth `SearchEntity` in
      `search.handler.ts`, backed by the `LexicalBeliefRetriever`.
      - Files: `apps/backend/src/modules/search/search.handler.ts`
      - Verify: `universalSearch` returns belief matches merged with
        the other five entity types; `bun run measure:latency` stays
        within budget after the new index is added.

- [ ] **M21-T07** — Build the search-first `apps/gui/src/features/
      Memory/` screen: query box, belief cards with provenance/status/
      confidence, related-beliefs list, Promote action via
      `ConfirmDialog`, a history tab, and a separate "Browse all" view.
      - Files: `apps/gui/src/features/Memory/index.tsx` + `.test.tsx` +
        `.stories.tsx`
      - Verify: `moon run gui:test`, Storybook stories for Empty/
        Loading/Error/Populated, `jest-axe` clean.

- [ ] **M21-T08** — Build `apps/cli/cmd/memory.go`: `tasker memory
      search/record/get/list/update/supersede/promote/relate/archive/
      restore/purge`, `--json` parity, proto3-optional flags via
      `cmd.Flags().Changed()`.
      - Files: `apps/cli/cmd/memory.go`, `apps/cli/cmd/memory_test.go`
      - Verify: `go test ./cmd/...`, `moon run cli:coverage`.

- [ ] **M21-T09** — Write `.agents/skills/capture-belief/SKILL.md` and
      update `docs/agent-integration.md` with the same guidance for
      non-Claude agents.
      - Files: `.agents/skills/capture-belief/SKILL.md`,
        `docs/agent-integration.md`
      - Verify: `moon run tasker:docs-lint`; a worked example in the
        skill produces a correct CLI invocation when followed literally.

- [ ] **M21-T10** — Backfill remaining test coverage; run the full
      milestone verification suite.
      - Files: any file left under the 95% gate after M21-T02–T09
      - Verify: `moon check --all` (27/27).

## 6. Verification

```bash
docker compose up -d mysql nats
moon run shared-contract:compile
moon check --all
cd apps/backend && bun run seed -- --scale large && bun run measure:latency
```

## 7. Risks

- **Retrieval scope creep.** The temptation to build the vector-store
  phase (ADR-0016) alongside v1 "since it's already designed" — resist
  it; no evidence yet justifies the new dependency, and the interface
  boundary exists specifically so it's addable later without a rewrite.
- **`beliefs_fts` join-plan regression.** `search.handler.ts`'s own
  history includes a 58ms→368s regression from an unrelated index
  inverting SQLite's join plan (`api-standard.md` §6) — re-run
  `bun run measure:latency` after M21-T04 and M21-T06, not just at the
  end.
- **Scope-tier pressure.** If, during implementation, a genuine need for
  agent-private (pre-project-visible) memory surfaces, do not quietly
  add a fourth scope tier mid-milestone — it's a new ADR superseding
  ADR-0014, not a schema tweak.
