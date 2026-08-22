---
id: ADR-0021
status: accepted
date: 2026-08-22
milestone: M24
---

# Hand-rolled SVG chart kit instead of a charting library

## Context

M24 puts the GUI's first charts on screen. No charting library exists
anywhere in the monorepo, so this is a governed adoption decision either
way (`dependency-standard`: exact pins for applications, flat dependency
trees, "reject dependencies for trivial tasks"; `tech-stack.md` row or
`:spec-drift` fails). The design review cut the chart set to **two forms**
— a multi-series line chart (autonomy & rework, created vs completed) and
a stacked area chart (CFD) — with every other panel a list or table.

Hard constraints from this repo's gates: the 95% aggregate coverage
threshold is a build failure; tests may query only by role/accessible name
(`ui-testing-standard`); `design-lint` bans raw hex and raw
`fill-`/`stroke-` palette utilities, so chart colors must be semantic
tokens; the Storybook a11y gate runs axe in a real browser; the mobile
gate fails anything wider than 375px without a deliberate scroll
container.

## Options

**A. Recharts** (the standard React choice; MIT). Mature tooltips,
legends, responsiveness. Costs: React 19 support only in recent majors; a
deep d3 transitive tree against the flat-tree rule; and
`ResponsiveContainer` measures 0×0 in jsdom, so every unit test needs
dimension mocking and untested wrapper branches fight the coverage gate.
All the token, a11y and overflow work would still be ours on top of it.

**B. visx / d3 direct.** Lower level than the need; d3's tree without a
chart library's conveniences — the worst point on the curve for two chart
forms.

**C. Hand-rolled SVG kit**: `LineChart` + `StackedAreaChart` over pure
scale/tick/path helpers, a shared shell providing `role="img"` +
`aria-label`, an sr-only data table (the queryable truth for tests and
screen readers), a hover/focus readout, explicit `viewBox` (renders fully
in jsdom), an `overflow-x-auto` wrapper (the mobile gate exempts
deliberate scrollers), and `--chart-1..6` tokens. Cost: axis/tick math and
degenerate cases (empty, single point) are ours to write and test.

## Decision

Hand-roll the two-component SVG chart kit; adopt no charting dependency.

## Consequences

Easier: the coverage gate (pure helpers, fully testable in jsdom), the
token rules (colors are `var(--chart-n)` by construction), a11y (the data
table is the contract, not an afterthought), and zero dependency surface.
Harder: any future chart form is real work — and that is a deliberate
ratchet: the kit stays cheap only while interactivity stays at
hover/focus readout level. Zoom, brushing, animation or a third-plus chart
form reopens this decision as a new ADR rather than growing bespoke code.
Chart tokens deliberately get no `*-foreground` pairs — they never carry
text (legends pair swatch + text in `foreground`; WCAG 1.4.1 is met by
labels, never color alone) — so the design-lint contrast gate's silence on
them is a decision, not an oversight. The palette is six tokens; a CFD
whose task type defines more than six statuses cycles the palette (series
remain distinguishable by their labels and the sr-only table, which is the
accessible contract anyway). Precedent: ADR-0005 hand-rolled UI
primitives; ADR-0011 admitted Radix only for genuinely-hard focus/overlay
problems. Charts are deterministic rendering — the easy case.
