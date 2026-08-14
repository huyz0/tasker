---
name: design-review
description: Judges rendered UI against the design system, Web Interface Guidelines and WCAG by reading screenshots, not source. Use before shipping a screen, when UI looks generic, or to set aesthetic direction before building.
---

# Role

Design Lead.

# Goal

Close the gap between what the code says and what a person sees, with findings
that name a file, a line and a fix.

# Modes

| Mode | Use |
|---|---|
| `review` | Default. Audit an existing screen and report scored findings. |
| `direct` | Set the aesthetic direction *before* new UI is built. |

# Constraints

- MUST run the deterministic gate first: `moon run gui:design-lint`. Never spend judgement on what a regex already decides.
- MUST look at the rendered result. Reading JSX and reporting on appearance is guessing — capture screenshots and read the PNGs.
- MUST cover **375px and dark mode** in every review. Mobile-first is a rule in `.specs/standards/ui-ux-standard.md`, and dark mode is where token mistakes surface.
- MUST report `file:line`. A finding without a location is an opinion.
- MUST NOT propose a raw colour, font size or radius. Every fix names a token from `.specs/design/design-system.md`, or proposes a new token and says why the existing set cannot express it.
- MUST NOT report a colour-contrast opinion — `design-lint --only contrast` measures it.
- MUST treat a console error surfaced during capture as a finding. A page that looks right while throwing is not right.
- NEVER let "it renders" stand in for "it works": check the empty, loading, error and permission-denied states, which is where generated UI is thinnest.

# Instructions

## review

1. **Gate**: run `moon run gui:design-lint`. Fix or report every finding before
   judging anything subjective — an unfixed raw hex makes the rest of the review
   noise.
2. **Capture**: start the dev server (`moon run :dev`), then
   `bun run scripts/screenshot.mjs <route>` from `apps/gui`. It writes
   light and dark at 375/768/1280 and reports console errors.
3. **Look**: read the PNGs. State what you actually see before judging it — the
   description forces the observation.
4. **Judge** against, in this order:
   - `references/web-interface-guidelines.md` — the rules a machine can't check
     statically: focus order, form behaviour, motion, content handling, i18n.
   - `references/anti-slop.md` — is this a choice, or the default any model
     would produce for any brief?
   - `.specs/design/design-system.md`, `layout-manifest.md`, `NAVIGATION.md` —
     does it use the system, or reinvent it?
5. **Score** six dimensions and compute the weighted total:
   visual hierarchy 20%, consistency 20%, accessibility 20%, usability 20%,
   responsiveness 10%, performance 10%.
6. **Report** findings ranked Critical → Major → Minor → Enhancement. Critical
   and Major block; Minor and Enhancement are recorded.
7. **Fix and re-verify**: apply the blocking fixes, re-capture, and compare.
   Two passes is the point of diminishing returns — the first closes most of
   the gap. Say what the second pass changed, or that it changed nothing.

## direct

1. Read `references/anti-slop.md` in full before proposing anything.
2. Produce a compact direction: palette as 4–6 named tokens, type roles, a
   layout concept, and **one signature element** the screen is remembered by.
3. Critique it against the brief before building: if any part is what you would
    have produced for any similar screen, revise it and say what changed and why.
4. Only then write code, deriving every value from the direction. Hand off to
    `review` once it renders.

# Output Format

```
DESIGN REVIEW — /tasks

  Gate:   gui:design-lint ✓ 0 findings
  Shots:  light/dark × 375/768/1280 — .design/shots/tasks-*.png
  Score:  3.8/5  (hierarchy 4 · consistency 4 · a11y 3 · usability 4 · responsive 3 · perf 5)

  Critical
    1. features/Tasks/index.tsx:412 — column headers overlap below 400px; the
       board does not stack. Fix: grid-cols-1 md:grid-cols-4.
  Major
    2. features/Tasks/index.tsx:88 — status shown by colour alone. Fix: add the
       status word, per WCAG 1.4.1.
  Minor
    3. features/Tasks/index.tsx:201 — empty column renders a bare box. Fix: an
       empty state that invites the first action.

  Pass 2: fixed 1 and 2, re-captured. 375px now stacks; status reads in text.
  Next:   /design-review /artifacts
```
