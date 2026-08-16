# M07 — Read-Path Scale — Progress Journal

One entry per task, written when the task's **Verify** line has actually
passed. Measurements go here rather than in a commit message, because the
milestone's fourth exit criterion is that the numbers are committed.

## M07-T01 — Column projection, made mandatory

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `db/query-builder.ts` (the tail of `executePaginatedQuery`
  became one required options object), all 15 list call sites across 9
  handlers, `db/query-builder.test.ts`
- **Verified**: listing a folder of 50 images against the running server —
  **2,008 KB → 7.6 KB**, and the row keys went from
  `content, contentType, folderId, id, name` to `contentType, folderId, id,
  name`. `backend:test` — 596 pass.
- **Notes**: `shape.select` already existed and *nothing used it*, because it
  was optional and omitting it meant `SELECT *`. That is the whole defect: not
  a wrong choice of columns but an optional one, so the default grew silently as
  the tables grew. `select` is now a **required** property, which means a new
  list handler does not compile until it names its columns — the compiler listed
  all 15 sites the moment the type changed.
  **The find was not the artifact body.** `listRepositoryLinks` selected
  `accessTokenEncrypted` — an encrypted credential — carried it through the
  handler, and removed it afterwards with `accessTokenEncrypted: undefined`
  written after the spread. The secret was protected by someone having
  remembered to protect it, and any future `...t` would have undone that
  silently. It is not selected at all now, so it never leaves the database.
- **Next**: M07-T02

## M07-T02 — The artifact body is its own request

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `main.tsp` **and** `tasker/health/v1/health.proto` (new
  `getArtifactContent`, `Artifact.sizeBytes`), `artifacts.handler.ts`,
  `lib/scopes.ts`, `lib/viewer-denial.test.ts`,
  `features/Artifacts/index.tsx`, its test
- **Verified**: the list is **8.6 KB** for 50 images and carries `sizeBytes` but
  no `content` (verify line: under 100 KB). In a real browser, deep-linking
  `/artifacts/:id` issues exactly **one** `GetArtifactContent` and renders the
  body. `gui:test` — 614 pass. `backend:test` — 596 pass.
- **Notes**: T01 removed `content` from the list, which **broke the viewer** —
  it read `selectedArtifact.content`. The two tasks are one change and were
  finished before committing rather than leaving a commit that lists artifacts
  nobody can open.
  `sizeBytes` is the **stored** length, and the first version was wrong. It
  computed a decoded base64 size, which measured 27 for a 25-byte file and, worse,
  is meaningless for a whole class of artifacts: uploads are stored base64 but
  text written in the editor is not, and `contentType` does not distinguish them
  (an uploaded `.md` is base64 with a text content type). A decoded figure would
  have been confidently wrong; the stored length is coarser and true. The
  underlying inconsistency — mixed encodings behind one column — is real and
  belongs to a later task, noted here rather than papered over.
  The size is computed as `length(content)` **in SQL**, so "how big is this
  file" stays a column read rather than a transfer.
  The M03 viewer sweep and the M04 agent sweep both failed on the new RPC until
  it was classified — which is what they are for.
  **Two hours of the browser check were a stale dev server, not a bug.** The
  viewer sat on "Loading this artifact…" with *zero* network calls; the loaded
  `ArtifactService` had 15 methods and not the new one. Vite had cached the
  generated descriptor from before codegen. `Object.keys(ArtifactService.method)`
  in the page is what settled it — the absence of a request, not its failure,
  was the signal.
- **Next**: M07-T03

## M07-T03 — Each board column fetches and counts itself

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `main.tsp` **and** `health.proto` (`ListTasksRequest.status`, new
  `getTask`), `tasks.handler.ts`, `lib/scopes.ts`,
  `lib/viewer-denial.test.ts`, `features/Tasks/index.tsx` (new `BoardColumn`),
  its test (+ 6 tests, 1 replaced), `scripts/seed.ts` (batched task insert)
- **Verified**: against a **50,000-task** project, in a real browser:
  **first card painted in 326 ms** (verify line: under one second), **4**
  `ListTasks` requests for the whole screen, 60 cards, and the column badges
  read **16667 / 16667 / 16666** — the server's counts, which sum exactly to
  50,000. Server-side: each faceted page is ~25 ms and every row matches its
  facet. `gui:test` — 619 pass, branches 95.01%. `backend:test` — 596 pass.
  `moon check --all` — 26 pass.
