# M05 — GUI / API Parity — Progress Journal

Append-only. Newest entry at the bottom.

---

## M05-T01 — Remove the fabricated agent status

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `apps/gui/src/features/Agents/index.tsx`,
  `apps/gui/scripts/design-lint.mjs` (new `fabrication` check),
  `apps/gui/scripts/design-lint.test.mjs` (new, 12 tests), `apps/gui/moon.yml`,
  `apps/gui/vitest.config.ts`
- **Verified**: `moon run gui:test` — 423 pass. `moon check --all` — 23 pass.
  The rule was proven by injection: reintroducing the badge turns the gate red,
  and removing it turns it green again.
- **Made the criterion structural rather than a one-off.** Exit criterion 2 is
  "no component renders a hardcoded status, priority, assignee or user name".
  Deleting today's instances satisfies it once; a `fabrication` check in
  `design-lint` keeps it true. It matches literal display text, because a value
  that comes from data reaches the DOM through an expression and cannot match —
  a literal in the markup is the defect by definition.
- **Its first run found a false positive, and that changed the rule.** The
  Organizations tree marks the selected org "Active", which is *real* state
  rendered conditionally. `ACTIVE` came out of the word list: a rule that flags
  correct code gets disabled rather than obeyed, and the test suite now pins
  that case so it cannot creep back in.
- **The gate had no tests at all.** `DESIGN_LINT_ROOT` existed as a testing seam
  that nothing used — the same shape as the untested harness validator M02
  found. `design-lint.test.mjs` now plants one defect per case and asserts the
  matching rule fires, with negative cases for the code that must *not* trip it,
  and runs inside `gui:design-lint` before the gate itself.
- **Divergence, deliberately wider than the task**: `Active Workflows: 0` was
  also hardcoded, for a concept the product does not have. Removed. Leaving it
  would mean the Agents screen still lied after a task whose entire point is
  that it stops. The `Status` column header went too — it labelled nothing once
  the badge was gone.
- **One escape hatch added on purpose**: `Tasks/index.tsx`'s `High Priority`
  chip is T02's to remove, and the gate would otherwise be red between the two
  tasks. It carries a reason naming T02, and T02 removes chip and hatch
  together.
- **Next**: M05-T02

---

## M05-T02 — Remove the fabricated priority chip and avatar

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `apps/gui/src/features/Tasks/index.tsx`,
  `apps/gui/scripts/design-lint.mjs` (avatar rule),
  `apps/gui/scripts/design-lint.test.mjs` (+2, now 14)
- **Verified**: `moon run gui:test` — 423 pass (Tasks 45). `moon check --all` —
  23 pass. `node scripts/design-lint.mjs --only fabrication` — 0 findings, and
  the escape hatch T01 left behind is gone with the chip it covered.
- **Every task card claimed the same two things.** `High Priority` on all of
  them — tasks have no priority column — and a `U` avatar, an initial standing
  in for a person nobody looked up. The footer row held nothing else, so it went
  with them; **M05-T04** puts a real assignee there.
- **Extended the gate rather than only deleting.** A hardcoded avatar initial is
  the same class of lie as a hardcoded badge, so `fabrication` now flags a
  single literal letter inside a `rounded-full` element. A real initial arrives
  as an expression (`{name.charAt(0)}`), so the rule cannot match one — pinned
  by a negative test, which is also what stops it flagging the Organizations
  tree's org avatars.
- The avatar rule was written **before** the removal and failed on the live
  code, so it is known to catch the thing it was written for rather than
  asserted to.
- **Next**: M05-T03

---

## M05-T03 — Render the signed-in user from `getIdentity`

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `apps/gui/src/components/layout/CurrentUser.tsx` (new),
  `CurrentUser.test.tsx` (new, 7 tests), `AppShell.tsx`
- **Verified**: `moon run gui:test` — 430 pass. `moon check --all` — 23 pass.
  And in a real browser against a running backend:

  ```
  backend identity:                    Dev User <dev@tasker.local>
  sidebar says:                        Signed in as Dev User
  matches backend:                     true
  hardcoded "Tuong Nguyen" present:    false
  console errors:                      none
  ```

- **No contract change was needed.** The task says "extend the response with
  name and avatar", but `User` already carries `name` and `avatarUrl`, the
  `users` table already stores both, and `getIdentity` already returns the whole
  row. The gap was entirely on the client: **`getIdentity` had no caller in the
  GUI at all**. Recorded because the task's file list named `main.tsp` and
  `auth.handler.ts`, and neither needed touching.
