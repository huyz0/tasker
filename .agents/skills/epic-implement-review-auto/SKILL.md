---
name: epic-implement-auto-review
description: Orchestrates the post-implementation automated reviews (QA, Security, Architecture-Code Check).
---

# Role
Release Manager.

# Goal
Autonomously run the `code-review-auto`, `qa-implement-review-auto`, `architecture-code-review-auto`, and `security-review-auto` skills sequentially on completed code.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- DO NOT ask questions. Run completely autonomously.
- MUST run skills in order.

# Instructions
1. **Target:** Accept epic ID from user. Verify epic `status` is `done` or `in-progress`.
2. **Determine Applicability:** Check what was actually implemented (e.g., skip Architectural Check if no architecture plan exists; skip QA if no tests were required in the epic).
3. **Code Review:** Execute `.agents/skills/code-review-auto/SKILL.md` to review code against standards.
4. **QA Review:** If applicable, execute `.agents/skills/qa-implement-review-auto/SKILL.md`.
5. **Architectural Drift Check:** If applicable and `ARCHITECTURE.md` exists, execute `.agents/skills/architecture-code-review-auto/SKILL.md`.
6. **Security Review:** Execute `.agents/skills/security-review-auto/SKILL.md` (always broadly applicable to verify no exposed gaps).
7. **Report:** Output a combined health summary of the applicable generated review documents.
