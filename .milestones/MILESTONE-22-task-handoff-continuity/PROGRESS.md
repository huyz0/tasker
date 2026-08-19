# M22 Progress Journal

## M22-T01 — Save spec documentation

- **Status**: done
- **Date**: 2026-08-19
- **Changed**: `.specs/specs/2026-08-19-1659-task-handoff-continuity/`
  (`shape.md`, `standards.md`, `references.md`, `plan.md`),
  `.specs/adr/ADR-0017-handoff-notes-are-a-typed-tasknote-distinction.md`,
  `.milestones/MILESTONE-22-task-handoff-continuity/MILESTONE.md`, this
  file.
- **Verified**: All files written per `milestone-standard.md` and
  `spec-shape`'s documented output format; `.specs/adr/README.md`'s ADR
  format followed (frontmatter + Context/Options/Decision/Consequences,
  real alternatives with reasons for rejection). `moon run
  tasker:docs-lint` run against the new files.
- **Notes**: Design was shaped interactively in plan mode, following
  directly on from the M21 closeout discussion. Three exploration passes
  (backend, GUI, CLI) via Explore subagents confirmed the concrete
  extension points before any decision was finalized — notably that
  `createTaskNote` already denies a human principal, that neither
  `claimTask` nor `getTask` join notes today, that the GUI's task-notes
  query is already eager (so the task-detail summary needs no new
  network call), and that this codebase's skill-forge adapter generation
  requirement (learned the hard way in M21-T09) still applies unchanged.
  Two rounds of `AskUserQuestion` materially shaped the design: (1) the
  user confirmed handoff notes stay agent-authored only, matching the
  existing restriction, rather than loosening it for a claiming human;
  (2) the user's own free-text answer overrode both offered options for
  where a handoff note surfaces — not lumped into the general notes
  panel, and not confined to a per-task sub-view either, but a compact
  task-detail summary (count + last few) that clicks through to a new
  top-level cross-task "Handoffs" screen, mirroring how Memory got its
  own nav entry in M21. That single answer added `listHandoffNotes` (a
  new RPC, absent from the first draft) to scope. One ADR was judged
  sufficient (`ADR-0017`) rather than M21's three, since this milestone
  makes one real decision (typed distinction on an existing entity, not
  a new one) rather than three independent ones.
- **Next**: M22-T02 — add `TaskNote.noteType` and the other contract
  changes to `packages/shared-contract/main.tsp`.

## M22-T02 — Contract: TaskNote.noteType + handoff surface

- **Status**: done
- **Date**: 2026-08-19
- **Changed**: `packages/shared-contract/main.tsp` + `health.proto`
  (`TaskNote.noteType`, `CreateTaskNoteRequest.noteType`,
  `HandoffNoteEntry`/`ListHandoffNotesRequest/Response`,
  `TaskNoteService.listHandoffNotes`, `ClaimTaskResponse`/
  `GetTaskResponse.latestHandoffNote`), regenerated `health_pb.ts`/
  `health.pb.go`/`health.connect.go`, `apps/gui/scripts/rpc-coverage.mjs`
  (temporary exception for the new RPC, ahead of its GUI caller).
- **Verified**: `moon run shared-contract:compile` clean; `bunx tsp
  format --check` clean; `backend:build`/`gui:typecheck`/`cli:build`
  clean against the new generated types; `gui:rpc-coverage` clean.