- **The review found a second fabrication the task did not name, and the gate
  could not catch.** The sidebar footer showed **"Tuong Nguyen" / "Admin"** —
  hardcoded, identical for every account that ever signed in. That is exit
  criterion 2's "hardcoded user name" exactly. The `fabrication` rule matches
  status words, priority chips and placeholder initials; an arbitrary person's
  name is not expressible as a pattern without flagging every string in the
  product. **The gate narrows the search; it does not replace reading the
  screen.**
- **Unknown identity renders nothing**, deliberately — not a stand-in avatar.
  Loading, signed out and failed all produce no account chip, because a
  placeholder in those states looks exactly like a resolved account, which is
  the fabrication this milestone removes. Three tests hold it.
- The fallback initial is computed from the real name or email
  (`label.charAt(0)`), so it is an initial rather than the literal `U` that
  M05-T02 deleted — and being an expression, it cannot trip the avatar rule.
- **Next**: M05-T04

---

## M05-T04 — Assignment

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: both contract files (`Assignee`, `Task.assignees`,
  `unassignTask`), `modules/tasks/tasks.handler.ts`,
  `modules/tasks/assignment.test.ts` (new, 12 tests),
  `features/Tasks/AssigneePicker.tsx` + `.test.tsx` (new, 14 tests),
  `features/Tasks/index.tsx`, both authorization sweeps
- **Verified**: `moon run backend:test` 569 pass · `moon run gui:test` 423 pass ·
  `moon check --all` 23 pass. And the verify line end to end: assigned
  `Member 0050000` to `SEED-145` in the browser, then
  `cli tasks list --json` reported `SEED-145 -> Member 0050000 (person)`.
- **Artifacts**: design note (`design/M05-T04-assignment.md`), review
  (`reviews/M05-T04-assignment-v1.md`) — approved, 1 high, 1 medium, 2 low.
- **The task's file list was incomplete, and the gap was the whole problem.**
  `Task` carried no assignee field and there was no `listTaskAssignments`, so
  "show the assignee" and "visible via `cli tasks list`" were both unreachable
  from the GUI alone. The rows have existed since M01 and nothing could read
  them — which is *why* the card rendered a hardcoded avatar. Added
  `Task.assignees`, resolved server-side with display names, plus `unassignTask`:
  a picker that cannot undo a mis-click is a trap.
- **I reintroduced the exact defect M03 spent a milestone removing.** The first
  picker paged through every member to fill a `<select>`; against the
  100,001-member fixture that was ~2,000 requests and it never finished loading.
  It now searches — one page of 10, the typed text passed to the server's
  `filter`. **2 requests to open, measured.** The unit tests could not have
  caught it: they mock the transport, so a page that costs two thousand calls
  looks identical to one that costs two. Running it against the real fixture is
  what showed it.
- **That rework improved the design rather than patching it.** Server-side
  filtering is this milestone's sixth exit criterion, so the fix moves toward
  the milestone's goal instead of around it.
- **Batching was designed in, not repaired.** `assigneesByTask` resolves a whole
  page in a fixed number of queries, with a test asserting the count stays under
  ten for 25 tasks — the defect is invisible in output, since the per-task
  version returns identical data.
- **A third fabrication turned up**: the task detail hardcoded `Assignee:
  Unassigned` regardless of the actual assignments. Replaced with the real
  control.
- **Recorded for M06**: the Kanban card is a `<div role="button">`, so its
  accessible name is now its entire text including the labels of the controls
  inside it — `getByRole('button', {name: 'Assign…'})` matches the card. Found
  while writing the browser check.

## M05-T05 — Reviewers

- **Done.** Reviewers add, list and remove from the task detail
  (`ReviewerPicker.tsx`), with names resolved server-side.
  (`reviews/M05-T05-reviewers-v1.md`) — approved, 1 medium, 1 low.
- **The verify line was read strictly.** "Round-trips through the API" means a
  *second* client sees what the GUI wrote, not that the page still shows it.
  Added `Member 0099999` to `SEED-145` in the browser; a separate HTTP
  `ListTaskReviewers` returned that reviewer by name; removed it in the browser;
  the same call then returned empty.
- **`TaskReviewer` carried only ids**, so any client wanting to show a name had
  to hold the member catalogue — the exact pressure that produced M05-T04's
  two-thousand-request picker one task earlier. Added `TaskReviewer.name`,
  resolved in one batched lookup.
- **Deliberately not shared with `AssigneePicker`.** Same shape — bounded page,
  server-side `filter`, a count of what was matched but not shown — but a
  different set (`task_reviewers` references `users` only) and a different
  question. One component with a `kind` flag would carry that branch through
  every line.
- **The 95% branch gate fired again**, at 94.72%, and named four real
  behaviours across both pickers: the "Showing N of M" line, the two distinct
  empty states, Cancel, and the name-or-email fallback for a member who was
  invited but never signed in. Fourth milestone running.
- **Next**: M05-T06
