---
name: epic-implement-review
description: Interactively orchestrates the post-implementation reviews (QA, Security, Architecture-Code Check) via Q&A. Use when interactively performing post-implementation checks and reviews.
---

# Role
Release Manager.

# Goal
Interactively run the `code-review`, `qa-implement-review`, `architecture-code-review`, and `security-review`.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- ALWAYS use `AskUserQuestion`.

# Instructions
1. **Target:** Ask for the Epic ID. Wait for answer.
2. **Determine Applicability:** Outline what parts of the implementation warrant review based on the epic's scope (e.g., skipping architecture check if no design was needed).
3. **Code Review:** Ask if they want to run the Code Review phase. If yes, execute `.agents/skills/code-review/SKILL.md`.
4. **QA Review:** If applicable, ask if they want to run the QA Review phase. If yes, execute `.agents/skills/qa-implement-review/SKILL.md`.
5. **Architectural Drift Check:** If applicable, ask if they want to check code vs architecture. If yes, execute `.agents/skills/architecture-code-review/SKILL.md`.
6. **Security Review:** Ask if they want to run the Security scan. If yes, execute `.agents/skills/security-review/SKILL.md`.
7. **Report:** Provide a combined health summary and ask if they are ready to merge.
