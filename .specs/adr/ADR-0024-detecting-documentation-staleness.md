---
id: ADR-0024
status: accepted
date: 2026-08-23
milestone: M27
---

# Documentation staleness is detected by milestone ownership, in a designated set of documents

## Context

`AGENTS.md` tells every agent session to read `README.md` first and to treat
`.specs/` as ground truth. M02 exists to make that true. It lapsed: by M26 the
two most-read documents described a product eight milestones behind the code,
in the present tense — the GUI "is not real-time", teams have "no table in the
schema yet", "there is no subscriber anywhere in the repository". Each was
false, and each had been false for months.

Of the five product/design documents, exactly one is clean: `tech-stack.md`,
which is the only one with a gate (`:spec-drift`). Everything prose-only rotted
in proportion to how load-bearing it was. Correcting the text without adding a
check would restore the same arrangement that produced the drift.

The obstacle is that prose staleness is not decidable in general. A checker
cannot know whether "the CLI has no TUI" is still true. What it *can* know is
whether a document promises work that has since shipped — and that turned out
to describe nearly every false statement found, because this repository's
documents cite the milestone that owns each gap.

## Options

**A. No gate; correct the text and rely on review.** Free, and exactly the
arrangement that produced eight milestones of undetected drift. The evidence
against it is the drift itself.

**B. Extend `spec-drift.ts`.** One script, one task, one place to look. But
`spec-drift` answers a different question with a different mechanism — it
diffs a table against package manifests, bidirectionally, and its findings are
`undocumented`/`stale` package names. Folding in an unrelated rule set would
make one script that fails for two incomparable reasons, and its focused
`Result` type and test suite would have to become a union. Rejected for
cohesion, not effort.

**C. Require every claim to carry a machine-readable status annotation** —
each paragraph tagged with the milestone and state it asserts. Fully general
and genuinely checkable, and it would turn readable prose into a form nobody
maintains. The cost lands on every future edit; the benefit lands on the small
subset of claims that go stale.

**D. Detect one specific, high-yield pattern: a document citing a `done`
milestone as owning unbuilt work.** Narrow by construction — it cannot know
whether an unattributed sentence is true — but it catches the pattern that
produced essentially all of the observed drift, and it costs nothing to write
prose that satisfies it.

## Decision

Take **D**, as a sibling script `scripts/doc-drift.ts` with its own suite,
mirroring `spec-drift`'s shape (own tests first, then the check; exit 0
agreement / 1 drift / 2 could not run).

A milestone reference is read as **pending ownership** when it appears in one
of a small, explicitly listed set of constructions — `is`/`are M0N`, `M0N
owns`/`adds`/`builds`/`decides`, `owed by M0N`, or a section heading ending in
`— **M0N**`. If the milestone named that way is `done` in `.milestones/
STATE.md`'s ledger, that is drift.

Everything else is left alone, and deliberately so. **Historical attribution
is legitimate and common** in these files — `(M09-T02/T03)` citing what built
a thing, `M08's streaming endpoint`, `ADR-0004, whose "until M11" this
discharges` — and a checker that flagged those would be turned off within a
week. The test suite pins both directions: each pending construction must be
caught, and each historical form must pass.

The checked set is `README.md`, `.specs/product/architecture.md`,
`.specs/design/NAVIGATION.md` and `.specs/product/mission.md`. `mission.md`
needs no correction — it is pure intent — but it is designated ground truth,
so it joins the set to keep it that way. The set is a list in the script,
because "documents an agent is told to trust" is a judgement, not a glob.

## Consequences

Easier: the specific failure that produced this milestone cannot recur
silently. A milestone closing while a document still says it owns unbuilt work
now fails `moon check --all`, which is the moment someone is looking.

Harder: writing "X is M0N" about genuinely pending work now requires that M0N
actually be open — which is correct, and is the rule stated positively.

What this deliberately does **not** catch, so nobody mistakes a green gate for
a true document: a false claim citing no milestone at all; a claim that was
never true; and prose that is merely out of date without promising anything.
`NAVIGATION.md`'s "there is no breadcrumb component in the repository" is
exactly that shape, and only a human reading found it. The gate narrows the
surface; it does not close it, and `architecture.md`'s own rule — that
everything in **Built** is present-tense-true and citable — remains a
discipline rather than an assertion a script can settle.
