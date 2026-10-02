# M32 — Progress Journal

## M32-T01 — Task-note events refresh the open task's notes

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/gui/src/lib/eventQueryKeys.ts`, `eventQueryKeys.test.ts`
- **Verified**: `bunx vitest run src/lib/eventQueryKeys.test.ts` — green; the
  new test failed first.
- **Notes**: The `tasknote` entity invalidated `['handoffNotes','task',
  'reports']`; the notes panel and handoff summary in an open task read
  `['taskNotes', id]`. React Query matches prefixes by whole key element, so
  `'task'` never matched `'taskNotes'` — the panel a supervisor watches an
  agent through refreshed only on window refocus. The new test asserts the
  real panel key is matched, not just that a string is in a list.
- **Next**: M32-T02

## M32-T02 — The task dialog shows its own edits immediately

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/gui/src/features/Tasks/index.tsx`, `index.test.tsx`
- **Verified**: `moon run gui:lint gui:design-lint gui:typecheck gui:test` —
  1214 pass, coverage thresholds met; the two new tests failed first.
- **Notes**: Status and edit mutations now merge the changed fields into the
  cached `['task', id]` and invalidate it. A merge, not `setQueryData(task)`:
  the update responses are not the `getTask` projection, and replacing would
  drop fields such as assignees. Bulk status changes invalidate every open
  `['task']` entry. The tests serve a GetTask that answers with the server's
  current state, so they fail if the dialog waits for anything but its own
  mutation.
- **Next**: M32-T03

## M32-T03 — Escape belongs to the topmost layer; a deep link that fails says so

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/gui/src/features/Tasks/index.tsx`, `index.test.tsx`,
  `src/App.test.tsx`
- **Verified**: as T02; five new tests, all failing first except "closes
  without asking when nothing was changed", which pins existing behaviour.
- **Notes**:
  - The `window` keydown listener closed the task dialog on *every* Escape,
    alongside Radix, which already closes only the topmost layer — so Escape
    on the delete confirmation closed both. Removed. The old Escape test
    dispatched on `window`, which only that listener could hear; it now
    dispatches on the focused element, where a real key press lands.
  - Closing with unsaved edits (button, Escape or backdrop) asks first.
  - `/tasks/:id` rendered nothing while loading or after a failure. It now
    opens an "Opening task" dialog with a loading state, or the error with
    retry and close. Titled differently from "Task Details" so nothing can
    mistake the placeholder for the loaded task. `App.test.tsx`'s routing
    test now looks the page heading up with `hidden` — the modal correctly
    hides the page behind it.
- **Next**: M32-T04

## M32-T04 — Comment load and mutation errors are reported truthfully

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/gui/src/components/ui/comments/{CommentContext,CommentList,
  CommentItem}.tsx`, `Comment.test.tsx`, `components/ui/ListState.tsx`,
  `features/Tasks/index.tsx`
- **Verified**: GUI gates green, 1217 tests; the three new tests failed first.
- **Notes**: The provider never read the list query's `error`, so a thread
  that failed to load rendered "No comments yet. Start the conversation!".
  It now renders the error with Try again. Post, edit and delete errors were
  merged into one `isError`, shown under the composer as "Failed to post
  comment" whatever had failed; edit and delete now report on the comment
  they happened to, via the mutation's own `variables`. A failed edit keeps
  the editor open with the user's text — it used to reject unhandled and
  leave the editor open with no message at all. `ListState` gained an
  `errorLabel`, because "Could not load this list" was the wrong sentence for
  a comment thread and for T03's unopenable task.
- **Next**: M32-T05

