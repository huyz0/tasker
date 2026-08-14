# Anti-Slop

Why generated UI reads as generated, and what to do instead. Distilled from
Anthropic's `frontend-design` skill and the design-taste doctrine in
`plugin87/ux-ui-agent-skills`.

The failure is not ugliness. It is **defaulting**: producing the same competent
thing regardless of the brief, because no choice was made.

## Calibration — the current defaults

Right now generated design clusters on three looks:

1. Warm cream background (near `#F4F1EA`), high-contrast serif display, terracotta accent.
2. Near-black background, one acid-green or vermilion accent.
3. Broadsheet layout — hairline rules, zero radius, dense newspaper columns.

All three are legitimate *for some briefs*. They are defaults rather than
choices, and they appear regardless of subject. Where the brief pins a
direction, follow it exactly — the brief always wins, including when it asks for
one of these. Where the brief leaves an axis free, do not spend that freedom on
a default.

## Banned tells

**Copy** — the loudest signal, and the one most often ignored:

- Em-dashes sprinkled through interface text. Use a period, a comma, or two sentences.
- Marketing filler: *elevate, unlock, seamless, effortless, supercharge, empower*.
- Hollow triads: "powerful, intuitive, and beautiful". Name one verifiable thing.
- Fake structure labels: `SECTION 01`, `FEATURE`, lorem ipsum, "Your headline here".
- Over-hedged microcopy: "you may want to consider possibly". Frontload the verb.

**Layout**:

- Three identical equal-weight cards, every section centred, one repeated row.
- Numbered markers (`01 / 02 / 03`) where the content is not actually a sequence.
- Emoji standing in for icons. Use the icon set the project already has.
- Colored left-border accent strips on alerts and callouts.
- Decoration that encodes nothing. Structural devices should be *true*, not pretty.

## Positive discipline

**Spend boldness in one place.** Pick a single signature element the screen is
remembered by, then keep everything around it quiet. Chanel's rule applies:
before shipping, remove one accessory.

**Structure is information.** An eyebrow, a divider, a number should encode
something true about the content. If it does not, delete it.

**Match complexity to the vision.** Maximalist directions need elaborate
execution; minimal ones need precision in spacing and type. Elegance is
executing the chosen vision well, not choosing the safe vision.

**Motion earns its place.** Every transition communicates a spatial relationship
or continuity. If you cannot say what it communicates, remove it — scattered
animation is itself a tell.

**Variance.** If two adjacent sections share the same column structure and
alignment, change one.

**Coherence across turns.** UI is built one block at a time. A new block reuses
the established scale, spacing rhythm, radius, primary and accent, and the
existing primitives. A new block never introduces a new colour, font or radius.

## The self-critique that matters

Before building, write the direction down: 4–6 named colour tokens, the type
roles, the layout concept, the signature element. Then work through the brief a
second time as if fresh. **If you arrive somewhere similar, the direction is a
default** — revise it and state what changed and why.

After building, look at it. Screenshots, not source. A picture is worth a
thousand tokens, and a model reviewing its own JSX is reviewing its intentions
rather than its output.

## In this repository

The brief is constrained and that is fine: `.specs/design/design-system.md`
fixes the palette and scale, `layout-manifest.md` fixes the shell. Distinction
here comes from hierarchy, density, empty states and copy — not from
introducing a new colour. A screen that respects the system and still has a
point of view is the target.
