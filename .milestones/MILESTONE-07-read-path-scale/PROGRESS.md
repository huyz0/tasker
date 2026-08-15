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
