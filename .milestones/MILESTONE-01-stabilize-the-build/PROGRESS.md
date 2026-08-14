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

## M01-T06 — GUI tests and the coverage gate run in CI
- **Status**: done
- **Date**: 2026-08-15
- **Changed**: .github/workflows/ci.yml
- **Verified**: `act` is not available here, so the workflow itself cannot be
  executed locally; instead the exact command the job now runs was executed
  directly, twice broken on purpose:
  - green: `moon run gui:lint gui:typecheck gui:test gui:build` — 4 tasks
    completed, exit 0.
  - broken assertion (renamed the heading NotFound.test.tsx asserts on):
    `Tests 1 failed | 378 passed`, `Task gui:test failed to run`, exit 1.
  - broken coverage (thresholds raised to 100): `ERROR: Coverage for lines
    (99.91%) does not meet global threshold (100%)`, exit 1.
  Both deliberate breaks were reverted and the command re-run green.
- **Notes**: `gui:test` maps to `vitest run --coverage`, so adding the single
  task to the job gates merges on the suite *and* on the 95% thresholds in
  `vitest.config.ts` — proving the second one mattered, since a passing suite
  with sinking coverage would otherwise still merge. Installed moon 2.4.6 via
  `proto install moon` to run any of this; it was not present on this machine.
- **Next**: M01-T07

## M01-T07 — E2E runs in CI
- **Status**: done
- **Date**: 2026-08-15
- **Changed**: apps/gui/playwright.config.ts, apps/gui/moon.yml,
  .github/workflows/ci.yml, apps/gui/tests/e2e/universal-search.spec.ts,
  apps/gui/tests/e2e/comments.spec.ts
- **Verified**: The literal Verify line ("E2E job runs and passes on a pull
  request") needs a PR, which this session will not open. Everything short of
  the runner was executed here instead: seeded a fresh database, started the
  backend, and ran the exact command the CI job runs —
  `moon run gui:e2e` → **2 passed, exit 0**. The workflow file parses and now
  declares five jobs (contract, gui, gui-e2e, backend, cli).
- **Notes**: Removing the pinned `executablePath` was the smallest part of this.
  Once the specs could actually launch a browser, **both of them failed** —
  they had never run against the product:
  - `universal-search` waited on `text=Tasker`, which matches the mobile
    header's brand first; that node is `md:hidden` and never visible at the
    desktop viewport, so it timed out at 30s. Now waits on the dashboard
    heading, and picks the visible one of the two search buttons.
  - `comments` clicked `.bg-card.border.rounded-md`, a Tailwind class chain.
    Now selects the board card by structure (a `role=button` containing an
    `h4`) and waits for the detail overlay, which is a route change since T01.
  Both rewritten rather than retry-masked, per the milestone's stated risk
  position. Local browser notes (environment, not repo): this machine is Ubuntu
  26.04, which Playwright 1.59 has no browser build for —
  `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64` plus nspr/nss/asound
  extracted into a scratch dir on `LD_LIBRARY_PATH` got it running without
  touching system packages. CI uses `--with-deps`, which handles this properly.
  `gui:e2e` is `cache: false` on purpose: its result depends on a live server
  and database that moon cannot fingerprint.
- **Next**: M01-T08

## M01-T08 — Remove the unreachable specs, keep what they meant
- **Status**: done
- **Date**: 2026-08-15
- **Changed**: apps/gui/e2e/{agents,organizations,projects,tasks}.spec.ts
  (removed), apps/gui/tests/e2e/navigation.spec.ts (new)
- **Verified**: `find apps/gui -name '*.spec.ts' -not -path '*/node_modules/*'
  -not -path '*/tests/e2e/*'` returns nothing — the Verify line exactly. The
  ported suite runs for real: `moon run gui:e2e` → **13 passed, exit 0**
  against the seeded backend.
- **Notes**: Read each of the four before deleting, rather than assuming stale.
  Two assertions no longer described the app and were dropped: Organizations
  expected an "Admin User" string and Projects a "Software Development"
  template, neither of which exists anywhere in the GUI. The rest was real
  intent worth keeping — every sidebar destination renders its own view — so it
  is now one table-driven `navigation.spec.ts` covering all eight routes, plus
  the agents visualiser panel and the Kanban columns from the old specs. Added
  an unknown-URL case, which puts M01's "no reachable URL renders an empty
  content area" exit criterion under a real browser.
  One porting fix along the way: the column label element carries its count
  ("Todo 15"), so the old text match could never have matched exactly; the test
  keys off each column's `Add task to <column>` control instead.
- **Next**: M01-T09

## M01-T09 — Align the Go toolchain
- **Status**: done
- **Date**: 2026-08-15
- **Changed**: .prototools, .github/workflows/ci.yml
- **Verified**: `moon setup && moon run cli:build` — exit 0, binary built on
  go1.26.1 from `proto`'s shim (`which go` → `~/.proto/shims/go`,
  `go version` → `go1.26.1`). Also ran the CLI job's full command,
  `moon run cli:format cli:vet cli:test cli:build` — 4 tasks completed, tests
  ok at 58.4% coverage.
