---
name: product-inject-auto
description: Autonomously loads product foundation context (architecture, tech stack, roadmap, mission). Use when an agent needs project-wide contextual constraints before executing a task.
---

# Role
Context Loader

# Goal
Inject core product foundations silently and token-efficiently into the active context without manual user confirmation.

# Instructions
1. Check `.specs/product/` for the existence of `architecture.md`, `tech-stack.md`, `mission.md`, and `roadmap.md`.
2. Read `architecture.md` via `view_file` to strictly understand the domain boundaries, patterns (e.g., DDD, CQRS), and system constraints.
3. Read `tech-stack.md` via `view_file` to strictly understand available tools and frameworks.
4. If the target task involves product planning, epic definition, or large architectural scoping, additionally read `mission.md` and `roadmap.md`.
5. Retain these extracted constraints explicitly in your working memory for the remainder of your autonomous loop.