- **Notes**: the board's cost is now the number of columns rather than the size
  of the project. The old `fetchAllPages` looped until the project was
  exhausted — at the default page size of 50 that is **1,000 sequential
  requests** for 50,000 tasks, before anything painted.
  The reason it needed all of them is worth keeping: a column's contents *and*
  its count cannot both be had from a page of mixed statuses. Counting rendered
  cards would say "20", not "16,667". A server-side `status` facet is what makes
  a real count possible, so the facet and the per-column paging are one change.
  **Two regressions from T01 surfaced here, one of them mine on paper.** T01's
  comment said `description` "is read back by `getTask` on the detail view" —
  and no such RPC existed, so the detail panel would have shown an empty
  description. `getTask` is now real, and the comment is true. It is also what
  makes a deep link work at all once the board is paged: the task a URL names
  need not be on any loaded page.
  Column discovery changed source. It used to scan every task in the project for
  an unrecognised status — which required the very fetch this removes. It reads
  the project's task types now: a status a type declares is a column, and a
  status no type declares is a data defect rather than a column to invent.
  **Seed batching was pulled forward from T10** because T03 cannot be verified
  without data at the scale target, and no project in the fixture had a single
  task. 50,000 rows insert in 1.4 s batched at 500. The `--scale` interface and
  the latency script remain T10's.
- **Next**: M07-T04

## M07-T04 — `fetchAllPages` out of Agents, Bin and Labels

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `main.tsp` **and** `health.proto`
  (`ListArtifactsRequest.projectId`), `artifacts.handler.ts`,
  `features/{Labels,Agents,Bin}/index.tsx` and their tests (5 rewritten,
  4 added)
