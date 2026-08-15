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
