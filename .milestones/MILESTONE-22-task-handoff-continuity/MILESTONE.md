---
id: M22
title: Task Handoff & Continuity
status: in-progress
goal: An agent about to lose its claim on an unfinished task can record what it tried, what's blocked, and what the concrete next step is, and that context is visible to whoever picks the task up next — in the same round trip as claiming or inspecting the task, and browsable across a whole project without opening tasks one at a time.
depends_on: []
surfaces: [backend, gui, cli, contract, specs]
exit_criteria_met: false
started_at: 2026-08-19
completed_at: null
---

# M22 — Task Handoff & Continuity

## 1. Goal

A cloud agent working a task through its token has no local disk to fall
back on the way a person coding locally does — if its claim is
interrupted, reassigned, or simply ends before the task is done, all
context about what it tried and what's left is lost unless it was
explicitly written down somewhere queryable. This milestone makes that
explicit: an agent can record a handoff note before its claim ends, the
next claimant (agent or human) sees the latest one automatically when it
claims or inspects the task, and a human can browse every task with
pending handoff context across a project from one screen.

## 2. Why Now

Requested directly by the user via follow-up discussion immediately
after M21 (Shared Memory & Belief System) closed (2026-08-19) — a
distinct problem from beliefs (durable, cross-task knowledge) that
surfaced naturally from the same conversation: this is ephemeral,
task-scoped execution *state*, not durable *knowledge*. Design pass
(`.specs/specs/2026-08-19-1659-task-handoff-continuity/` + `ADR-0017`)
and an interactive scoping review with the user are complete. No formal
dependency on any `todo` milestone (M08/M09/M11/M12); sequenced here by
explicit user priority, the same way M13 and M21 were both sequenced
ahead of the numbered backlog.

## 3. Exit Criteria

- [ ] An agent token can call `createTaskNote`/`tasker tasks note-add
      --type handoff` on a task it holds; a human token attempting the
      same call is denied `PermissionDenied` — the existing
      agent-only restriction, confirmed to still hold with the new
      field present.
- [ ] `claimTask`/`tasker tasks claim` on a task that has a handoff note
      returns that note in the same response — no second call needed.
- [ ] `getTask`/`tasker tasks get` on the same task also returns it.
- [ ] The task detail view in the GUI shows a compact handoff summary
      (count + last few, truncated) separate from the general notes
      panel, with a working click-through — not the full history inline.
- [ ] A human can browse `/handoffs` (GUI) or `tasker tasks handoffs`
      (CLI), project-scoped, and see one row per task with a pending
      handoff note (the latest per task, not full history), without
      opening any task individually.
- [ ] `.agents/skills/handoff-task/SKILL.md` exists and, followed
      literally, produces a correct `tasker tasks note-add --type
      handoff` invocation for a worked example.
- [ ] `moon check --all` is clean (27/27) with every changed file
      holding the 95% coverage gate.

## 4. Scope

**In Scope**: `TaskNote.noteType` (`'comment' | 'handoff'`, default
`'comment'`); `listHandoffNotes` RPC (one row per task, latest handoff
note only, project-scoped); `latestHandoffNote` field on `claimTask`/
`getTask` responses; `note_type` column + migration on both dialects; a
task-detail Handoffs summary block; a new top-level `features/Handoffs/`
GUI screen + nav entry + route; `tasker tasks handoffs` CLI command +
`--type` flag on `note-add` + surfacing on `claim`/`get`; the
`handoff-task` agent skill and `docs/agent-integration.md` updates;
`ADR-0017`.

