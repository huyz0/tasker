---
id: ADR-0011
status: accepted
date: 2026-08-16
milestone: ad-hoc — user-directed UI/navigation pass, outside M08 scope
---

# Adopt Radix for overlay and navigation primitives

## Context

[ADR-0009](ADR-0009-component-primitives.md) kept primitives hand-rolled and
named three conditions that would reverse it: **(a)** the user authorizes the
dependency, **(b)** a second overlay pattern appears needing focus management
that is not the M06-T09 combobox, or **(c)** a defect in the seven `Dialog`
behaviours ships despite the tests.

The user has now given condition (a) directly — *"let use radix and fix all
finding on navigation, layout"* — after a design review surfaced findings that
also independently trip condition (b): `GlobalSearch` is a command-palette
pattern (search-as-you-type over a scrollable result list, opened from two
places, previously fixed by M06-T03 for double-mount) with defects a hand-rolled
listbox keeps getting wrong — a placeholder promising commands that don't
exist, a blank empty state, results clipped mid-row, no type grouping. That is
not the M06-T09 combobox (a single-select field bound to a form value); it is
the second, harder overlay pattern ADR-0009 flagged as the trigger to revisit.

Separately, the same review found the navigation IA itself under-structured — a
flat ten-item sidebar with no sections, admin and daily-use items at equal
weight, row actions clipped off-screen on mobile. Building a real section/group
primitive by hand repeats the exact risk ADR-0009 accepted for `Dialog`: each
hand-rolled attempt gets one behavior slightly wrong, invisibly, until a review
or a user finds it.

## Options

**Keep hand-rolling `GlobalSearch` and a new sidebar-group primitive.**
Consistent with ADR-0009's original reasoning, but that reasoning rested on
*"no dependency authorization exists"* — which is no longer true — and *"the
scope is two overlays, not a component system"* — which is no longer true
either; the review found a second pattern and a navigation-structure gap in the
same pass. Continuing to hand-roll here repeats the specific failure mode
ADR-0009 named as its reversal trigger: overlays get their behavior *slightly*
wrong until reviewed.

**Install Radix piecemeal, per-primitive, as each is touched.** Chosen. Radix
ships as scoped single-purpose packages (`@radix-ui/react-dialog`,
`@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`, `@radix-ui/react-tabs`,
`@radix-ui/react-visually-hidden`) rather than one monolith, so this repo can
adopt exactly the primitives the current work needs — `Dialog` (search
palette), `DropdownMenu`/`Popover` (row action menus, mobile overflow),
`Tabs` (Organizations' in-page sections) — without pulling `react-select`,
`react-toast`, or anything unused. Each is declared in `tech-stack.md`
individually, so `moon run :spec-drift` still catches anything undeclared.

**Adopt `shadcn/ui` wholesale (copy-in components + Radix underneath).**
Rejected for now, scoped narrower than the request: `shadcn add` pulls
`class-variance-authority`, `tailwind-merge`, and `clsx` for its `cn()`
convention, none of which this repo uses today (`button.tsx` explicitly avoids
`cva`). Taking Radix directly and wiring it to the existing token layer is a
smaller, auditable diff than adopting shadcn's whole authoring convention in
the same pass as fixing the reported findings. Revisiting shadcn specifically
is left open — nothing here forecloses it, and the existing `--background`,
`--primary`, `--card` etc. token names were already chosen to make that
adoption cheap if it's wanted later.

## Decision

**Adopt Radix**, starting with `@radix-ui/react-dialog` (replacing the
hand-rolled overlay contract in `components/ui/Dialog.tsx` and
`GlobalSearch.tsx`) and `@radix-ui/react-dropdown-menu` /
`@radix-ui/react-tabs` where the navigation findings need them. Each new
package gets a row in `tech-stack.md` at the moment it's installed, not
speculatively.

Call sites keep depending on `Dialog`'s existing props where possible — ADR-0009
built it that way specifically so this swap would be "one file", and this
decision confirms that was the right call. Styling stays entirely in the
existing token layer (`--background`, `--popover`, `--ring`, etc.); Radix
supplies behavior, not appearance, and `gui:design-lint` keeps gating raw hex
and off-token utilities inside the newly-installed components exactly as it
does everywhere else.

`design-system.md` §4 currently reads *"Rely on accessible Radix primitives…
whenever possible"* — true again as of this decision, but it was already
written that way before ADR-0009 reversed it once; this ADR is what makes the
sentence correct rather than stale a second time.

## Consequences

**Easier.** Focus trap, focus restoration, scroll lock, portal rendering,
`aria-hidden` on the background tree, and typeahead/roving-tabindex for menus
are the library's job now, not this repo's. The navigation findings that
needed real menu/tab semantics (row actions on mobile, Organizations' section
switch) get a tested primitive instead of a fourth from-scratch attempt.

**Harder.** A dependency family to keep current — `bun update` now touches
`@radix-ui/*` versions, and each one needs the same scrutiny `better-sqlite3`
got in `tech-stack.md`'s correction section: know why it's there, not just that
it resolves. The bundle-size question ADR-0009 declined to measure now has to
be measured for real, since the packages are actually installed —
`gui:typecheck` and `gui:build` size become part of what this change is judged
on.

**What this forecloses, and what would reverse it.** `Dialog.tsx`'s existing
test suite becomes the acceptance bar for the Radix-backed replacement — a
regression against any of the seven behaviours ADR-0009 enumerated is a
blocking finding, not a style note. This does not commit to shadcn's
components or `cva`; that remains open. Reverse this specific decision only if
a measured cost (bundle size, an unresolvable styling conflict with the token
layer) turns out to outweigh what it bought — record that as a new ADR rather
than quietly hand-rolling around it.
