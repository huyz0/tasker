# Architecture Decision Records

One file per decision: `ADR-<4-digit>-<kebab-title>.md`.

These used to be addressed as `.epics/adr/`, a directory that never existed —
five milestone tasks named files inside it. Decisions outlive the work item that
prompted them, so they live beside the other specs rather than inside a delivery
artifact that gets archived.

## When to write one

A decision earns an ADR when it has a **real alternative** and a **consequence**.
Choosing Zustand over Redux is an ADR. Naming a variable is not. If you cannot
name the option you rejected, you are documenting an implementation, not a
decision.

## Format

```markdown
---
id: ADR-0008
status: proposed | accepted | superseded by ADR-00NN
date: YYYY-MM-DD
milestone: M04
---

# Short decision title

## Context
What forces are in play — constraints, requirements, what we already have.

## Options
What was actually considered, and what each costs.

## Decision
The choice, in one sentence, in the active voice.

## Consequences
What becomes easier, what becomes harder, and what this forecloses.
```

`status` is never edited to `rejected`. A decision that was reversed gets a new
ADR that supersedes it, and the original stays — the reasoning that led
somewhere wrong is the most useful thing in the file.

`milestone` ties the decision to the work that forced it, so a reader can find
the code that implements it.
