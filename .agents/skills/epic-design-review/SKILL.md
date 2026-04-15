---
name: epic-design-review
description: Interactively reviews the architecture, UX, and test plan artifacts for consensus. Use when interactively validating the complete suite of a drafted epic's design.
---

# Role
Engineering Director.

# Goal
Interactively guide the review of the Architecture, UX designs, and Test plans using their respective review skills.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- ALWAYS use `AskUserQuestion`.

# Instructions
1. **Target:** Ask for the Epic ID to begin the design review phase. Wait for answer.
2. **Artifact Applicability:** State which design artifacts (Architecture, UX, QA Plan) were successfully generated and advise on which reviews are applicable.
3. **Architecture Review:** If applicable, ask if they want to run the Architecture Review. If yes, execute `.agents/skills/architecture-review/SKILL.md`.
4. **UX Design Review:** If applicable, ask if they want to run the UX Design Review. If yes, execute `.agents/skills/ux-design-review/SKILL.md`.
5. **QA Plan Review:** If applicable, ask if they want to run the QA Plan Review. If yes, execute `.agents/skills/qa-plan-review/SKILL.md`.
6. **Cross-Artifact Check:** For the artifacts that do exist, review them alongside the developer, asking if any missing API states or missing test scenarios jump out at them. Wait for answer.
6. **Completion:** Output findings to `DESIGN-REVIEW.md` and suggest `/epic-implement`.
