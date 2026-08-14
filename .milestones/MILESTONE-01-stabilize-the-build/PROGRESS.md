# M01 — Stabilize the Build · Progress Journal

Append-only. Newest entry at the bottom. One entry per task attempt.

## M01-T01 — URL-driven task and artifact detail routes
- **Status**: done
- **Date**: 2026-08-15
- **Changed**: apps/gui/src/App.tsx, apps/gui/src/features/Tasks/index.tsx,
  apps/gui/src/features/Artifacts/index.tsx, plus both feature test files
- **Verified**: `bun run test` — 370 pass (36 files); `bun run test:coverage`
  — 99.62% statements / 95.6% branches, above the 95% gate; `bunx tsc --noEmit`
  and `bun run lint` clean. Ten new tests cover the deep links directly:
  mounting at `/tasks/task-1` opens that task's overlay with no click, and
  mounting at `/artifacts/art-1` renders its content with its folder expanded —
  a reload is the same fresh mount at the same URL.
- **Notes**: The open task/artifact now comes from `useParams`, not `useState`.
  The contract has no `GetArtifact` RPC, so a deep link resolves the artifact by
  walking the project's folders until it matches, then expands that folder.
  Found and worked around a real hazard while doing it: a mutation-level
  `onSuccess` closure lags one render behind component state (proven by
  instrumenting `archiveFolder` — `selectedFolderId` read as `null` after the
  render that set it to `fld-1`). The delete paths now decide "was this the open
  one" at click time and pass a per-call `onSuccess`. The same latent staleness
  still affects the `['artifacts', selectedFolderId]` invalidations elsewhere in
  the file; left alone as out of scope for this task.
- **Next**: M01-T02

## M01-T02 — Not Found view on the catch-all route
- **Status**: done
- **Date**: 2026-08-15
- **Changed**: apps/gui/src/pages/NotFound.tsx (new), NotFound.test.tsx (new),
  NotFound.stories.tsx (new), apps/gui/src/App.tsx, apps/gui/src/App.test.tsx
- **Verified**: `bun run test` — 375 pass (37 files). The Verify line is a test:
  rendering the app at `/nonsense` shows the "Page not found" heading and the
  "Back to dashboard" link, with the sidebar still mounted around it. Coverage
  99.62% statements / 95.6% branches, `bunx tsc --noEmit` and lint clean.
- **Notes**: The catch-all sits inside the shell, so an unknown URL keeps the
  sidebar and gets a route back rather than an empty content area. The view
  names the missed path, which makes a typo self-explanatory. `/login` is
  matched by the outer route first and is unaffected.
- **Next**: M01-T03

## M01-T03 — Every search result lands on a rendered entity
- **Status**: done
- **Date**: 2026-08-15
- **Changed**: apps/gui/src/components/layout/GlobalSearch.tsx,
  GlobalSearch.test.tsx, apps/gui/src/App.test.tsx
- **Verified**: `bun run test` — 379 pass (37 files); coverage 99.62% statements
  / 95.59% branches; typecheck and lint clean. The Verify line is covered by
  mounting the app at `resultRoute({type:'task'})` and asserting the Tasks
  Workbench heading renders and Not Found does not — the same for artifacts.
- **Notes**: Confirmed against `search.handler.ts` that `universalSearch` emits
  exactly two result types, `task` and `artifact`; both now have routes (T01).
  Replaced the two inline `if (result.type === …) navigate(…)` lines with an
  exported `resultRoute` over a single `ROUTE_BY_RESULT_TYPE` map, and results
  with no route are filtered out of the list rather than rendered as a dead
  click. That is what makes "every rendered result navigates somewhere real"
  true by construction instead of by inspection.
- **Next**: M01-T04

## M01-T04 — Read-only health probe
- **Status**: done
- **Date**: 2026-08-15
- **Changed**: apps/backend/src/modules/health/health.handler.ts,
  apps/backend/drizzle-sqlite/0020_purge_health_probe_rows.sql,
  apps/backend/drizzle-sqlite/meta/_journal.json,
  apps/backend/src/modules/health/health.test.ts
- **Verified**: `bun run test` (backend) — 326 pass, 7 skip, 0 fail across 33
  files; lint unchanged from baseline (the same 5 pre-existing warnings, none
  in touched files). The Verify line is now a test: it reads
  `SELECT count(*) FROM search_index`, pings 100 times asserting
  `sqlite+fts5-ok` each time, and asserts the count is identical afterwards.
- **Notes**: The probe now runs `SELECT count(*) … WHERE search_index MATCH
  'health'`, which proves the same thing the INSERT did (fts5 loaded, index
  queryable) without writing. `count(*)` always returns exactly one row, so the
  `sqlite-error` branch still means something rather than becoming dead code.
  The cleanup migration is hand-written because `search_index` is created
  outside drizzle (db.ts) and excluded by drizzle-kit's `tablesFilter`; a second
  test runs the migration file itself against a seeded contentless table. Probed
  SQLite first to confirm the mechanics: a contentless fts5 table rejects
  `DELETE FROM` and `'rebuild'`, so `'delete-all'` is the supported way to empty
  it, and the probe was the index's only ever writer so clearing it is correct.
- **Next**: M01-T05

## M01-T05 — `moon run dev` produces a logged-in app
- **Status**: done
- **Date**: 2026-08-15
- **Changed**: scripts/dev.sh, apps/backend/.env.example (new),
  apps/gui/.env.example (new), README.md, apps/gui/README.md,
  apps/backend/src/db/db.ts, apps/backend/scripts/seed.ts
- **Verified**: Ran the real thing, not a proxy. Before: `/api/auth/test/inject`
  returned `403 {"title":"Test login disabled"}`. After, from a wiped `.data/`:
  `bash scripts/dev.sh` → GUI 200, inject 200 with a `session` cookie, and as
  the GUI's own dev user `ListOrgs`/`ListProjects`/`ListAgents` all 200 and
  `ListTasks` returns 50 rows of `totalCount: 150`. Zero 403s in the run log.
  Backend suite still 326 pass / 7 skip / 0 fail; lint unchanged from baseline.
- **Notes**: Three separate things stood between a fresh clone and a working
  app, not the one the task named:
  1. `ENABLE_TEST_LOGIN` was never set, so every dev session bootstrap 403'd.
     `dev.sh` now defaults it (`${ENABLE_TEST_LOGIN:-true}`) rather than forcing
     it, so `ENABLE_TEST_LOGIN=false moon run dev` still works. It cannot leak
     into production — the backend refuses to boot with it under
     `NODE_ENV=production`.
  2. A fresh clone has no `apps/backend/.data/`, and SQLite will not create a
     database file's parent directory: the very first `moon run dev` died with
     `SQLITE_CANTOPEN` before listening. Fixed in `db.ts` rather than the dev
     script, so tests and the standalone binary get the same guarantee.
  3. `bun run seed` created its own user, so the seeded data was invisible to
     the browser session until someone pasted the printed token by hand. The
     seed now also makes the GUI's `dev-user` a member of the seeded org.
  Divergence from the task's file list: it named only `dev.sh`, the two
  `.env.example`s and `README.md`; `db.ts` and `seed.ts` were needed to make the
  stated outcome actually hold.
  Left alone (out of scope): `bun run seed` still fails on a second run against
  the same database, on `UNIQUE constraint failed: users.email`.
- **Next**: M01-T06
