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