- **Notes**: The pin was not merely imprecise, it was *below* the floor:
  `.prototools` said 1.26.0 while `apps/cli/go.mod` declares `go 1.26.1`, so
  the pinned toolchain was older than the module's own minimum. Pinned to
  1.26.1 with a comment naming go.mod as the constraint. CI now uses
  `go-version-file: apps/cli/go.mod` instead of `go-version: '1.26'` — the same
  version by construction, and it cannot drift when go.mod moves.
  Worth flagging for the exit criteria: `moon setup` is currently a no-op here
  ("Unable to setup, no toolchains are configured!") because the workspace has
  no `toolchain.yml`; tool installation actually happens through proto's
  `auto-install`. It exits 0, so the Verify line holds, but the exit criterion
  about a machine with only `moon` installed leans on proto's auto-install
  rather than on `moon setup` doing anything.
- **Next**: M01-T10

## M01-T10 — One lockfile per ecosystem
- **Status**: done
- **Date**: 2026-08-15
- **Changed**: apps/gui/package-lock.json (removed),
  .specs/standards/dependency-standard.md
- **Verified**: `find . -name 'package-lock.json' -not -path '*/node_modules/*'`
  returns nothing — the Verify line exactly. Widened the same search to
  `yarn.lock`, `pnpm-lock.yaml` and `bun.lockb`: also nothing, so `bun.lock` at
  the root is now the only JS lockfile in the repository. `moon run gui:build
  --force` (cache bypassed) still succeeds without it.
- **Notes**: The standard was not silent on this, it was *wrong* — it told
  contributors to commit `package-lock.json` and `bun.lockb`, neither of which
  this repo uses, which is presumably how the stray file survived. Rewrote the
  Lockfiles rule to name `bun.lock` as the only permitted JS/TS lockfile, list
  the forbidden ones explicitly, and say why a second lockfile is harmful: it
  records a second unverified resolution of the same graph that no build step
  ever reads.
- **Next**: M01-T11

## M01-T11 — knip gates unused code and dependencies
- **Status**: done
- **Date**: 2026-08-15
- **Changed**: package.json, knip.json (new), moon.yml, apps/gui/moon.yml,
  packages/shared-contract/package.json, apps/backend/src/db/query-builder.ts,
  apps/backend/src/lib/requestContext.ts,
  apps/backend/src/modules/repositories/providers/bitbucket.ts,
  apps/backend/src/test/setup.ts,
  apps/gui/src/components/PaginationControls.tsx,
  apps/gui/src/components/ui/{comments,labels}/{index.ts,*Context.tsx}
- **Verified**: `bunx knip` — **exit 0, no output**, the Verify line exactly.
  `moon run :knip` runs it as a task and `moon check tasker` includes it.
  Nothing regressed: `moon run gui:lint gui:typecheck gui:test gui:build
  backend:test backend:lint :knip` — 7 tasks completed, and
  `cli:format cli:vet cli:test cli:build shared-contract:format` — 5 completed.
- **Notes**: Four dependencies were genuinely dead and are gone —
  `@connectrpc/connect-query`, `clsx`, `tailwind-merge`, `globals` (an
  artefact of an eslint config this repo replaced with oxlint; its only textual
  match was vitest's unrelated `globals: true` option). Five more that knip
  flagged are *not* dead and stay, with a documented `ignoreDependencies`:
  `@typespec/compiler` and `@bufbuild/buf` supply the `tsp`/`buf` binaries the
  contract build shells out to, `@bufbuild/protoc-gen-es` is a buf plugin,
  `@typespec/protobuf` is imported by `main.tsp`, and `tailwindcss` enters
  through `@import "tailwindcss"` in `index.css` — none reachable by import
  graph. Checked each one rather than deleting on knip's say-so.
  The 34 "unused exports" were mostly not dead code but unnecessary `export`
  keywords: symbols used only inside their own module (`applyFilter`,
  `parseSort`, `requestContextStore`, `bitbucketAuthHeader`,
  `MockNatsPublishSpy`) and barrel re-exports nobody imported. Unexported those,
  deleted two `PaginationParams` interfaces that had no remaining reference at
  all, and scoped generated contract output (`gen/**`) out of the analysis since
  it is regenerated by `shared-contract:compile`.
  Two small things found on the way: `packages/shared-contract/package.json`
  declared `main: index.js`, a file that does not exist (consumers deep-import
  `shared-contract/gen/...`), and `apps/gui/moon.yml` listed `bun.lockb` as a
  build input — a filename that has never existed here, so dependency changes
  never invalidated the GUI build cache. Both fixed.
- **Next**: M01-T12
