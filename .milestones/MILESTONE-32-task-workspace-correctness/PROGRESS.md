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