- **Verified**: in a real browser — `/labels` issues **1** `ListLabels`,
  `/agents` **1** `ListAgents`, and each Bin section **1** request (the Bin's
  two `ListOrgs` are its own section plus the sidebar switcher, which every
  page has; `/labels` shows the switcher's 1 on its own). `ListFolders` on the
  Bin is now **0**. `gui:test` — 621 pass, branches 95.03%.
  `moon check --all` — 26 pass.
- **Notes**: eight loops removed, one kept. Each removed loop had a comment
  explaining why it needed everything, and each explanation was wrong in the
  same way: "the dashboard needs every agent to render deploy/archive actions"
  — those actions belong to the row they are on, and an unrendered row has no
  action to render.
  **The Bin's artifacts tab was the worst of them**: it listed every folder in
  the project (all pages), then every deleted artifact in each folder (all
  pages) — a fan-out proportional to the folder tree, to render one small list.
  `listArtifacts` takes a `projectId` now and answers it in one query.
  **One `fetchAllPages` is kept, justified in the code** (exit criterion 1
  requires exactly that): agent **roles**. It backs the `<select>` an operator
  picks from and the map that resolves a role name for every agent row — page
  it and a role past the boundary cannot be chosen, and an agent holding one
  renders blank. Roles are a configuration vocabulary an administrator writes,
  not user-generated volume. The proper fix is to resolve the name server-side
  on `Agent`, the M05 `Assignee.name` lesson; that is a contract change and is
  noted at the call site for whoever next touches the service.
- **Next**: M07-T05

## M07-T05 — An FTS5 index that cannot drift

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: new `drizzle-sqlite/0025_fts5_search_index.sql` (+ journal entry),
  new `src/db/searchIndex.test.ts` (5 tests)
- **Verified**: against a migrated database — a task inserted with the word
  only in its **description** is found by that word (the verify line); an
  update leaves the old word unfindable and the new one findable; a delete
  removes it; artifacts index by name and description; and `cat` no longer
  matches `concatenate`. `backend:test` — 601 pass.
- **Notes**: **maintained by triggers, not by the application.** The milestone's
  risk note asks for the index update to sit in the same transaction as the
  write so it cannot drift — a trigger is that guarantee expressed where the
  next handler to insert a row cannot forget it. An application-side update has
  to be repeated at every write site, and the site that forgets is invisible
  until someone reports a missing search result.
  The tables are `content=''` (contentless): they hold the index, not a second
  copy of the rows, so a 15 MB artifact body is not duplicated on disk. That
  choice has a consequence the update trigger has to respect — a contentless
  FTS5 row cannot be updated in place, so the trigger deletes and reinserts.
  A test asserts both halves, because an update that only inserted would leave
  the old text findable and nothing else would notice.
  The migration backfills existing rows, so search does not silently return
  less than it used to for data written before this.
  Only the SQLite dialect is touched; the MySQL `FULLTEXT` branch is T07.
  **This task adds the index. Nothing reads it yet** — `universalSearch` is
  still `LIKE '%term%'`, and switching it over is T06.
- **Next**: M07-T06

## M07-T06 — not started; one design note for whoever picks it up

The index from T05 exists and nothing reads it. `universalSearch` still runs
`LIKE '%term%'` on `tasks.title`/`description` and `artifacts.name`/`content`.

**The non-obvious part is the cursor, not the `MATCH`.** Both branches currently
paginate with `buildCursorPaginationWhere` over `createdAt`/`id`, and the verify
line asks for results ranked by *relevance*. A cursor over `createdAt` cannot
page a result set ordered by `bm25()`: the second page would be ordered by one
thing and filtered by another, which silently skips and repeats rows. So T06 is
"switch to MATCH" **plus** "decide what the cursor sorts on" — the honest
options being a `(rank, rowid)` cursor, or an offset within a bounded result set
on the grounds that nobody pages deeply into a search.

Note also that `artifacts.content` is searched today but is **not** in the FTS5
index (T05 indexes `name` and `description`). Indexing 15 MB base64 bodies would
be a large index of unsearchable noise, so the sensible reading is that artifact
*bodies* stop being searched and that is a deliberate, recorded narrowing — but
it is a behaviour change and belongs in T06's journal entry, not silently.

## M07-T06 — Search served from MATCH, ranked by relevance

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `modules/search/search.handler.ts` (new `fullTextSearch`, token
  allowlist, application-side snippets, offset cursor), `search.test.ts`
  (+10 tests, 1 replaced), new `.specs/adr/ADR-0010-…`, new
  `reviews/CODE-REVIEW-v1.md`
- **Verified**: the verify line — *ranked by relevance, not creation date* —
  in a real browser through the GUI's own search box: a task created **2020**
  outranks one created **2030** because the older one matches more strongly.
  Under the previous `ORDER BY createdAt DESC` that order was reversed. Its
  snippet is a window centred on the match rather than the first 100 characters,
  which for that row were entirely filler. `backend:test` — 618 pass.
  `moon check --all` — 26 pass.
- **Artifacts**: ADR-0010 (the pagination decision had a real alternative);
  `CODE-REVIEW-v1.md`. No UX pass — no screen changed, the GUI was not touched.
  No test plan — the behaviour states in one verify line.
- **Notes**: **the ordering change forces a pagination change; they are one
  decision.** A cursor over `createdAt` cannot page a set ordered by `bm25()` —
  page two would be filtered by one thing and ordered by another, silently
  skipping and repeating rows.
  Two SQLite facts were measured rather than assumed, and both moved the design.
  `bm25()` **is** usable in a `WHERE` clause, so a keyset cursor was genuinely
  available — the first draft of the ADR claimed otherwise and was wrong. But
  `EXPLAIN QUERY PLAN` shows `SCAN … VIRTUAL TABLE` + `USE TEMP B-TREE FOR ORDER
  BY`: ranking re-sorts the entire match set on every page regardless, so keyset
  does not avoid the cost it exists to avoid. It would only have bought
  stability, at the price of comparing floats for equality — and bm25 ties are
  common (two rows in a six-row fixture scored identically). Hence a bounded
  offset, and hence `ORDER BY bm25(...), id`, whose tie-break is load-bearing.
  **`snippet()` cannot be used and does not say so.** On a contentless FTS5
  table it returns **NULL** rather than raising, so a handler built on it ships
  silently empty snippets. Snippets are built in the application from the base
  row instead.
  **The injection surface moved rather than disappeared.** It is no longer SQL
  wildcards but FTS5's query language, where an unbalanced `"` is a hard error,
  not a no-op. The defence is an allowlist — only `\p{L}`/`\p{N}` runs survive
  — because refusing to carry operator characters is easier to get right than
  escaping them.
  **The review caught a High that predates this task.** Paging restarted an
  entity type once it was exhausted, because an omitted per-type cursor is
  indistinguishable from "no cursor yet". One task and five artifacts at limit 2
  returned ten rows for six ids. The old keyset cursor had the identical shape,
  so this is a fix rather than a regression — and the existing paging test
  collected into a `Set`, which hid it.
  Artifact **bodies** are no longer searched: `artifacts_fts` covers name and
  description, and `content` holds base64 blobs. A deliberate narrowing, in
  ADR-0010 and asserted by a test so the loss is visible.
- **Next**: M07-T07

## M07-T07 — MySQL FULLTEXT, and the two dialects measured against each other

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: new `drizzle-mysql/0012_fulltext_search_index.sql` (+ its
  `meta/_journal.json` entry), `modules/search/search.handler.ts` (dialect
  split, LIKE branch deleted), new `modules/search/search.mysql.test.ts`
  (4 tests, gated), `db/query-builder.ts` (un-export),
  `schema.sqlite.ts` (knip annotation), `knip.json` (`tags`)
- **Verified**: against **MySQL 8.0.46** in Docker. The verify line — *the
  MySQL integration test returns the same ranking* — passes: the task created
  **2020** outranks the one created **2030**, the same fixture and the same
  outcome as the SQLite branch. `SHOW INDEX` confirms `tasks_fts_idx` on
  (title, description) and `artifacts_fts_idx` on (name, description), both
  `FULLTEXT`. Full suite with MySQL enabled — **624 pass, 0 fail**.
  `moon check --all` — 26 pass.
- **Notes**: this entry was `blocked` for one commit. Docker was unavailable, so
  the code and a gated test were committed **unrun** and the box left unchecked;
  when Docker came back the test ran and both of the risks recorded at that
  point turned out to be answerable rather than speculative. Recording both
  outcomes, because a named risk that is never resolved is just a worry:
  1. **`LIMIT ?` / `OFFSET ?` bind fine** through mysql2's prepared statements.
     The first page could never have shown this — page one is always `OFFSET 0`
     — so there is now a paging test that walks seven rows at limit 2 and
     asserts no repeats, which is what actually exercises a non-zero offset.
  2. **`innodb_ft_min_token_size` is 3, and it bites.** A two-character term
     matches nothing in MySQL while SQLite's unicode61 tokenizer finds it. This
     is a real divergence between the dialects, not a bug: it is now asserted in
     both directions ("go" misses, "somewhere" hits the same row), so the
     difference is documented by a test rather than discovered by a user.
     Changing it means changing server configuration, which is a deployment
     decision and not this task's.
  **The relevance sorts run in opposite directions.** SQLite's `bm25()` is
  negative and *falls* as a match improves; MySQL's relevance is positive and
  *rises*. The `ORDER BY` directions differ to match, and the test asserts
  **order rather than presence** — inverting the sort would rank the worst match
  first while every membership assertion still passed.
  Boolean mode, not natural-language mode: the latter drops any word appearing
  in more than half the rows, which on a small table returns nothing for a
  perfectly good term and reads as a broken index.
  MySQL needs no triggers. InnoDB `FULLTEXT` is part of the table, so the index
  update is already inside the write's transaction — the guarantee the SQLite
  side needed six triggers to get.
  **The `LIKE` fallback was deleted rather than left dead**: after the dialect
  split it was unreachable in both branches, and unreachable code is not a
  fallback. Removing it exposed two exports the namespace import had hidden from
  knip — `buildCursorPaginationWhere`, which `executePaginatedQuery` still uses
  internally and only needed its `export` dropped, and `testSchema`, which is
  kept and annotated because deleting it would make the next generated migration
  propose `DROP`ping a live table.
  Only the match expression and the four statements differ per dialect; the
  trimming, offsets and stop condition are shared on purpose — that is where
  T06's High finding lived, and two copies would drift.
- **Next**: M07-T08

## M07-T08 — Five entity types behind one index-backed search

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: new `drizzle-sqlite/0026_fts5_projects_agents_comments.sql`
  (3 FTS5 tables, 9 triggers, 3 backfills) and
  `drizzle-mysql/0013_fulltext_projects_agents_comments.sql` (+ both journal
  entries), `main.tsp` **and** `health.proto` (`SearchResult.parentType`,
  `.parentId`), `modules/search/search.handler.ts` (entity-driven rewrite),
  `search.test.ts` (+7), `search.mysql.test.ts` (+1),
  `components/layout/GlobalSearch.tsx` and its test (+1, 2 rewritten)
- **Verified**: in a real browser — searching `Seed Agent` returns **5 agents**
  (the verify line), and searching a word inside a comment returns the comment
  titled with its **parent task**, snippet from the comment body, and
  `parentType`/`parentId` set. Both dialects tested for all five types;
  full suite with MySQL enabled — **630 pass**. `gui:test` — 620 pass, branches
  95.01%. `moon check --all` — 26 pass.
- **Notes**: the handler is now a list of `SearchEntity` values rather than two
  hard-coded blocks. Only the match expression and each type's SQL vary; the
  allocation, offsets and stop condition are shared, because that is where
  T06's High finding lived and five copies would drift.
  **The even split was a real defect, not just a thing to generalise.** Dividing
  the caller's limit evenly up front looks fair and quietly under-fills every
  page: with five types and a limit of 20, a term matching only tasks returned
  **four** results and a next cursor. It was already wrong at two types — the
  same search returned ten. Allocation is round-robin now: one row per type per
  pass until the page is full, which keeps the fairness (no type crowds out
  another that still has rows) and hands unused capacity to the types that
  actually matched. Presentation stays grouped by type.
  **A comment has no screen of its own**, so `SearchResult` gained
  `parentType`/`parentId` and the GUI routes on those. Overloading `id` would
  have produced a result that navigates to a URL matching no route.
  The same trap caught projects: the obvious `\`/projects/${id}\`` matches **no
  route** — there is no project detail view — so a project result would have
  landed on Not Found. Projects and agents both route to their list.
  Projects and agents are small enough that a `LIKE` scan would have been fast
  enough. They are indexed anyway so search *behaves* the same whatever it
  finds: a mixed implementation would have `cat` matching `concatenate` for a
  project and not for a task, which is worse than a slow query because it is
  invisible.
  Two GUI tests used `project` as their stand-in for "a type with no route".
  That type is routable now, so both were rewritten rather than deleted.
  Branch coverage needed two dead branches removed to stay at 95: an icon `??`
  fallback (unmapped types are filtered before render) and an empty-query guard
  inside a `queryFn` that `enabled` already gates.
- **Next**: M07-T09

## M07-T09 — Indexes reviewed against the hot query set

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: new `drizzle-sqlite/0027_hot_query_indexes.sql` and
  `drizzle-mysql/0014_hot_query_indexes.sql` (+ journal entries),
  `db/schema.sqlite.ts` and `db/schema.mysql.ts` (index definitions), new
  `db/indexCoverage.test.ts` (3 tests)
- **Verified**: the verify line — *no hot query performs a full table scan* —
  as an executable gate over 14 hot queries, not a one-time reading.
  `backend:test` 634 pass with MySQL enabled; `moon check --all` 26 pass.

  Plans after the change (`EXPLAIN QUERY PLAN`, SQLite):

  | Hot query | Plan |
  |---|---|
  | task list for a project | `SEARCH tasks USING INDEX tasks_project_created_idx (project_id=?)` |
  | one Kanban column | `SEARCH tasks USING INDEX tasks_project_status_created_idx (project_id=? AND status=?)` |
  | artifacts in a folder | `SEARCH artifacts USING INDEX artifacts_folder_created_idx (folder_id=?)` |
  | projects in an org | `SEARCH projects USING INDEX projects_org_created_idx (org_id=?)` |
  | agents in an org | `SEARCH agents USING INDEX agents_org_created_idx (org_id=?)` |
  | comments on a task | `SEARCH comments USING COVERING INDEX comments_entity_created_idx (entity_id=? AND entity_type=?)` |
  | pull requests for a task | `SEARCH remote_pull_requests USING INDEX remote_pull_requests_task_id_idx (task_id=?)` |
  | entities carrying a label | `SEARCH entity_labels USING INDEX entity_labels_label_id_idx (label_id=?)` |
  | members of an org | `SEARCH organization_members USING COVERING INDEX sqlite_autoindex_… (org_id=?)` |
  | notes on a task | `SEARCH task_notes USING INDEX task_notes_task_id_idx (task_id=?) \| USE TEMP B-TREE FOR ORDER BY` |
  | folders in a project | `SEARCH folders USING INDEX folders_project_id_idx (project_id=?)` |
  | labels in an org | `SEARCH labels USING INDEX labels_org_id_name_idx (org_id=?)` |
  | tasks awaiting my review | `SEARCH task_reviewers USING INDEX task_reviewers_user_id_idx (user_id=?)` |
  | when an agent last called | `SEARCH api_tokens USING INDEX api_tokens_agent_id_idx (agent_id=?)` |

- **Notes**: **two genuine full scans**, both on paths that look indexed until
  you read the plan.
  `remote_pull_requests` had **no index on `task_id`** — `SCAN
  remote_pull_requests` — and that is how both the task detail view and the
  dashboard's "done, but the PR is open" panel find a task's pull requests.
  `entity_labels` reported `SCAN … USING COVERING INDEX`, which reads as
  indexed and is not: the unique index is (entity_id, entity_type, label_id),
  so a lookup by **label alone** cannot seek into it and walks every entry.
  A composite index does not help a query that does not start at its first
  column.
  **The larger finding was the sort, not the scan.** Every ordered list read
  `SEARCH … USING INDEX (fk=?) | USE TEMP B-TREE FOR ORDER BY`: the *filter*
  used an index and the *sort* did not, so a project with 50,000 tasks sorted
  50,000 rows to return 50. That is not a full table scan, so the verify line
  as written would have passed over it. Adding the cursor's sort columns to
  each index removes the temp b-tree outright, measured one index at a time.
  It is asserted by its own test, separately from the scan gate, so the
  distinction stays visible.
  `tasks` needs **two** composites, not one: `status` sits between the filter
  and the sort columns, so `(project_id, status, created_at, id)` cannot serve
  the unfaceted list and `(project_id, created_at, id)` cannot serve a board
  column. The board is the hot path since T03 gave each column its own paging.
  **The composites are SQLite-only, on evidence.** MySQL rejected the
  four-column form outright — `error 1071: max key length is 3072 bytes`, since
  these are `varchar(256)` columns at 1,024 bytes each. Dropped to three columns
  it is legal, but measured on MySQL 8.0.46 with **20,000 tasks in one project**
  the optimiser kept `Using filesort` with `(project_id, status, created_at)`,
  with `(project_id, status, deleted_at, created_at)`, and **even under
  `FORCE INDEX`**. An index that does not change the plan is write amplification
  with no read benefit, so it is not added there; MySQL evaluates
  `ORDER BY … LIMIT 50` with a bounded priority queue rather than a full sort.
  The two scan fixes *are* mirrored, because those change the plan in both.
  `notes on a task` keeps its temp b-tree deliberately: it sorts one task's
  notes, a small bounded set, and an index to avoid that would cost more on
  write than it saves on read.
  The gate includes a test that the gate can fail — an unindexed probe table
  whose plan must contain `SCAN`. Without it, a typo in a query string would
  produce a plan nobody reads and a suite that passes vacuously.
- **Next**: M07-T10

## M07-T10 — Seeded to the scale target, and the measurement that found a 368-second search

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `scripts/seed.ts` (`--scale small|medium|large`, bulk project and
  artifact seeding), new `scripts/measure-latency.ts`, `package.json`
  (`measure:latency`), `modules/search/search.handler.ts` (`CROSS JOIN`)
- **Verified**: the verify line — *measured p95 numbers are committed* — below.
  Fixture: **50,004 tasks** in the measured project, **100,000 artifacts** in
  the measured folder, **2,001 projects** and **100,002 members** in the
  measured orgs. 50 samples per endpoint, 5 discarded as warmup, percentiles by
  nearest rank. `moon check --all` — 26 pass.

  | Endpoint | Budget | p50 | p95 | Within budget |
  |---|---|---|---|---|
  | `listTasks (project, first page)` | 150 ms | 11.1 ms | 16.4 ms | yes |
  | `listTasks (one board column)` | 150 ms | 11.1 ms | 12.8 ms | yes |
  | `listArtifacts (folder, first page)` | 150 ms | 18.8 ms | 23.4 ms | yes |
  | `listProjects (org)` | 150 ms | 0.6 ms | 0.9 ms | yes |
  | `listAgents (org)` | 150 ms | 0.4 ms | 0.7 ms | yes |
  | `listOrgMembers (org)` | 150 ms | 105.1 ms | 115.9 ms | yes |
  | `universalSearch` | 300 ms | 163.7 ms | 175.0 ms | yes |
  | `getDashboard` | 300 ms | 39.3 ms | 43.1 ms | yes |

- **Notes**: **the script found a defect on its first real run, and it was
  enormous.** `universalSearch` took **368,877 ms** — six minutes — for a term
  matching 50,000 rows. The plan said why:

  ```
  SEARCH p USING COVERING INDEX projects_org_created_idx (org_id=?)
  | SEARCH t USING INDEX tasks_project_id_idx (project_id=?)
  | SCAN tasks_fts VIRTUAL TABLE INDEX 0:=M2
  ```

  SQLite had inverted the join: it drove from **projects**, then **tasks**, and
  probed the FTS table once per task row, instead of letting the match set
  drive. Pinning the order with `CROSS JOIN` takes the same query to **58 ms** —
  a **4,500x** difference, and the whole endpoint from 368 s to 175 ms p95.
  **The index that caused it was one I added in T09.** `projects_org_created_idx`
  exists to make an ordered project list seek instead of sort, and it did — and
  it also made `projects` look like an attractive driving table for a query in a
  different module. An index is a global change to every plan in the schema, not
  a local improvement to one query. Nothing in T09 could have caught this,
  because T09 measured the plans of the queries it was about.
  `CROSS JOIN` is now load-bearing in every SQLite FTS query and says so in the
  code. It is not a style choice; plain `JOIN` is a 4,500x regression waiting
  for the next index anyone adds.
  **My own script also lied once, and had to be fixed before its numbers were
  worth committing.** The first version picked the org owning the biggest task
  project and measured *every* endpoint there — so `listProjects` and
  `listOrgMembers` were measured against an org with **1 project and 2
  members**, and reported sub-millisecond figures. Real numbers, meaningless,
  which is worse than none. Each endpoint now resolves its own largest fixture,
  and the header prints the sizes so the reader can check.
  It also printed nothing until the final table, which made the six-minute
  search indistinguishable from a hang. Progress now goes to stderr as each
  endpoint starts.
  `listOrgMembers` at 100,002 members is **115.9 ms p95** against a 150 ms
  budget — comfortably inside, but the closest of the eight, and the one to
  watch if the budget tightens.
- **Next**: M07-T11

## M07-T11 — A latency budget per endpoint, in the standard

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `.specs/standards/api-standard.md` (new §6 "Latency budgets";
  the two sections after it renumbered)
- **Verified**: the verify line — *each list endpoint has a stated budget*.
  There are **22** `list*` methods across the handlers, so the budget is stated
  as a **default that binds all of them** (150 ms) plus two named exceptions
  (`universalSearch` and `getDashboard`, 300 ms), rather than a 22-row table.
  `moon run tasker:docs-lint` — 189 files pass. `moon check --all` — 26 pass.
- **Notes**: a table of 22 rows would have been literally complete and wrong in
  practice: the twenty-third endpoint arrives without a budget, and nobody
  notices because the list looks thorough. A default binds an endpoint written
  next month on the day it is written.
  The budget is defined as **p95 of the handler's own answer time**, not the
  round trip, because a figure that includes the socket measures the machine's
  networking as much as the read path — and the browser-side number is already
  measured separately, in a real browser (T03).
  The standard points at `bun run measure:latency` and says plainly that it
  **exits non-zero** over budget, so the budget is a check rather than a
  report. It points at this journal for the committed figures, on the grounds
  that a number without the fixture it was measured against is an anecdote.
  It also carries the warning T10 earned: re-measure after touching the schema,
  because an index added for one query changes the plan of every other — which
  is exactly how `universalSearch` reached 368 seconds while every unit test
  passed in milliseconds.
- **Next**: close M07

## M07-T12 — The last unbounded fetches, and a deep link that walked the tree

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `main.tsp` **and** `health.proto` (new `getArtifact`),
  `modules/artifacts/artifacts.handler.ts`, `lib/scopes.ts`,
  `lib/viewer-denial.test.ts`, `features/Artifacts/index.tsx` and its test
  (2 rewritten), `features/Tasks/index.tsx`
- **Verified**: in a real browser against the seeded scale fixture. Opening a
  folder holding **100,000 artifacts** issues **one** `ListArtifacts` and offers
  "Load more artifacts"; before this it walked every page. Deep-linking
  `/artifacts/:id` to an artifact **500 rows deep** issues **one**
  `GetArtifact` and renders it. `gui:test` 620 pass; `moon check --all` 26 pass.
- **Notes**: exit criterion 1 asks that each remaining `fetchAllPages` be
  justified. Reading them showed two that could not be:
  the artifacts list walked **every page of a folder**, and a folder is
  unbounded — the scale fixture puts 100,000 in one, which is ~2,000 sequential
  requests to render a list nobody scrolls to the end of. It is a paged
  `useInfiniteQuery` now.
  Worse, the **deep-link locate walked every folder in the project and every
  page of each** until the row turned up. The comment above it said why —
  *"the contract exposes no GetArtifact RPC"* — which is a description of a
  missing endpoint, not a justification. Adding `getArtifact` turns
  O(folders x pages) into one request, and it returns the `folderId` the tree
  needs to expand, which is the only reason the walk existed.
  **A comment explaining what the code does is not a justification.** All three
  of these had comments and passed a reading; the criterion asks why the *full
  set* is required, and only one of the three could answer it.
  Three uses remain, each stating why: the folder **tree** (a tree missing a
  branch is not partially loaded, it is wrong, and folders are navigation
  structure a person maintains by hand), the agents list (already justified in
  T04), and one task's notes (bounded by what agents wrote about a single task,
  and a chronological record that reads wrongly if it stops partway).
  `getArtifact` names its columns and excludes `content`, for the same reason
  the list does — it is not the response a 15 MB body belongs in. Both
  deny-by-default sweeps needed it classified before they would pass.
