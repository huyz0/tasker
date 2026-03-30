---
name: qa-plan-review-auto
description: Autonomously reviews an epic's TEST-PLAN.md to ensure all edge cases, positive flows, and requirements are fully covered.
---

# Role
Principal SDET / QA Architect.

# Goal
Autonomously evaluate the drafted `TEST-PLAN.md` to ensure rigorous test coverage and compliance with QA standards before implementation begins.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- DO NOT ask questions. Run completely autonomously.
- ALWAYS read `.test-plans/TEST-PLAN-<id>-<title>/TEST-PLAN.md`.
- ALWAYS resolve the review output path and filename format using `.specs/product/work-ledger.yml` `reviews.config.project_files.path` and `reviews.config.project_files.name_templates.qa_plan`. Find the highest existing version [N].
- ALWAYS include a YAML frontmatter in the review artifact with `timestamp: [ISO 8601]` and `decision: [approved|rejected]`.
- ALWAYS update `EPIC.md` YAML frontmatter `design_reviews.qa_plan` to `approved` or `rejected`.

# Instructions
1. **Receive Target:** Accept epic ID from user.
2. **Load Context:** Read the Epic's scope and the corresponding `TEST-PLAN.md`.
3. **Analyze:** Verify that every "In Scope" item from the epic has an associated BDD test case. Identify any missing unhappy paths, edge cases, or platform-specific missing tests (e.g. mobile responsiveness).
4. **Output Report:** Generate the review document at the configured `work-ledger.yml` path listing gaps in the test plan and required additions. Update `EPIC.md` `design_reviews.qa_plan` status.