## M32-T05 — Status pickers offer only allowed transitions

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/gui/src/features/Tasks/statusTransitions.ts` (new, + test),
  `features/Tasks/index.tsx`, `index.test.tsx`
- **Verified**: GUI gates green, 1225 tests; each new test failed first.
- **Notes**:
  - `allowedStatuses` is the server's `validateStatusForTaskType` rule on the
    client — including its two permissive cases (a type with no edges yet,
    and a current status that predates the type's machine), so the picker
    never refuses a move the server would allow either. The detail select
    now offers the current status and its outgoing edges only.
  - Bulk changes keep their per-row fan-out but name the tasks that failed
    ("1 of 2 tasks failed to update: T-2"): across task types the same
    target is legal for some rows and not others.
  - A card dropped back on its own column no longer sends an update (the
    card now carries its status in the drag data), and the drop highlight no
    longer flickers as the pointer crosses the column's own cards —
    `dragleave` only clears it when the pointer actually leaves the column.
- **Next**: M32-T06

## M32-T06 — Notes render Markdown; agents appear by name; one date formatter

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `packages/shared-contract/{main.tsp,tasker/health/v1/health.proto}`
  (`TaskNote.agentName`, field 7), generated TS and Go,
  `apps/backend/src/modules/tasks/task_notes.handler.ts` (+ test),
  `apps/gui/src/lib/format.ts` (new, + test), Tasks, Handoffs, Memory, Bin,
  AgentTokens, CommentItem
- **Verified**: `moon run shared-contract:format gui:* backend:typecheck
  backend:test cli:test cli:docs-check :knip` green; GUI 1230 tests.
- **Notes**:
  - **Names are resolved on the server**, the way GetDashboard already does:
    `withAgentNames` adds one batched lookup to `listTaskNotes`,
    `listHandoffNotes` and the latest-handoff attached to `getTask`/
    `claimTask`. Resolving them in the browser would have meant loading the
    org's whole agent list — 20K at the declared scale — to label three notes.
  - **Contract codegen without buf.build**: the remote Go plugins are
    unreachable from this environment, so `protoc-gen-go v1.36.0` and
    `protoc-gen-connect-go v1.17.0` — the versions in the generated headers —
    were installed locally and run with a temporary template; the Go diff is
    the new field plus the re-encoded descriptor, nothing else. The `.proto`
    is hand-maintained beside `main.tsp` (buf reads the checked-in file),
    so both were edited.
  - Notes render through `MarkdownRenderer`; a handoff written as "tried /
    blocked / next" on separate lines no longer collapses into one paragraph.
  - `formatDateTime` replaces six copies of the same formatter and returns ""
    for a missing or unparseable time — `format(new Date(''))` throws a
    RangeError that took the whole list down. `formatStatus` reads
    `in_progress` as "In progress" on Handoffs (CSS `capitalize` rendered
    "In_progress").
- **Next**: M32-T07

## M32-T07 — Copy and small UX fixes

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: sentence-case labels across 17 source/test/e2e files;
  `features/Reports/{TrendCards,StalledWorkCard}.tsx`;
  `features/Settings/AccountSettings.tsx` (+ test);
  `components/layout/NotificationBell.tsx` (+ test);
  `features/Artifacts/ArtifactUpload.test.tsx`
- **Verified**: GUI gates green, 1232 tests; the new tests failed first.
- **Notes**:
  - **Labels**: "Post comment", "Load more", "Create template", "Use
    template", "Delete forever", "Deploy agent", "New role", "Ping backend",
    "Show/Hide builds" — sentence case, as the design review asked. Unit and
    E2E selectors moved with them.
  - **Reports sub-headings** are no longer all caps — both "Recent
    completions" (the one the review named) and `StalledWorkCard`'s, which
    used the same style; changing one would have made the page inconsistent.
  - **Set password** kept its submit disabled until the fields were valid,
    without saying why. It is now enabled, validates on submit and says what
    is missing ("Enter your current password." / "Use at least N
    characters."); the form is `noValidate` so the messages are ours.
  - **Notification bell** closes on a click outside it — a popover, not a
    modal.
  - **The flaky upload test** that failed this session's first full GUI run:
    "previews an image while it uploads" started an upload it never awaited,
    and the late request landed on the next test's handler, which then
    counted two requests. It now registers its own handler and waits for the
    request.
- **Next**: M32-T08
