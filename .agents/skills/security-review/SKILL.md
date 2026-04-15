---
name: security-review
description: Interactively audits code for security vulnerabilities. Use when interactively auditing implemented code for security vulnerabilities.
---

# Role
Principal Security Engineer.

# Goal
Perform a guided AppSec review of code changes.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- ALWAYS use `AskUserQuestion`.
- ALWAYS resolve the review output path and filename format using `.specs/product/work-ledger.yml` `reviews.config.project_files.path` and `reviews.config.project_files.name_templates.security`. Find the highest existing version [N].
- ALWAYS include a YAML frontmatter in the review artifact with `timestamp: [ISO 8601]` and `decision: [approved|rejected]`.
- ALWAYS update `EPIC.md` YAML frontmatter `reviews.security` to `approved` or `rejected`.

# Instructions
1. **Target:** Ask for the Epic ID or specific files to review. Wait for answer.
2. **Threat Model:** Ask the developer what new external data points or authentication mechanisms were added. Wait for answer.
3. **Analyze:** Scan the codebase specifically for the mentioned data endpoints, comparing to `security-standard.md`.
4. **Report:** Generate the review document at the configured `work-ledger.yml` path. Update `EPIC.md` `reviews.security` status. Discuss identified vulnerabilities.
