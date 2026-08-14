# Protocol: Skill Authoring

The contract every skill in `.agents/skills/` satisfies. `scripts/validate.mjs`
in the `skill-forge` skill checks all of it deterministically — read this before
writing a skill, then run the validator instead of trusting a reading.

## Layout

```
.agents/skills/<kebab-name>/
├── SKILL.md            # required — tier 1
├── references/*.md     # optional — tier 2, read on demand
└── scripts/*           # optional — tier 2, deterministic work
.agents/workflows/<kebab-name>.md        # required — the slash command
.agents/workflows/<kebab-name>-auto.md   # optional — autonomous variant
```

`<kebab-name>` is lowercase alphanumeric plus hyphens, 1–64 chars, and MUST equal
the `name` in frontmatter and the directory name.

## Frontmatter

Exactly two keys. Every host parses these; anything else is a portability risk.

```yaml
---
name: kebab-name
description: What it does. Use when <trigger>.
---
```

`description` is **tier 0** — it is in context for every skill on every turn, and
it is the only thing the model sees when deciding whether to invoke. Therefore:

- Two parts: what it does, then `Use when <concrete trigger>`.
- 40–400 characters. Under 40 is too vague to route on; over 400 taxes every turn.
- Name the trigger, not the category. "Use when implementing or continuing a
  milestone" routes; "Use for project management" does not.

## Body

Required sections, in this order:

| Section | Content |
|---|---|
| `# Role` | The persona, one line. |
| `# Goal` | One sentence, the end state. |
| `# Constraints` | Imperative bullets. `MUST`, `MUST NOT`, `ALWAYS`, `NEVER`. |
| `# Instructions` | Numbered atomic steps. One action per step. |
| `# Output Format` | The exact shape of the final report. |

Optional: `# Modes` (when interactive/autonomous differ), `# References`.

Budgets, enforced:

- **Fail** over 12,000 characters — Antigravity truncates workflow and rule files
  at that limit, so a longer skill is silently broken on one of the three hosts.
- **Warn** over 6,000 characters — half the hard limit, which leaves room to grow
  before a skill breaks on a host without warning. The body should carry the
  common path; anything that runs once per epic or once per milestone, rather
  than once per task, belongs in `references/`.

## Rules

- MUST NOT copy a protocol or a standard into the body. Reference it:
  `Follow @.agents/protocols/work-ledger.md`. A copy drifts; a reference cannot.
- MUST NOT restate another skill's procedure. Delegate to it by name.
- MUST use negative constraints to draw boundaries — what not to do is what an
  LLM most reliably obeys.
- MUST NOT contain conversational filler, preamble, or motivational text.
- Every path a skill names MUST exist. A dead path is a runtime failure, and the
  validator treats it as one.
- Prefer a script over prose for anything deterministic. Reasoning tokens spent
  rediscovering a CLI flag are wasted every single run.

## Quality gate — is this a skill at all?

Before creating one, all three MUST be true:

1. Could someone work this out from public docs in five minutes? → **No.**
2. Is it specific to this repository, product, or workflow? → **Yes.**
3. Did discovering it take real debugging, design, or operational effort? → **Yes.**

A skill encodes decision heuristics, constraints, pitfalls, and verification. If
the answer is a snippet or a library usage example, it is documentation instead.

## Host portability

`.agents/` is canonical. Codex reads `.agents/skills/` natively; Antigravity reads
`.agents/` for workflows, skills and rules. Claude Code reads `.claude/` only, so
its `.claude/commands/` and `.claude/skills/` files are **generated adapters** —
thin forwarders to the `.agents/` playbook, never copies of it.

Regenerate them with `skill-forge` in `sync` mode. Never hand-edit `.claude/`.