- **Next**: M07-T13

## M07-T13 — Highlighted snippets, as offsets rather than markup

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `main.tsp` **and** `health.proto` (new `SnippetMatch`,
  `SearchResult.snippetMatches`), `modules/search/search.handler.ts`
  (`buildSnippet` returns ranges, new `findMatches`), `search.test.ts` (+3),
  `components/layout/GlobalSearch.tsx` (new `HighlightedSnippet`) and its test
  (+4)
- **Verified**: in a real browser — searching a word that appears inside a
  snippet renders real `<mark>` elements around it
  (`<mark class="bg-warning-subtle …">scale</mark>`), and a word that matches
  only the *name* correctly produces no marks, because the snippet is drawn
  from the description. `gui:test` 624 pass, branches 95.10%.
  `moon check --all` — 26 pass.
- **Notes**: **the server sends offsets, not markup.** Wrapping the matches in
  tags server-side would have been less code in two places and would have made
  the snippet HTML the client must trust and render — an injection hole opened
  for a visual nicety. Ranges keep the snippet plain text, and `<mark>` is the
  element that already means "relevant to what the user is doing", so the
  emphasis reaches a screen reader rather than being a styled `span`.
  Offsets are computed against **the finished snippet**, not the source text.
  The snippet is trimmed and carries a leading ellipsis, so a range measured
  against the original lands on the wrong characters — and by a different
  amount for every result, which presents as a font or encoding problem rather
  than an off-by-N. There is a test that slices the snippet by the returned
  range and asserts it equals the search term.
  Overlapping ranges are merged, because "migration migrations" tokenises to
  two words that match the same text and the client would otherwise be asked to
  nest one `<mark>` inside another.
  **The contract edit landed in the wrong message and the type checker caught
  it.** `SearchResult` and `TaskType` both end `parentId = 6`, so a
  first-match replace put `snippetMatches` on `TaskType`. The TypeSpec was
  right and the proto was wrong — the two hand-maintained files disagreeing is
  exactly the failure mode this repo keeps hitting, and only `gui:build`
  noticed.
  One `?? []` was removed as dead and then **restored**: proto3 always
  materialises a repeated field, so it is unreachable from the server — but two
  existing tests construct results without it, and a component that renders
  whatever it is handed should not depend on that. Its restoration is what
  those tests now cover.
