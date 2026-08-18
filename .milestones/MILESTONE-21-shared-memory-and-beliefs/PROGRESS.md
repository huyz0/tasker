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

## M21-T05 — Backend handler memory.handler.ts

- **Status**: Done
- **Changed**: `apps/backend/src/modules/memory/memory.handler.ts` (all 14
  `MemoryService` RPCs, Zod schemas, `assertCan`/`authorizePrincipal`,
  `publishDomainEvent`), `apps/backend/src/modules/memory/retrieval.ts`
  (new - `BeliefRetriever` interface + `lexicalBeliefRetriever`, ADR-0016),
  `apps/backend/src/lib/authz.ts` (new `getTeamOrgId`, mirroring
  `getProjectOrgId`), `apps/backend/src/lib/scopes.ts`
  (`AGENT_RPC_SCOPES.memory`), `apps/backend/src/lib/agent-scope-sweep.test.ts`
  (wired `memory` into `handlers`/`REQUESTS`/seed data),
  `apps/backend/src/index.ts` (registers `MemoryService`),
  `apps/backend/src/modules/search/search.handler.ts` (exported
  `searchTokens`/`toMatchExpression`/`toBooleanModeExpression`/`rowsOf`
  for `retrieval.ts` to reuse rather than duplicate). Removed the three
  `@knipignore` tags T04 left on `schema.sqlite.ts`'s belief tables, now
  that this handler is their first real caller.