- **Notes**: Also fixed a pre-existing, unrelated flaky coverage gate
  found while verifying this task — `ArtifactUpload.tsx`'s
  `onSuccess` resets the file input via `inputRef.current`, null once
  the component has unmounted before the async upload resolves; the
  branch's coverage intermittently flipped v8's report across
  otherwise-identical runs (confirmed pre-existing by reproducing on
  this branch's parent commit via `git stash`). Added a deterministic
  unmount-before-resolve test; three consecutive full-suite runs held
  at 95.02% branches afterward.
- **Next**: M22-T03 — `note_type` column + migration.

## M22-T03 — Schema + migration: note_type column on task_notes

- **Status**: done
- **Date**: 2026-08-19
- **Changed**: `apps/backend/src/db/schema.{sqlite,mysql}.ts`
  (`taskNotes.noteType` + composite `(note_type, task_id)` index),
  `apps/backend/drizzle-sqlite/0043_task_notes_note_type.sql`,
  `apps/backend/drizzle-mysql/0030_task_notes_note_type.sql`, both
  `meta/_journal.json` files.
- **Verified**: `backend:test` (73 pass in the tasks module, migrations
  applied fresh from a real SQLite bootstrap on every run); ad hoc
  script against live MySQL (docker compose) confirmed the `ALTER
  TABLE` applies cleanly, an omitted `note_type` backfills to
  `'comment'`, an explicit `'handoff'` round-trips, and an invalid enum
  value is genuinely rejected by the database — not committed, deleted
  after use.
- **Notes**: A simple `ALTER TABLE ADD COLUMN` on both dialects, no
  full-table rebuild needed — unlike prior NOT-NULL-drop migrations in
  this repo's history, a constant default doesn't require SQLite's
  create-copy-drop-rename dance.
- **Next**: M22-T04 — backend handler.

## M22-T04 — Backend handler: listHandoffNotes + claim/getTask surfacing

- **Status**: done
- **Date**: 2026-08-19
- **Changed**: `apps/backend/src/modules/tasks/task_notes.handler.ts`
  (Zod `noteType` on create, `getLatestHandoffNote` helper,
  `listHandoffNotes` handler), `apps/backend/src/modules/tasks/
  tasks.handler.ts` (`claimTask`/`getTask` attach `latestHandoffNote`),
  `apps/backend/src/lib/scopes.ts` (`listHandoffNotes: 'tasks:read'`),
  `apps/backend/src/lib/agent-scope-sweep.test.ts` +
  `viewer-denial.test.ts` (both exhaustive sweeps wired to the new RPC),
  `task_notes.test.ts` + `tasks.test.ts` (new tests).
- **Verified**: `bun test --coverage` — 1369 pass, 0 fail,
  95.20%/96.28% functions/lines (bunfig.toml's 95% gate);
  `backend:lint`/`tasker:knip` clean; `moon check --all` 27/27.
- **Notes**: `listHandoffNotes` avoids a dialect-branched raw-SQL
  window-function query (the `search.handler.ts` pattern) in favor of a
  single ordered+capped typed join followed by in-JS dedupe-to-
  latest-per-task — simpler, avoids guessing how each driver returns
  timestamp columns from raw SQL, and is honestly bounded
  (`RAW_FETCH_CAP = 1000`, named in a comment, not hidden). Its own tiny
  index cursor, not `query-builder.ts`'s keyset `encodeCursor`/
  `decodeCursor` — reusing that for an in-memory-array index would have
  tripped its `!id`-means-empty-string guard, and the semantics
  genuinely differ (resuming an in-memory array position vs. a SQL
  keyset). Found and fixed a real bug while writing tests: SQLite's
  `created_at` column is second-resolution, so two notes created
  milliseconds apart tie on `createdAt`, and the ORDER BY's `id`
  tiebreak (a random UUID) doesn't reliably reflect insertion order —
  the production query is correct and matches this repo's own
  established tiebreak convention (`query-builder.ts`'s cursor
  pagination does the same); only a test that assumed sub-second
  wall-clock precision was wrong, fixed by inserting fixtures with
  explicit, well-separated timestamps.
- **Next**: M22-T05 — GUI.

## M22-T05 — GUI: task-detail Handoffs summary + top-level Handoffs screen

- **Status**: done
- **Date**: 2026-08-19
- **Changed**: `apps/gui/src/features/Tasks/index.tsx` (+`.test.tsx`,
  new `HandoffsSummary` component), new `apps/gui/src/features/
  Handoffs/{index.tsx,index.test.tsx,index.stories.tsx}`,
  `AppShell.tsx` (nav entry), `App.tsx` (route), `rpc-coverage.mjs`
  (temporary exception removed).
- **Verified**: `moon run gui:test` 95.03% branches (up from a
  below-threshold 94.98% — two targeted tests closed real gaps: an
  in-flight "Loading…" state on the load-more control, and a
  duplicate-text disambiguation fix); `gui:typecheck`/`gui:lint`/
  `gui:design-lint`/`gui:rpc-coverage` clean; `moon check --all` 27/27.
- **Notes**: `HandoffsSummary` shares `TaskNotesPanel`'s own
  `['taskNotes', taskId]` query/cache entry (client-filtered to
  `noteType === 'handoff'`), so the task-detail summary costs no extra
  network call — confirming the design note in `shape.md`. Wrapped in
  `<section aria-label="Handoffs summary">` since a handoff note's
  content legitimately appears twice on the page (summary excerpt +
  full Agent Notes record below) and tests need `within(getByRole(
  'region', ...))` to tell them apart, the same pattern established for
  Memory's own tests in M21. A stray untracked `apps/gui/coverage/`
  directory (left over from an ad hoc `--coverage.reporter=json` debug
  run) briefly broke `moon check --all`'s git-based task hashing with an
  unrelated `fatal: could not open 'apps/gui/coverage/base.css'` error —
  removed (it's gitignored, never meant to be tracked).
- **Next**: M22-T06 — CLI.

## M22-T06 — CLI: note-add --type, claim/get surfacing, tasks handoffs

- **Status**: done
- **Date**: 2026-08-19
- **Changed**: `apps/cli/cmd/tasks_notes.go` (`--type` flag, `[handoff]`
  tag in `notes` listing, new `tasks handoffs` command),
  `apps/cli/cmd/tasks.go` (`claim`/`get` print the latest handoff note;
  `--json` now marshals the whole response, not just the bare task),
  `apps/cli/cmd/tasks_notes_test.go` + `tasks_test.go` (new tests).
- **Verified**: `go build`/`vet`/`gofmt` clean; `go test ./cmd/...`
  clean (default order); `go tool cover -func` fresh total 96.5%;
  `moon check --all` 27/27.
- **Notes**: `claim`/`get`'s `--json` shape change (bare task object →
  whole response) is a deliberate, documented breaking change — the
  wrapper is the only way `latestHandoffNote` is reachable at all, and
  this repo already has precedent for a multi-field response marshaling
  the whole `res.Msg` (`task-types get`). Found and fixed a real,
  previously-latent bug while writing tests: `--json` is a
  `PersistentFlag` on `rootCmd`, shared by every command in the file,
  and `cmd.Flags().Changed()` never resets itself once a prior test sets
  it — the same class M20-T10 already documented, here on the one flag
  every test in this file happens to touch. Fixed with an explicit
  `resetJSONFlag(t)` helper. Separately confirmed (via a differential
  run against the pre-M22-T06 commit with an identical `-run` filter,
  10/10 failures on both) that `TestTasksUpdateCommand`'s own
  `--description` flag-leak under `-shuffle=on` is pre-existing and
  unrelated to this task — not fixed, out of scope, matching M20-T10's
  own precedent for `artifacts_test.go`/`auth_token_test.go`/
  `auth_test.go`.
- **Next**: M22-T07 — agent skill + docs.

## M22-T07 — Agent skill + docs: handoff-task skill

- **Status**: done
- **Date**: 2026-08-19
- **Changed**: `.agents/skills/handoff-task/SKILL.md` (new),
  `.agents/workflows/handoff-task.md` (new),
  `.claude/commands/handoff-task.md` + `.claude/skills/handoff-task/
  SKILL.md` (new, both generated via `node .agents/skills/skill-forge/
  scripts/sync-adapters.mjs` — not hand-written, per M21-T09's own
  hard-won lesson), `docs/agent-integration.md` (new §10 "Task handoff
  notes", `## See also` gains `ADR-0017` and the new skill).
- **Verified**: `node .agents/skills/skill-forge/scripts/validate.mjs`
  clean on the first attempt (0 errors, 0 warnings, 18 skills) — the
  skill file itself was written correctly the first time by directly
  applying the required-sections-in-order and body-length lessons
  already learned in M21-T09, rather than rediscovering them;
  `sync-adapters.mjs --check` in sync after generating (not
  hand-writing) the two `.claude/` adapters; `node --test
  .agents/skills/skill-forge/scripts/*.test.mjs` 24/24;
  `moon run tasker:docs-lint` clean (222 files); every flag named in
  the skill's and docs' worked examples (`--type`, `--content`,
  `--project`) checked against `tasker tasks note-add/handoffs/claim/get
  --help` on a freshly built CLI binary.
- **Next**: M22-T08 — test coverage backfill + final `moon check --all`
  pass (milestone-closing task).

## M22-T08 — Test coverage backfill + full verification suite

- **Status**: done
- **Date**: 2026-08-19
- **Checked for gaps left by T02–T07**: each task's own commit already
  verified its own coverage gate held at commit time (backend
  95.20%/96.28% functions/lines against bunfig.toml's 95% threshold;
  GUI 95.03% branches against vitest.config.ts's 95% threshold, up from
  a below-threshold 94.98% closed by two targeted tests in T02 and T05;
  CLI's `go tool cover -func` fresh total 96.5%, no hard gate enforced
  for Go in this repo). No further backfill needed - a fresh
  `moon check --all` run (below) confirms all three still hold together
  with nothing else changed since T07's commit.
- **Verified**: `moon check --all` → **27/27 tasks completed, 0
  failures** (all cached from T07's own pre-commit run, since nothing
  changed since - a legitimate cache hit, not a stale one, given the
  working tree was clean before this task's own doc-only edits).
- **Exit criteria** (`MILESTONE.md` §3) re-checked against what's
  already been tested task-by-task: agent-only `note-add --type
  handoff` and the human-denial path are `task_notes.test.ts` (T04);
  `claimTask`/`getTask` surfacing is `tasks.test.ts` (T04) and the CLI's
  own `TestTasksClaimCommandSurfacesLatestHandoffNote`/
  `TestTasksGetCommandSurfacesLatestHandoffNote` (T06); the GUI summary
  block and click-through are `Tasks/index.test.tsx` (T05); the
  cross-task browse view is `Handoffs/index.test.tsx` (GUI, T05) and
  `TestTasksHandoffsCommand`+siblings (CLI, T06); the skill's worked
  example was flag-checked against the built CLI binary (T07); `moon
  check --all` is clean per above. All seven boxes checked.
- **Notes**: Two genuine, previously-latent bugs were found and fixed
  along the way (not scope creep - both were blocking this milestone's
  own verification, the same "found while verifying" pattern M21's own
  PROGRESS.md documents): the `ArtifactUpload.tsx` flaky coverage branch
  (T02) and the `rootCmd`-level `--json` PersistentFlag leak across CLI
  tests (T06). Both documented in their own task's entry above, both
  fixed with a dedicated regression test, neither left as a TODO.
- **Verified**: `moon check --all` (27/27, this task's own confirming
  run, output captured above).
