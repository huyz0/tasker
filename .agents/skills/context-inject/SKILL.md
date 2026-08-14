---
name: context-inject
description: Loads only the project standards and product foundations that a task actually needs, from .specs/. Use when starting implementation, planning, review or design work and the agent has not yet read the rules that bind it.
---

# Role

Just-In-Time Context Loader.

# Goal

Put the smallest set of binding rules in context before work starts, so the agent
is constrained by this project rather than by its training defaults.

# Modes

| Mode | Use |
|---|---|
| `interactive` | Default. Ask only when the task's domain is genuinely ambiguous. |
| `auto` | Never ask. Select at most 2 standards from the task surface and inject them. |

# Constraints

- MUST select a **maximum of 2 standards**. More than two produces lost-in-the-middle behaviour and defeats the purpose.
- MUST route from the `AGENTS.md` §3 table first — it is already in context and costs nothing. Read `index.yml` only when the surface is not in the table, and never read a standard to decide whether it applies.
- MUST NOT load product foundations for a review or an implementation task. They bind planning, not code.
- MUST NOT wrap injected content in banners, preambles or summaries of what is about to be read.
- MUST report which files were injected. Silent injection is unauditable.
- Follow `@.agents/protocols/context-budget.md` — reference paths in plans and skills, inline content only in conversation, and never pass either to a sub-agent that can select for itself.

# Instructions

1. **Classify the task** into one of:
   - `coding` — implementing, fixing, refactoring. Default.
   - `planning` — shaping, milestone planning, roadmap, architecture.
   - `review` — code, security, QA, architecture review.
   - `authoring` — writing a skill, workflow or plan document.

2. **Select standards.** The routing table in `AGENTS.md` §3 is the source of
   truth and it is already in context — do not restate it here and do not read
   `index.yml` when the table answers the question. Read `index.yml` only when
   the surface is not in the table, and then match on its descriptions. At most 2
   either way.

3. **Select product foundations** — `planning` tasks only, from `.specs/product/`:
   `architecture.md` for system design, `tech-stack.md` for tooling choices,
   `mission.md` and `roadmap.md` for prioritisation. Load only what the task names.

4. **Inject by scenario.**
   - `coding` and `review`: read the files and inline their content, densely:

     ```
     @<path>
     <content>
     ```

     Close with `**Priority**:` and a one-line summary of the binding rule.
   - `planning` and `authoring`: emit **path references only** (`@.specs/standards/api-standard.md`).
     A plan or skill that inlines a standard forks it; a reference cannot drift.

5. **Retain only** the constraints that bind this task. Do not carry the rest
   forward into subsequent steps.

6. **Surface, do not invoke.** Name any `.agents/workflows/` playbook that is
   relevant. Never auto-run it.

# Output Format

```
INJECTED

  Standards: api-standard, security-standard
  Product:   none (coding task)
  Priority:  All RPC errors return Problem Details; org scope is checked in the handler, not the query.
  Related:   /milestone-deliver
```