- **Next**: M07-T14

## M07-T14 — Virtualized lists — IN PROGRESS, 3 of 8 views

- **Status**: in-progress
- **Date**: 2026-08-16
- **Changed**: new `components/ui/VirtualList.tsx` and its test (5 tests),
  `features/Artifacts/index.tsx` (artifact list virtualized)
- **Verify line**: *every list view renders its rows through a virtualizer.*
  **Not met.** Three of eight do: the task board and the org member list
  already did, and the artifact list does now. **Projects, Agents, Labels, Bin
  and TaskTypes still render one node per row.** The box stays unchecked.
- **What landed**: a shared `VirtualList`. The board and the member list each
  grew their own copy of the wiring, and a third and fourth copy is how the
  overscan, the absolute positioning and the total-height maths drift apart
  between views that should behave identically. It is tested for the property
  that matters — 10,000 items produce far fewer than 10,000 DOM nodes — and for
  the one that is easy to get wrong: the scroll area is sized to the whole list,
  not to the rendered window, or the list looks short and cannot be scrolled to
  the rows it is hiding.
  The artifact list is the case that actually mattered: a folder holds 100,000
  rows at the scale target, and every one of them was a DOM node.
- **Notes**: **`VirtualList` deliberately has no "load more when you reach the
  bottom" hook.** The first version had one, and it fired on mount — with a
  short list every render is already at the bottom, so it fetched the next page
  immediately, which is paging that does not page. Callers offer an explicit
  control instead. The first version also called it *during render*, which
  fires a parent's state update mid-render; React either warns or loops.
  **The remaining five are not a copy-paste of this one.** Projects renders
  variable-height cards that grow an inline edit form when opened, so a
  fixed-height virtualizer would misplace every row below the one being edited.
  That view needs either measured rows or a row redesign, and it is a real
  decision rather than mechanical work — which is why it is not being rushed
  into this entry.
