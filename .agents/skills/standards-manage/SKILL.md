---
name: standards-manage
description: Discovers tribal knowledge from the codebase, writes it as a token-efficient standard in .specs/standards/, and keeps index.yml consistent. Use when codifying a convention, adding a rule, or when the standards index is out of sync.
---

# Role
Standards Architect.

# Goal
Turn undocumented convention into a dense, enforceable rule set that agents read
instead of guessing — and keep the index that makes those rules discoverable
exact.

# Modes

| Mode | Use |
|---|---|
| `discover` | Mine the codebase for unwritten conventions and codify them. |
| `create` | Write one standard the user already knows they want. |
| `index` | Rebuild `index.yml` only. Runs automatically after the other two. |

# Constraints
- MUST NOT write prose. Bullets only, one constraint per bullet, imperative: `MUST`, `MUST NOT`, `FORBIDDEN`, `ALWAYS`, `NEVER`.
- MUST show the code a rule came from, and skip anything a competent developer would already do.
- MUST record **why** a rule exists when the reason is non-obvious. An unexplained rule gets rationalised away by the next agent.
- MUST rebuild the index in the same change as any file creation or deletion. A standard missing from `index.yml` is invisible to `context-inject`.
- MUST NOT create a new standard when the rule belongs in an existing one. Append instead.
- Index descriptions MUST be <= 15 words and entries sorted by `id`.
- Stale entries are dropped without asking. New entries are confirmed in interactive mode.
- Follow `@.agents/protocols/autonomy.md`.

# Instructions

## discover

1. **Pick a domain.** If none was given, propose 3–5 from the actual tree
   (`api`, `db`, `frontend`, `testing`, `cli`) and wait for a choice.
2. **Read 5–10 representative files** in that domain. Look only for patterns that
   are unusual, opinionated, or tribal — a choice that could have gone
   differently and that a newcomer would get wrong.
3. **Propose the shortlist** and wait. Discard anything that is a framework
   default rather than a project decision.
4. **For each accepted pattern**: ask 1–2 questions about the *why*, draft the
   rule as bullets, confirm, then write or append it.
5. Go to `index`.

## create

6. **Take the topic.** Ask for it only if the caller gave none.
7. **Draft** the whole standard as grouped bullets. Sections numbered
   (`## 1. Rules`, `## 2. Validation`). No preamble, no examples that restate the rule.
8. **Confirm** the draft, then write `.specs/standards/<name>-standard.md`.
9. Go to `index`.

## index

10. **Diff** `.specs/standards/**/*.md` against `index.yml`: new, deleted, unchanged.
11. **Add** an entry per new file; **drop** entries whose file no longer exists.
12. **Write** `index.yml`, sorted by `id`:
    ```yaml
    standards:
      - id: api-standard
        title: API Architecture Standards
        description: Terse description under 15 words.
        file: api-standard.md
    ```
13. **Verify** with `node .agents/skills/skill-forge/scripts/validate.mjs`, which
    fails on any disk/index mismatch.

# Output Format

```
STANDARDS UPDATED

  Created:  .specs/standards/cli-standard.md  (6 rules, from apps/cli/cmd/*.go)
  Appended: testing-standard.md — fixtures must fail loudly
  Index:    +1 added, -0 removed, 13 total
  Verify:   validate.mjs ✓ PASS
```
