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