**Out of Scope**: claim TTL / auto-expiry / stale-claim detection (a
real, separate scheduling/liveness problem — ADR-0017's "Foreclosed, for
now" section); human-authored handoff notes (matches `createTaskNote`'s
existing agent-only restriction; the problem this solves doesn't apply
to a human by the user's own framing); a new shared GUI `Badge`/`Tag`
component (the pill idiom is already duplicated elsewhere in this
codebase — a future cleanup, not this milestone's job); automatic
promotion of handoff-note content into beliefs (stays a manual
`capture-belief` call).

## 5. Task Breakdown

- [x] **M22-T01** — Save spec documentation: `.specs/specs/2026-08-19-
      1659-task-handoff-continuity/`, `ADR-0017`, this `MILESTONE.md` and
      `PROGRESS.md`. No product code.
      - Files: `.specs/specs/2026-08-19-1659-task-handoff-continuity/*`,
        `.specs/adr/ADR-0017-*.md`,
        `.milestones/MILESTONE-22-task-handoff-continuity/*`
      - Verify: files exist, `moon run tasker:docs-lint` passes.

- [ ] **M22-T02** — Add `TaskNote.noteType`,
      `CreateTaskNoteRequest.noteType`, `ListHandoffNotesRequest/
      Response` + `HandoffNoteEntry`, `ClaimTaskResponse.
      latestHandoffNote`, `GetTaskResponse.latestHandoffNote` to the
      TypeSpec contract; regenerate `health.proto` and the generated
      TS/Go clients.
      - Files: `packages/shared-contract/main.tsp`,
        `packages/shared-contract/tasker/health/v1/health.proto`,
        generated `health_pb.ts`/`health.pb.go`
      - Verify: `moon run shared-contract:compile` succeeds; generated
        types include the new fields/messages.

- [ ] **M22-T03** — Add `note_type` column to `task_notes`, both
      dialects (`mysqlEnum` on MySQL, plain `text` + Zod on SQLite),
      default `'comment'`, backfilled, with paired numbered migrations.
      - Files: `apps/backend/src/db/schema.sqlite.ts`,
        `apps/backend/src/db/schema.mysql.ts`, new numbered migration
        files both dialects, both `meta/_journal.json` files
      - Verify: migration verified against a live MySQL instance via
        `docker compose up -d mysql` + integration test run; existing
        rows read back as `noteType: 'comment'`.

- [ ] **M22-T04** — Implement `listHandoffNotes` in
      `task_notes.handler.ts`; add `noteType` to the `createTaskNote`
      Zod schema; add a shared `getLatestHandoffNote(db, taskId)` helper
      and wire it into `claimTask`/`getTask` in `tasks.handler.ts`; add
      `listHandoffNotes: 'tasks:read'` to `AGENT_RPC_SCOPES.taskNotes`.
      - Files: `apps/backend/src/modules/tasks/task_notes.handler.ts`,
        `apps/backend/src/modules/tasks/task_notes.test.ts`,
        `apps/backend/src/modules/tasks/tasks.handler.ts`,
        `apps/backend/src/modules/tasks/tasks.test.ts`,
        `apps/backend/src/lib/scopes.ts`,
        `apps/backend/src/lib/agent-scope-sweep.test.ts`
      - Verify: `moon run backend:test`, coverage gate held;
        `agent-scope-sweep.test.ts` passes with `listHandoffNotes`
        classified; a human principal still gets `PermissionDenied` from
        `createTaskNote` regardless of `noteType`.

- [ ] **M22-T05** — Build the task-detail Handoffs summary block in
      `apps/gui/src/features/Tasks/index.tsx` (count + last few,
      derived client-side from the already-eager notes query, no new
      network call); build the new top-level `apps/gui/src/features/
      Handoffs/` screen (project-scoped list backed by
      `listHandoffNotes`, each row linking to its task), nav entry in
      `AppShell`, route in `App.tsx`.
      - Files: `apps/gui/src/features/Tasks/index.tsx` (+ `.test.tsx`),
        `apps/gui/src/features/Handoffs/index.tsx` + `.test.tsx` +
        `.stories.tsx`, `apps/gui/src/App.tsx`,
        `apps/gui/src/components/layout/AppShell.tsx`,
        `apps/gui/scripts/rpc-coverage.mjs` (if `listHandoffNotes` needs
        an exception or gets called directly)
      - Verify: `moon run gui:test` (95% branch-coverage gate held);
        `gui:typecheck`/`gui:lint`/`gui:design-lint`/`gui:rpc-coverage`
        clean; Storybook stories for the new screen; `jest-axe` clean.

- [ ] **M22-T06** — Add `--type` flag to `tasks_notes.go`'s `note-add`;
      surface `latestHandoffNote` on `tasks claim`/`tasks get` (plain +
      `--json`); add `tasker tasks handoffs [--project P] [--json]`.
      - Files: `apps/cli/cmd/tasks_notes.go`,
        `apps/cli/cmd/tasks_notes_test.go`, `apps/cli/cmd/tasks.go`,
        `apps/cli/cmd/tasks_test.go`
      - Verify: `go test ./cmd/...` and `-shuffle=on -count=5`;
        `moon run cli:vet`/`cli:format`/`cli:build`/`cli:test`/
        `cli:coverage`.

- [x] **M22-T07** — Write `.agents/skills/handoff-task/SKILL.md` (+ its
      four adapter files, the two `.claude/` ones generated via
      `sync-adapters.mjs`, never hand-written) and update
      `docs/agent-integration.md` with a new §10.
      - Files: `.agents/skills/handoff-task/SKILL.md`,
        `.agents/workflows/handoff-task.md`,
        `.claude/commands/handoff-task.md`,
        `.claude/skills/handoff-task/SKILL.md`,
        `docs/agent-integration.md`
      - Verify: `moon run tasker:docs-lint` clean; `node .agents/skills/
        skill-forge/scripts/validate.mjs` clean; `sync-adapters.mjs
        --check` in sync; worked example's flags checked against the
        built CLI binary's `--help` output.

- [ ] **M22-T08** — Backfill remaining test coverage; run the full
      milestone verification suite.
      - Files: any file left under the 95% gate after M22-T02–T07
      - Verify: `moon check --all` (27/27).

## 6. Verification

```bash
docker compose up -d mysql nats
moon run shared-contract:compile
moon check --all
```

## 7. Risks

- **Silent duplication with M21's belief system.** A handoff note that's
  actually durable knowledge in disguise should still go through
  `capture-belief`, not linger as a "handoff" that never gets promoted.
  The `handoff-task` skill (M22-T07) explicitly names this distinction
  in its own trigger criteria — resist blurring the two.
- **`listHandoffNotes`'s grouped/latest-per-task query.** A naive
  `GROUP BY taskId` without care for dialect differences (SQLite window
  functions vs. MySQL 8+ window functions vs. an older MySQL without
  them) could silently pick the wrong row on one dialect — verify both
  dialects explicitly, not just SQLite, per this milestone's own
  `search.handler.ts`-precedent risk (a prior join-plan regression cost
  368 seconds before being caught).
- **Scope creep toward claim TTL.** Once handoff notes exist, the
  temptation to also auto-detect a stale claim and force a handoff will
  be there — resist it; ADR-0017 names it out of scope for a reason, and
  it deserves its own design pass, not a bolt-on here.
