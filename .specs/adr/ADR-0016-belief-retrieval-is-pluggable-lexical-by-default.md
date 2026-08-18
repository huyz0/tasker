---
id: ADR-0016
status: accepted
date: 2026-08-18
milestone: M21
---

# Belief retrieval sits behind a pluggable interface; v1 ships lexical search only, no vector store or embedding-model dependency

## Context

M21's belief system needs a way to answer "what's relevant to X" —
`searchBeliefs` is the primary read path (see `MILESTONE-21`'s task
breakdown), used both by an agent skill deciding what's relevant to its
current task and by the GUI's own search-first Memory screen. The
question is what powers that ranking: keyword/lexical matching, or
semantic (embedding-based) similarity, and whether tasker's backend
should call an LLM/embedding provider at all.

Two facts from this repository's own history bound the decision:

1. `apps/backend/src/modules/search/search.handler.ts` already runs a
   real, production federated ranked search — FTS5+`bm25()` on SQLite,
   InnoDB `FULLTEXT` on MySQL, round-robin merged across entity types,
   bounded-offset cursor pagination (ADR-0010), server-computed snippet
   highlighting. This was built exactly because ADR-0002 deferred an
   index until "M07 measures real query latency against a realistic
   dataset" — the same "measure before you build" discipline applies
   here, and belief search should reuse this infrastructure as a sixth
   `SearchEntity`, not duplicate it.
2. Tasker previously depended on OpenSearch for search and deliberately
   dropped it (`.archive/epics/EPIC-0003-.../ADR-0001-database-search-
   abstraction.md`) so the standalone single-binary deployment needs no
   external service. Exhaustive grep across the product code finds zero
   existing embeddings/vector-search/LLM-provider integration anywhere —
   this would be the repository's first.

`AGENTS.md` requires justifying any new dependency. There is currently no
measured evidence that lexical search is insufficient for belief
retrieval — the feature has not shipped yet.

## Options

**Lexical-only retrieval as the sole, required v1 implementation, behind
a `BeliefRetriever` interface a future implementation can satisfy without
touching callers** (chosen). `searchBeliefs`'s handler calls
`BeliefRetriever.search(scope, query, opts)`; `LexicalBeliefRetriever`
wraps the same FTS5/`bm25()`/`FULLTEXT` machinery `search.handler.ts`
already runs, scoped to a new `beliefs`/`beliefs_fts` index, and also
serves as the `belief` `SearchEntity` for the human ⌘K palette — one
index, two callers. Zero new dependencies; identical behavior on both
dialects and both deployment modes.

**Build a vector store (LanceDB) and local embedding pipeline as part of
v1** (rejected for this milestone, not foreclosed — see below). Genuinely
useful, and researched in depth (see Consequences), but there is no
measured evidence yet that lexical search is insufficient, and building
it speculatively repeats exactly the mistake ADR-0002/0003 were written
to avoid: infrastructure investment ahead of a measured need.

**Depend on a hosted embedding API (OpenAI/Voyage/etc.)** (rejected,
permanently unless reversed by a future ADR). Would give tasker's backend
its first LLM-provider credential to manage, a network dependency on the
belief-write path, and a per-call cost, in *every* deployment that
enables the feature — not opt-in the way a pluggable local model or
vector store can be.

## What "pluggable" concretely means, for whoever builds the next phase

Researched against current (Aug 2026) tooling, not assumed:

- **Vector store, if built: LanceDB**, not Vespa or OpenSearch. LanceDB
  is embedded — a library linked into the process, like `bun:sqlite`, no
  server to run — the only one of the three that doesn't reintroduce the
  external-service dependency this repo's own architecture history
  (EPIC-0003) deliberately moved away from. Vespa has zero existing
  footprint in this repo; OpenSearch is exactly what was removed.
- **Who generates embeddings, if built: the backend itself, via a small
  local model run in-process — not a hosted API, and not caller-supplied
  only.** A caller-only design (an agent attaches its own embedding)
  cannot answer "what embeds a human's plain-text query typed into the
  GUI search box" — there's no embedding for a human to attach. A local
  model run by the backend can embed both stored belief text and incoming
  search queries, so semantic search would work for humans and agents
  alike, not just agents. Current candidates: **EmbeddingGemma-300M**
  (Google DeepMind, purpose-built for on-device/edge use, <200MB RAM
  quantized, ~22ms/embedding, multilingual) or **Nomic Embed v2** (137M
  params, 274MB, ~580 chunks/sec CPU, 8192-token context) if retrieval
  quality matters more than footprint — run via **`transformers.js`**
  (Hugging Face), which as of its 2026 releases runs ONNX models directly
  in Bun with no native build step. `recordBelief`/`supersedeBelief`/
  `searchBeliefs` still accept an optional `embedding`/`queryEmbedding`
  override for a caller (e.g. an agent) that already has one.
- **Selection is a deployment-time config** (`retrieverKind: 'lexical' |
  'vector'`, defaulting to `'lexical'`), read once by the handler — not a
  per-query toggle — keeping authorization/scope/provenance logic
  identical regardless of which retriever answers a query.

None of this is built in M21. `Belief.embedding` (a nullable BLOB column)
is added now specifically so a caller-supplied embedding is captured and
not lost, even though nothing indexes it yet — avoiding a backfill if/
when `VectorBeliefRetriever` ships.

## Decision

`searchBeliefs` is implemented against a `BeliefRetriever` interface.
`LexicalBeliefRetriever` (FTS5/`bm25()` + InnoDB `FULLTEXT`, reusing
`search.handler.ts`'s proven machinery) is the only implementation built
in M21, and is required in every deployment. No vector store, no
embedding-model dependency, no LLM-provider integration ships in this
milestone. A `VectorBeliefRetriever` is documented, not built, with
LanceDB and a local ONNX-class embedding model (run via `transformers.js`
in-process) as the recommended future defaults if evidence later
justifies building it.

## Consequences

**Easier.** Belief search ships with zero new dependencies, identical
behavior across SQLite/MySQL and standalone/clustered deployments, and
reuses code (`search.handler.ts`'s FTS/FULLTEXT machinery, ADR-0010's
pagination scheme) that's already proven in production rather than a
new, unvalidated retrieval path.

**Harder.** Belief search is keyword-based only until a `Vector
BeliefRetriever` is actually built — a belief phrased differently from
how it's later searched for won't surface via similarity the way a
semantic index would. This is the same tradeoff ADR-0002 accepted for
general search and is measurable the same way: real usage, not
speculation, decides whether it's worth fixing.

**Foreclosed, for now.** Nothing structurally — the interface boundary
exists specifically so a future `VectorBeliefRetriever` is a plug-in
implementing the same `search()` signature, not a rewrite of
`searchBeliefs`'s callers. Building it is a future milestone's decision,
made against real evidence rather than this one's guess.
