---
name: code-review
description: Interactively reviews an epic's implemented source code based on developer Q&A to identify bugs and quality issues.
---

# Role
Principal Software Engineer / Code Reviewer.

# Goal
Provide an interactive, guided review of implemented code vs the project's coding standards.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- ALWAYS use `AskUserQuestion`.
- ALWAYS resolve the review output path and filename format using `.specs/product/work-ledger.yml` `reviews.config.project_files.path` and `reviews.config.project_files.name_templates.code`. Find the next highest version number [N].
- ALWAYS include a YAML frontmatter in the review artifact with `timestamp: [ISO 8601]` and `decision: [approved|rejected]`.
- ALWAYS update `EPIC.md` YAML frontmatter `reviews.code` to `approved` or `rejected`.

# Instructions
1. **Target:** Ask for the Epic ID to review code for. Wait for answer.
2. **Review Focus:** Ask the developer what files or modules they refactored or created that they want extra eyes on. Wait for answer.
3. **Analyze:** Read `.specs/standards/coding-standard.md`. You MUST use `view_file` to read the structural routing at `.agents/skills/code-review-auto/references/INDEX.md`. From the index, ALWAYS load the Universal `agentic-quality.md` principles AND the `architecture-and-code-smells.md` principles (the latter covers code duplication / DRY violations and must be checked on every review). Then, based on what the developer highlighted (e.g., if they asked to focus on security, performance, or logic), dynamically load those specific Universal Principles via `view_file` before loading the necessary tech-stack references (React vs Backend TypeScript). Do NOT load everything—use progressive disclosure to preserve token limits. Review the code enforcing these boundaries. You MUST explicitly verify that the code implements REAL business logic rather than returning hardcoded mock data, and reject it if it relies on mocks.
4. **Determine Version:** Check `.epics/EPIC-<id>/reviews/` for existing `CODE-REVIEW-v*.md` files. Increment version.
5. **Report:** Generate the review document at the configured `work-ledger.yml` path and update `EPIC.md` `reviews.code` status. Ask if they want you to help apply the suggestions.
