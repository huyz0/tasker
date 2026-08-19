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
