---
id: ADR-0005
status: accepted
date: 2026-08-15
milestone: M02
---

# Hand-roll UI primitives instead of installing Shadcn and Radix

## Context

`tech-stack.md` named Shadcn and Radix before this milestone. Neither is
installed and neither ever was. `apps/gui/src/components/ui/` holds primitives
written here: `button.tsx`, `card.tsx`, `GenericPlaceholder.tsx`,
`InlineCreateForm.tsx`, `MarkdownRenderer.tsx`.

The Shadcn *convention* was adopted without the tooling. `apps/gui/src/index.css`
uses Shadcn's HSL custom-property token names (`--background`, `--foreground`,
`--primary`, `--muted`, `--ring`, `--radius`), which is why the two are easy to
confuse — the CSS looks like a Shadcn project and no Shadcn component exists.

Shadcn is not a dependency in the normal sense: it copies source into the
repository, and that source imports Radix, which *is* a runtime dependency. So
the real decision is about Radix.

## Options

**Install Radix and pull in Shadcn components.** Gets correct keyboard
interaction, focus management, focus trapping, ARIA wiring and portal behaviour
for dialogs, dropdowns, popovers and tooltips — the parts that are genuinely hard
and that every team gets wrong by hand. Costs a dependency per primitive and a
styling layer to own regardless.

**A full component library (MUI, Mantine, Chakra).** Most delivered per unit of
effort, at the price of a design language that is theirs and a bundle far larger
than this app needs.

**Hand-roll.** No dependency, exactly the API needed, full control. Every
accessibility behaviour is then this repository's job — and unlike styling,
those behaviours fail silently for the people who need them.

## Decision

Keep hand-rolled primitives. **M06** owns the design system and accessibility,
and revisits this with the evidence below rather than on preference.

## Consequences

**Easier.** No dependency surface for primitives, no library upgrade to absorb,
components have exactly the props this app uses, and the token layer is already
in place and gated by `apps/gui/scripts/design-lint.mjs`.

**Harder — with two failures already on record.**

1. **Nobody notices an empty primitive.** `button.tsx` and `card.tsx` were bare
   `<div>`/`<button>` passthroughs with no styling at all, and stayed that way
   until a screenshot showed a login card with its title, subtitle and button
   touching. An installed library cannot be accidentally empty.
2. **Accessibility is opt-in and was opted out of.** The app had **no
   `:focus-visible` indicator at all** until one was added globally in
   `index.css`; keyboard users could not see where focus was. Two hand-rolled
   overlays exist — `components/layout/GlobalSearch.tsx:79` and
   `features/Tasks/index.tsx:485`. Both handle `Escape`. **Neither declares
   `role="dialog"` or `aria-modal`, and neither traps focus**, so tabbing inside
   either one walks out into the page behind it. Radix gives all three by
   default.

**Mitigation now in place.** `jest-axe` is installed and every page asserts
`expectNoA11yViolations` (`apps/gui/src/test/a11y.ts`), and `gui:design-lint`
fails on token and contrast violations. These catch static defects; they do not
catch a missing focus trap.

**What would reverse this.** M06 should install Radix for the overlay
primitives specifically — dialog, dropdown, popover, tooltip — and keep
hand-rolled buttons, cards and inputs. The distinction is that overlays have
interaction contracts that are hard to get right and invisible when wrong,
whereas a button is a button. Recording that as the recommended shape so M06
inherits an argument rather than a preference.
