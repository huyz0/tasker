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

## M21-T02 — Contract: MemoryService + Belief/BeliefRelation/BeliefPromotion

- **Status**: done
- **Date**: 2026-08-18
- **Changed**: `packages/shared-contract/main.tsp` (14 new models +
  `MemoryService` interface, appended after `RoleService`),
  `packages/shared-contract/tasker/health/v1/health.proto` (hand-mirrored
  - this project's `tsp compile` output does not emit `service` blocks or
  the `optional` keyword on proto3-optional scalar fields, confirmed by
  diffing `tsp-output/` against the checked-in file before writing this,
  so every `?` field was hand-annotated `optional` to match `main.tsp`
  rather than copied blind), generated
  `packages/shared-contract/gen/ts/tasker/health/v1/health_pb.ts` and
  `apps/cli/gen/tasker/health/v1/{health.pb.go,v1connect/health.connect.go}`,
  `apps/gui/scripts/rpc-coverage.mjs` (14 temporary `EXCEPTIONS` entries
  for `MemoryService.*`, each citing M21-T07 - the GUI screen isn't built
  yet and this repo's `gui:rpc-coverage` check fails the build on an
  RPC with no GUI caller and no documented exception).
- **Verified**: `moon run shared-contract:compile` clean; generated TS
  shows `supersedesBeliefId?: string` (proto3 presence preserved) and Go
  shows `SupersedesBeliefId *string` (pointer, same); `moon check --all`
  27/27 including `gui:rpc-coverage` (116/134 RPCs reached, 18 excepted
  with reasons, up from 4 permanent exceptions before this task).
- **Notes**: `Belief.embedding`/`RecordBeliefRequest.embedding`/
  `SearchBeliefsRequest.queryEmbedding` are `repeated float`, not
  `optional repeated float` - proto3 doesn't allow combining the two
  labels (a `repeated` field already has no presence tracking, empty and
  absent are indistinguishable, which doesn't matter for an embedding:
  "caller sent nothing" and "caller sent an empty list" are the same
  case). `listBeliefRelations`/`listBeliefPromotions` were added to the
  interface beyond the RPC names enumerated in `MILESTONE.md`'s prose -
  the GUI's related-beliefs list and promotion-history tab (T07) need a
  way to read them, and "implement all RPCs above" in T05 already covers
  it without a `MILESTONE.md` edit.
- **Next**: M21-T03 — add `memory:{read,write,admin}` to the permission
  vocabulary and `memory:read`/`memory:write` to the agent-token scope
  vocabulary.

## M21-T03 — RBAC: memory permission family + agent-token scopes

- **Status**: done
- **Date**: 2026-08-18
- **Changed**: `apps/backend/drizzle-sqlite/0041_seed_memory_permissions.sql`,
  `apps/backend/drizzle-mysql/0028_seed_memory_permissions.sql` (new,
  both dialects, following `0034`/`0021`'s exact `INSERT OR IGNORE`/
  `INSERT IGNORE` + re-run-the-wildcard-`SELECT`s pattern so only the
  three new keys land, idempotently), `meta/_journal.json` in both
  migration folders, `apps/backend/src/lib/scopes.ts` (`memory:read`/
  `memory:write` added to `AGENT_SCOPES`), `apps/backend/src/modules/
  roles/roles.test.ts` (32→35-key vocabulary assertion updated).
- **Verified**: `bun test` (SQLite, standalone) - 544/544 across the four
  RBAC-adjacent test files, including the updated 35-key assertion.
  Verified against live MySQL: `docker compose up -d mysql`,
  `TASKER_MYSQL_INTEGRATION=1 bun test src/db/db.mysql.test.ts`, then
  `docker exec tasker-mysql-1 mysql ... -e "SELECT COUNT(*) FROM
  permissions"` → 35, and a `role_permissions` count-by-role query
  confirming viewer=1 (`memory:read`), member=2 (`+write`), admin=3
  (`+admin`), owner=3 - the exact tiering ADR-0014 specifies, produced
  by the wildcard `LIKE` pattern with zero new logic. `moon check --all`
  27/27.