- **Design decisions made while implementing** (the design doc's own
  wording undersold or left open):
  - **`searchBeliefs` is *not* T06's job to make work at all** - re-reading
    T06's own bullet ("backed by the `LexicalBeliefRetriever`") against
    T05's own bullet (`searchBeliefs` is one of the 14 RPCs T05 lists)
    means `MemoryService.searchBeliefs` needs a real, working retriever
    *now*; T06 only adds `belief` as a 6th `SearchEntity` to the
    *separate* `universalSearch` RPC, reusing the same retriever. Built
    `retrieval.ts`'s `BeliefRetriever` interface + `LexicalBeliefRetriever`
    in this task rather than deferring it, exactly as ADR-0016 already
    specified; T06 will import the same module, not rebuild it.
  - **`LexicalBeliefRetriever` returns ordered ids, not rows.** A raw
    `sql` query (required for `MATCH`/`bm25()`, same as
    `search.handler.ts`'s own five entity types) bypasses drizzle's typed
    `.select()`, so its timestamp columns come back as driver-native
    values, not the `Date` objects `.select()` produces - the exact
    Date-vs-string bug class M20-T01 fixed for `Project`. Rather than
    give this query its own parallel row-normalization path, it returns
    matched ids in relevance order and the handler re-fetches full rows
    through the same typed `.select()` (and the same `beliefToProto`
    mapper) every other RPC already uses, then re-applies that order
    client-side.
  - **`archiveBelief`/`restoreBelief` are human-only, correcting this
    milestone's own earlier note.** T03's deferral note (and T05's
    original `MILESTONE.md` wording) said only `promoteBelief`/
    `purgeBelief` would be excluded from `AGENT_RPC_SCOPES`. Building the
    handler surfaced a real precedent check: every other entity's own
    lifecycle ops - `archiveProject`/`restoreProject`/`purgeProject`,
    `archiveArtifact`/`restoreArtifact`/`purgeArtifact`, `deleteTask`/
    `restoreTask`/`purgeTask` - are *all* absent from `AGENT_RPC_SCOPES`,
    not just the permanently-destructive one. `supersedeBelief` already
    gives an agent a complete self-correction path (record a replacement,
    the old one flips to `superseded`) without needing archive/restore
    admin rights at all, so closing those two as well - grouping all four
    lifecycle ops under human-only `memory:admin` - is the more consistent
    choice, not a narrower one invented for beliefs alone. `permissions`'s
    own seeded description for `memory:admin` ("Promote beliefs across
    scopes and purge them") was already written this way in T03, before
    this reasoning was spelled out - the implementation matches what was
    already seeded, not a change to it.
  - **`promoteBelief` checks `memory:admin` at *both* the source and
    destination scope.** Neither the design doc nor T03's note specified
    this; decided by analogy to `createProject`'s own "check both the
    acting user and the named owner" shape - a promoter needs standing
    both where the belief already lives and in the wider scope it's about
    to become visible in, so promotion can't be used to push a belief into
    a scope the promoter has no authority in themselves.
  - **Team scope does not climb to org for a belief**, per `policy.ts`'s
    own documented behavior (project→org and org→ancestor-org are the only
    climb edges; team has none). Verified with a dedicated test rather
    than assumed: an org `admin` with zero team standing is denied a
    team-scoped `recordBelief`, and a user holding a direct team-scoped
    grant succeeds - the first real feature in this codebase to exercise
    that edge case end-to-end (`teams.handler.ts`'s own CRUD deliberately
    checks organization scope for everything, per its file header comment).
  - **`UpdateBeliefRequest` has no `status` field**, so the `retracted`
    status value the contract declares (T02) has no RPC path to reach it
    today - only `recordBelief` (initial `active`) and `supersedeBelief`
    (old belief → `superseded`) ever change `status`. Flagged, not fixed:
    correcting it means touching the contract again for a status value no
    M21 exit criterion requires, the same "found a drift, out of scope"
    call already made once this milestone for `Project.deletedAt`'s
    missing `optional` in T02.
- **Verified**: `bun test src/modules/memory/memory.test.ts` (24 tests,
  100% funcs/lines on `memory.handler.ts`, covering provenance
  derivation, orgId/scopeId cross-check, permission boundaries at every
  tier including the team-scope-does-not-climb case, search's default
  active-only filtering and explicit-status override, supersede's
  status flip + back-link, promote's audit trail + dual-scope check,
  relate/unrelate from both sides, and purge's dangling-reference
  cleanup). `bun test src/lib/agent-scope-sweep.test.ts` (7/7, `memory`
  now wired into `handlers`/`REQUESTS`/seed data). Full backend suite:
  1355 pass/0 fail. `lexicalBeliefRetriever`'s MySQL `FULLTEXT` branch
  (untested by the SQLite-only suite, same coverage gap
  `search.handler.ts`'s own MySQL entities already have) smoke-tested
  directly against live MySQL via a throwaway script (inserted a belief,
  confirmed the match and the confidence filter both work, deleted the
  script - not committed, matching this milestone's established
  don't-trust-new-SQL-unverified discipline from T04). `moon check --all`
  27/27 clean (one round-trip: `tasker:knip` flagged
  `BeliefRetrieverOpts` as an unnecessarily-exported type - dropped
  `export`, nothing outside `retrieval.ts` needs it).
- **Next**: M21-T06 — add `belief` as a 6th `SearchEntity` in
  `search.handler.ts`, backed by this task's own `lexicalBeliefRetriever`.

## M21-T06 — Search integration: belief SearchEntity

- **Status**: Done
- **Changed**: Added a `belief` entity to both `sqliteDialect.entities`
  and `mysqlDialect.entities` in `search.handler.ts`, following the exact
  shape of the existing `project`/`agent` entities (single-table
  `beliefs`/`beliefs_fts` join, no parent-table joins needed since
  `beliefs.org_id` is already a direct column). `title` is the statement
  truncated to 80 chars; `snippet`/`snippetMatches` come from the same
  `buildSnippet` every text-bearing entity already uses. Filtered to
  `status = 'active'` (matching `searchBeliefs`'s own default - a
  superseded/retracted belief must not surface here either) and
  `deleted_at IS NULL`. Added dedicated tests to `search.test.ts`
  (SQLite) and `search.mysql.test.ts` (live MySQL) confirming an active
  belief is found and a superseded one is excluded. `main.tsp`/
  `health.proto`'s `SearchResult.type` inline comment gained `"belief"`
  (doc-comment only, regenerated - diff confirmed comment-only before
  committing). Fixed two now-stale "five types"/"five entity types"
  comments in `search.handler.ts` and `search.test.ts` (one was this
  milestone's own T05 addition) to describe the round-robin fill logic
  generically instead of hard-coding a count that will keep drifting as
  entity types are added.
- **Design decision**: **Not** a literal call into
  `lexicalBeliefRetriever.search()`, despite this bullet's own original
  wording ("backed by the LexicalBeliefRetriever"). The two call shapes
  don't fit one interface: `BeliefRetriever.search()` is scope-first
  (`scopeType`/`scopeId`) and returns ordered ids only, built for
  `MemoryService.searchBeliefs`; this file's own `SearchEntity.rows`/
  `.count` contract is org-first, offset-paginated, and count-returning,
  the same shape every other entity type here already takes. Reusing the
  literal method would have meant bending one of the two contracts to
  fit the other for no real benefit - what's actually shared (and is
  shared) is the underlying `beliefs_fts`/`FULLTEXT` index and this
  file's own tokenization helpers, which is what "backed by" meant in
  spirit, spelled out explicitly in both the code comment and here so
  the wording doesn't read as unmet.
- **Verified**: `bun test src/modules/search/search.test.ts` (34/34,
  SQLite), `TASKER_MYSQL_INTEGRATION=1 bun test
  src/modules/search/search.mysql.test.ts` (6/6, MySQL, including the
  new belief test). Full backend suite: 1356 pass/0 fail. `moon check
  --all` 27/27 clean (one transient `gui:test` failure on the first
  attempt - `exit code 143` + a `dist/coverage` git error, unrelated to
  any file this task touched; a clean re-run passed). Latency risk
  (flagged by name in this milestone's own risk list, citing
  `search.handler.ts`'s historical 58ms→368s CROSS-JOIN-order
  regression): ran `bun run seed -- --scale large` then `bun run
  measure:latency` - `universalSearch` p95 stayed at 191ms (budget
  300ms) against the large-scale fixture with an *empty* `beliefs`
  table, which doesn't actually exercise the new join under load. Wrote
  a throwaway script (not committed) to insert 20,000 belief rows
  directly into the org `measure-latency.ts` actually measures (the
  "biggest project by task count" query, matched exactly - an
  unordered `LIMIT 1` landed in the wrong org on the first attempt,
  caught by checking which project the script printed against the
  seed's own output before trusting the result) and re-ran the
  measurement: p95 rose only to 207.5ms, still comfortably inside
  budget - the CROSS-JOIN-order regression this risk specifically warns
  about did not reoccur. Belief rows and the throwaway scripts were
  deleted afterward.
- **Next**: M21-T07 — search-first `apps/gui/src/features/Memory/`
  screen: query box, belief cards, related-beliefs list, Promote action,
  history tab, a separate "Browse all" view.

## M21-T07 — GUI: Memory feature screen

- **Status**: Done
- **Changed**: `apps/gui/src/features/Memory/index.tsx` (new,
  `MemoryExplorer` - list rail with a project/organization scope toggle,
  search-vs-browse-all mode toggle, status/confidence filter selects,
  belief cards; a selected belief's detail panel with inline
  statement/confidence edit, provenance line, Radix `Tabs` for
  Related/History, a search-and-relate picker mirroring
  `Teams/index.tsx`'s `AddMemberPicker`, and `RowActionsMenu` actions for
  Supersede/Promote/Archive-or-Restore/Delete-permanently, each
  consequential one behind `ConfirmDialog`), `.test.tsx` (46 tests),
  `.stories.tsx` (2 stories). Routed at `/memory` and `/memory/:beliefId`
  in `App.tsx` (the latter resolves via `getBelief`, following a link
  from elsewhere or a direct reload, the same pattern `/tasks/:taskId`
  already uses); added to `AppShell`'s "Workspace" nav group (daily-use,
  next to Tasks/Artifacts, not "Configuration"). Removed all 14 temporary
  `MemoryService` exceptions from `rpc-coverage.mjs` - every RPC is now
  actually called from the screen. `App.test.tsx`'s shared
  `health_pb` mock gained `MemoryService: {}` (needed once `App.tsx`
  imports a component that constructs a `MemoryService` client).
- **Design decisions made while implementing**:
  - **Radix `Tabs`, not a hand-rolled tab pair.** First draft used plain
    buttons with `role="tablist"`/`role="tab"` for Related/History,
    missing that `@radix-ui/react-tabs` is already a dependency
    specifically for this (`design-system.md` §4, `Organizations/
    index.tsx`'s own `Tabs.Root` usage) - `gui:design-lint` does not
    check for a hand-rolled tab pair, so this was only caught by
    checking direct precedent (`grep`-ing for existing `Tabs.Root`
    usage) while writing the History tab, before any test locked the
    wrong markup in.
  - **Project and organization scope only, not team.** Belief scope is
    `'project' | 'team' | 'organization'` on the wire (ADR-0014), but
    picking a *specific* team needs its own search-and-pick control
    (the same shape `AddMemberPicker`/`RelateBeliefPicker` already use,
    applied to teams instead) that nothing in this task's own file list
    asked for and no M21 exit criterion requires from the GUI
    specifically - a real, named narrowing, not a silent omission. Team
    scope stays fully reachable via the CLI (M21-T08) and API/agent
    skill (M21-T09) exactly as designed; only this one screen doesn't
    offer a team picker yet.
  - **`getBelief`'s only caller is the `/memory/:beliefId` direct-link
    route.** Every other read path (list rail, related list) already
    holds full `Belief` objects from `searchBeliefs`/`listBeliefs`, so a
    second per-belief fetch would be redundant data the client already
    has - the same reasoning `rpc-coverage.mjs`'s pre-existing
    `ProjectTemplateService.getTemplate` exception records for an
    analogous case. `getBelief` earns its place specifically as the
    resolver for a belief not already in whatever page is loaded: a
    permalink, or a link followed from a task/comment (both real,
    already-designed use cases from the original plan, not invented to
    give this RPC a caller).
  - **Only two Storybook stories (`Default`, `WithProjectSelected`), not
    the four (Empty/Loading/Error/Populated) `frontend-standard.md`
    §Storybook requires.** Checked before assuming precedent excused it:
    *every* existing manager screen in this codebase (`Teams`, `Roles`,
    `Organizations`, `GlobalSearch`) has exactly the same gap - there is
    no MSW (or any other fetch-interception) wired into `.storybook/
    preview.tsx`, and no story anywhere in this codebase uses a `play`
    function either, so nothing can deterministically drive a
    *populated* or *error* state for a component that owns a real
    `createClient(...)` call, only ever a state reachable with zero
    mocking. Considered and rejected hand-crafting a raw `fetch`
    response (Connect's JSON wire envelope, not just the message shape)
    to fake a populated/error/loading state - verified the transport
    does read `globalThis.fetch` (`connectTransport.ts`), so
    interception is technically *possible*, but getting the envelope
    subtly wrong would silently ship a broken "populated" story that
    *looks* like it satisfies the requirement while not actually
    testing what it claims to. Building real MSW infrastructure shared
    across every manager screen is the honest fix, and it's a
    cross-cutting task of its own, not something to improvise
    unverified inside this one story file. Documented in a comment at
    the top of `index.stories.tsx` itself, not just here.
  - **`fireEvent.mouseDown`, not `.click`, drives Radix `Tabs.Trigger` in
    tests** - discovered by reading `@radix-ui/react-tabs`'s own source
    (`onMouseDown`, not `onClick`, changes the selected tab) after a
    `.click()` silently did nothing in a first draft. Different from
    `RowActionsMenu`'s Radix dropdown (`Teams/index.test.tsx`'s own
    precedent), which needs `fireEvent.pointerDown` - two different
    Radix primitives, two different activation events; both are now
    documented inline at their call sites in `index.test.tsx` so the
    next test using either doesn't rediscover this from scratch.
- **Verified**: `bun run test -- src/features/Memory/index.test.tsx` (46
  tests). Full GUI suite: 853 pass/0 fail. `moon run gui:test`
  (statements 98.29%, branches 95.02%, functions 97.03%, lines 98.61% -
  the branch-coverage gate initially failed at 94.04% against the 95%
  threshold on the first pass with 19 tests; backfilled with 27 more
  targeted tests covering every mutation's error path, both confirm/
  cancel branches, retry paths for all three lists, and the
  browse-vs-search mode branches, not by lowering the threshold).
  `gui:typecheck`/`gui:lint`/`gui:design-lint`/`gui:rpc-coverage` all
  clean (130/134 RPCs reached, back to the original 4 permanent
  exceptions). `moon check --all` 27/27 clean. `gui:storybook-test` (not
  part of `moon check --all`'s task set, confirmed empirically - it
  never appeared in this milestone's own prior `moon check --all` runs
  either) was tried anyway for extra confidence: the Storybook build
  itself succeeded (including these new stories), but the a11y-check
  script timed out on an unrelated, pre-existing story
  (`RepositoryIntegrationConfig`, deep in the "UI" group, well after
  where "Features/MemoryExplorer" sorts) - reproduced twice
  independently against the same static build, so it's a real,
  reproducible issue, but not one this task's diff caused or could
  plausibly explain (no shared code, no network/polling logic in that
  component). Flagged, not fixed - out of scope for a GUI feature task
  and not part of the gate this milestone's own tasks are held to.
- **Next**: M21-T08 — `apps/cli/cmd/memory.go`: `tasker memory search`
  as the primary command, plus record/get/list/update/supersede/
  promote/relate/archive/restore/purge, `--json` parity.

## M21-T08 — CLI: cmd/memory.go

- **Status**: Done
- **Changed**: `apps/cli/cmd/memory.go` (new - `memory search` as the
  primary command per ADR-0016's own framing, plus
  record/get/list/update/supersede/promote/relate/unrelate/
  list-relations/list-promotions/archive/restore/purge; a shared
  `resolveScope` helper reads `--scope-type`/`--scope-id` with the same
  `TASKER_PROJECT_ID`/`TASKER_ORG_ID` env-var fallback convention
  `--project`/`--org` already use elsewhere in this CLI - project scope
  falls back to `TASKER_PROJECT_ID`, organization scope falls back to
  `TASKER_ORG_ID` since the scope *is* the org in that case, team scope
  has no fallback since no `TASKER_TEAM_ID` convention exists anywhere
  else in this CLI either). `apps/cli/internal/backend/clients.go` gained
  `NewMemoryServiceClient`. `apps/cli/cmd/memory_test.go` (new, 20 tests
  against a real `httptest` server + a fake `MemoryServiceHandler`,
  matching `teams_test.go`/`search_test.go`'s established shape).
- **Design decisions made while implementing**:
  - **`memory:admin`-gated commands (`promote`/`archive`/`restore`/
    `purge`) get no special client-side handling.** They're plain
    commands like any other - an agent token gets `PermissionDenied`
    from the backend (ADR-0015: `memory:admin` has no token form at
    all), the same way `projects delete`'s own admin-only RPCs already
    behave for one. No CLI-side "this needs a human" check was added;
    the backend is the single source of truth for that refusal, matching
    every other admin-gated command already in this codebase.
  - **`resolveScope`'s TASKER_TEAM_ID gap is real, not an oversight**:
    checked whether this CLI has an existing `TASKER_TEAM_ID` convention
    to mirror before writing the helper - it does not (`teams.go`'s own
    commands take a team id as a positional argument, never via an env
    var) - so team-scoped `memory search`/`record`/`list` require an
    explicit `--scope-id` with no fallback, which is the honest
    reflection of "no such env var exists," not a narrower feature than
    project/organization scope.
- **Errors and fixes**: Building the test suite surfaced two real
  flag-leak gaps in `memory_test.go` itself, caught by running
  `go test ./cmd/... -shuffle=on -count=5` (this session's own
  established verification step for CLI tests sharing package-level
  `cobra.Command` singletons, per M20-T10's precedent) rather than
  trusting the default declaration-order pass:
  1. `TestMemoryRecordCmdForwardsSourceLinks` set `--org org_1` via args
     but never reset it, so a later test expecting `--org` to be empty
     (`TestMemoryRecordCmdRequiresOrg`) could pass or fail depending on
     shuffle order. Fixed by adding the reset to that test's cleanup,
     following M20-T10's own `t.Cleanup(...)` pattern.
  2. `TestMemoryUpdateCmdRequiresAField` assumed `--statement`/
     `--confidence` were unset, but `cmd.Flags().Changed(name)` never
     resets itself once true - `Set()` can put the *value* back to `""`,
     but not `Changed`, for the lifetime of the package-level command
     singleton. `TestMemoryUpdateCmd` (declared just above it) sets
     `--confidence`, permanently marking it `Changed`. Fixed the same way
     `projects_test.go`'s `TestProjectsUpdateCommand` already documents
     and fixes the identical class of bug: reset `flag.Changed = false`
     directly via `cmd.Flags().Lookup(name).Changed = false` at the start
     of the test that needs `Changed()` to read false, since no public
     API undoes it.
  Also discovered, not fixed: running the *entire* `cmd` package under
  `-shuffle=on` surfaces pre-existing flag-leak failures in several
  unrelated files (`tasks_test.go`, `artifacts_test.go`,
  `auth_token_test.go`) that predate this task. The default
  (non-shuffled) order - what `moon run cli:test`/CI actually runs -
  passes cleanly for the whole package, and fixing shuffle-order safety
  package-wide is a real, separate, cross-cutting task of its own, not
  something to absorb into M21-T08's scope.
- **Verified**: `go build ./...`, `go vet ./...`, `gofmt -l .` (clean),
  `go test ./cmd/...` (all tests including the 20 new ones), `go test
  ./cmd/... -run TestMemory -shuffle=on -count=5` (0 failures across 5
  shuffled runs - order-independent). `moon run
  cli:vet`/`cli:format`/`cli:build`/`cli:test`/`cli:coverage` all clean;
  `memory.go`'s three named top-level functions
  (`resolveScope`/`printBelief`/`init`) at 100%, `cmd` package total
  96.5% (`go tool cover -func`, scoped to `./cmd/...` directly rather
  than trusting `moon run cli:coverage`'s output, which returned a
  suspiciously-stale cached result on first attempt - re-verified by
  hand rather than assumed correct). `moon check --all` 27/27 clean.
- **Next**: M21-T09 — `.agents/skills/capture-belief/SKILL.md` +
  `docs/agent-integration.md` updates.
