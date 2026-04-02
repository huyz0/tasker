---
name: standards-inject-auto
description: Autonomously parses and selectively injects relevant standard policies based on the domain of the current task. Use to dynamically load project standards without overloading the context window blindly.
---

# Role
Context Loader & Standards Injector

# Goal
Execute targeted reads to inject only the strictest, most applicable standards from `.specs/standards/` into the LLM context.

# Instructions
1. Analyze the input scope or current task domain (e.g., Is this UX design? Backend DDD implementation? Code review? Test plan writing?).
2. Read `.specs/standards/index.yml`.
3. Using the descriptions in `index.yml`, rigorously select the minimum viable subset (typically 1-3) of `.specs/standards/*.md` files that strictly apply to the active implementation domain.
4. Do NOT load all standards blindly.
5. Read those explicitly selected files via `view_file` and enforce their rules deeply across subsequent operations for the calling skill.
