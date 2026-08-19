# Task Handoff & Continuity — Plan

## Task 1 (this document) — Save spec documentation

Write this spec folder (`shape.md`, `standards.md`, `references.md`,
`plan.md`), one ADR (`ADR-0017` in `.specs/adr/`), and the formal
milestone spec (`.milestones/MILESTONE-22-task-handoff-continuity/
MILESTONE.md` + `PROGRESS.md`). No product code changes in this task.

## Tasks 2 onward — tracked in `MILESTONE-22`, not duplicated here

Per `milestone-standard.md`, `MILESTONE.md`'s own Task Breakdown section
(with stable `M22-T<NN>` ids, `Files:`, and `Verify:` per task) is the
single source of truth for what remains. Summary, for orientation:

- **M22-T02** — Contract: `TaskNote.noteType`,
  `CreateTaskNoteRequest.noteType`, `ListHandoffNotesRequest/Response` +
  `HandoffNoteEntry`, `ClaimTaskResponse.latestHandoffNote`,
  `GetTaskResponse.latestHandoffNote`.
- **M22-T03** — Schema + migration: `note_type` column on `task_notes`,
  both dialects, verified against live MySQL.
- **M22-T04** — Backend handler: Zod update, `listHandoffNotes`,
  `getLatestHandoffNote` helper wired into `claimTask`/`getTask`,
  `AGENT_RPC_SCOPES` entry.
- **M22-T05** — GUI: task-detail Handoffs summary block; new
  `features/Handoffs/` screen + nav entry + route.
- **M22-T06** — CLI: `note-add --type`, `claim`/`get` surfacing, new
  `tasks handoffs` command.
- **M22-T07** — Agent skill + docs: `.agents/skills/handoff-task/
  SKILL.md`, `docs/agent-integration.md` §10.
- **M22-T08** — Test coverage backfill + final `moon check --all` pass.

Each executes one at a time, one commit per task, in the discipline this
repo has used for every milestone so far: dedicated test per change,
revert-and-confirm-fail for anything nontrivial, full backend/GUI/CLI
suites plus `moon check --all` clean before commit, migration verified
against a live MySQL instance.

## Where the design lives

The full design (data model, API surface, GUI/CLI shape) is recorded in
`shape.md`'s Decisions section and in `ADR-0017` — not restated here, to
keep one place authoritative per decision.
