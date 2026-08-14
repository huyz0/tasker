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
