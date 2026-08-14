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