- **Next**: M07-T14 continues — Projects (needs variable-height handling or a
  uniform row), then Agents, Bin, Labels and TaskTypes, which are uniform rows
  and should take the shared component directly.

---

## Out-of-band — dashboard rework (not an M07 task)

Requested directly by the user between T05 and T06, after a feature review of
the product from a user's point of view. **`active_task` stays `M07-T06`**; this
entry is here because it is where the next reader looks chronologically, not
because it belongs to the milestone.

- **Problem**: the home screen showed four entity counts — organizations,
  projects, agents, tasks — plus database latency. Counts of things that exist
  only ever climb, and none of the four survived the question "what will you do
  differently because of this number?". The four were also at three different
  scopes on one row, so switching project changed one card and left three still.
- **Change**: one new RPC, `DashboardService.GetDashboard`, and four panels that
  answer a supervisor's actual questions in order — what is waiting on my
  judgement, where does the record disagree with reality, which agents have gone
  quiet, and what have they been writing. The server does the joins; the browser
  makes one round trip rather than four.
  The "disagreement" panel is the one worth keeping: `status = 'done'` joined
  against a pull request still `open`/`draft`. Industry writing on agent-native
  trackers is consistent that the bottleneck is verification capacity, not
  production — a panel that surfaces where the *record* and the *diff* contradict
  each other is the exit-side gate this product otherwise only has at the
  entrance.
