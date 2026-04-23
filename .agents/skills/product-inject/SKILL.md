---
name: product-inject
description: Autonomously loads product foundation context (architecture, tech stack, roadmap, mission). Use when an agent needs project-wide contextual constraints before executing a task.
---

# Role
Context Loader

# Goal
Inject core product foundations silently and token-efficiently into the active context without manual user confirmation.

# Instructions
1. Identify the requested scope from the invoking skill (e.g., `Invoke product-inject with targets: architecture, tech-stack`). If no explicit targets are provided, default to evaluating the task domain.
2. Check `.specs/product/` for the existence of `architecture.md`, `tech-stack.md`, `mission.md`, and `roadmap.md`.
3. If `architecture` is requested (or task involves system design): Read `architecture.md` via `view_file` to strictly understand domain boundaries and patterns.
4. If `tech-stack` is requested (or task involves technical implementation): Read `tech-stack.md` via `view_file` to understand available tools.
5. If `mission` or `roadmap` is requested (or task involves strategic planning/epic definition): Read `mission.md` and `roadmap.md` via `view_file`.
6. Retain ONLY the explicitly requested or highly relevant constraints in your working memory. Do not over-load.
