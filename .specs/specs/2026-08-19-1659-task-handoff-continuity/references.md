# References for Task Handoff & Continuity

## Similar Implementations

### `apps/backend/src/modules/tasks/task_notes.handler.ts` — the surface being extended

- **Location:** `apps/backend/src/modules/tasks/task_notes.handler.ts`
  (56 lines: `createTaskNote`, `listTaskNotes`, `updateTaskNote`,
  `deleteTaskNote`).
- **Relevance:** `noteType` is added to this handler's Zod schemas, not a
  new module. `createTaskNote` already requires an agent principal
  (`ConnectError PermissionDenied` for a human caller) — this is the
  *existing* behavior decision 1 in `shape.md` matches, so no change is
  needed there, only confirmed by a test.
- **Key patterns to borrow:** `assertTaskNoteAuthor` (only the authoring
  agent may edit/delete, mirrors `comments.handler.ts`'s
  `assertCommentAuthor`); `authorizePrincipal(db, principal, orgId,
  {scope: 'tasks:read'|'comments:write', permission: 'tasknote:read'|
  'tasknote:write'})` as the dual human/agent-token authorization path;
  id prefix convention (`tnt-${crypto.randomUUID()}`).

### `apps/backend/src/modules/tasks/tasks.handler.ts` — `claimTask`/`getTask`

- **Location:** `apps/backend/src/modules/tasks/tasks.handler.ts:691-710`
  (`getTask`), `:883-923` (`claimTask`).
- **Relevance:** Both responses gain an optional `latestHandoffNote`
  field via one new shared helper, `getLatestHandoffNote(db, taskId)`.
  `claimTask` is already wrapped in `withIdempotency` and already
  authorized via `authorizePrincipal(..., 'tasks:write', 'task:write')`
  — the new field is additive to its existing response shape, not a
  change to its authorization or idempotency behavior.
- **Key patterns to borrow:** The atomic `INSERT ... SELECT ... WHERE NOT
  EXISTS` claim pattern (dialect-branched sqlite/mysql) stays completely
  unchanged; only the response object gains a field, populated by a call
  made after the claim itself succeeds.

### `apps/backend/src/lib/scopes.ts` — where `listHandoffNotes` gets classified

- **Location:** `apps/backend/src/lib/scopes.ts:80-85`
  (`AGENT_RPC_SCOPES.taskNotes`).
- **Relevance:** `listHandoffNotes` is classified `tasks:read` in this
  same block, next to `listTaskNotes`. No new agent-token scope is
  needed anywhere in this feature — confirmed during exploration that
  both the read side (`tasks:read`) and write side (`comments:write`)
  task notes already use are sufficient.

### `apps/gui/src/features/Memory/index.tsx` — top-level-screen precedent

- **Location:** `apps/gui/src/features/Memory/index.tsx`,
  `apps/gui/src/components/layout/AppShell.tsx` (nav entry),
  `apps/gui/src/App.tsx` (routes).
- **Relevance:** The new `Handoffs` screen is structured the same way
  Memory was added in M21 — its own feature folder, its own nav entry
  (Workspace group), its own route, container/presentational split, and
  Storybook stories.
- **Key patterns to borrow:** `AppShell.tsx`'s nav-entry pattern (icon +
  label + route, grouped under "Workspace"); the "Browse all" list view
  shape Memory already has for its admin/audit case — `Handoffs` is
  closer to that list shape than to Memory's search-first landing view,
  since browsing "what's currently mid-handoff" is inherently a small,
  bounded, recency-sorted list, not a query-first interaction.

### `apps/gui/src/components/ui/statusStyles.ts` — badge/pill idiom to reuse

- **Location:** `apps/gui/src/components/ui/statusStyles.ts:15-28`
  (`TONE_CLASSES`/`StatusTone`).
- **Relevance:** No shared `Badge`/`Tag` component exists in this
  codebase (confirmed during exploration — `apps/gui/src/components/ui`
  has no `Badge.tsx`). Every status pill (Memory's `StatusBadge`/
  `ConfidenceBadge`, Teams, Roles, GlobalSearch) hand-rolls the same
  `rounded-full px-2 py-0.5 text-[10px] font-medium` span combined with
  a tone class pair from this file. The task-detail Handoffs summary and
  the new screen's rows should copy this exact idiom, not invent a new
  visual language or build a new shared component as a side quest.

### `apps/gui/src/features/Tasks/index.tsx` — eager query precedent, no new call needed

- **Location:** `apps/gui/src/features/Tasks/index.tsx:428-432` (`getTask`
  query, `enabled: !!expandedTaskId`), `:43-49` (`['taskNotes', taskId]`
  query, independent and also eager, mounted unconditionally with the
  detail dialog).
- **Relevance:** The task-detail Handoffs summary block needs **no new
  network call** — it derives from the notes data the dialog is already
  fetching eagerly, filtered client-side to `noteType === 'handoff'` and
  sorted by recency. Only the new cross-task screen needs a genuinely
  new query (`listHandoffNotes`).

### `.agents/skills/capture-belief/SKILL.md` — sibling skill template

- **Location:** `.agents/skills/capture-belief/SKILL.md`, and its four
  adapter files (`.agents/workflows/capture-belief.md`,
  `.claude/commands/capture-belief.md`,
  `.claude/skills/capture-belief/SKILL.md`).
- **Relevance:** `handoff-task`'s skill file copies this file's exact
  section shape (Role/Goal/Constraints/Instructions/Output Format/
  Worked example/See also) and its adapter-file requirement — confirmed
  during exploration that `.agents/skills/skill-forge/scripts/
  validate.mjs` still requires all four files for a new skill, and that
  the two `.claude/` adapters must be produced by `node .agents/skills/
  skill-forge/scripts/sync-adapters.mjs`, never hand-written (a
  hand-written guess failed `sync-adapters.mjs --check` in M21-T09 —
  don't repeat that mistake here).

### `.specs/adr/ADR-0014-memory-reuses-the-existing-scope-hierarchy.md` — ADR template

- **Location:** `.specs/adr/ADR-0014-memory-reuses-the-existing-scope-hierarchy.md`.
- **Relevance:** The closest prior ADR in shape to this milestone's own
  decision — "extend an existing feature with a small typed distinction
  instead of inventing new infrastructure." `ADR-0017` mirrors its exact
  structure: frontmatter → H1 as the decision sentence → `## Context` →
  `## Options` (chosen + rejected, each with an inline bolded verdict) →
  `## Decision` → `## Consequences` (**Easier.** / **Harder.** /
  **Foreclosed, for now.**).
