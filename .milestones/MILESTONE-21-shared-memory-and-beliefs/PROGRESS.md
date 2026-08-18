# M21 Progress Journal

## M21-T01 — Save spec documentation

- **Status**: done
- **Date**: 2026-08-18
- **Changed**: `.specs/specs/2026-08-18-1622-shared-memory-and-beliefs/`
  (`shape.md`, `standards.md`, `references.md`, `plan.md`),
  `.specs/adr/ADR-0014-memory-reuses-the-existing-scope-hierarchy.md`,
  `.specs/adr/ADR-0015-agent-tokens-gain-memory-read-write-scopes.md`,
  `.specs/adr/ADR-0016-belief-retrieval-is-pluggable-lexical-by-default.md`,
  `.milestones/MILESTONE-21-shared-memory-and-beliefs/MILESTONE.md`,
  this file.
- **Verified**: All files written per `milestone-standard.md` and
  `spec-shape`'s documented output format; `.specs/adr/README.md`'s ADR
  format followed (frontmatter + Context/Options/Decision/Consequences,
  one real alternative and consequence per file). `moon run tasker:
  docs-lint` run against the new files.
- **Notes**: Design was shaped interactively in plan mode across several
  rounds with the user before this task started — three follow-up
  questions materially changed the design from the first draft: (1)
  "agent skill" was confirmed to mean a markdown CLI-usage playbook, not
  a new product/data-model concept, which removed an entire speculative
  subsystem from scope; (2) `searchBeliefs` was elevated from "an
  agent-facing convenience RPC" to the primary read path for both agents
  and the GUI, with `listBeliefs`/`getBelief` demoted to secondary/admin
  endpoints; (3) the vector-retrieval question went through three
  iterations — "do we need one at all" → "who generates embeddings" →
  "can we use a cheap embedded LLM" — landing on a concrete, currently-
  researched (not training-data-guessed) recommendation: LanceDB
  (embedded, no server) + a local in-process embedding model
  (EmbeddingGemma-300M/Nomic Embed v2 via `transformers.js`), documented
  in ADR-0016 but explicitly not built in this milestone. All three
  ADRs were written to capture a real alternative and consequence each,
  per `.specs/adr/README.md`'s own bar for when a decision earns one.
- **Next**: M21-T02 — add `MemoryService` and the three models to
  `packages/shared-contract/main.tsp`.
