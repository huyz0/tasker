---
name: skill-forge
description: Creates, audits, compresses and evolves the agent harness itself — skills, workflows, protocols and host adapters. Use when adding a skill, when a skill is bloated or drifting, or when the harness needs a health check.
---

# Role

Harness Engineer.

# Goal

Keep `.agents/` a comprehensive, portable, token-efficient system in which every
skill is discoverable at tier 0, complete at tier 1, and provably consistent.

# Modes

| Mode | Use |
|---|---|
| `audit` | Default. Report harness health. Changes nothing. |
| `new` | Scaffold a skill from a capability description. |
| `optimize` | Compress an over-budget or fluffy skill without losing fidelity. |
| `sync` | Regenerate the Claude Code adapter layer from `.agents/`. |
| `evolve` | Find and fix the harness's own weaknesses, then re-audit. |

# Constraints

- ALWAYS read `@.agents/protocols/skill-authoring.md` before writing any skill file. It is the contract the validator enforces.
- MUST run `scripts/validate.mjs` after every change and report the real output. A skill is not done because it looks right.
- MUST NOT hand-edit anything under `.claude/`. It is generated — fix `.agents/` and re-run `sync`.
- MUST NOT copy protocol or standard text into a skill body. Reference the path.
- MUST NOT create a skill that fails the three-question quality gate in the authoring protocol. Say so and stop instead.
- MUST NOT delete a skill without saying which skill now owns its behaviour.
- NEVER let a fix be "raise the budget". Over-budget means content belongs in `references/`.
- Follow `@.agents/protocols/autonomy.md` for interactive vs autonomous behaviour.

# Instructions

## Phase 1: Orient

1. **Resolve mode** from the caller's request. Default to `audit`.
2. **Measure**: run `node .agents/skills/skill-forge/scripts/validate.mjs`.
   Every mode starts here — the report is the input to the rest.

## Phase 2: Act

Steps are numbered across the whole skill, not per mode, so a reference to
"step 13" means one thing.

### audit

3. Report the validator output verbatim, then add what it cannot see: skills
   whose descriptions overlap (two skills competing for one trigger), skills no
   workflow or document ever mentions, and protocols with a single consumer
   (a protocol with one caller should be folded back into that skill).
4. Rank findings by cost: a dead path breaks a run, an over-budget body breaks
   one host, an overlapping description misroutes silently. Stop.

### new

5. Apply the quality gate in the authoring protocol. If any of the three answers
   fails, say which one and stop — propose documentation instead.
6. Gather the objective, boundaries, ordered steps, and the report shape.
   Interactive: ask one at a time. Autonomous: derive them from context.
7. Write `.agents/skills/<name>/SKILL.md` to the required section order, keeping
   the body under the tier-1 budget. Detail that does not fit goes to
   `references/`, referenced by name from the body.
8. Write `.agents/workflows/<name>.md` — a forwarder, not a second copy of the
   instructions. Add `<name>-auto.md` only if the skill has an autonomous mode,
   and declare that mode in the skill's `# Modes` table.
9. Run `sync`, then re-run the validator. Both must be clean.

### optimize

10. Read the target skill. Identify, in order: text a protocol already owns,
    detail that belongs in `references/`, filler and preamble, and restatements
    of another skill's procedure.
11. Rewrite. Preserve every constraint and every step — compression removes
    words, never rules. Move overflow to `references/`; do not delete it.
12. Re-run the validator and report the before/after body size.

### sync

13. Run `node .agents/skills/skill-forge/scripts/sync-adapters.mjs`. Report what
    changed. Use `--check` to verify parity without writing.

### evolve

14. Run the audit, then read the four records that actually exist. Nothing logs
    "friction" — do not look for it.

    | Source | What it shows |
    |---|---|
    | `PROGRESS.md` divergence lines | Where the plan named the wrong files |
    | `PROGRESS.md` `blocked` entries | What stopped an agent, verbatim |
    | `STATE.md` handoff notes | What a session had to discover the hard way |
    | `git log --stat -- .agents/` | Churn: a file edited every session is unstable |

15. Convert each recurring signal into exactly one change — a new constraint, a
    new protocol, a script replacing prose, or a merge of two competing skills.
    One change per finding; do not bundle.
16. Apply, re-audit, and report the delta. If a finding cannot be encoded as a
    deterministic check, say so rather than encoding a vague instruction — and
    if it can, add the check **and a test that proves it fires**.

# Output Format

```
HARNESS <MODE>

  Skills:     18 (2 over tier-1 budget)
  Workflows:  34 · Adapters: 52 in sync
  Validator:  ✓ PASS — 0 errors, 3 warnings

  Findings:
    ! milestone-deliver/SKILL.md 6,140 chars — move a phase to references/
    ! standards-manage and auto-memorize both claim "capture a project rule"

  Changed:  <files, or "none">
  Next:     node .agents/skills/skill-forge/scripts/validate.mjs
```
