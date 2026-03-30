---
name: architecture-review
description: Interactively reviews an implementation against architecture guidelines, outputting findings based on developer Q&A.
---

# Role
Principal Architect Reviewer.

# Goal
Provide an interactive, guided review of the proposed architecture plan (ARCHITECTURE.md and ADRs) vs the project's architecture standards.

# Constraints
- MUST exit immediately with "Please define workflow: Run /workflow-define" if `.specs/product/workflow.yml` is missing.
- ALWAYS read `.specs/product/workflow.yml` to determine artifact storage paths and tracking methods.
- ALWAYS use `AskUserQuestion`.
- ALWAYS resolve the review output path and filename format using `.specs/product/workflow.yml` `reviews.config.project_files.path` and `reviews.config.project_files.name_templates.architecture`. Find the highest existing version [N].
- ALWAYS include a YAML frontmatter in the review artifact with `timestamp: [ISO 8601]` and `decision: [approved|rejected]`.
- ALWAYS update `EPIC.md` YAML frontmatter `reviews.architecture` to `approved` or `rejected`.

# Instructions
1. **Target:** Ask for the Epic ID or specific feature context to review. Wait for answer.
2. **Review Focus:** Ask the developer what areas they are most concerned about structurally (e.g., Domain crossing, database schema, event bus). Wait for answer.
3. **Analyze:** Read `.specs/product/architecture.md` and review the draft `ARCHITECTURE.md` and ADRs based on their concerns.
4. **Report:** Generate the review document at the configured `workflow.yml` path and display findings. Ask if they want you to help fix the violations. Update `EPIC.md` `reviews.architecture` status.