- **Verify**: `moon check --all` — 26 tasks pass, `gui:test` 619 pass at 95.00%
  branches, `backend:test` 608 pass. Playwright: 18 pass.
- **Notes**: three defects here were invisible to jsdom and only a browser found
  them, which is why this work added `apps/gui/tests/e2e/dashboard.spec.ts`
  rather than stopping at unit tests.
  1. `max(apiTokens.lastUsedAt)` bypasses drizzle's decoding and returns the raw
     column. That column is `mode: "timestamp"` — **seconds** — so reading it as
     milliseconds reported every agent as last seen in 1970. There is now an
     e2e assertion that no agent renders a five-digit day count.
  2. Moving System Health to `/settings` was only half a move: the route was
     reachable by URL but had **no sidebar entry**, so telemetry would have been
     effectively deleted rather than relocated. Caught by looking at a
     screenshot, not by any test — every test navigated by URL. The spec now
     navigates by *click*.
  3. Seeding the wrong organization produced four plausible empty panels. The
     GUI picks `orgs[0]`, which was not the first org `dev-user` belongs to;
     the fixtures had to be pointed at the org the running app actually asks
     for. An empty panel and a broken join look identical from the outside.
  Both deny-by-default sweeps (`viewer-denial`, `agent-scope-sweep`) needed a
  new helper to enumerate a handler that registers onto a router; they then
  caught `getDashboard` immediately. `getDashboard` is `requireUser` — a
  supervision console is a human's screen, and agents have no business reading
  it.
  Two pre-existing e2e specs asserted the old `Dashboard Overview` heading and
  were updated. A third, `comments.spec.ts`, had been failing on a clean tree
  since before this work and is now fixed — see below.

## Out-of-band — repairing `comments.spec.ts`

- **Problem**: the spec clicked a board card and waited for the task-detail
  dialog, which never opened. Playwright clicks an element's **centre**, and a
  card's centre is now the `AssigneePicker`, which deliberately calls
  `stopPropagation` so that choosing an assignee does not also open the task.
  So the card's `onClick` never fired. The product behaviour is right; the spec
  was clicking a spot that stopped meaning "open this task" when the picker
  landed on the card.
- **Change**: click the card's `h4` title — the actual affordance — instead of
  the card body. The assertion was also anchored to the comment this run posts
  (`check <stamp>`) rather than to any `strong` containing "bold", which a
  comment left behind by an earlier run would have satisfied. As written before,
  the test would have survived the post silently failing.
- **Verify**: Playwright — 19 pass, 0 fail. `moon check --all` — 26 tasks pass.
- **Notes**: the failure mode is specific and easy to repeat: a centred click is a guess
  about layout, and any component that legitimately swallows clicks in the middle
  of a container silently invalidates every test that clicks that container.
  Prefer clicking the named affordance.
