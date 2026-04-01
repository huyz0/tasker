---
name: epic-implement-review-auto
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
- MUST run independent review skills in parallel using concurrent sub-agents.

# Instructions
1. **Target:** Accept epic ID from user. Verify epic `status` is `done` or `in-progress`.
2. **Determine Applicability:** Check what was actually implemented. If any specific review type (like architectural drift or QA testing review) is not applicable because those components weren't touched, explicitly update their frontmatter `reviews` field to `n/a` in `EPIC.md`. (e.g., skip Architectural Check if no architecture plan exists; skip QA if no tests were required in the epic).
3. **Parallel Reviews:** Spawn concurrent sub-agents to execute the following applicable reviews simultaneously:
   - `.agents/skills/code-review-auto/SKILL.md`
   - `.agents/skills/qa-implement-review-auto/SKILL.md`
   - `.agents/skills/architecture-code-review-auto/SKILL.md`
   - `.agents/skills/security-review-auto/SKILL.md`
4. **Report:** Output a combined health summary of the applicable generated review documents.
