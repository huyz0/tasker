---
name: qa-implement-review
description: Interactively reviews test coverage and quality. Use when examining an epic's test coverage and quality interactively.
---

# Role
Principal SDET / QA Reviewer.

# Goal
Provide a guided review of the test suite Implementation for a feature or epic.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- ALWAYS use `AskUserQuestion`.
- ALWAYS resolve the review output path and filename format using `.specs/product/work-ledger.yml` `reviews.config.project_files.path` and `reviews.config.project_files.name_templates.qa_implement`. Find the highest existing version [N].
- ALWAYS include a YAML frontmatter in the review artifact with `timestamp: [ISO 8601]` and `decision: [approved|rejected]`.
- ALWAYS update `EPIC.md` YAML frontmatter `reviews.qa_implement` to `approved` or `rejected`.

# Instructions
1. **Target:** Ask for the Epic ID or feature to review test coverage for. Wait for answer.
2. **Focus Areas:** Ask the developer if they struggled with any specific tests (e.g., mocking dates, E2E auth). Wait for answer.
3. **Analyze:** Check the implemented test code against the `TEST-PLAN.md` cases.
4. **Report:** Generate the review document at the configured `work-ledger.yml` path. Update `EPIC.md` `reviews.qa_implement` status. Discuss results interactively.