- **Notes**: Deliberately did **not** touch `policy.test.ts`'s exhaustive
  role×permission×scope matrix (M10-T13) - it parses permission keys
  directly out of `0034_seed_system_roles_and_migrate_grants.sql` by
  filename, so a new, separate migration file for the memory family
  doesn't feed it and the matrix keeps validating exactly what it was
  built to validate (the original 32-key ADR-0013 rollout). Deferred the
  `AGENT_RPC_SCOPES` per-RPC mapping and `agent-scope-sweep.test.ts`
  wiring to T05 (updated `MILESTONE.md` to say so explicitly) -
  that sweep instantiates the real handler against real seeded data, so
  it can only be written once `memory.handler.ts` exists; attempting it
  here would mean either a fake/stub handler or a broken import.
- **Next**: M21-T04 — `beliefs`/`belief_relations`/`belief_promotions`
  schema + migrations, both dialects.

## M21-T04 — Schema + migrations for beliefs/belief_relations/belief_promotions

- **Status**: Done
- **Changed**: Added `beliefs`/`beliefRelations`/`beliefPromotions` Drizzle
  table definitions to `schema.sqlite.ts`/`schema.mysql.ts` (self-
  referencing `supersedesBeliefId` FK via `AnySQLiteColumn`/
  `AnyMySqlColumn`; `embedding` as JSON-serialized text/`mediumtext`,
  same pattern as `apiTokens.scopes`). Hand-wrote
  `apps/backend/drizzle-sqlite/0042_beliefs_schema.sql` (three
  `CREATE TABLE`s + indexes + a contentless `beliefs_fts` FTS5 virtual
  table with insert/delete/update triggers, matching
  `0025_fts5_search_index.sql`'s exact pattern) and
  `apps/backend/drizzle-mysql/0029_beliefs_schema.sql` (same three
  tables in MySQL syntax + `CREATE FULLTEXT INDEX beliefs_fts_idx ON
  beliefs (statement)`, matching `0012_fulltext_search_index.sql` - no
  triggers needed, InnoDB maintains it transactionally). Manually
  appended both `meta/_journal.json` entries. Not wired into
  `search.handler.ts` yet - that's M21-T06.
- **Verified**: `bun test` (full backend suite, SQLite) 1331 pass/0
  fail. `TASKER_MYSQL_INTEGRATION=1 bun test src/db/db.mysql.test.ts`
  passed (`setupDatabase("mysql")` runs every migration on boot, so this
  is a real apply-from-scratch check, not a schema diff). Direct
  inspection via `docker exec tasker-mysql-1 mysql ... -e "DESCRIBE
  beliefs; SHOW INDEX FROM beliefs WHERE Key_name='beliefs_fts_idx'"`
  confirmed all three tables and the `FULLTEXT` index exist with the
  expected columns/types. `moon check --all` 27/27 clean.
- **Notes**: `bunx drizzle-kit generate` against the SQLite schema
  produced a corrupted migration - `CREATE TABLE` statements for a dozen
  already-existing tables plus destructive-looking recreate-and-copy
  statements for `invitations`/`users`, sourced from a stale baseline
  snapshot (this repo's drizzle-sqlite snapshot lineage has been known-
  drifted from the real applied-migration history since M13). Confirmed
  hands-on rather than just trusting the prior flag; discarded the bad
  output and `git checkout --`-reverted the auto-appended journal entry
  before it touched any database, then hand-wrote the migration instead,
  cross-checking every `CREATE TABLE`/`CREATE INDEX` line against
  `schema.sqlite.ts`. Wrote the MySQL migration by the same hand-written
  discipline for consistency, even though `drizzle-kit generate` wasn't
  attempted against that dialect this time.
  `moon check --all` initially failed on `tasker:knip` flagging the
  three new schema exports as unused (real - nothing calls
  `memory.handler.ts` yet, since that's M21-T05). Followed the
  established `@knipignore` precedent (`testSchema` in the same file)
  rather than silencing the whole rule or committing dead-looking code
  unexplained: added a JSDoc `@knipignore` tag with an explanatory
  comment to each of the three exports, explicitly noting M21-T05 is the
  first caller and that the tag should come out once it lands. A first
  attempt using `//` line comments for the tag did not suppress the
  warning - knip's tag parser only recognizes tags inside a JSDoc `/**
  */` block, confirmed by matching `testSchema`'s exact working form.
- **Next**: M21-T05 — `memory.handler.ts` implementing all 14
  `MemoryService` RPCs, plus the deferred `AGENT_RPC_SCOPES.memory`
  mapping and `agent-scope-sweep.test.ts` wiring.
