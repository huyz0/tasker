---
id: ADR-0009
status: superseded by ADR-0011
date: 2026-08-15
milestone: M06
---

# Keep primitives hand-rolled, and make the overlay contract testable

## Context

[ADR-0005](ADR-0005-hand-rolled-ui-primitives-instead-of-shadcn-and-radix.md)
kept primitives hand-rolled through M02 and left this milestone a
recommendation, not a decision: *install Radix for the overlay primitives
specifically — dialog, dropdown, popover, tooltip — and keep hand-rolled
buttons, cards and inputs.* M06 owns accessibility, so this is where that gets
settled.

Three forces bear on it, and they do not point the same way.

**The accessibility defects are real and still open.** Two overlays exist —
`components/layout/GlobalSearch.tsx` and the task detail in
`features/Tasks/index.tsx`. Both handle `Escape`. Neither declares
`role="dialog"` or `aria-modal`, and neither traps focus, so tabbing inside
either walks out into the page behind it. That is exactly the class of behaviour
Radix ships correctly and that hand-written overlays get wrong, and it is
invisible to everyone who does not need it.

**Installing Radix requires an authorization this milestone does not have.**
`AGENTS.md` is explicit: *never install third-party packages unless explicitly
authorized by the user or the `tech-stack.md` document.* `tech-stack.md`
currently says the opposite — "Shadcn and Radix are not installed". A
recommendation in an ADR is not that authorization, and neither is a milestone
task's phrasing.

**The scope is two overlays, not a component system.** The exit criteria name
five behaviours: `role="dialog"`, `aria-modal`, focus trapping, focus
restoration, escape-to-close. The GUI has no dropdown, popover or tooltip
primitive today; M06-T09's combobox is the only other candidate, and it is a
listbox pattern rather than a modal one.

## Options

**Install `@radix-ui/react-dialog`.** Correct focus trap, focus restoration,
`aria-hidden` on the rest of the tree, scroll lock, portal, nested-dialog
handling, and years of bug reports already absorbed. Costs: a dependency family
(the dialog package alone pulls a dozen `@radix-ui/react-*` peers), a styling
layer we own regardless, and — decisively for this milestone — an authorization
nobody has given. The bundle delta was **not measured**, because measuring it
means installing it; the current build is 735 KB raw / 208 KB gzipped, and the
honest statement is that the argument here turns on correctness rather than on
size.

**Adopt a full component library** (MUI, Mantine, Chakra). Rejected for the same
reason as in ADR-0005 and more so: it brings a design language that is not this
one, against a token layer already built and gated.

**Formalise the hand-rolled set**, with the overlay contract written down and
enforced by tests rather than left to each call site. Costs: the five behaviours
become this repository's job, and they fail silently when wrong — which is
precisely what happened to the two existing overlays. That cost is only
acceptable if "silently" is removed, which is the substance of the decision
below.

## Decision

**Keep primitives hand-rolled.** Build one `Dialog` primitive that owns the
whole overlay contract, migrate both existing overlays onto it, and make the
contract executable so that a regression fails the build rather than a user.

This is the outcome the milestone anticipated ("formalising the hand-rolled set
is an equally valid outcome as long as the accessibility criteria are still
met"), chosen for a reason the milestone did not anticipate: the alternative
needs a dependency authorization that does not exist. That is a decision about
*this* milestone's authority, not a judgement that Radix is worse.

**The contract `Dialog` must implement**, each item testable:

1. `role="dialog"` and `aria-modal="true"` on the panel.
2. An accessible name, via `aria-labelledby` pointing at its own heading.
3. Focus moves into the dialog on open.
4. Tab and Shift+Tab cycle **within** the dialog and never reach the page.
5. `Escape` closes it.
6. Focus returns to the element that opened it, on any close path.
7. The page behind does not scroll while it is open.

**The gate.** Every one of the seven has a test in `Dialog.test.tsx`, and the
existing `expectNoA11yViolations` helper runs against the open dialog. A
behaviour without a test is not part of the contract — that is what makes this
different from the last three attempts at hand-rolled overlays.

## Consequences

**Easier.** No dependency to authorize, absorb or upgrade. The primitive takes
exactly the props this app uses. The token layer and `design-lint` already cover
its styling.

**Harder.** Everything Radix would have handled for free is now scope: nested
dialogs (not supported — a second dialog opening over a first is out of scope
and should be avoided by design), `aria-hidden` management of the background
tree (approximated with `inert` where supported), and every future overlay
pattern. Each is a place where a hand-rolled answer will be slightly worse than
the library's.

**What this forecloses, and what would reverse it.** It does not foreclose
Radix. The reversal is cheap by construction: call sites depend on `Dialog`'s
props, not on its internals, so swapping the implementation for
`@radix-ui/react-dialog` is one file. Reverse it when any of these is true —
**(a)** the user authorizes the dependency, **(b)** a second overlay pattern
appears that needs focus management (a real dropdown or popover, not the
combobox), or **(c)** a defect in the seven behaviours ships to a user despite
the tests, which would be evidence that hand-rolling this is beyond what tests
here can hold.

`tech-stack.md` is updated to state this decision rather than the bare fact that
Radix is absent — the previous wording read as an oversight when it was a
choice.
