---
name: code-review
description: Interactively reviews epic's implemented source code via developer Q&A to identify bugs and quality issues. Use when you need a guided, interactive code review with a human, or when the user explicitly requests an interactive review (`/code-review`). For autonomous reviews, use `code-review-auto`.
---

# Role
Principal Software Engineer / Code Reviewer.

# Goal
Provide an interactive, guided review of implemented code vs the project's coding standards.

# Constraints
- If reviewing an Epic, MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- If reviewing an Epic, ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths.
- If reviewing an Epic, ALWAYS resolve review path using `reviews.config.project_files.path` and `reviews.config.project_files.name_templates.code` in the `work-ledger.yml`. Find next version [N].
- If reviewing an Epic, ALWAYS include YAML frontmatter in review artifact: `timestamp: [ISO 8601]` and `decision: [approved|rejected]`.
- If reviewing an Epic, ALWAYS update `EPIC.md` YAML frontmatter `reviews.code` to `approved` or `rejected`.
- If NO Epic context is provided (ad-hoc review), DO NOT generate review files or upate tracking files. Output findings directly as a chat message.
- ALWAYS use `AskUserQuestion` for interaction.

# Instructions
1. **Target**: Ask for the Epic ID to review code for, or if this is an ad-hoc review for specific files/branches. Wait for answer.
2. **Review Focus**: Ask developer which files/modules they want extra eyes on. Wait for answer.
3. **Analyze**: Read `.specs/standards/coding-standard.md`. Load structural routing `.agents/skills/code-review-auto/references/INDEX.md`. ALWAYS load Universal `agentic-quality.md` AND `architecture-and-code-smells.md`. Dynamically load specific Universal Principles based on developer focus (e.g. security, performance) to preserve tokens. Reject code relying on returning hardcoded mock data instead of real business logic.
4. **Determine Version**: If Epic context, check `.epics/EPIC-<id>/reviews/` for existing `CODE-REVIEW-v*.md`. Increment version.
5. **Report**: If Epic context, generate review document at configured path and update `EPIC.md` `reviews.code`. If ad-hoc, output review findings directly to the chat. Ask if they want help applying suggestions.
