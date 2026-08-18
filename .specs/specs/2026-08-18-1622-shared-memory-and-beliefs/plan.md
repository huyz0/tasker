# Shared Memory & Belief System — Plan

## Task 1 (this document) — Save spec documentation

Write this spec folder (`shape.md`, `standards.md`, `references.md`,
`plan.md`), three ADRs (`ADR-0014`, `ADR-0015`, `ADR-0016` in
`.specs/adr/`), and the formal milestone spec
(`.milestones/MILESTONE-21-shared-memory-and-beliefs/MILESTONE.md` +
`PROGRESS.md`). No product code changes in this task.

## Tasks 2 onward — tracked in `MILESTONE-21`, not duplicated here

Per `milestone-standard.md`, `MILESTONE.md`'s own Task Breakdown section
(with stable `M21-T<NN>` ids, `Files:`, and `Verify:` per task) is the
single source of truth for what remains, so it doesn't drift out of sync
with a second copy kept here. Summary, for orientation:

- **M21-T02** — Contract: `MemoryService` + `Belief`/`BeliefRelation`/
  `BeliefPromotion` models.
- **M21-T03** — RBAC: `memory:{read,write,admin}` permission family +
  `memory:read`/`memory:write` agent-token scopes (ADR-0014, ADR-0015).
- **M21-T04** — Schema + migrations, both dialects, verified against
  live MySQL.
- **M21-T05** — Backend handler (`memory.handler.ts`).
- **M21-T06** — Search integration: `belief` as a sixth `SearchEntity`
  (ADR-0016).
- **M21-T07** — GUI: search-first `features/Memory/` screen.
- **M21-T08** — CLI: `cmd/memory.go`.
- **M21-T09** — Agent skill + docs (`.agents/skills/capture-belief/
  SKILL.md`, `docs/agent-integration.md`).
- **M21-T10** — Test coverage backfill + final `moon check --all` pass.

Each executes one at a time, one commit per task, in the discipline this
repo has used for every milestone so far: dedicated test per change,
revert-and-confirm-fail for anything nontrivial, full backend/GUI/CLI
suites plus `moon check --all` clean before commit, migrations verified
against a live MySQL instance.

## Where the design lives

The full design (data model, API surface, retrieval architecture,
capture flow, GUI, CLI) is recorded in `shape.md`'s Decisions section and
in the three ADRs — not restated here, to keep one place authoritative
per decision rather than three slightly-different summaries drifting
apart over the milestone's lifetime.
