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

## M07-T07 — MySQL FULLTEXT branch — BLOCKED, cannot be verified here

- **Status**: blocked
- **Date**: 2026-08-16
- **Changed**: new `drizzle-mysql/0012_fulltext_search_index.sql` (+ journal
  entry in `meta/_journal.json`), `modules/search/search.handler.ts` (dialect
  split, LIKE branch deleted), new `modules/search/search.mysql.test.ts`
  (2 tests, gated), `db/query-builder.ts` (un-export), `schema.sqlite.ts`
  (knip annotation), `knip.json` (`tags`)
- **Verify line**: *the MySQL integration test returns the same ranking.*
  **Not run.** There is no MySQL in this environment: no `mysql` client, and
  Docker Desktop's daemon is not reachable from this WSL distro
  (`failed to connect to the docker API at npipe:////./pipe/…`). The test is
  written and gated behind `TASKER_MYSQL_INTEGRATION=1`, matching the existing
  `tasks.mysql.test.ts` convention, so it runs the moment a MySQL is present —
  but it has **never executed**, and the box stays unchecked because of it.
- **What was verified**: the SQLite branch still ranks correctly through the
  GUI after the dialect refactor (the 2020 task still outranks the 2030 one),
  `backend:test` 618 pass with the 2 MySQL tests skipped, `moon check --all`
  26 pass.
- **Notes**: the shared code is deliberate. Only the match expression and the
  four statements differ per dialect; trimming, offsets and the stop condition
  are shared, because that is exactly where T06's High finding lived and two
  copies would drift.
  **The relevance sort runs in opposite directions.** SQLite's `bm25()` is
  negative and *falls* as a match improves, so it sorts ascending; MySQL's
  relevance is positive and *rises*, so it sorts descending. Getting this
  backwards ranks the worst match first while every membership assertion still
  passes — which is why the gated test asserts order, not presence.
  MySQL needs no triggers: InnoDB `FULLTEXT` is part of the table, so the index
  update is already inside the write's transaction. The SQLite side needed six
  triggers for the guarantee this dialect gets for free.
  **Two named risks in the unexecuted path**, both of which the gated test
  exists to catch:
  1. `LIMIT ?` / `OFFSET ?` as bound parameters. mysql2 uses prepared
     statements for `execute`, and MySQL has historically refused placeholders
     in `LIMIT`. If it does, this fails loudly on the first clustered search.
  2. `innodb_ft_min_token_size` defaults to **3**, so two-character words are
     not indexed at all. SQLite's unicode61 tokenizer has no such floor. The
     dialects will disagree on short terms, and that is a real behavioural
     difference rather than a bug to fix blindly.
  **The `LIKE` fallback was deleted, not left dead.** After the dialect split it
  was unreachable in both branches, and unreachable code is not a fallback. The
  consequence is stated plainly: clustered-mode search now runs a path no test
  has executed. Deleting it also revealed two exports that the removed namespace
  import had been hiding from knip — `buildCursorPaginationWhere`, which is used
  internally by `executePaginatedQuery` and only needed its `export` dropped,
  and `testSchema`, which is kept and annotated because removing it would make
  the next generated migration propose `DROP`ping a live table.
- **Next**: M07-T07 stays open. Run
  `docker compose up -d mysql && TASKER_MYSQL_INTEGRATION=1 bun test src/modules/search/search.mysql.test.ts`
  from `apps/backend`, fix what it finds, then check the box.

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
